# Monthly target & hero redesign

## Context

Today's dashboard hero compares spending to a baseline that mixes scopes: the big number (`₪5,301`) is total period spend across all categories, the "₪48 ahead of pace" verdict is computed from spend in a tiny sliver of budgeted categories (currently ₪146 out of ₪5,301 for this user), and the "+ ₪5,155 in tracked" line is everything else. The three numbers are talking about three different things and the verdict is technically true but practically meaningless — it paces 3% of spending while ignoring 97%.

The earlier round of this work removed the misleading "auto-budget" fallback. This round introduces a single workspace-level monthly target so the hero has one honest reference point that always describes the same scope.

The user's framing: the hero should evaluate when there's something honest to evaluate against, and otherwise just state facts.

## Decisions

1. **New workspace setting `monthly_target`** (nullable integer ₪). Single number per workspace, set in onboarding or settings.
2. **Hero verdict references `monthly_target` only.** Per-category budgets stay in the DB and continue to drive per-category cards, but they no longer roll up into `totalBudget`.
3. **Scope-aligned donut.** Center number, ring fill, notch, and verdict all describe the same comparison: budgeted spend vs monthly target.
4. **Monthly target is the ceiling for ALL spend.** Tracking-mode is now a per-category organizational tag only — it no longer excludes spend from the hero verdict. The "+₪X in tracked" sub-line is removed. A user who sets `monthly_target = ₪5,000` sees `₪5,000` as the cap on the entire period's spend, not just on some subset.
5. **5-step onboarding.** New "Monthly target" step inserted between AI and the existing per-category budgets step. Both target and per-category remain skippable.
6. **Existing users land in facts mode** until they set a target. A dashboard CTA suggests a target based on their 3-month average.

## Data model

### New setting

`monthly_target` lives in the existing `workspace_settings` table — same KV pattern as `payday_day` and `months_to_sync`. No schema migration needed.

- Storage: `workspace_settings` row with `key = 'monthly_target'`, `value` as a string-encoded integer (₪).
- Type at the API/type boundary: `number | null`.
- NULL → facts mode.
- 0 → not allowed (treated as NULL on save, i.e. server deletes the key if 0 or blank comes in).
- Accessed via existing `getWorkspaceSetting` / `setWorkspaceSetting` helpers in [src/server/db/queries/settings.ts:31](src/server/db/queries/settings.ts:31).

### Summary route inputs

`src/app/api/summary/route.ts` reworks how `totalBudget` and `budgetedSpent` are computed:

- `totalBudget = monthlyTarget ?? 0`. The current code that sums `r.budget` across leaves/parents and gates the loop on `r.budget > 0` is removed entirely.
- `budgetedSpent = periodTotal`. All spend counts against the monthly target — tracking-mode is ignored for hero math. The per-category loop that previously filtered by `budgetMode === "budgeted"` is removed.
- The "+ ₪X in tracked" sub-line is removed from the hero entirely.
- New field returned to the client: `typicalMonthly: number | null`, used to enrich the facts-mode CTA. Computed by summing the existing `getAutoBudgetAverage(workspaceId, 3)` output and rounding to the nearest 100. NULL if the 3-month window contains no completed transactions.

Per-category `budget` fields keep their meaning at the row level — they're surfaced on category cards via existing `CategoryWithData.budget`. They no longer contribute to the hero's `totalBudget`.

## Hero — two states

### A. Monthly target set (`monthly_target > 0`)

Visual: donut, scope-aligned (mockup A from brainstorming session).

- Donut center: `₪{budgetedSpent}` = `₪{periodTotal}` (serif, large) above `of ₪{monthly_target}` (muted, small).
- Ring fill: `periodTotal / monthly_target`, clamped to [0, 100]%.
- Notch: at `timeElapsedPercent` of the ring, identical math to today.
- Verdict line under donut: `₪X ahead of pace` / `₪X over pace` / `On pace`, using the existing gap math (`target = monthly_target × timeElapsedPercent; gap = periodTotal − target`).
- Subtitle: `Friday, May 15 · You have 17 days until payday` (unchanged).
- Headline: `You've spent ₪{periodTotal} of your ₪{monthly_target} {monthLabel} target — {paceVerdict}.` (`paceVerdict` keywords unchanged from `src/server/lib/pace.ts:83`.)
- No "+ ₪X in tracked" sub-line — all spend counts against the target.
- Stacked-bar + legend below headline (unchanged).
- Two-column grid: 200/240px gauge column + flexible body column (today's layout).

### B. No monthly target (`monthly_target` is null or 0)

Facts mode — this is what's in main today after the prior round, with two adjustments:

- Headline: `You've spent ₪{periodTotal} this {monthLabel}.` (Existing pace.ts no-budget branch.)
- No donut, no notch, no verdict.
- Single-column layout — gauge column omitted.
- Stacked-bar + legend below headline (unchanged).
- CTA at the bottom of the body: `Set a monthly target to see how you're pacing →`.
- **Suggested target enrichment:** if the workspace has at least 1 prior completed month of data, the CTA becomes `Set a monthly target (₪{typical} typical) →` where `typical` is the 3-month rolling average of all completed-status transactions (existing `getAutoBudgetAverage` helper, summed across all categories, rounded to nearest 100). Pure suggestion — clicking the link still lands on the settings input with that amount pre-filled.

## Settings UI

New section in settings, above "Per-category budgets":

```
Monthly target

[ ₪ 10,000 ]    Save

Typical last 3 months: ₪11,250 / mo
```

- Single ₪ input. Save button (or auto-save on blur).
- Helper text below: `Typical last 3 months: ₪{avg} / mo` (3-month rolling average of all completed-status transactions, rounded to nearest 100). Only shown when prior history exists.
- Clearing the input sets `monthly_target` to NULL → hero drops into facts mode.

Existing per-category budgets section remains unchanged below.

## Onboarding wizard — 5 steps

Existing 4-step wizard becomes 5 steps with a new "Monthly target" step inserted between AI and per-category budgets. The full ordered set today (`workspace-name → bank → ai → budgets → complete`) is itself 5 screens with a workspace-name preamble; this redesign keeps that preamble untouched and adds one screen after the AI step, taking it to 6 ordered screens with 5 numbered steps shown to the user:

1. **Bank** (unchanged)
2. **AI** (unchanged)
3. **Monthly target (new):**
   - Headline: `What's a fair monthly spending target?`
   - Single ₪ input.
   - Helper text: `Not sure yet? You can skip this and set it later in settings.`
   - No history available at this point (sync hasn't run), so no typical-spend suggestion here.
   - Buttons: `Skip` and `Continue →`. Skip leaves `monthly_target` NULL.
4. **Per-category budgets (existing `budgets-step.tsx`):** Reframed copy — the headline becomes `Want to set per-category budgets too? (optional)` and the body explains these are for tracking individual categories like groceries or restaurants on top of the overall target. Functionality unchanged.
5. **Complete** (unchanged)

Step counter strings update from "Step X of 4" → "Step X of 5" across all step components (`bank-step.tsx`, `ai-step.tsx`, the new `monthly-target-step.tsx`, `budgets-step.tsx`, `complete-step.tsx`).

## Migration

- No schema migration. The settings table already supports arbitrary keys.
- `monthly_target` is implicitly NULL for all existing workspaces until set.
- Existing users open the dashboard → facts mode → CTA with their typical-spend suggestion → click → settings → set target. No data loss; their per-category budgets and tracking-mode flags are untouched.

## Files to change

### Server / API
- [src/app/api/summary/route.ts](src/app/api/summary/route.ts) — read `monthly_target` via `getWorkspaceSetting`. Set `totalBudget = monthlyTarget ?? 0` and rework `budgetedSpent` (see "Summary route inputs"). Return `typicalMonthly` in the response.
- [src/app/api/settings/route.ts](src/app/api/settings/route.ts) — generic settings PUT already exists; extend the `updateAppSettings` flow to handle `monthlyTarget`.
- [src/server/db/queries/settings.ts:64](src/server/db/queries/settings.ts:64) — extend `getAppSettings` to include `monthlyTarget: number | null` and update `updateAppSettings` to write the value (or delete the row when value is null/0).

### Settings types
- [src/lib/types.ts](src/lib/types.ts) — extend `AppSettings` interface with `monthlyTarget: number | null`. Extend `DashboardSummary` interface with `typicalMonthly: number | null`.
- [src/lib/api.ts](src/lib/api.ts) — no new helper needed if the generic settings PUT handles arbitrary keys; otherwise add a thin wrapper.

### Hero card
- `src/components/dashboard/hero-card.tsx` — update `PaceGauge` to show `₪{budgetedSpent}` over `of ₪{monthly_target}` in the center (today it shows `₪{periodTotal}` and a verdict line). Adjust the verdict-line text to read from props. Headline copy update via the `pacePhrase` call.
- `src/server/lib/pace.ts` — headline templates: `You've spent ₪{budgetedSpent} of your ₪{target} {monthLabel} target — {tone}.` (when target is set). The no-target branch stays as-is from the prior round.

### Settings UI
- `src/components/settings/` — new monthly-target section component. Follows existing settings section patterns (look at how per-category-budgets section is composed).

### Onboarding
- `src/components/setup/monthly-target-step.tsx` — new step component, modeled after the simplest existing step (probably `workspace-name-step.tsx` for a single-input feel).
- `src/components/setup/setup-wizard.tsx` — wire in the new step between AI and budgets-step. Bump "of 4" → "of 5" in all step counters.
- `src/components/setup/budgets-step.tsx` — update headline + copy to reframe as optional refinement. Change "Step 3 of 4" to "Step 4 of 5". Update the explanatory copy to mention this is on top of the monthly target.
- `src/components/setup/ai-step.tsx`, `src/components/setup/bank-step.tsx`, `src/components/setup/workspace-name-step.tsx`, `src/components/setup/complete-step.tsx` — bump step counter strings.

### Dashboard CTA enrichment
- `src/components/dashboard/hero-card.tsx` — when in facts mode AND a `typicalMonthly` value is provided by the summary response, render the CTA as `Set a monthly target (₪{typical} typical) →`. Otherwise the plain `Set a monthly target …` link.
- `src/app/api/summary/route.ts` — compute and return `typicalMonthly` (3-month avg, rounded to 100, or null if no completed months exist).

## Verification

1. **Facts mode:**
   - Reset state or use a workspace with `monthly_target` NULL.
   - Confirm hero: single-column layout, headline `You've spent ₪X this {month}.`, CTA link visible. No donut. No verdict copy.
   - With prior-month history: CTA shows the `(₪Y typical)` suggestion.

2. **Set monthly target via settings:**
   - Enter a value, save.
   - Reload dashboard.
   - Confirm: two-column layout, donut renders, center reads `₪{budgetedSpent} / of ₪{target}`, headline references the target, verdict tone matches gap math.

3. **Monthly target via onboarding:**
   - Reset workspace and walk through wizard.
   - On the new step, enter a target → continue → land on per-category step → continue → complete. After sync, the dashboard should be in "target set" state.
   - Repeat with skip → confirm target stays NULL and dashboard lands in facts mode.

4. **Tracking-mode is a no-op for the hero:**
   - With target set, put one category in tracking mode.
   - Confirm: donut center, ring fill, and headline are unchanged. Tracking-mode is purely organizational and does not affect hero math.

5. **Per-category budgets unaffected:**
   - Set an explicit budget on one category, confirm it shows on the category card (ring/progress) but does NOT change the hero numbers.

6. **Typecheck & build:** `npx tsc --noEmit` clean.

## Out of scope

- Forecast-to-month-end framing in facts mode (rejected earlier).
- Income / paycheck-based budgeting.
- Multiple targets (week / quarter / year). Monthly only.
- Surfacing per-category budget summaries in the hero (the "rolled up" view doesn't exist anymore).
- Reworking the visual style of category cards.
- Changing the existing `getAutoBudgetAverage` function (still used for the typical-spend suggestion).
