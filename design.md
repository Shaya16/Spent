# Spent design system

The single source of truth for how Spent looks and feels. Every screen, component,
and pull request should follow this. When something here conflicts with a component,
the component is wrong, fix the component.

The goal: a **calm, cozy, trustworthy** finance app. Warm "buttercream" surfaces,
soft rounded cards, a serif display face for headlines, tabular numerals for money.
Nothing should look rough.

All tokens live in [`src/app/globals.css`](src/app/globals.css) under `@theme inline`
and `:root` / `.dark`. Tailwind v4 exposes them as utilities (`bg-card`,
`text-muted-foreground`, `rounded-2xl`, `text-status-over`, ...). **Never hardcode a
hex / rgb / oklch value in a component** unless it is genuinely dynamic data (a
per-category color from the DB, a bank brand color). Use the token.

---

## 1. Color

Always use the semantic token, never a raw color. Light and dark are defined once in
`globals.css`; using the token means dark mode and future re-tints "just work".

| Token (utility)            | Use for                                                      |
| -------------------------- | ----------------------------------------------------------- |
| `bg-background` / `text-foreground` | App canvas + primary text                          |
| `bg-card` / `text-card-foreground`  | Card and panel surfaces                            |
| `bg-popover`                | Dialogs, sheets, dropdowns, tooltips                         |
| `bg-muted` / `text-muted-foreground`| Subtle fills, secondary/meta text                  |
| `bg-secondary` / `bg-accent`| Hover fills, quiet buttons, chips                           |
| `bg-primary` / `text-primary` | Primary actions, brand green, active nav            |
| `bg-destructive`           | Destructive actions only                                    |
| `border-border` / `border-input` | All borders and input outlines                        |
| `ring-ring`                | Focus rings (see Accessibility)                             |

### Status colors (pace / health)

Four semantic status tokens, registered as color utilities. Use `text-status-*`,
`bg-status-*`, `border-status-*` (with opacity modifiers like `bg-status-over/10`):

| Token                | Meaning                              |
| -------------------- | ------------------------------------ |
| `status-on-track`    | Good / income / under budget / OK    |
| `status-plenty-left` | Comfortably under                    |
| `status-heads-up`    | Warning / approaching limit / review |
| `status-over`        | Over budget / expense / error        |

Soft tinted backgrounds (banners, badges) use `color-mix` against the token so they
adapt per theme, e.g. `color-mix(in oklch, var(--status-over) 12%, var(--card))`.
Prefer the helpers in [`src/lib/colors.ts`](src/lib/colors.ts) / status utilities
over re-deriving the mix inline.

### Charts & categories

`chart-1`..`chart-5` are the pastel chart palette. Category swatches come from the
database (`category.color`) and are the one place inline color is correct. When a
category color is missing, fall back to `var(--muted-foreground)`, never a hardcoded
beige/grey hex.

---

## 2. Typography

Three families, mapped in `globals.css`:

- **`font-serif`** (Fraunces) — display headings, hero numbers, card titles. Cozy, editorial.
- **`font-sans`** (Inter) — all body text, labels, controls. The default.
- **`font-mono`** (Geist Mono) — only where needed; numbers use `tabular-nums`, not mono.

Rules:

- **Money and any aligned number gets `tabular-nums`** so columns line up and values
  don't jitter as they change.
- Page title: `font-serif text-2xl leading-none tracking-tight` (see `PageHeader`).
- Hero amount: `font-serif` at `text-4xl`/`text-5xl`.
- **Eyebrow / section label**: the small uppercase muted label is one component,
  `CardLabel` ([`src/components/ui/card-label.tsx`](src/components/ui/card-label.tsx)):
  `text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground`.
  Do not hand-roll `text-[10px]/[11px]` uppercase spans, use `<CardLabel>`.
- De-emphasized text is `text-muted-foreground`, not `text-foreground/60`.

---

## 3. Radius

Driven by `--radius: 0.875rem`. The scale (`rounded-sm`..`rounded-4xl`) is in `@theme`.

- **Cards / panels / sheets / dialogs: `rounded-2xl`.** This is the canonical surface radius.
- Buttons, inputs, dropdown items, badges-as-rect: `rounded-md` / `rounded-lg`.
- Pills, status chips, fully-round toggles: `rounded-full`.

Do not mix `rounded-xl` / `rounded-3xl` for cards. One surface radius.

---

## 4. Surfaces & elevation

The canonical card is:

```
rounded-2xl border border-border bg-card
```

A **border**, not a ring, not a shadow. The `Card` primitive
([`src/components/ui/card.tsx`](src/components/ui/card.tsx)),
`CardShell` (home), `HeroCard`, KPI cards, settings sections, and chat surfaces all
resolve to this. Reserve `shadow`/`ring` for transient layers (open dropdowns,
popovers, the dragged thumb), not resting cards.

Padding: cards use `p-5 md:p-6`; hero/feature cards `p-6 md:p-8`.

---

## 5. Spacing & layout

- **Page padding**: `p-4 md:p-6 lg:p-8`.
- **Section gap** within a page: `space-y-6` (or `gap-4 md:gap-5 lg:gap-6` in the home grid).
- Content max width for reading/forms: `max-w-4xl` (settings), `max-w-3xl` (chat column).
- Every flex child that can shrink and truncate needs `min-w-0`.
- The home grid is 12 columns (`grid-cols-12`) with responsive `col-span-*`.

---

## 6. Components

- **PageHeader** ([`app-shell.tsx`](src/components/layout/app-shell.tsx)) — sticky,
  `backdrop-blur`, serif title, optional meta + actions. Every top-level screen uses it,
  including chat. Actions wrap on mobile.
- **Card / CardShell** — section container, section 4.
- **CardLabel** — the eyebrow, section 2.
- **ProgressBar** ([`src/components/ui/progress-bar.tsx`](src/components/ui/progress-bar.tsx))
  — the budget/pace meter. Clamps 0-100, optional elapsed marker, `tone` from status.
- **Button** ([`button.tsx`](src/components/ui/button.tsx)) — variants
  `default | outline | secondary | ghost | destructive | link`; sizes
  `default | xs | sm | lg | icon*`. Icon-only buttons MUST have `aria-label`.
- **Segmented filter / Tabs** — use the `Tabs` primitive (or shared segmented pill) for
  view toggles; do not hand-build divergent active states.
- **Status pill / dot** — derive color from the status token, never amber/emerald literals.

---

## 7. Iconography

- Icons come from **`lucide-react`**, default size `size-4` (16px). No hand-drawn inline SVGs.
- Spinners are `Loader2` with `animate-spin`.
- Decorative icons get `aria-hidden`; meaningful icon-only controls get `aria-label`.

---

## 8. Motion

Keyframes live in `globals.css` (`fadeIn`, `countIn`, `pop`, `checkPop`, `dotPulse`).
Framer Motion is used for the setup wizard step transitions. Keep durations short
(150-280ms) and easing gentle. Respect `prefers-reduced-motion` where feasible.

---

## 9. RTL & internationalization (hard rules)

Spent ships English (LTR) and Hebrew (RTL); `<html dir>` flips. Therefore:

- **Use logical properties, never physical.** `ms-/me-` not `ml-/mr-`; `ps-/pe-` not
  `pl-/pr-`; `start-/end-` not `left-/right-`; `text-start/text-end` not
  `text-left/text-right`; `border-s/border-e`; `rounded-s/rounded-e`. The only
  physical exception is true visual centering (`left-1/2 -translate-x-1/2`).
- Directional icons (chevrons, arrows) flip with `rtl:rotate-180`.
- Popover/sheet/menu sides use logical `inline-start`/`inline-end`.
- **All user-facing copy goes through `next-intl`** (`useTranslations` /
  `getTranslations`). No hardcoded strings in components. Keep `en.json` and `he.json`
  at full key parity (`bun run i18n:check`).
- Money via `formatCurrency(amount, currency, locale)`; dates via the `formatters.ts`
  helpers. Respect `chargedCurrency`, do not assume ILS per-transaction.

---

## 10. Accessibility

- Visible focus: `focus-visible:ring-2 focus-visible:ring-ring` (built into Button).
- Every icon-only control has an accessible name; decorative glyphs are `aria-hidden`.
- Active nav exposes `aria-current="page"`.
- Inputs have associated labels; validation errors link via `aria-describedby`.
- Don't encode meaning in color alone, pair status color with text or an icon.
- Touch targets are comfortable (~40px+) on coarse pointers.

---

## 11. Conventions

- No em dashes anywhere (copy, comments, commits). Use commas, parentheses, or "to".
- `import "server-only"` at the top of every `src/server/` file.
- Comments only where the "why" isn't obvious.
- The full gate is `bun run ci` (format, typecheck, i18n, knip, react-doctor, test).
