# Docs upgrade implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Spent docs at `website/src/content/docs/` so they match the homepage vibe, serve both technical and non-technical readers via a plain-English + `<details>` pattern, and reflect the current `npm install` + `npm run setup` install flow.

**Architecture:** A small in-doc Astro component library under `website/src/components/docs/` provides the visual vocabulary (hero, card grid, callouts, step list, fragment components extracted from the homepage). Each doc page is rewritten to use those components. A new script `scripts/capture-docs-screenshots.mjs` seeds a tmp fake-data DB, boots `next dev` pointed at it via a new `SPENT_DATA_DIR` env override, walks the dashboard with Puppeteer, and writes the screenshots into `website/src/assets/screenshots/`. The Starlight sidebar in `website/astro.config.mjs` is reshaped around the user journey.

**Tech Stack:** Astro 5 + Starlight 0.37, MDX, Puppeteer (transitively present), Next.js 16, better-sqlite3, existing Spent design tokens in `website/src/styles/global.css`.

---

## File map

**New files:**

- `website/src/components/docs/DocsHero.astro` — per-page header
- `website/src/components/docs/DocsCardGrid.astro` — card grid wrapper
- `website/src/components/docs/DocsCard.astro` — single card
- `website/src/components/docs/Callout.astro` — note / gotcha / for-developers variants
- `website/src/components/docs/ForDevelopers.astro` — collapsed `<details>` accordion
- `website/src/components/docs/StepList.astro` — wrapper for step items
- `website/src/components/docs/StepItem.astro` — single step with pastel-rotation number
- `website/src/components/docs/NextStepCard.astro` — end-of-page CTA
- `website/src/components/docs/ProviderCard.astro` — AI provider tile (Claude / Ollama / Manual)
- `website/src/components/docs/fragments/BankFormFragment.astro` — extracted from `HowItWorks.astro`
- `website/src/components/docs/fragments/SyncProgressFragment.astro` — extracted from `HowItWorks.astro`
- `website/src/components/docs/fragments/TransactionListFragment.astro` — extracted from `HowItWorks.astro`
- `website/src/content/docs/what-is-spent.mdx`
- `website/src/content/docs/install/linux.mdx`
- `website/src/content/docs/categories-and-budgets.mdx`
- `website/src/content/docs/hebrew-and-rtl.mdx`
- `scripts/capture-docs-screenshots.mjs`
- `scripts/docs-seed/fake-data.mjs` — exports the curated fake dataset

**Modified files:**

- `website/astro.config.mjs` — new sidebar shape
- `website/src/content/docs/getting-started.mdx` — full rewrite as editorial landing
- `website/src/content/docs/install/mac.mdx` — full rewrite around `npm run setup`
- `website/src/content/docs/install/windows.mdx` — full rewrite, drop Visual Studio Build Tools
- `website/src/content/docs/connect-bank.mdx` — rewrite with fragments
- `website/src/content/docs/ai-categorization.mdx` — rewrite with ProviderCard
- `website/src/content/docs/sync-and-dashboard.mdx` — rewrite, content split
- `website/src/content/docs/troubleshooting.md` → `.mdx` — promote so callouts work
- `website/src/content/docs/security-and-privacy.md` → `.mdx` — promote
- `website/src/content/docs/disclaimer.md` → `.mdx` — promote
- `website/src/styles/global.css` — append a small `docs-*` utility class block
- `src/server/db/index.ts` — accept `SPENT_DATA_DIR` env var override (1-line change to enable capture script)
- `package.json` — add `docs:screenshots` script

**Path conventions:**

- All component imports inside MDX use relative paths from `website/src/content/docs/` (e.g. `../../components/docs/DocsHero.astro`).
- Page slugs match file paths under `src/content/docs/`. Internal links use `/Spent/<slug>` (the configured `base`).

---

## Task 0: Branch setup

**Files:**
- N/A (git only)

- [ ] **Step 1: Confirm we're on the right branch**

Run: `git status`
Expected: clean or only the pre-existing landing-page changes from the current working tree (which we leave alone).

- [ ] **Step 2: Create a dedicated branch**

Run: `git checkout -b docs-upgrade`
Expected: switched to a new branch.

---

## Task 1: Add `SPENT_DATA_DIR` env override

The screenshot script needs to boot the app against a fake-data tmp DB without touching the user's real `data/` folder. Today the path is hardcoded.

**Files:**
- Modify: `src/server/db/index.ts:8`

- [ ] **Step 1: Change `DB_DIR` to read the override**

In `src/server/db/index.ts`, replace line 8:

```ts
const DB_DIR = path.join(process.cwd(), "data");
```

with:

```ts
const DB_DIR = process.env.SPENT_DATA_DIR
  ? path.resolve(process.env.SPENT_DATA_DIR)
  : path.join(process.cwd(), "data");
```

- [ ] **Step 2: Smoke-test the change**

Run: `SPENT_DATA_DIR=/tmp/spent-smoke npm run dev` (Ctrl-C after ~5s once "Ready" appears).
Expected: server starts. `/tmp/spent-smoke/spent.db` exists.
Cleanup: `rm -rf /tmp/spent-smoke`.

- [ ] **Step 3: Commit**

```bash
git add src/server/db/index.ts
git commit -m "feat(db): allow SPENT_DATA_DIR override for tooling"
```

---

## Task 2: Append docs CSS utilities

Adds a small set of utility classes the new doc components reuse. Kept in `global.css` next to the existing `spent-*` tokens so there's only one stylesheet to look at.

**Files:**
- Modify: `website/src/styles/global.css` (append at end of file)

- [ ] **Step 1: Append the utility block**

Append the following to `website/src/styles/global.css`:

```css
/* ===== Docs page primitives ===== */
.docs-hero {
  padding: 1.5rem 0 2.5rem;
  border-bottom: 1px solid var(--spent-border);
  margin-bottom: 2rem;
}
.docs-hero .eyebrow {
  font-family: var(--spent-font-sans);
  font-size: 0.7rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--spent-fg-muted);
  margin-bottom: 0.85rem;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.docs-hero .eyebrow::before {
  content: '';
  width: 18px;
  height: 1px;
  background: currentColor;
}
.docs-hero .title {
  font-size: clamp(2rem, 4.5vw, 2.8rem);
  line-height: 1.05;
  letter-spacing: -0.02em;
  margin: 0 0 0.85rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4em;
}
.docs-hero .title .bold {
  font-family: var(--spent-font-sans);
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--spent-fg);
}
.docs-hero .title .italic {
  font-family: var(--spent-font-serif);
  font-style: italic;
  font-weight: 400;
  color: var(--spent-fg);
}
.docs-hero .lede {
  font-family: var(--spent-font-sans);
  font-size: 1.05rem;
  line-height: 1.6;
  color: var(--spent-fg-muted);
  max-width: 36rem;
  margin: 0;
}

.docs-card-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin: 2rem 0;
}
@media (min-width: 48rem) {
  .docs-card-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (min-width: 68rem) {
  .docs-card-grid { grid-template-columns: repeat(3, 1fr); }
}
.docs-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.25rem 1.35rem 1.35rem;
  background: var(--spent-card);
  border: 1px solid var(--spent-border);
  border-radius: var(--spent-radius);
  text-decoration: none;
  color: var(--spent-fg);
  transition: transform 180ms ease, box-shadow 180ms ease;
  position: relative;
  overflow: hidden;
}
.docs-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--spent-shadow-card);
}
.docs-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--card-accent, var(--spent-primary));
}
.docs-card .eyebrow {
  font-family: var(--spent-font-mono);
  font-size: 0.625rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--card-accent, var(--spent-primary));
  font-weight: 500;
}
.docs-card .title {
  font-family: var(--spent-font-serif);
  font-style: italic;
  font-weight: 500;
  font-size: 1.2rem;
  color: var(--spent-fg);
  margin: 0;
}
.docs-card .desc {
  font-family: var(--spent-font-sans);
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--spent-fg-muted);
  margin: 0;
}
.docs-card .arrow {
  font-family: var(--spent-font-sans);
  font-size: 0.85rem;
  color: var(--card-accent, var(--spent-primary));
  margin-top: 0.4rem;
}

.docs-callout {
  border-radius: var(--spent-radius);
  padding: 0.95rem 1.1rem;
  margin: 1.5rem 0;
  border-left: 3px solid var(--callout-accent, var(--spent-primary));
  background: var(--callout-bg, var(--spent-bg-soft));
}
.docs-callout .label {
  font-family: var(--spent-font-sans);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--callout-accent, var(--spent-primary));
  margin-bottom: 0.35rem;
}
.docs-callout :global(p) { margin: 0.35rem 0; }
.docs-callout--note { --callout-accent: var(--spent-primary); --callout-bg: var(--spent-bg-soft); }
.docs-callout--gotcha { --callout-accent: var(--spent-pink); --callout-bg: rgba(244, 168, 166, 0.18); }
.docs-callout--for-developers { --callout-accent: var(--spent-blue); --callout-bg: rgba(73, 96, 229, 0.08); }

.docs-fordev {
  border-radius: var(--spent-radius);
  border: 1px solid rgba(73, 96, 229, 0.3);
  background: rgba(73, 96, 229, 0.05);
  padding: 0;
  margin: 1.5rem 0;
}
.docs-fordev > summary {
  cursor: pointer;
  padding: 0.85rem 1.1rem;
  font-family: var(--spent-font-sans);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--spent-blue);
  list-style: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.docs-fordev > summary::-webkit-details-marker { display: none; }
.docs-fordev > summary::before {
  content: '+';
  font-family: var(--spent-font-mono);
  font-size: 1.1rem;
  line-height: 1;
}
.docs-fordev[open] > summary::before { content: '−'; }
.docs-fordev > .body {
  padding: 0 1.1rem 1rem;
  font-family: var(--spent-font-sans);
  font-size: 0.9rem;
  line-height: 1.55;
  color: var(--spent-fg);
}

.docs-steplist { display: flex; flex-direction: column; gap: 1.25rem; margin: 2rem 0; }
.docs-stepitem {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  gap: 1.25rem;
  align-items: start;
  background: var(--spent-card);
  border: 1px solid var(--spent-border);
  border-radius: var(--spent-radius);
  padding: 1.5rem 1.5rem 1.25rem;
}
.docs-stepitem .num {
  font-family: var(--spent-font-serif);
  font-style: italic;
  font-weight: 400;
  font-size: 3.2rem;
  line-height: 1;
  color: var(--step-accent, var(--spent-primary));
  opacity: 0.55;
}
.docs-stepitem[data-i='1'] { --step-accent: var(--spent-vibrant); }
.docs-stepitem[data-i='2'] { --step-accent: var(--spent-pink); }
.docs-stepitem[data-i='3'] { --step-accent: var(--spent-blue); }
.docs-stepitem[data-i='4'] { --step-accent: var(--spent-orange); }
.docs-stepitem[data-i='5'] { --step-accent: var(--spent-vibrant); }
.docs-stepitem[data-i='6'] { --step-accent: var(--spent-pink); }
.docs-stepitem .body { min-width: 0; }
.docs-stepitem .body h3 {
  font-family: var(--spent-font-sans);
  font-weight: 700;
  letter-spacing: -0.02em;
  font-size: 1.2rem;
  color: var(--spent-fg);
  margin: 0 0 0.4rem;
  font-style: normal;
}
.docs-stepitem .body :global(p) {
  font-family: var(--spent-font-sans);
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--spent-fg);
  margin: 0.45rem 0;
}
@media (max-width: 40rem) {
  .docs-stepitem { grid-template-columns: 1fr; gap: 0.6rem; padding: 1.25rem; }
  .docs-stepitem .num { font-size: 2.4rem; }
}

.docs-nextstep {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.2rem 1.4rem;
  margin: 3rem 0 0;
  background: var(--spent-primary);
  color: var(--spent-primary-fg);
  border-radius: var(--spent-radius);
  text-decoration: none;
}
.docs-nextstep:hover { background: var(--spent-primary-dark); }
.docs-nextstep .label {
  font-family: var(--spent-font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  opacity: 0.7;
  display: block;
  margin-bottom: 0.25rem;
}
.docs-nextstep .title {
  font-family: var(--spent-font-serif);
  font-style: italic;
  font-size: 1.1rem;
}
.docs-nextstep .arrow { font-size: 1.4rem; }

.docs-providergrid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin: 2rem 0;
}
@media (min-width: 60rem) {
  .docs-providergrid { grid-template-columns: repeat(3, 1fr); }
}
.docs-provider {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1.4rem;
  background: var(--spent-card);
  border: 1px solid var(--spent-border);
  border-radius: var(--spent-radius);
  position: relative;
}
.docs-provider::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 4px;
  background: var(--prov-accent, var(--spent-primary));
  border-radius: var(--spent-radius) var(--spent-radius) 0 0;
}
.docs-provider .name {
  font-family: var(--spent-font-serif);
  font-style: italic;
  font-size: 1.3rem;
  color: var(--spent-fg);
  margin: 0.3rem 0 0;
}
.docs-provider .tagline {
  font-family: var(--spent-font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--prov-accent, var(--spent-primary));
  font-weight: 500;
}
.docs-provider .lines {
  list-style: none;
  padding: 0;
  margin: 0.4rem 0 0;
  font-family: var(--spent-font-sans);
  font-size: 0.85rem;
  line-height: 1.55;
  color: var(--spent-fg);
}
.docs-provider .lines li { padding: 0.15rem 0; }
.docs-provider .lines li strong { color: var(--prov-accent, var(--spent-primary)); }
.docs-provider .link {
  margin-top: auto;
  font-family: var(--spent-font-sans);
  font-size: 0.85rem;
  color: var(--prov-accent, var(--spent-primary));
  text-decoration: underline;
  text-underline-offset: 3px;
}
.docs-provider--claude { --prov-accent: var(--spent-orange); }
.docs-provider--ollama { --prov-accent: var(--spent-vibrant); }
.docs-provider--manual { --prov-accent: var(--spent-blue); }
```

- [ ] **Step 2: Verify CSS parses**

Run: `cd website && npm run build`
Expected: build completes without CSS errors. (We expect Astro warnings about MDX referencing missing components — fine. We're checking for CSS-only errors here.)

If build fails on missing components, scroll the output for `.css` errors specifically. Component errors are addressed by later tasks.

- [ ] **Step 3: Commit**

```bash
git add website/src/styles/global.css
git commit -m "feat(website): add docs-* CSS primitives"
```

---

## Task 3: Build `DocsHero.astro`

**Files:**
- Create: `website/src/components/docs/DocsHero.astro`

- [ ] **Step 1: Write the component**

Create `website/src/components/docs/DocsHero.astro`:

```astro
---
interface Props {
  eyebrow: string;
  titleBold: string;
  titleItalic: string;
  lede?: string;
}
const { eyebrow, titleBold, titleItalic, lede } = Astro.props;
---
<header class="docs-hero">
  <div class="eyebrow">{eyebrow}</div>
  <h1 class="title">
    <span class="bold">{titleBold}</span>
    <span class="italic">{titleItalic}</span>
  </h1>
  {lede && <p class="lede">{lede}</p>}
</header>
```

- [ ] **Step 2: Smoke-render in a sandbox page**

Temporarily add to top of `website/src/content/docs/getting-started.mdx` (we'll fully rewrite that file later — this is just to verify):

```mdx
import DocsHero from '../../components/docs/DocsHero.astro';

<DocsHero eyebrow="SANDBOX" titleBold="Hero" titleItalic="renders." lede="Smoke test only." />
```

Run: `cd website && npm run dev`
Open: `http://localhost:4321/Spent/getting-started`
Expected: sage eyebrow line, two-line headline with sans-bold "Hero" then Fraunces-italic "renders.", lede beneath. No console errors.

- [ ] **Step 3: Revert the sandbox edit**

Remove the import and `<DocsHero ... />` you added. Leave `getting-started.mdx` as-is — it gets rewritten in Task 16.

- [ ] **Step 4: Commit**

```bash
git add website/src/components/docs/DocsHero.astro
git commit -m "feat(docs): add DocsHero component"
```

---

## Task 4: Build `DocsCardGrid.astro` and `DocsCard.astro`

**Files:**
- Create: `website/src/components/docs/DocsCardGrid.astro`
- Create: `website/src/components/docs/DocsCard.astro`

- [ ] **Step 1: Write `DocsCardGrid.astro`**

```astro
---
---
<div class="docs-card-grid">
  <slot />
</div>
```

- [ ] **Step 2: Write `DocsCard.astro`**

```astro
---
interface Props {
  eyebrow: string;
  title: string;
  desc: string;
  href: string;
  accent?: 'vibrant' | 'pink' | 'blue' | 'orange' | 'sage';
  arrow?: string;
}
const { eyebrow, title, desc, href, accent = 'sage', arrow = 'Read →' } = Astro.props;

const accentVar = {
  vibrant: 'var(--spent-vibrant)',
  pink: 'var(--spent-pink)',
  blue: 'var(--spent-blue)',
  orange: 'var(--spent-orange)',
  sage: 'var(--spent-primary)',
}[accent];
---
<a class="docs-card" href={href} style={`--card-accent: ${accentVar};`}>
  <span class="eyebrow">{eyebrow}</span>
  <h3 class="title">{title}</h3>
  <p class="desc">{desc}</p>
  <span class="arrow">{arrow}</span>
</a>
```

- [ ] **Step 3: Smoke-render**

Temporarily add to `website/src/content/docs/getting-started.mdx`:

```mdx
import DocsCardGrid from '../../components/docs/DocsCardGrid.astro';
import DocsCard from '../../components/docs/DocsCard.astro';

<DocsCardGrid>
  <DocsCard eyebrow="INSTALL" title="On macOS" desc="Three commands, ten minutes." href="/Spent/install/mac" accent="vibrant" />
  <DocsCard eyebrow="USING" title="Connect a bank" desc="What each bank needs." href="/Spent/connect-bank" accent="pink" />
  <DocsCard eyebrow="USING" title="Categorize with AI" desc="Claude, Ollama, or manual." href="/Spent/ai-categorization" accent="blue" />
</DocsCardGrid>
```

Run: `cd website && npm run dev` (or refresh if already running).
Open: `http://localhost:4321/Spent/getting-started`
Expected: three cards in a grid (1 col mobile, 2 col tablet, 3 col desktop), each with a colored left rail in the right accent color. Hover lifts.

- [ ] **Step 4: Revert sandbox edit**

Remove the imports and grid block. Leave the rest of the file alone.

- [ ] **Step 5: Commit**

```bash
git add website/src/components/docs/DocsCardGrid.astro website/src/components/docs/DocsCard.astro
git commit -m "feat(docs): add DocsCardGrid and DocsCard components"
```

---

## Task 5: Build `Callout.astro`

**Files:**
- Create: `website/src/components/docs/Callout.astro`

- [ ] **Step 1: Write the component**

```astro
---
interface Props {
  variant?: 'note' | 'gotcha' | 'for-developers';
  label?: string;
}
const { variant = 'note', label } = Astro.props;
const defaultLabels = {
  'note': 'Note',
  'gotcha': 'Heads up',
  'for-developers': 'For developers',
};
const resolvedLabel = label ?? defaultLabels[variant];
---
<aside class={`docs-callout docs-callout--${variant}`}>
  <div class="label">{resolvedLabel}</div>
  <slot />
</aside>
```

- [ ] **Step 2: Smoke-render**

Temporarily add to `getting-started.mdx`:

```mdx
import Callout from '../../components/docs/Callout.astro';

<Callout variant="note">A sage-bordered note.</Callout>
<Callout variant="gotcha">A pink-bordered heads-up.</Callout>
<Callout variant="for-developers">A blue-bordered tech tangent.</Callout>
```

Run: dev server. Verify three colored callouts, each with the correct label and border color.

- [ ] **Step 3: Revert sandbox edit**

- [ ] **Step 4: Commit**

```bash
git add website/src/components/docs/Callout.astro
git commit -m "feat(docs): add Callout component with three variants"
```

---

## Task 6: Build `ForDevelopers.astro`

**Files:**
- Create: `website/src/components/docs/ForDevelopers.astro`

- [ ] **Step 1: Write the component**

```astro
---
interface Props {
  summary?: string;
}
const { summary = 'For developers' } = Astro.props;
---
<details class="docs-fordev">
  <summary>{summary}</summary>
  <div class="body"><slot /></div>
</details>
```

- [ ] **Step 2: Smoke-render**

Temporarily add to `getting-started.mdx`:

```mdx
import ForDevelopers from '../../components/docs/ForDevelopers.astro';

<ForDevelopers summary="The technical version">
This is the collapsed-by-default detail block.
</ForDevelopers>
```

Run: dev server. Verify collapsed state shows `+ The technical version`, click expands to show body, the `+` flips to `−`.

- [ ] **Step 3: Revert sandbox edit**

- [ ] **Step 4: Commit**

```bash
git add website/src/components/docs/ForDevelopers.astro
git commit -m "feat(docs): add ForDevelopers accordion"
```

---

## Task 7: Build `StepList.astro` and `StepItem.astro`

**Files:**
- Create: `website/src/components/docs/StepList.astro`
- Create: `website/src/components/docs/StepItem.astro`

- [ ] **Step 1: Write `StepList.astro`**

```astro
---
---
<ol class="docs-steplist">
  <slot />
</ol>
```

- [ ] **Step 2: Write `StepItem.astro`**

```astro
---
interface Props {
  i: number;
  title: string;
}
const { i, title } = Astro.props;
const num = String(i).padStart(2, '0');
---
<li class="docs-stepitem" data-i={i}>
  <span class="num" aria-hidden="true">{num}</span>
  <div class="body">
    <h3>{title}</h3>
    <slot />
  </div>
</li>
```

- [ ] **Step 3: Smoke-render**

Temporarily add to `getting-started.mdx`:

```mdx
import StepList from '../../components/docs/StepList.astro';
import StepItem from '../../components/docs/StepItem.astro';

<StepList>
  <StepItem i={1} title="First step">
    Body of the first step.
  </StepItem>
  <StepItem i={2} title="Second step">
    Body of the second step.
  </StepItem>
  <StepItem i={3} title="Third step">
    Body of the third step.
  </StepItem>
</StepList>
```

Run: dev server. Verify three step cards, big italic `01 / 02 / 03` numbers in vibrant-green / pink / blue.

- [ ] **Step 4: Revert sandbox edit**

- [ ] **Step 5: Commit**

```bash
git add website/src/components/docs/StepList.astro website/src/components/docs/StepItem.astro
git commit -m "feat(docs): add StepList and StepItem components"
```

---

## Task 8: Build `NextStepCard.astro`

**Files:**
- Create: `website/src/components/docs/NextStepCard.astro`

- [ ] **Step 1: Write the component**

```astro
---
interface Props {
  href: string;
  title: string;
  label?: string;
}
const { href, title, label = 'Next' } = Astro.props;
---
<a class="docs-nextstep" href={href}>
  <span>
    <span class="label">{label}</span>
    <span class="title">{title}</span>
  </span>
  <span class="arrow" aria-hidden="true">→</span>
</a>
```

- [ ] **Step 2: Smoke-render**

Temporarily add to `getting-started.mdx`:

```mdx
import NextStepCard from '../../components/docs/NextStepCard.astro';

<NextStepCard href="/Spent/install/mac" title="Install on macOS" />
```

Run: dev server. Verify sage-green CTA card with `NEXT` eyebrow, italic title, arrow on the right. Hover darkens.

- [ ] **Step 3: Revert sandbox edit**

- [ ] **Step 4: Commit**

```bash
git add website/src/components/docs/NextStepCard.astro
git commit -m "feat(docs): add NextStepCard component"
```

---

## Task 9: Build `ProviderCard.astro`

**Files:**
- Create: `website/src/components/docs/ProviderCard.astro`

- [ ] **Step 1: Write the component**

```astro
---
interface Props {
  variant: 'claude' | 'ollama' | 'manual';
  name: string;
  tagline: string;
  href: string;
  linkLabel?: string;
}
const { variant, name, tagline, href, linkLabel = 'Setup steps →' } = Astro.props;
---
<article class={`docs-provider docs-provider--${variant}`}>
  <span class="tagline">{tagline}</span>
  <h3 class="name">{name}</h3>
  <ul class="lines">
    <slot />
  </ul>
  <a class="link" href={href}>{linkLabel}</a>
</article>
```

- [ ] **Step 2: Smoke-render**

Temporarily add to `getting-started.mdx`:

```mdx
import ProviderCard from '../../components/docs/ProviderCard.astro';

<div class="docs-providergrid">
  <ProviderCard variant="claude" name="Claude" tagline="Paid · Excellent" href="#claude">
    <li><strong>Cost</strong> — about $0.01–$0.05 / mo</li>
    <li><strong>Privacy</strong> — merchant name + amount only</li>
    <li><strong>Quality</strong> — handles Hebrew well</li>
  </ProviderCard>
  <ProviderCard variant="ollama" name="Ollama" tagline="Free · Local" href="#ollama">
    <li><strong>Cost</strong> — free</li>
    <li><strong>Privacy</strong> — nothing leaves your computer</li>
    <li><strong>Quality</strong> — very good with the right model</li>
  </ProviderCard>
  <ProviderCard variant="manual" name="Manual" tagline="Free · You" href="#manual">
    <li><strong>Cost</strong> — free</li>
    <li><strong>Privacy</strong> — perfect</li>
    <li><strong>Quality</strong> — depends on you</li>
  </ProviderCard>
</div>
```

Run: dev server. Verify three cards in a row (on desktop), each with a top accent bar in orange / vibrant green / blue.

- [ ] **Step 3: Revert sandbox edit**

- [ ] **Step 4: Commit**

```bash
git add website/src/components/docs/ProviderCard.astro
git commit -m "feat(docs): add ProviderCard component"
```

---

## Task 10: Build `BankFormFragment.astro`

Extracts the `frag-form` markup from `HowItWorks.astro` so it can be reused in MDX. The component takes optional props so the doc can render different bank fields.

**Files:**
- Create: `website/src/components/docs/fragments/BankFormFragment.astro`

- [ ] **Step 1: Write the component**

```astro
---
interface Tab { label: string; active?: boolean; }
interface Field { label: string; value: string; mask?: boolean; }
interface Props {
  tabs?: Tab[];
  fields?: Field[];
  lockText?: string;
}
const {
  tabs = [{ label: 'Isracard', active: true }, { label: 'Hapoalim' }, { label: 'Leumi' }],
  fields = [
    { label: 'User ID', value: '012345678' },
    { label: 'Password', value: '••••••••', mask: true },
  ],
  lockText = 'Encrypted locally',
} = Astro.props;
---
<div class="docs-frag-form">
  <div class="ftab">
    {tabs.map(t => <span class={t.active ? 'active' : ''}>{t.label}</span>)}
  </div>
  {fields.map(f => (
    <div class="row">
      <label>{f.label}</label>
      <div class={`field${f.mask ? ' pw' : ''}`}>{f.value}</div>
    </div>
  ))}
  <div class="lock">
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
    {lockText}
  </div>
</div>

<style>
.docs-frag-form {
  background: var(--spent-card);
  border: 1px solid var(--spent-border);
  border-radius: 12px;
  padding: 14px;
  box-shadow: var(--spent-shadow-card);
  font-family: var(--spent-font-sans);
  font-size: 0.75rem;
  max-width: 24rem;
  margin: 1.5rem 0;
}
.docs-frag-form .ftab { display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap; }
.docs-frag-form .ftab span {
  padding: 4px 10px;
  border-radius: 100px;
  font-family: var(--spent-font-mono);
  font-size: 0.5625rem;
  color: var(--spent-fg-muted);
  letter-spacing: 0.06em;
  background: var(--spent-bg-soft);
}
.docs-frag-form .ftab span.active { background: var(--spent-primary); color: var(--spent-bg); }
.docs-frag-form .row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.docs-frag-form .row label {
  font-family: var(--spent-font-mono);
  font-size: 0.5625rem;
  color: var(--spent-fg-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.docs-frag-form .row .field {
  background: var(--spent-bg);
  border-radius: 6px;
  padding: 8px 10px;
  font-family: var(--spent-font-mono);
  color: var(--spent-fg);
}
.docs-frag-form .row .field.pw { letter-spacing: 4px; }
.docs-frag-form .lock {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(40, 199, 91, 0.15);
  border-radius: 100px;
  font-size: 0.625rem;
  color: var(--spent-primary);
  font-weight: 500;
  margin-top: 6px;
}
.docs-frag-form .lock svg { color: var(--spent-vibrant); }
</style>
```

- [ ] **Step 2: Smoke-render**

Add to `getting-started.mdx`:

```mdx
import BankFormFragment from '../../components/docs/fragments/BankFormFragment.astro';

<BankFormFragment />
```

Run: dev server. Verify the form fragment renders with default Isracard tab and ID/password fields.

- [ ] **Step 3: Revert sandbox edit**

- [ ] **Step 4: Commit**

```bash
git add website/src/components/docs/fragments/BankFormFragment.astro
git commit -m "feat(docs): add BankFormFragment component"
```

---

## Task 11: Build `SyncProgressFragment.astro`

**Files:**
- Create: `website/src/components/docs/fragments/SyncProgressFragment.astro`

- [ ] **Step 1: Write the component**

```astro
---
interface Tick { label: string; done?: boolean; }
interface Props {
  name?: string;
  done?: number;
  total?: number;
  eta?: string;
  ticks?: Tick[];
}
const {
  name = 'Syncing Isracard',
  done = 23,
  total = 47,
  eta = '~12s left',
  ticks = [
    { label: 'Connected', done: true },
    { label: 'Fetched May', done: true },
    { label: 'Categorize', done: false },
  ],
} = Astro.props;
const pct = Math.max(0, Math.min(100, (done / total) * 100));
---
<div class="docs-frag-sync">
  <div class="row1">
    <span class="pulse-dot" aria-hidden="true"></span>
    <span class="name">{name}</span>
  </div>
  <div class="bar-bg"><div class="bar-fill" style={`width: ${pct.toFixed(1)}%;`}></div></div>
  <div class="stats"><span>{done} of {total}</span><span>{eta}</span></div>
  <div class="ticks">
    {ticks.map(t => (
      <div class={`tick${t.done ? '' : ' pending'}`}>
        {t.done ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg>
        )}
        {t.label}
      </div>
    ))}
  </div>
</div>

<style>
.docs-frag-sync {
  background: var(--spent-card);
  border: 1px solid var(--spent-border);
  border-radius: 12px;
  padding: 14px;
  box-shadow: var(--spent-shadow-card);
  font-family: var(--spent-font-sans);
  font-size: 0.75rem;
  max-width: 22rem;
  margin: 1.5rem 0;
}
.docs-frag-sync .row1 { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.docs-frag-sync .pulse-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--spent-vibrant);
  animation: spent-pulse 2s infinite;
}
.docs-frag-sync .name { font-weight: 600; color: var(--spent-fg); }
.docs-frag-sync .bar-bg {
  height: 8px; background: var(--spent-bg-soft);
  border-radius: 100px; overflow: hidden; margin-bottom: 8px;
}
.docs-frag-sync .bar-fill { height: 100%; background: var(--spent-vibrant); border-radius: 100px; }
.docs-frag-sync .stats {
  display: flex; justify-content: space-between;
  font-family: var(--spent-font-mono);
  font-size: 0.6rem;
  color: var(--spent-fg-muted);
  margin-bottom: 12px;
}
.docs-frag-sync .ticks { display: flex; flex-direction: column; gap: 6px; }
.docs-frag-sync .tick {
  display: flex; align-items: center; gap: 8px;
  font-size: 0.75rem; color: var(--spent-fg);
}
.docs-frag-sync .tick svg { color: var(--spent-vibrant); flex-shrink: 0; }
.docs-frag-sync .tick.pending { color: var(--spent-fg-muted); opacity: 0.5; }
</style>
```

- [ ] **Step 2: Smoke-render**

Add to `getting-started.mdx`:

```mdx
import SyncProgressFragment from '../../components/docs/fragments/SyncProgressFragment.astro';

<SyncProgressFragment />
```

Verify in dev server: green pulsing dot, progress bar at ~49%, three ticks.

- [ ] **Step 3: Revert sandbox edit**

- [ ] **Step 4: Commit**

```bash
git add website/src/components/docs/fragments/SyncProgressFragment.astro
git commit -m "feat(docs): add SyncProgressFragment component"
```

---

## Task 12: Build `TransactionListFragment.astro`

**Files:**
- Create: `website/src/components/docs/fragments/TransactionListFragment.astro`

- [ ] **Step 1: Write the component**

```astro
---
interface Row {
  icon: string;
  iconClass: 'cof' | 'gro' | 'tra' | 'sub' | 'sho';
  merchant: string;
  category: string;
  amount: string;
}
interface Props { rows?: Row[]; }
const {
  rows = [
    { icon: '☕', iconClass: 'cof', merchant: 'Aroma · Rothschild', category: '✨ Coffee', amount: '−₪14.50' },
    { icon: '🛒', iconClass: 'gro', merchant: 'Shufersal Deal', category: '✨ Groceries', amount: '−₪284.20' },
    { icon: '🚇', iconClass: 'tra', merchant: 'Rav-Kav', category: '✨ Transport', amount: '−₪124.00' },
  ],
} = Astro.props;
---
<div class="docs-frag-cat">
  {rows.map(r => (
    <div class="tx-row">
      <div class={`ico ${r.iconClass}`}>{r.icon}</div>
      <div class="body">
        <span class="merchant">{r.merchant}</span>
        <span class="cat-pill">{r.category}</span>
      </div>
      <span class="amount">{r.amount}</span>
    </div>
  ))}
</div>

<style>
.docs-frag-cat {
  background: var(--spent-card);
  border: 1px solid var(--spent-border);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--spent-shadow-card);
  max-width: 26rem;
  margin: 1.5rem 0;
}
.docs-frag-cat .tx-row {
  padding: 12px 14px;
  border-bottom: 1px solid var(--spent-border);
  display: flex;
  align-items: center;
  gap: 10px;
}
.docs-frag-cat .tx-row:last-child { border-bottom: none; }
.docs-frag-cat .ico {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; color: #fff; font-size: 13px;
}
.docs-frag-cat .ico.cof { background: var(--spent-orange); }
.docs-frag-cat .ico.gro { background: var(--spent-vibrant); color: var(--spent-primary); }
.docs-frag-cat .ico.tra { background: var(--spent-blue); }
.docs-frag-cat .ico.sub { background: var(--spent-pink); color: var(--spent-primary); }
.docs-frag-cat .ico.sho { background: var(--spent-primary); }
.docs-frag-cat .body { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.docs-frag-cat .merchant { font-weight: 600; color: var(--spent-fg); font-size: 0.85rem; font-family: var(--spent-font-sans); }
.docs-frag-cat .cat-pill {
  font-family: var(--spent-font-mono);
  font-size: 0.55rem;
  color: var(--spent-vibrant);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.docs-frag-cat .amount {
  font-family: var(--spent-font-mono);
  font-size: 0.8rem;
  color: var(--spent-orange);
  font-weight: 600;
}
</style>
```

- [ ] **Step 2: Smoke-render**

Add to `getting-started.mdx`:

```mdx
import TransactionListFragment from '../../components/docs/fragments/TransactionListFragment.astro';

<TransactionListFragment />
```

Verify three transaction rows render with coffee / cart / transit icons.

- [ ] **Step 3: Revert sandbox edit**

- [ ] **Step 4: Commit**

```bash
git add website/src/components/docs/fragments/TransactionListFragment.astro
git commit -m "feat(docs): add TransactionListFragment component"
```

---

## Task 13: Reshape the Starlight sidebar

Wire the new pages into the sidebar before the page rewrites land. Pages that don't exist yet will 404 in dev until their tasks land — that's expected.

**Files:**
- Modify: `website/astro.config.mjs`

- [ ] **Step 1: Replace the `sidebar:` block**

In `website/astro.config.mjs`, replace the existing `sidebar: [...]` array with:

```js
sidebar: [
  {
    label: 'Welcome',
    items: [
      { label: 'Getting started', slug: 'getting-started' },
      { label: 'What is Spent?', slug: 'what-is-spent' },
    ],
  },
  {
    label: 'Install',
    items: [
      { label: 'On macOS', slug: 'install/mac' },
      { label: 'On Windows', slug: 'install/windows' },
      { label: 'On Linux', slug: 'install/linux' },
    ],
  },
  {
    label: 'Using Spent',
    items: [
      { label: 'Connect your bank', slug: 'connect-bank' },
      { label: 'Categorize with AI', slug: 'ai-categorization' },
      { label: 'Sync & dashboard', slug: 'sync-and-dashboard' },
      { label: 'Categories & budgets', slug: 'categories-and-budgets' },
      { label: 'Hebrew & RTL', slug: 'hebrew-and-rtl' },
    ],
  },
  {
    label: 'Reference',
    items: [
      { label: 'Troubleshooting', slug: 'troubleshooting' },
      { label: 'Security & privacy', slug: 'security-and-privacy' },
      { label: 'Disclaimer', slug: 'disclaimer' },
    ],
  },
],
```

- [ ] **Step 2: Smoke-check the sidebar renders**

Run: `cd website && npm run dev`
Open: any docs page. Sidebar shows the 4 groups with the new items. Items for not-yet-created pages link to 404s — fine for now.

- [ ] **Step 3: Commit**

```bash
git add website/astro.config.mjs
git commit -m "feat(docs): reshape sidebar around user journey"
```

---

## Task 14: Promote `.md` reference pages to `.mdx`

The Callout component is JSX-based and needs MDX. Convert the three remaining `.md` files now so subsequent tasks can use callouts without surprises.

**Files:**
- Rename: `website/src/content/docs/troubleshooting.md` → `troubleshooting.mdx`
- Rename: `website/src/content/docs/security-and-privacy.md` → `security-and-privacy.mdx`
- Rename: `website/src/content/docs/disclaimer.md` → `disclaimer.mdx`
- Rename: `website/src/content/docs/404.md` → leave as-is (no callouts needed; Starlight splash template).

- [ ] **Step 1: Rename via git so history follows**

```bash
git mv website/src/content/docs/troubleshooting.md website/src/content/docs/troubleshooting.mdx
git mv website/src/content/docs/security-and-privacy.md website/src/content/docs/security-and-privacy.mdx
git mv website/src/content/docs/disclaimer.md website/src/content/docs/disclaimer.mdx
```

- [ ] **Step 2: Smoke-check pages still load**

Run: dev server. Visit `/Spent/troubleshooting`, `/Spent/security-and-privacy`, `/Spent/disclaimer`. All three render the same as before.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(docs): promote reference pages to mdx"
```

---

## Task 15: Build the fake-data seed module

The shared dataset that the screenshot script will load into the tmp DB.

**Files:**
- Create: `scripts/docs-seed/fake-data.mjs`

- [ ] **Step 1: Write the seed module**

```js
// scripts/docs-seed/fake-data.mjs
//
// Curated fake dataset for docs screenshots. Used only by
// scripts/capture-docs-screenshots.mjs. No real user data.

const today = new Date();

function daysAgo(n) {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Reference: schema in src/server/db/migrations/001_initial.sql
export const banks = [
  { provider: 'isracard', label: 'Isracard' },
  { provider: 'hapoalim', label: 'Bank Hapoalim' },
  { provider: 'max', label: 'Max' },
];

// 16 seeded categories from 001_initial.sql, by 1-based id.
export const categoryIds = {
  Groceries: 1,
  Restaurants: 2,
  Transport: 3,
  Shopping: 4,
  Entertainment: 5,
  Health: 6,
  Education: 7,
  BillsUtilities: 8,
  Subscriptions: 9,
  Travel: 10,
  CashATM: 11,
  Transfers: 12,
  Insurance: 13,
  Home: 14,
  PersonalCare: 15,
};

export const transactions = [
  // This-month coffees
  { date: daysAgo(0), merchant: 'Aroma · Rothschild', amount: -14.5, cat: categoryIds.Restaurants, provider: 'isracard' },
  { date: daysAgo(1), merchant: 'Cofix · Allenby', amount: -7.0, cat: categoryIds.Restaurants, provider: 'isracard' },
  { date: daysAgo(2), merchant: 'Aroma · Sarona', amount: -14.5, cat: categoryIds.Restaurants, provider: 'isracard' },
  // Groceries
  { date: daysAgo(3), merchant: 'Shufersal Deal', amount: -284.2, cat: categoryIds.Groceries, provider: 'hapoalim' },
  { date: daysAgo(8), merchant: 'Tiv Taam', amount: -198.4, cat: categoryIds.Groceries, provider: 'isracard' },
  { date: daysAgo(15), merchant: 'Shufersal Deal', amount: -312.8, cat: categoryIds.Groceries, provider: 'hapoalim' },
  // Transport
  { date: daysAgo(4), merchant: 'Rav-Kav', amount: -124.0, cat: categoryIds.Transport, provider: 'isracard' },
  { date: daysAgo(11), merchant: 'Gett', amount: -42.5, cat: categoryIds.Transport, provider: 'max' },
  { date: daysAgo(18), merchant: 'Rav-Kav', amount: -124.0, cat: categoryIds.Transport, provider: 'isracard' },
  // Bills
  { date: daysAgo(6), merchant: 'Cellcom', amount: -89.0, cat: categoryIds.BillsUtilities, provider: 'hapoalim' },
  { date: daysAgo(9), merchant: 'Bezeq International', amount: -119.0, cat: categoryIds.BillsUtilities, provider: 'hapoalim' },
  { date: daysAgo(14), merchant: 'Hot · Pakage', amount: -209.0, cat: categoryIds.BillsUtilities, provider: 'hapoalim' },
  // Subscriptions
  { date: daysAgo(7), merchant: 'Netflix', amount: -49.9, cat: categoryIds.Subscriptions, provider: 'max' },
  { date: daysAgo(7), merchant: 'Spotify', amount: -19.9, cat: categoryIds.Subscriptions, provider: 'max' },
  { date: daysAgo(7), merchant: 'iCloud+', amount: -8.9, cat: categoryIds.Subscriptions, provider: 'max' },
  // Food delivery
  { date: daysAgo(2), merchant: 'Wolt · Pizza Domino', amount: -68.0, cat: categoryIds.Restaurants, provider: 'isracard' },
  { date: daysAgo(5), merchant: 'Tenten', amount: -120.0, cat: categoryIds.Restaurants, provider: 'isracard' },
  // Health
  { date: daysAgo(10), merchant: 'Super-Pharm', amount: -94.7, cat: categoryIds.Health, provider: 'hapoalim' },
  { date: daysAgo(20), merchant: 'Clalit Pharmacy', amount: -34.0, cat: categoryIds.Health, provider: 'hapoalim' },
  // Last month
  { date: daysAgo(32), merchant: 'Shufersal Deal', amount: -298.4, cat: categoryIds.Groceries, provider: 'hapoalim' },
  { date: daysAgo(34), merchant: 'Rav-Kav', amount: -124.0, cat: categoryIds.Transport, provider: 'isracard' },
  { date: daysAgo(37), merchant: 'Cellcom', amount: -89.0, cat: categoryIds.BillsUtilities, provider: 'hapoalim' },
  { date: daysAgo(40), merchant: 'Netflix', amount: -49.9, cat: categoryIds.Subscriptions, provider: 'max' },
  { date: daysAgo(45), merchant: 'Aroma · Dizengoff', amount: -14.5, cat: categoryIds.Restaurants, provider: 'isracard' },
  { date: daysAgo(48), merchant: 'Wolt · Sushi Bazaar', amount: -82.0, cat: categoryIds.Restaurants, provider: 'isracard' },
  // Income (positive amount)
  { date: daysAgo(28), merchant: 'Acme Industries · Payroll', amount: 18500.0, cat: categoryIds.Transfers, provider: 'hapoalim' },
  { date: daysAgo(58), merchant: 'Acme Industries · Payroll', amount: 18500.0, cat: categoryIds.Transfers, provider: 'hapoalim' },
];

// Optional: monthly budget targets per parent category.
export const budgets = [
  { category_id: categoryIds.Groceries, monthly_target: 1200 },
  { category_id: categoryIds.Restaurants, monthly_target: 800 },
  { category_id: categoryIds.Transport, monthly_target: 500 },
  { category_id: categoryIds.BillsUtilities, monthly_target: 600 },
  { category_id: categoryIds.Subscriptions, monthly_target: 150 },
];
```

- [ ] **Step 2: Smoke-import the module**

Run from repo root:

```bash
node -e "import('./scripts/docs-seed/fake-data.mjs').then(m => console.log(m.transactions.length, 'transactions,', m.banks.length, 'banks'))"
```

Expected: prints `26 transactions, 3 banks` (or similar count if you tweaked rows).

- [ ] **Step 3: Commit**

```bash
git add scripts/docs-seed/fake-data.mjs
git commit -m "feat(docs): add fake dataset for screenshot capture"
```

---

## Task 16: Build the screenshot capture script

Spins up Next.js against a tmp `SPENT_DATA_DIR`, seeds the DB via the existing app boot (which runs migrations), inserts fake data via raw SQL, captures the screenshots, then cleans up.

**Files:**
- Create: `scripts/capture-docs-screenshots.mjs`
- Modify: `package.json` (add `docs:screenshots` script)

- [ ] **Step 1: Write the capture script**

```js
// scripts/capture-docs-screenshots.mjs
//
// Boot Next.js against a tmp data dir seeded with fake data,
// capture docs screenshots into website/src/assets/screenshots/.
//
// Usage:
//   npm run docs:screenshots
//
// Requires a built Next app (run `npm run build` first) OR uses dev mode.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import puppeteer from 'puppeteer';
import { banks, transactions, budgets } from './docs-seed/fake-data.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(REPO_ROOT, 'website/src/assets/screenshots');

const VIEWPORT = { width: 1600, height: 1100, deviceScaleFactor: 2 };
const PORT = 4399; // separate from prod 41234 and dev 3000

const SCREENS = [
  { name: 'home-light.png', path: '/', theme: 'light' },
  { name: 'dashboard-light.png', path: '/budget', theme: 'light' },
  { name: 'dashboard-dark.png', path: '/', theme: 'dark' },
  { name: 'transactions-light.png', path: '/transactions', theme: 'light' },
  { name: 'settings-banks-light.png', path: '/settings/bank', theme: 'light' },
  { name: 'settings-ai-light.png', path: '/settings/ai', theme: 'light' },
  { name: 'settings-categories-light.png', path: '/settings/categories', theme: 'light' },
  {
    name: 'setup-bank-light.png',
    path: '/setup',
    theme: 'light',
  },
];

function seedDb(dbDir) {
  fs.mkdirSync(dbDir, { recursive: true });
  // First boot the dev server briefly to run migrations? No — open the DB
  // directly. But the schema isn't applied until the app opens it. Simplest:
  // open via better-sqlite3, apply migrations manually from the SQL file.
  const dbPath = path.join(dbDir, 'spent.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  const migrationPath = path.join(REPO_ROOT, 'src/server/db/migrations/001_initial.sql');
  db.exec(fs.readFileSync(migrationPath, 'utf-8'));

  // Insert banks with dummy encrypted blobs. The dashboard doesn't decrypt
  // these to render — it only shows the provider label.
  const insertBank = db.prepare(
    `INSERT INTO bank_credentials (provider, credentials_encrypted, iv, auth_tag)
     VALUES (?, ?, ?, ?)`,
  );
  for (const b of banks) {
    insertBank.run(b.provider, Buffer.from('demo'), Buffer.from('demo'), Buffer.from('demo'));
  }

  // Insert transactions. The actual schema has more columns; we fill the
  // required ones with sensible defaults.
  const insertTx = db.prepare(
    `INSERT INTO transactions
      (account_number, date, processed_date, original_amount, original_currency,
       charged_amount, charged_currency, description, type, status, category_id, provider, hash)
     VALUES (@account, @date, @date, @amount, 'ILS', @amount, 'ILS', @desc, 'normal', 'completed', @cat, @provider, @hash)`,
  );
  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    insertTx.run({
      account: '****1234',
      date: t.date,
      amount: t.amount,
      desc: t.merchant,
      cat: t.cat,
      provider: t.provider,
      hash: `demo-${i.toString().padStart(4, '0')}`,
    });
  }

  // Budgets — table may or may not exist depending on schema; soft-fail.
  try {
    const insertBudget = db.prepare(
      `INSERT INTO budgets (category_id, monthly_target) VALUES (?, ?)`,
    );
    for (const b of budgets) insertBudget.run(b.category_id, b.monthly_target);
  } catch (e) {
    console.log('   (skipping budgets table — not in schema)');
  }

  db.close();
  return dbPath;
}

function startServer(dataDir) {
  const env = { ...process.env, SPENT_DATA_DIR: dataDir, PORT: String(PORT) };
  // Use `next dev` for fastest iteration. Could also use `next start` if you
  // ran `npm run build` first.
  const child = spawn('npm', ['run', 'dev', '--', '-p', String(PORT)], {
    cwd: REPO_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return child;
}

async function waitForServer() {
  const url = `http://127.0.0.1:${PORT}/api/health`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    const html = document.documentElement;
    html.classList.remove('light', 'dark');
    html.classList.add(t);
    try { localStorage.setItem('theme', t); } catch {}
  }, theme);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spent-docs-'));
  console.log(`Tmp data dir: ${tmpDir}`);

  console.log('Seeding fake data...');
  seedDb(tmpDir);
  console.log('  ✓ seeded');

  console.log('Starting Next.js (this can take 10-20s)...');
  const server = startServer(tmpDir);
  server.stdout.on('data', (d) => process.stdout.write(`  [next] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`  [next!] ${d}`));

  const ready = await waitForServer();
  if (!ready) {
    server.kill('SIGTERM');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error('Next.js did not become ready in 60s');
  }
  console.log('  ✓ Next.js is ready');

  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: VIEWPORT,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle2', timeout: 30000 });

    for (const screen of SCREENS) {
      const dest = path.join(OUT_DIR, screen.name);
      console.log(`Capturing ${screen.name} ← ${screen.path} (${screen.theme})`);
      await setTheme(page, screen.theme);
      await page.goto(`http://127.0.0.1:${PORT}${screen.path}`, { waitUntil: 'networkidle2', timeout: 30000 });
      await setTheme(page, screen.theme);
      await new Promise(r => setTimeout(r, 1200));
      await page.screenshot({ path: dest, fullPage: false });
      console.log('  ✓ saved');
    }
  } finally {
    await browser.close();
    server.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 1000));
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log('Cleaned up tmp dir');
  }
})().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `scripts`:

```json
"docs:screenshots": "node scripts/capture-docs-screenshots.mjs",
```

- [ ] **Step 3: Test the script**

Run: `npm run docs:screenshots`
Expected: tmp dir created, fake data seeded, Next.js boots on port 4399, Puppeteer captures all 8 screenshots into `website/src/assets/screenshots/`, tmp dir cleaned up, script exits 0.

If a particular page errors (e.g. budgets table missing), the script logs the error and continues to the next screenshot. The screenshot of the failed page may show an error state — that's OK, we'll note which ones we use in subsequent rewrites.

- [ ] **Step 4: Spot-check one screenshot**

Open `website/src/assets/screenshots/dashboard-light.png` in Preview. Verify it shows fake merchants (Aroma, Shufersal, Cellcom, etc.) — not whatever your real DB contains.

- [ ] **Step 5: Commit**

```bash
git add scripts/capture-docs-screenshots.mjs package.json website/src/assets/screenshots/
git commit -m "feat(docs): add fake-data screenshot capture script"
```

---

## Task 17: Rewrite `getting-started.mdx` as the editorial landing

**Files:**
- Modify: `website/src/content/docs/getting-started.mdx`

- [ ] **Step 1: Replace the file contents**

Overwrite `website/src/content/docs/getting-started.mdx` with:

```mdx
---
title: Getting started
description: A local-only personal finance tracker for Israeli banks. Beautiful, private, open source.
---

import { Image } from 'astro:assets';
import dashboardShot from '../../assets/screenshots/dashboard-light.png';
import DocsHero from '../../components/docs/DocsHero.astro';
import DocsCardGrid from '../../components/docs/DocsCardGrid.astro';
import DocsCard from '../../components/docs/DocsCard.astro';
import Callout from '../../components/docs/Callout.astro';

<DocsHero
  eyebrow="WELCOME"
  titleBold="Spent"
  titleItalic="in five minutes."
  lede="A local-only personal finance tracker for Israeli banks. Beautiful, private, open source."
/>

Spent runs entirely on your own computer. It signs into your Israeli banks for you, pulls down the last few months of transactions, sorts them into categories, and shows you a calm dashboard at `localhost`. No cloud, no accounts, no telemetry.

<figure class="doc-figure">
  <Image src={dashboardShot} alt="The Spent dashboard, showing monthly spending, category totals, and recent transactions" class="doc-shot" />
  <figcaption>The dashboard you'll wake up to every morning.</figcaption>
</figure>

## What you'll need

- A Mac, Windows PC, or Linux machine.
- About **10 minutes** to install and 5 to connect a bank.
- Your **bank login credentials** (same ones you use on the bank's website).
- *Optional*: an **Anthropic API key** for Claude, or **Ollama installed locally**. You can also skip AI entirely.

<Callout variant="gotcha">
Spent automates your bank's website on your behalf. Some banks restrict this in their terms. You're responsible for using Spent within them. Read the full [Disclaimer](/Spent/disclaimer) before installing.
</Callout>

## Pick your path

<DocsCardGrid>
  <DocsCard eyebrow="START HERE" title="What is Spent?" desc="One-pager about the project, philosophy, and trade-offs." href="/Spent/what-is-spent" accent="sage" arrow="Read the intro →" />
  <DocsCard eyebrow="INSTALL · MACOS" title="On macOS" desc="Three commands, about ten minutes." href="/Spent/install/mac" accent="vibrant" arrow="Install →" />
  <DocsCard eyebrow="INSTALL · WINDOWS" title="On Windows" desc="Three commands, plus a .NET 8 SDK prompt." href="/Spent/install/windows" accent="blue" arrow="Install →" />
  <DocsCard eyebrow="INSTALL · LINUX" title="On Linux" desc="Service-only, no menubar." href="/Spent/install/linux" accent="orange" arrow="Install →" />
  <DocsCard eyebrow="USING SPENT" title="Connect your bank" desc="What credentials each Israeli bank needs." href="/Spent/connect-bank" accent="pink" arrow="Connect →" />
  <DocsCard eyebrow="USING SPENT" title="Categorize with AI" desc="Claude, Ollama, or manual — pick one." href="/Spent/ai-categorization" accent="blue" arrow="Choose a provider →" />
  <DocsCard eyebrow="USING SPENT" title="Sync & dashboard" desc="Day-to-day use, menubar, dark mode." href="/Spent/sync-and-dashboard" accent="orange" arrow="Tour the dashboard →" />
  <DocsCard eyebrow="REFERENCE" title="Security & privacy" desc="How encryption works, what travels the network." href="/Spent/security-and-privacy" accent="sage" arrow="Read the details →" />
  <DocsCard eyebrow="REFERENCE" title="Troubleshooting" desc="Common gotchas, grouped by OS." href="/Spent/troubleshooting" accent="pink" arrow="Find your problem →" />
</DocsCardGrid>
```

- [ ] **Step 2: Verify**

Run: dev server. Open `/Spent/getting-started`. You should see the new hero, intro paragraph, dashboard screenshot, gotcha callout, and a 9-card grid. Click each card — they should land on the right pages (some 404 until later tasks).

- [ ] **Step 3: Commit**

```bash
git add website/src/content/docs/getting-started.mdx
git commit -m "feat(docs): rewrite getting-started as editorial landing"
```

---

## Task 18: Write `what-is-spent.mdx`

**Files:**
- Create: `website/src/content/docs/what-is-spent.mdx`

- [ ] **Step 1: Write the page**

```mdx
---
title: What is Spent?
description: One-pager about the project, philosophy, and trade-offs.
---

import DocsHero from '../../components/docs/DocsHero.astro';
import Callout from '../../components/docs/Callout.astro';
import NextStepCard from '../../components/docs/NextStepCard.astro';

<DocsHero
  eyebrow="WELCOME"
  titleBold="A finance tracker"
  titleItalic="for Israel."
  lede="Lives on your computer, talks directly to your bank, and quietly keeps your finances in order."
/>

## Why Spent exists

Israeli banks have terrible exports. YNAB doesn't speak ILS gracefully. Every "cloud finance" app wants you to hand over your bank password to a server you don't control. Spent is the answer for people who'd rather just run something on their own laptop.

Your transactions are pulled directly from your bank with the open-source [`israeli-bank-scrapers`](https://github.com/eshaham/israeli-bank-scrapers) library, stored in a local SQLite file you can `cp` and back up like any other file, and categorized by an AI provider **you choose**: paid Claude (Anthropic), free local Ollama, or nothing at all.

## The trade-off, honestly

You self-host. You trust the scraper. You accept that banks may not love automation — some restrict it in their terms.

In return you get a fast, beautiful, fully offline dashboard that never phones home.

<Callout variant="gotcha">
Spent is **read-only**. It cannot transfer funds, pay bills, or change settings inside your bank account. It only reads transaction data the bank's website already shows you.
</Callout>

## Architecture, in one sentence

A Next.js app + a SQLite file + a headless Chromium tab that drives your bank's login + your choice of AI for categorization, all on `127.0.0.1`.

## Status

**Beta.** Built by [Shay Avivi](https://github.com/Shaya16) for personal use first and then released. MIT licensed. Issues and PRs welcome on [GitHub](https://github.com/alon710/Spent).

Things that work today: Isracard, Hapoalim, Max, Visa Cal, Leumi, Mizrahi, Discount, FIBI group, Yahav, One Zero (with OTP), Beyahad Bishvilha. Light + dark themes. Hebrew + English UI.

Things that don't yet: custom categories, exports, multi-user, mobile.

<NextStepCard href="/Spent/install/mac" title="Install on macOS" />
```

- [ ] **Step 2: Verify**

Open `/Spent/what-is-spent`. Verify hero, paragraphs, gotcha callout, and a sage "Next" card pointing to mac install.

- [ ] **Step 3: Commit**

```bash
git add website/src/content/docs/what-is-spent.mdx
git commit -m "feat(docs): add What is Spent? intro page"
```

---

## Task 19: Rewrite `install/mac.mdx`

**Files:**
- Modify: `website/src/content/docs/install/mac.mdx`

- [ ] **Step 1: Replace the file**

```mdx
---
title: Install on macOS
description: Three commands, about ten minutes.
---

import DocsHero from '../../../components/docs/DocsHero.astro';
import StepList from '../../../components/docs/StepList.astro';
import StepItem from '../../../components/docs/StepItem.astro';
import Callout from '../../../components/docs/Callout.astro';
import ForDevelopers from '../../../components/docs/ForDevelopers.astro';
import NextStepCard from '../../../components/docs/NextStepCard.astro';

<DocsHero
  eyebrow="INSTALL · MACOS"
  titleBold="Install Spent"
  titleItalic="on your Mac."
  lede="Three commands, about ten minutes. Spent will install itself as a background service and put a small icon in your menu bar."
/>

## What you'll need

- macOS 12 (Monterey) or newer.
- About **500 MB** of disk space.
- Your bank login credentials (have them ready).

<StepList>

<StepItem i={1} title="Install Node.js">

Spent runs on Node.js, a small runtime you install once. Go to **[nodejs.org](https://nodejs.org)**, download the **LTS** installer for macOS, and run it. Click through the defaults.

If you prefer Homebrew:

```sh
brew install node@20
```

</StepItem>

<StepItem i={2} title="Get Spent">

Open **Terminal** (in *Applications → Utilities*) and clone the repo:

```sh
git clone https://github.com/alon710/Spent.git ~/Applications/Spent
cd ~/Applications/Spent
```

No Git? Download the [latest source as a zip](https://github.com/alon710/Spent/releases) and unzip it to `~/Applications/Spent`. Then in Terminal: `cd ~/Applications/Spent`.

</StepItem>

<StepItem i={3} title="Install and run setup">

```sh
npm install
npm run setup
```

`npm install` takes 2-3 minutes the first time. `npm run setup` does everything else: builds the app, installs the background service, builds the menubar, registers everything to start at login, and opens the dashboard.

</StepItem>

</StepList>

<Callout variant="note">
**Setup may pause to install Xcode Command Line Tools** if you don't have them yet. That's a 1 GB, 5-15 minute system download. You can say no and skip the menubar (web app still installs). Re-run `npm run setup` later to add it.
</Callout>

<ForDevelopers summary="What `npm run setup` actually does">

In order:

1. **Builds the Next.js app** (`npm run build`).
2. **Adds `127.0.0.1 spent.local` to `/etc/hosts`** so you can reach the dashboard at `http://spent.local:41234`. Asks for `sudo` once.
3. **Registers a LaunchAgent** at `~/Library/LaunchAgents/io.spent.app.plist` that starts the server on login. Server binds to `127.0.0.1:41234` only.
4. **Builds `Spent.app`** from `menubar/mac/` (Swift). Needs Xcode Command Line Tools (offered for install if missing).
5. **Copies `Spent.app` to `~/Applications/`** and registers it as a Login Item so the menubar shows up after reboot.
6. **Polls `/api/health`** until the server is ready, then opens the browser.

Source: `scripts/setup.mjs`.

</ForDevelopers>

## First launch

The first time you click the menubar icon, macOS Gatekeeper will balk:

<Callout variant="gotcha">
*"Spent.app can't be opened because it is from an unidentified developer."* — Right-click `Spent.app` in `~/Applications`, choose **Open**, then **Open** in the dialog. After the first launch, double-click works normally.
</Callout>

## Day-to-day commands

Once installed, you mostly forget the terminal. But these are useful:

```sh
npm run service:status   # is the background service running?
npm run service:start    # start it
npm run service:stop     # stop it
npm run service:reload   # rebuild + restart (after a code change)
npm run service:logs     # tail the server logs
npm run service:open     # open the dashboard in the browser
```

## Uninstall

To remove the service, hosts entry, menubar, and login item:

```sh
npm run uninstall
```

Your `data/` folder is left alone so you can reinstall later.

<NextStepCard href="/Spent/connect-bank" title="Connect your bank" />
```

- [ ] **Step 2: Verify**

Open `/Spent/install/mac`. Verify hero, three step cards with pastel-rotation numbers, the auto-Xcode callout, the For Developers accordion, the Gatekeeper gotcha, day-to-day commands, uninstall, and the Next CTA.

- [ ] **Step 3: Commit**

```bash
git add website/src/content/docs/install/mac.mdx
git commit -m "feat(docs): rewrite mac install around npm run setup"
```

---

## Task 20: Rewrite `install/windows.mdx`

**Files:**
- Modify: `website/src/content/docs/install/windows.mdx`

- [ ] **Step 1: Replace the file**

```mdx
---
title: Install on Windows
description: Three commands. The setup script handles the rest.
---

import DocsHero from '../../../components/docs/DocsHero.astro';
import StepList from '../../../components/docs/StepList.astro';
import StepItem from '../../../components/docs/StepItem.astro';
import Callout from '../../../components/docs/Callout.astro';
import ForDevelopers from '../../../components/docs/ForDevelopers.astro';
import NextStepCard from '../../../components/docs/NextStepCard.astro';

<DocsHero
  eyebrow="INSTALL · WINDOWS"
  titleBold="Install Spent"
  titleItalic="on Windows."
  lede="Three commands. The setup script handles the service, the menubar, and the auto-start."
/>

## What you'll need

- Windows 10 or 11.
- About **500 MB** of disk space (plus ~200 MB for the .NET 8 SDK if you don't have it).
- Your bank login credentials.
- An **elevated PowerShell** (right-click → *Run as Administrator*) for the first run, so setup can edit `hosts` and register the service.

<StepList>

<StepItem i={1} title="Install Node.js">

Go to **[nodejs.org](https://nodejs.org)**, download the **Windows Installer (.msi)** for the **LTS** version, and run it.

When the installer asks *"Automatically install the necessary tools"* near the end, **leave that box unchecked** — Spent's setup will handle the right build tools for you.

</StepItem>

<StepItem i={2} title="Get Spent">

Open **PowerShell** (as Administrator) and clone:

```powershell
git clone https://github.com/alon710/Spent.git $env:USERPROFILE\Spent
cd $env:USERPROFILE\Spent
```

No Git? Download the [latest source zip](https://github.com/alon710/Spent/releases), right-click → *Extract All* into `%USERPROFILE%\Spent`, then `cd` there.

</StepItem>

<StepItem i={3} title="Install and run setup">

```powershell
npm install
npm run setup
```

`npm install` takes 3-5 minutes the first time. `npm run setup` does everything else: builds the app, registers the Windows service, builds the tray icon, places startup shortcuts, and opens the dashboard.

</StepItem>

</StepList>

<Callout variant="note">
**Setup may pause to install the .NET 8 SDK** via `winget` if it's not present (~200 MB, 2-5 min). The SDK is needed to build the tray app. Decline if you want to skip the tray; the web app still installs.
</Callout>

<Callout variant="gotcha">
**Not running as Administrator?** Setup will continue, but skip the hosts entry. `http://127.0.0.1:41234` still works; `http://spent.local:41234` won't resolve. Re-run setup from an elevated shell later to add the friendly hostname.
</Callout>

<ForDevelopers summary="What `npm run setup` actually does">

On Windows, in order:

1. **Builds the Next.js app** (`npm run build`).
2. **Adds `127.0.0.1 spent.local` to `C:\Windows\System32\drivers\etc\hosts`** (skipped if not elevated).
3. **Registers a Task Scheduler logon trigger** that runs `next start -H 127.0.0.1 -p 41234` whenever you log in. Server is only reachable from loopback.
4. **Builds `Spent.exe`** from `menubar/windows/` (C#, .NET 8). Auto-installs the SDK via `winget install Microsoft.DotNet.SDK.8` if missing.
5. **Copies `Spent.exe` to `%LOCALAPPDATA%\Programs\Spent\`** and drops a `.lnk` in `shell:startup` so the tray app shows up after reboot.
6. **Polls `/api/health`** until ready, then opens the browser.

Source: `scripts/setup.mjs`.

</ForDevelopers>

## First launch

Windows Defender may flag the unsigned tray binary on first run:

<Callout variant="gotcha">
*"Windows protected your PC"* — Click **More info → Run anyway**. The binary is built from the source code in `menubar/windows/` and you can inspect it before running.
</Callout>

## Day-to-day commands

```powershell
npm run service:status   # is the background service running?
npm run service:start    # start it
npm run service:stop     # stop it
npm run service:reload   # rebuild + restart
npm run service:logs     # tail the server logs
npm run service:open     # open the dashboard
```

## Uninstall

```powershell
npm run uninstall
```

Removes the service, hosts entry, tray binary, and startup shortcut. Your `data/` folder is preserved.

<NextStepCard href="/Spent/connect-bank" title="Connect your bank" />
```

- [ ] **Step 2: Verify**

Open `/Spent/install/windows`. Verify the three-step structure, both callouts (note + gotcha), For Developers details, day-to-day commands, Next CTA.

- [ ] **Step 3: Commit**

```bash
git add website/src/content/docs/install/windows.mdx
git commit -m "feat(docs): rewrite Windows install around npm run setup"
```

---

## Task 21: Create `install/linux.mdx`

**Files:**
- Create: `website/src/content/docs/install/linux.mdx`

- [ ] **Step 1: Write the page**

```mdx
---
title: Install on Linux
description: Service-only install. No native tray.
---

import DocsHero from '../../../components/docs/DocsHero.astro';
import StepList from '../../../components/docs/StepList.astro';
import StepItem from '../../../components/docs/StepItem.astro';
import Callout from '../../../components/docs/Callout.astro';
import ForDevelopers from '../../../components/docs/ForDevelopers.astro';
import NextStepCard from '../../../components/docs/NextStepCard.astro';

<DocsHero
  eyebrow="INSTALL · LINUX"
  titleBold="Install Spent"
  titleItalic="on Linux."
  lede="Spent on Linux installs as a user-level systemd service. There's no native menubar — you open the dashboard in your browser."
/>

## What you'll need

- A modern systemd-based distro (Ubuntu 22.04+, Fedora 38+, Arch, Debian 12+, etc.).
- **Node.js 20+** from your distro's package manager, [nvm](https://github.com/nvm-sh/nvm), or [Volta](https://volta.sh).
- About **500 MB** of disk space.
- Your bank login credentials.

<StepList>

<StepItem i={1} title="Install Node.js">

Use whichever Node distribution you prefer. If you don't have one yet:

```sh
# nvm (recommended for most users)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install --lts

# OR: Ubuntu/Debian distro package
sudo apt install nodejs npm   # check `node --version` is >= 20

# OR: Fedora
sudo dnf install nodejs
```

</StepItem>

<StepItem i={2} title="Get Spent">

```sh
git clone https://github.com/alon710/Spent.git ~/.local/share/spent
cd ~/.local/share/spent
```

</StepItem>

<StepItem i={3} title="Install and run setup">

```sh
npm install
npm run setup
```

`npm install` takes 2-3 minutes. `npm run setup` builds the app, registers a systemd `--user` unit, and opens the dashboard.

</StepItem>

</StepList>

<Callout variant="note">
**No menubar on Linux.** The setup script installs the service only. You'll open the dashboard at `http://127.0.0.1:41234` (or `http://spent.local:41234` if you add the hosts entry manually with `sudo`).
</Callout>

<ForDevelopers summary="What `npm run setup` actually does">

On Linux, in order:

1. **Builds the Next.js app** (`npm run build`).
2. **Writes a `--user` systemd unit** at `~/.config/systemd/user/spent.service` and enables it so it starts at login.
3. **Polls `/api/health`** until the server is ready, then opens the browser via `xdg-open`.

Service management goes through `systemctl --user`; the `npm run service:*` commands shell out to it.

The hosts entry for `spent.local` is **not** added on Linux by default — modifying `/etc/hosts` outside of a package manager is unusual on Linux. Add it manually if you want the friendly name:

```sh
echo "127.0.0.1 spent.local" | sudo tee -a /etc/hosts
```

Source: `scripts/setup.mjs`, `scripts/service/install.mjs`.

</ForDevelopers>

## Day-to-day commands

```sh
npm run service:status   # systemctl --user status spent
npm run service:start
npm run service:stop
npm run service:reload   # rebuild + restart
npm run service:logs     # journalctl --user -u spent -f
npm run service:open     # opens the dashboard via xdg-open
```

## Uninstall

```sh
npm run uninstall
```

Disables and removes the systemd unit. Your `data/` folder is preserved.

<NextStepCard href="/Spent/connect-bank" title="Connect your bank" />
```

- [ ] **Step 2: Verify**

Open `/Spent/install/linux`. Verify three steps, note callout, dev details, commands, uninstall, Next CTA.

- [ ] **Step 3: Commit**

```bash
git add website/src/content/docs/install/linux.mdx
git commit -m "feat(docs): add Linux install page"
```

---

## Task 22: Rewrite `connect-bank.mdx`

**Files:**
- Modify: `website/src/content/docs/connect-bank.mdx`

- [ ] **Step 1: Replace the file**

```mdx
---
title: Connect your bank
description: How to connect each supported Israeli bank and credit card.
---

import DocsHero from '../../components/docs/DocsHero.astro';
import Callout from '../../components/docs/Callout.astro';
import BankFormFragment from '../../components/docs/fragments/BankFormFragment.astro';
import SyncProgressFragment from '../../components/docs/fragments/SyncProgressFragment.astro';
import NextStepCard from '../../components/docs/NextStepCard.astro';

<DocsHero
  eyebrow="USING SPENT"
  titleBold="Connect"
  titleItalic="your bank."
  lede="Pick your bank, paste your credentials. Spent encrypts them and never sends them anywhere."
/>

After you install Spent, opening the dashboard for the first time launches a short setup wizard. The wizard asks for your bank's login the same way the bank's own website does.

<BankFormFragment />

You can connect multiple banks. Run the wizard again from *Settings → Banks*.

## How credentials are stored

Spent stores your bank password (and your Claude API key, if you use one) encrypted with **AES-256-GCM** in a local SQLite database at `data/spent.db`. The encryption key is generated on first run, written to `data/.encryption-key`, and never leaves your computer.

Read the full mechanism in [Security & privacy](/Spent/security-and-privacy).

## A note about 2FA

Most Israeli banks **do not** support 2FA in a way that's compatible with automation. If you have 2FA enabled, you'll need to disable it on the bank's side before Spent can log in.

<Callout variant="note">
**One Zero is the exception** — it supports proper second-factor authentication during sync. Spent pauses and prompts you for the OTP when needed.
</Callout>

## Per-bank credentials

Each bank asks for slightly different fields. Here's what each wants.

### Credit cards

#### Isracard

- **ID number** — your 9-digit Israeli national ID (Teudat Zehut).
- **Last 6 digits of your card** — from the front of the card.
- **Password** — the same password you use on `digital.isracard.co.il`.

#### Visa Cal

- **Username** and **password** from `cal-online.co.il`.

#### Max

- **Username** and **password** from `max.co.il` (formerly Leumi Card).

#### American Express IL

- **Username** and **password** from your Israeli Amex account.

### Banks

#### Bank Hapoalim

- **User code** and **password**. The user code is *not* your ID number — it's the one shown in the bank app's *Personal area*.

#### Bank Leumi

- **Username** and **password**.

#### Mizrahi Tefahot

- **Username** and **password**.

#### Bank Discount, Mercantile Discount

- **ID number**, **password**, and an **account number** (sometimes labeled *num*).

#### First International (FIBI), Otsar Hahayal, Bank Pagi

- **Username** and **password**. All three are FIBI-group banks and share a login pattern.

#### Bank Yahav

- **ID number** and **password**.

<Callout variant="gotcha">
Yahav only exposes about **6 months** of transaction history through its website. Older data isn't reachable.
</Callout>

#### Bank Massad, Union Bank

- **Username** and **password**.

#### One Zero

- **Email**, **password**, and an **OTP** delivered to your phone during each sync. Spent will pause and prompt you for the OTP when needed.

### Benefits

#### Beyahad Bishvilha, Behatsdaa

- **Username** and **password** from the benefit-scheme website.

## What happens when you click Sync

Spent opens a headless Chromium tab, logs into the bank using your credentials, and pulls the last 6-12 months of transactions (depending on the bank). The first sync can take a few minutes — subsequent syncs are faster because Spent only processes new transactions.

<SyncProgressFragment />

Sync runs in the background. You don't need to keep the browser open. If a sync fails, Spent shows the error in the dashboard with a hint about what went wrong (see [Troubleshooting](/Spent/troubleshooting)).

<NextStepCard href="/Spent/ai-categorization" title="Categorize with AI" />
```

- [ ] **Step 2: Verify**

Open `/Spent/connect-bank`. Verify hero, bank form fragment, the per-bank credential reference, the gotcha for Yahav, the sync progress fragment, and the Next CTA.

- [ ] **Step 3: Commit**

```bash
git add website/src/content/docs/connect-bank.mdx
git commit -m "feat(docs): rewrite connect-bank with fragments and new hero"
```

---

## Task 23: Rewrite `ai-categorization.mdx`

**Files:**
- Modify: `website/src/content/docs/ai-categorization.mdx`

- [ ] **Step 1: Replace the file**

```mdx
---
title: Categorize with AI
description: How Spent uses AI to sort transactions, and how to pick a provider.
---

import DocsHero from '../../components/docs/DocsHero.astro';
import ProviderCard from '../../components/docs/ProviderCard.astro';
import Callout from '../../components/docs/Callout.astro';
import ForDevelopers from '../../components/docs/ForDevelopers.astro';
import TransactionListFragment from '../../components/docs/fragments/TransactionListFragment.astro';
import NextStepCard from '../../components/docs/NextStepCard.astro';

<DocsHero
  eyebrow="USING SPENT"
  titleBold="Categorize"
  titleItalic="with AI."
  lede="Spent assigns each transaction to a category like Groceries, Restaurants, Transport, or Subscriptions. You pick which model does the work."
/>

<TransactionListFragment />

## Three options

<div class="docs-providergrid">
  <ProviderCard variant="claude" name="Claude" tagline="Paid · Excellent" href="#claude">
    <li><strong>Cost</strong> — about $0.01–$0.05 / month</li>
    <li><strong>Privacy</strong> — merchant + amount only</li>
    <li><strong>Quality</strong> — handles Hebrew well</li>
  </ProviderCard>
  <ProviderCard variant="ollama" name="Ollama" tagline="Free · Local" href="#ollama">
    <li><strong>Cost</strong> — free</li>
    <li><strong>Privacy</strong> — nothing leaves your computer</li>
    <li><strong>Quality</strong> — very good with `llama3.1:8b`</li>
  </ProviderCard>
  <ProviderCard variant="manual" name="Manual" tagline="Free · You" href="#manual">
    <li><strong>Cost</strong> — free</li>
    <li><strong>Privacy</strong> — perfect</li>
    <li><strong>Quality</strong> — depends on you</li>
  </ProviderCard>
</div>

You pick one during the setup wizard, and you can switch any time from *Settings → AI*. Previously-categorized transactions stay categorized; only new transactions go through the new provider.

## Claude {#claude}

Cost-effective for personal use because of Claude Haiku 4.5's pricing and Spent's batching (50 transactions per call).

**Setup:**

1. Go to `console.anthropic.com` and create an API key under *Settings → API Keys*.
2. Paste it into Spent's setup wizard (or *Settings → AI*).
3. Done. Your key is encrypted at rest with the same AES-256-GCM that protects your bank credentials.

<Callout variant="note">
Spent sends Anthropic's API the **merchant name and amount** of each new transaction — no personal IDs, no bank credentials. Anthropic's commercial API does not train on submitted data.
</Callout>

## Ollama {#ollama}

Runs a language model on your own machine. Slower than Claude, but every byte stays local.

**Setup:**

1. Install Ollama from **[ollama.com/download](https://ollama.com/download)**.
2. In a terminal:
   ```sh
   ollama pull llama3.1:8b
   ```
   (4.7 GB download. `qwen2.5:3b` is a smaller alternative.)
3. In Spent's setup wizard, choose Ollama and pick the model.

Spent talks to Ollama at `http://localhost:11434`, its default.

<Callout variant="gotcha">
Ollama needs about **6-12 GB of RAM** while running. Smaller models can struggle with Hebrew merchant names — `llama3.1:8b` and `qwen2.5:3b` are the most reliable.
</Callout>

## Manual {#manual}

Skip AI entirely. Each transaction starts in *Uncategorized*. You assign categories by clicking the category badge in the dashboard.

Slow, but perfect privacy and perfect accuracy.

## How batching works

When Spent syncs, it groups uncategorized transactions into batches of **50** and sends each batch to the chosen provider in one round-trip. This keeps cost and latency low.

<ForDevelopers summary="What the prompt and retry logic look like">

The prompt (defined in `src/server/ai/prompts.ts`) is shared between Claude and Ollama. It asks the model to return JSON: an array of objects with `merchant`, `category`, and a confidence score.

Spent retries up to **three times** on malformed output. Persistent failures fall back to *Uncategorized* — never to a wrong category.

Default Claude model: `claude-haiku-4-5-20251001`. To upgrade, edit `src/server/ai/providers/claude.ts`.

</ForDevelopers>

## Switching providers

Switch any time from *Settings → AI*. Previously-categorized transactions stay categorized; only new transactions (and ones you've explicitly re-categorized) go through the new provider.

<Callout variant="gotcha">
**If you switch away from Claude, revoke your API key** in the Anthropic console. Spent will discard it locally, but rotating it is the safe move.
</Callout>

<NextStepCard href="/Spent/sync-and-dashboard" title="Sync & dashboard" />
```

- [ ] **Step 2: Verify**

Open `/Spent/ai-categorization`. Verify hero, transaction list fragment, three provider cards, per-provider sections with anchors (`#claude`, `#ollama`, `#manual`) navigable from the cards.

- [ ] **Step 3: Commit**

```bash
git add website/src/content/docs/ai-categorization.mdx
git commit -m "feat(docs): rewrite AI page with ProviderCards"
```

---

## Task 24: Rewrite `sync-and-dashboard.mdx`

**Files:**
- Modify: `website/src/content/docs/sync-and-dashboard.mdx`

- [ ] **Step 1: Replace the file**

```mdx
---
title: Sync & dashboard
description: Day-to-day usage — the dashboard, syncing, and the menubar app.
---

import { Image } from 'astro:assets';
import dashboardLight from '../../assets/screenshots/dashboard-light.png';
import dashboardDark from '../../assets/screenshots/dashboard-dark.png';
import transactions from '../../assets/screenshots/transactions-light.png';
import DocsHero from '../../components/docs/DocsHero.astro';
import SyncProgressFragment from '../../components/docs/fragments/SyncProgressFragment.astro';
import Callout from '../../components/docs/Callout.astro';
import NextStepCard from '../../components/docs/NextStepCard.astro';

<DocsHero
  eyebrow="USING SPENT"
  titleBold="Sync"
  titleItalic="and dashboard."
  lede="What you'll actually do once Spent is installed — sync, browse, re-categorize, sleep."
/>

## The dashboard

<figure class="doc-figure">
  <Image src={dashboardLight} alt="The Spent dashboard, with monthly totals at top and recent transactions below" class="doc-shot" />
  <figcaption>The default view when you open Spent.</figcaption>
</figure>

Visit `http://localhost:41234` (or `http://spent.local:41234` if you added the hosts entry). The dashboard has four areas:

- **Overview** — monthly totals, "on track / heads-up / over" status pills, top spending categories.
- **Transactions** — chronological list with merchant, amount, category, date. Click a row to edit.
- **Budget** — your monthly budget and pacing card.
- **Settings** — banks, AI provider, sync schedule, preferences.

## Syncing

By default, Spent syncs **once a day at 03:00** local time. Change this in *Settings → Sync schedule*, or trigger a manual sync from the menubar or the dashboard.

A sync does three things, in order:

1. **Scrape** — log into each connected bank and download new transactions.
2. **Deduplicate** — compare against existing transactions using a content hash (so you don't get duplicates if a bank shifts an old transaction's identifier).
3. **Categorize** — send uncategorized transactions to your chosen AI provider, in batches of 50.

<SyncProgressFragment />

If any step fails, the dashboard shows the error with a hint about what to do. See [Troubleshooting](/Spent/troubleshooting) for the common ones.

## The menubar / tray app

On macOS the menubar app gives you four actions; on Windows it's the same set in the system tray:

- **Open** — opens the dashboard in your default browser.
- **Sync now** — runs an immediate sync.
- **Start / Stop service** — pause Spent without uninstalling.
- **Quit** — quits the menubar (the background service keeps running).

The icon goes to a small animated dot while a sync is running.

<Callout variant="note">
On Linux there's no native menubar. Use `npm run service:open` or just bookmark `http://127.0.0.1:41234`.
</Callout>

## Transactions

<figure class="doc-figure">
  <Image src={transactions} alt="The transactions list, with merchant names, amounts, and category badges" class="doc-shot" />
  <figcaption>Filter, search, click any row to re-categorize.</figcaption>
</figure>

Click any category badge to change it. Spent remembers the correction and uses it the next time it sees a similar merchant — no re-training needed.

## Dark mode

Spent ships with a built-in dark theme. Toggle it from *Settings → Preferences*, or let it follow your OS.

<figure class="doc-figure">
  <Image src={dashboardDark} alt="The same dashboard in dark mode — warm dark background, sage accents preserved" class="doc-shot" />
  <figcaption>Same dashboard, after sundown.</figcaption>
</figure>

## Backups

Spent stores everything in `data/spent.db` plus `data/.encryption-key`. To back up: copy those two files together. To restore on a new machine: drop them into the new install's `data/` folder before the first sync.

Any SQLite-friendly backup tool that handles WAL-mode databases works fine.

<NextStepCard href="/Spent/categories-and-budgets" title="Categories & budgets" />
```

- [ ] **Step 2: Verify**

Open `/Spent/sync-and-dashboard`. Confirm three screenshots load (light dashboard, transactions, dark dashboard), the sync fragment renders, all sections present.

- [ ] **Step 3: Commit**

```bash
git add website/src/content/docs/sync-and-dashboard.mdx
git commit -m "feat(docs): rewrite sync-and-dashboard with new hero and fragment"
```

---

## Task 25: Create `categories-and-budgets.mdx`

**Files:**
- Create: `website/src/content/docs/categories-and-budgets.mdx`

- [ ] **Step 1: Write the page**

```mdx
---
title: Categories & budgets
description: How Spent groups your spending, sets targets, and detects transfers.
---

import DocsHero from '../../components/docs/DocsHero.astro';
import Callout from '../../components/docs/Callout.astro';
import NextStepCard from '../../components/docs/NextStepCard.astro';

<DocsHero
  eyebrow="USING SPENT"
  titleBold="Categories"
  titleItalic="and budgets."
  lede="How Spent groups your spending, where the colors come from, and how 'ahead of pace' is calculated."
/>

## The category set

Spent ships with 16 curated categories:

- *Groceries*
- *Restaurants*
- *Transport*
- *Shopping*
- *Entertainment*
- *Health*
- *Education*
- *Bills & Utilities*
- *Subscriptions*
- *Travel*
- *Cash & ATM*
- *Transfers*
- *Insurance*
- *Home*
- *Personal Care*
- *Uncategorized* (the fallback)

Each has its own color, used everywhere in the dashboard (badges, charts, the budget card).

<Callout variant="note">
Custom categories are planned for v2. For now, the set is fixed — you can't add or rename.
</Callout>

## Re-categorizing

Click any category badge in the transactions list to change it. Spent remembers the correction and applies it the next time it sees a similar merchant.

## Merchant memory

Once you correct an AI categorization, Spent caches the merchant-to-category mapping. The next batch of transactions from the same merchant goes straight to the right category without another call to the AI.

This is how Spent stays cheap on Claude — most ongoing sync calls only categorize *new* merchants.

## Budget pacing

The *Budget* area of the dashboard shows a "spent this month vs. target" view, with a hero card calling out whether you're **on track**, **heads-up** (over the daily pace), or **over** (already past target).

The math:

- *Daily pace* = monthly target ÷ days in the month.
- *Expected so far* = daily pace × days elapsed.
- If *spent so far* > *expected so far*: heads-up.
- If *spent so far* > *target*: over.

Set targets per category in *Settings → Budgets*.

## Auto-detected transfers

Credit card payments (e.g. an Isracard bill paid from your Hapoalim account) show up twice — once as the card statement, once as the bank withdrawal. Spent's matching pass detects these and categorizes them as *Transfers* so they're excluded from spending totals.

The same logic handles inter-account moves between two banks you've connected.

<Callout variant="note">
If you spot a real expense miscategorized as a transfer, re-categorize it manually. Spent will not "correct itself" in the other direction — your manual choice wins.
</Callout>

<NextStepCard href="/Spent/hebrew-and-rtl" title="Hebrew & RTL" />
```

- [ ] **Step 2: Verify**

Open `/Spent/categories-and-budgets`. Verify hero, category list, callouts, Next CTA.

- [ ] **Step 3: Commit**

```bash
git add website/src/content/docs/categories-and-budgets.mdx
git commit -m "feat(docs): add categories-and-budgets page"
```

---

## Task 26: Create `hebrew-and-rtl.mdx`

**Files:**
- Create: `website/src/content/docs/hebrew-and-rtl.mdx`

- [ ] **Step 1: Write the page**

```mdx
---
title: Hebrew & RTL
description: Switching Spent to Hebrew and how the right-to-left layout works.
---

import DocsHero from '../../components/docs/DocsHero.astro';
import Callout from '../../components/docs/Callout.astro';
import NextStepCard from '../../components/docs/NextStepCard.astro';

<DocsHero
  eyebrow="USING SPENT"
  titleBold="Hebrew"
  titleItalic="& RTL."
  lede="Spent's UI is available in Hebrew with full right-to-left layout. Switch any time."
/>

## Switching language

*Settings → Preferences → Language* gives you two options:

- **English** (left-to-right)
- **עברית** (right-to-left)

Your choice is saved per browser via `localStorage`.

## What flips

- **Layout direction** — sidebar moves to the right; tables, badges, and breadcrumbs all flip.
- **Dates** — formatted Israeli-style (`17.5.2026` rather than `5/17/2026`).
- **Numbers** — currency still leads with `₪` but commas and digit grouping match Hebrew conventions.
- **Category names** — translated.

## What does not flip

- **Bank logos** — kept as-is, since logos have a "correct" reading direction baked in.
- **The screenshots in these docs** — left as English so the docs read consistently. The Hebrew layout looks like a mirror of these screenshots.
- **Merchant names** — preserved as the bank reports them. A Hebrew merchant stays Hebrew, an English one stays English.

<Callout variant="note">
The transaction list mixes scripts naturally: Hebrew merchants like "ארומה" sit next to English ones like "Wolt" in the same list. The list direction is RTL when the UI is in Hebrew, but each merchant name renders in its native direction.
</Callout>

## Known limitations

- Tooltips in Hebrew can wrap awkwardly on very narrow screens.
- Charts (Recharts) don't fully mirror — the y-axis stays on the left.
- Date inputs in some browsers still pop their picker in LTR.

If any of these block you, please file an issue on [GitHub](https://github.com/alon710/Spent/issues).

<NextStepCard href="/Spent/troubleshooting" title="Troubleshooting" />
```

- [ ] **Step 2: Verify**

Open `/Spent/hebrew-and-rtl`. Verify hero, sections, callouts, Next CTA.

- [ ] **Step 3: Commit**

```bash
git add website/src/content/docs/hebrew-and-rtl.mdx
git commit -m "feat(docs): add Hebrew & RTL page"
```

---

## Task 27: Rewrite `troubleshooting.mdx`

**Files:**
- Modify: `website/src/content/docs/troubleshooting.mdx`

- [ ] **Step 1: Replace the file**

```mdx
---
title: Troubleshooting
description: Common problems and how to solve them.
---

import DocsHero from '../../components/docs/DocsHero.astro';
import Callout from '../../components/docs/Callout.astro';
import ForDevelopers from '../../components/docs/ForDevelopers.astro';

<DocsHero
  eyebrow="REFERENCE"
  titleBold="When something"
  titleItalic="isn't working."
  lede="Grouped by where the problem shows up. Start with the section that matches your situation."
/>

## During install

### `npm install` fails on Windows

<Callout variant="gotcha">
*"MSB8020"* or other native-compile errors — Spent depends on **better-sqlite3**, which compiles natively. The `npm run setup` script handles the build-tool prompt; if you ran `npm install` from a non-elevated PowerShell first, the compile may not have been able to register the .NET 8 SDK.
</Callout>

**Fix:** Close PowerShell, reopen as Administrator, run `npm install` again. If still failing, restart the machine first.

### "node is not recognized as an internal or external command"

Node.js isn't on your `PATH`. Close the terminal, open a new one. If it still happens, rerun the Node installer accepting the defaults — one of them adds Node to PATH.

### Permission errors during `npm install` on macOS

Lots of `EACCES`? You installed Node as root somewhere along the line. Reinstall via [nvm](https://github.com/nvm-sh/nvm) which puts Node in your home directory and avoids `sudo`.

### Setup script aborted partway

The setup script is **idempotent** — safe to re-run. Check what state you're in:

```sh
npm run service:status
```

Then just `npm run setup` again. It picks up where it left off without re-doing finished steps.

### "Spent.app is from an unidentified developer" (macOS)

Right-click `Spent.app` in `~/Applications`, choose **Open**, then **Open** in the dialog. After the first launch, double-click works.

### Windows Defender flags the tray app

Click **More info → Run anyway**. The binary is built from the source code in `menubar/windows/`. You can inspect or rebuild it yourself.

### `spent.local` doesn't resolve

The setup script edits `hosts` only when it has admin/sudo. If you ran setup non-elevated, the entry was skipped.

- **Mac/Linux:** `echo "127.0.0.1 spent.local" | sudo tee -a /etc/hosts`
- **Windows (elevated PowerShell):** `npm run service:install` re-runs the hosts step.

Either way, `http://127.0.0.1:41234` always works.

## During sync

### "Login failed — check credentials"

Most common causes:

- Your bank password changed recently. Update it in *Settings → Banks*.
- Your bank requires 2FA, which Spent can't do (except One Zero). Disable 2FA on the bank's side.
- The bank's website is down. Try again in an hour.

### Sync hangs or times out

The bank's website is being slow. Spent waits up to **5 minutes** per login. If it consistently times out, increase the timeout in *Settings → Advanced* or sync at a different time of day.

### "Connection refused" when calling Ollama

Ollama isn't running. Open a terminal:

```sh
ollama serve
```

On macOS Ollama usually starts automatically; on Windows you may need to launch it from the Start menu.

### Anthropic API returns 401

Your Claude API key is invalid or revoked. Generate a new one at `console.anthropic.com`, paste it into *Settings → AI*, and re-sync.

## With the dashboard

### "Cannot connect to localhost:41234"

The background service isn't running:

```sh
npm run service:status
npm run service:start
```

If `service:start` reports success but the page still won't load, check the logs:

```sh
npm run service:logs
```

### Transactions are missing

Some banks expose limited history. Yahav, in particular, only goes back about **6 months**. Older data isn't reachable via the website Spent scrapes.

### Dashboard looks broken after an update

Clear your browser cache for `localhost:41234`. The dashboard's assets are cached aggressively.

## With your data

### "Where is my data?"

In `data/spent.db` (a SQLite file) and `data/.encryption-key`. Both live inside your Spent install folder.

### How do I delete all my data?

Stop the service, delete the `data/` folder:

```sh
npm run service:stop
rm -rf data/
npm run service:start
```

A fresh empty database is created on next start.

### How do I move Spent to a new computer?

1. Install Spent on the new machine ([macOS](/Spent/install/mac) / [Windows](/Spent/install/windows) / [Linux](/Spent/install/linux)).
2. Before the first run, copy `data/spent.db` **and** `data/.encryption-key` from the old computer into the new install's `data/` folder.
3. Start the service. Spent picks up where it left off.

<ForDevelopers summary="Backing up via SQLite tools">

`data/spent.db` is a standard SQLite database in WAL mode. Any tool that respects WAL works:

```sh
sqlite3 data/spent.db ".backup data/spent-backup.db"
```

Or copy the `.db`, `.db-wal`, and `.db-shm` files together while the service is stopped. The encryption key is a separate concern — back it up like a password.

</ForDevelopers>

## Still stuck?

Open an issue on [GitHub](https://github.com/alon710/Spent/issues) with:

- Your operating system and version
- What you were doing when it broke
- The relevant error message (copy-pasted, not screenshotted)
- The output of `npm run service:logs`
```

- [ ] **Step 2: Verify**

Open `/Spent/troubleshooting`. Verify hero, four section groups, callouts where added, ForDevelopers accordion at the bottom.

- [ ] **Step 3: Commit**

```bash
git add website/src/content/docs/troubleshooting.mdx
git commit -m "feat(docs): rewrite troubleshooting with grouped sections and callouts"
```

---

## Task 28: Style-pass `security-and-privacy.mdx`

**Files:**
- Modify: `website/src/content/docs/security-and-privacy.mdx`

- [ ] **Step 1: Replace the file**

```mdx
---
title: Security & privacy
description: The full story on how Spent handles your credentials, transactions, and AI queries.
---

import DocsHero from '../../components/docs/DocsHero.astro';
import Callout from '../../components/docs/Callout.astro';
import NextStepCard from '../../components/docs/NextStepCard.astro';

<DocsHero
  eyebrow="REFERENCE"
  titleBold="Security &"
  titleItalic="privacy."
  lede="Where data lives, who can read it, and what happens when something goes wrong."
/>

Spent is built to be the kind of finance app you'd actually trust with your bank password. That means a clear story.

## What Spent stores, and where

Everything Spent saves lives inside the `data/` folder of your install directory. Two files:

- **`data/spent.db`** — a SQLite database with your encrypted bank credentials, transactions, categories, and settings.
- **`data/.encryption-key`** — a 32-byte random key generated on first run.

Both files are local. Spent never uploads them. There is no "Spent cloud."

## How credentials are encrypted

Bank passwords (and your Claude API key, if you use one) are encrypted with **AES-256-GCM** before being written to the database. The 32-byte key in `data/.encryption-key` is the one used to encrypt and decrypt.

This means:

- If someone copies just `data/spent.db` off your computer, they cannot read your passwords.
- If you delete `data/.encryption-key`, your saved credentials are unrecoverable — the next sync will fail until you re-enter passwords.

<Callout variant="gotcha">
**For backups: copy both files together** and treat the encryption key like a password.
</Callout>

## What goes over the network

Three kinds of traffic happen during a sync:

1. **Bank logins** — Spent opens a headless Chromium tab and logs into your bank's website using the credentials you provided. This traffic goes directly between your computer and your bank.
2. **AI categorization** — if you chose Claude, **only the merchant name and amount** of each new transaction are sent to Anthropic's API in batches of 50. Your bank credentials are never sent. If you chose Ollama, this traffic stays on your machine.
3. **No analytics, no telemetry, no crash reports.** Spent does not phone home. Ever.

## The threat model

<Callout variant="note">
**Protects against:** a casual attacker who reads your database file (without the key, passwords stay encrypted). An attacker with the key alone but no DB. Network eavesdroppers (all traffic is HTTPS).
</Callout>

<Callout variant="gotcha">
**Does NOT protect against:** an attacker with full control of your computer. A malicious npm dependency. These are true of every local app.
</Callout>

## The bank-side risk

Logging into your bank's website with an automation tool is **not the same** as using the official app. Banks may, in principle:

- Lock your account temporarily if fraud detection sees something unusual.
- Terminate your relationship with them if they consider it a breach of terms.

In practice, this is rare for read-only scraping that happens infrequently. But it's a real risk and you should know about it. Read the [Disclaimer](/Spent/disclaimer) for the full version.

## Reporting a vulnerability

If you find a security issue, please **don't** open a public issue. Email the maintainer (address in `SECURITY.md` in the repo). We'll respond within 72 hours.

For non-security bugs, [GitHub Issues](https://github.com/alon710/Spent/issues) is the right place.

## Auditing the code yourself

Spent is open source. Relevant files:

- `src/server/lib/encryption.ts` — the AES-256-GCM helpers.
- `src/server/scrapers/index.ts` — the bank scraping wrapper.
- `src/server/ai/prompts.ts` — the exact prompt sent to AI providers.

You are encouraged to read it, and to fork it.

<NextStepCard href="/Spent/disclaimer" title="Disclaimer" />
```

- [ ] **Step 2: Verify**

Open `/Spent/security-and-privacy`. Verify hero, two paired callouts under the threat model, Next CTA.

- [ ] **Step 3: Commit**

```bash
git add website/src/content/docs/security-and-privacy.mdx
git commit -m "feat(docs): style-pass security-and-privacy with hero and callouts"
```

---

## Task 29: Style-pass `disclaimer.mdx`

**Files:**
- Modify: `website/src/content/docs/disclaimer.mdx`

- [ ] **Step 1: Replace the file**

```mdx
---
title: Disclaimer
description: The legal context for using Spent.
---

import DocsHero from '../../components/docs/DocsHero.astro';
import Callout from '../../components/docs/Callout.astro';

<DocsHero
  eyebrow="REFERENCE"
  titleBold="Disclaimer"
  titleItalic="and legal context."
  lede="Read this before connecting any bank account."
/>

Spent is open-source software provided to you free of charge. By installing and using it, you agree to the following.

## Spent automates websites you don't own

Spent works by automating your bank's website on your behalf, using credentials you provide. This is functionally similar to "scraping": it logs in, navigates the same pages a human would, and reads the data shown to you. **The bank does not know it's an automated tool.**

## Banks may restrict this in their terms

Some Israeli banks include clauses in their terms of service that prohibit, restrict, or require permission for automated access to your account. **You are responsible for reading your bank's terms and deciding whether using Spent is appropriate for your situation.** The Spent project does not negotiate with banks on your behalf and does not warrant compatibility with any bank's terms.

If your bank's terms forbid automated access and you use Spent anyway, the consequences are yours to deal with. Possible (rare but real) consequences include account suspension, fraud-flag locks, or termination of the customer relationship.

## Spent never moves money

Spent is **read-only**. It does not, and cannot, transfer funds, pay bills, place orders, or change any settings inside your bank account. It only reads transaction data the bank's website would already show you.

Spent does not provide investment advice, financial planning, tax preparation, or any other regulated financial service.

## No warranty

Spent is provided "as is", without warranty of any kind, express or implied. The maintainers and contributors are not liable for:

- Any loss of access to bank accounts.
- Any incorrect or missing transaction data shown by the app.
- Any financial decisions you make based on Spent's output.
- Any breach of contract between you and your bank.
- Any data loss or theft, including from your own computer being compromised.

## Not affiliated with any bank

Spent is an independent open-source project. It is not affiliated with, endorsed by, or partnered with any of the banks listed as supported. Bank names, logos, and brand colors are used solely for navigational clarity and remain the property of their respective owners.

## Your data, your responsibility

Spent stores everything on your computer, encrypted with a key generated locally (see [Security & privacy](/Spent/security-and-privacy)). However, no encryption protects you from:

- Losing the encryption key file.
- Sharing your computer with someone who has your local user password.
- Backing up the data without proper care.
- Malware on your computer.

You are responsible for the security of your own machine.

## Open source license

Spent is licensed under the **MIT License**. Use, modify, and redistribute it freely, subject to the license terms. See the [LICENSE](https://github.com/alon710/Spent/blob/main/LICENSE) file in the repository.

## Questions

If anything on this page is unclear, please open an issue at [github.com/alon710/Spent/issues](https://github.com/alon710/Spent/issues) so we can clarify it for everyone.

<Callout variant="gotcha">
**By installing Spent and connecting a bank account, you confirm that you have read this disclaimer and accept the terms above.**
</Callout>
```

- [ ] **Step 2: Verify**

Open `/Spent/disclaimer`. Verify hero and the final accept-terms callout.

- [ ] **Step 3: Commit**

```bash
git add website/src/content/docs/disclaimer.mdx
git commit -m "feat(docs): style-pass disclaimer with hero and final callout"
```

---

## Task 30: Full local verification

End-to-end check that every page renders, every internal link works, and dark mode is consistent.

**Files:**
- N/A (verification only)

- [ ] **Step 1: Build the website cleanly**

```bash
cd website
rm -rf dist node_modules/.astro
npm run build
```

Expected: build succeeds. Note any warnings about missing references or broken anchors.

- [ ] **Step 2: Click through every doc page in dev**

```bash
npm run dev
```

Open each in turn and verify it renders with hero, content, and CTA where expected:

- `/Spent/getting-started`
- `/Spent/what-is-spent`
- `/Spent/install/mac`
- `/Spent/install/windows`
- `/Spent/install/linux`
- `/Spent/connect-bank`
- `/Spent/ai-categorization`
- `/Spent/sync-and-dashboard`
- `/Spent/categories-and-budgets`
- `/Spent/hebrew-and-rtl`
- `/Spent/troubleshooting`
- `/Spent/security-and-privacy`
- `/Spent/disclaimer`

- [ ] **Step 3: Click every "Next" CTA**

Starting from `getting-started`, follow:

- Getting started → (any card click works)
- What is Spent? → Install on macOS
- Install macOS → Connect your bank
- Install Windows → Connect your bank
- Install Linux → Connect your bank
- Connect your bank → Categorize with AI
- Categorize with AI → Sync & dashboard
- Sync & dashboard → Categories & budgets
- Categories & budgets → Hebrew & RTL
- Hebrew & RTL → Troubleshooting
- Security & privacy → Disclaimer

Each click lands on a 200 page.

- [ ] **Step 4: Test dark mode on docs**

In the Starlight theme switcher (top right), toggle to dark. Walk through 3-4 pages — heroes, callouts, step cards, fragment components should all render legibly in dark.

- [ ] **Step 5: Commit any small fixes**

If any internal link is broken or a component renders wrong in dark mode, fix inline and commit:

```bash
git add <fixed files>
git commit -m "fix(docs): <description>"
```

If no fixes needed: skip the commit.

---

## Self-review

After completing all tasks, run through this checklist:

- [ ] **Spec coverage:** Every section of `docs/superpowers/specs/2026-05-17-docs-upgrade-design.md` has a corresponding task.
  - IA → Task 13.
  - Visual design components → Tasks 3-12.
  - Per-page content → Tasks 17-29.
  - Screenshot strategy → Tasks 1, 15, 16.
  - Voice & tech-vs-non-tech → ForDevelopers / Callout components (Tasks 5, 6) used throughout content tasks.
- [ ] **Placeholder scan:** No `TBD`, `TODO`, or "add appropriate X" anywhere in the plan.
- [ ] **Type consistency:** Component prop names (`eyebrow`, `titleBold`, `titleItalic`, `lede`, `variant`, `i`, `title`) are consistent across all task references.
- [ ] **Cross-references:** Every internal link in a doc page points to a slug that exists after the relevant page-creation task lands.

