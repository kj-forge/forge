# UI Redesign „Żar kuźni" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin Forge to the approved „Żar kuźni" direction (spec: `docs/superpowers/specs/2026-07-14-ui-redesign-zar-kuzni-design.md`) — ember/black/white tokens in both themes, strength icons, phased motion.

**Architecture:** Token-first: all color lands in `styles.css` theme blocks (shadcn CSS vars) + two utilities (`bg-ember`, ember glow). Components then consume tokens — reskins are className changes only, no logic edits. Motion phases are additive and isolated behind `prefers-reduced-motion`.

**Tech Stack:** Tailwind v4 tokens (styles.css), lucide-react, TanStack Router View Transitions.

## Global Constraints

- Spec decisions are FINAL: variant A drawer, ember `#FF6A00→#FFB25C` (dark) / `#FF5A00` (light), gradient CTA in BOTH themes.
- Ember never colors body text (numbers ≥16px bold, icons, borders, pill tints only).
- Every animation respects `prefers-reduced-motion: reduce`.
- No form/server logic changes anywhere in this epic — className/JSX-presentation only.
- Every commit: `bun run typecheck` + `./node_modules/.bin/biome check` + `bun test` green; footer `Co-Authored-By: Claude <noreply@anthropic.com>`.
- KJ visually verifies dark AND light on iPhone at the end of each PR phase before merge.
- PR phases: PR-A = Task 1; PR-B = Tasks 2–6; PR-C = Tasks 7–8; PR-D = Task 9.

---

### Task 1: Ember theme tokens + utilities (PR-A)

**Files:**
- Modify: `src/styles.css` (both `:root` and `.dark` token blocks + new utilities)
- Modify: `src/routes/__root.tsx:16` (`theme-color` meta)

**Interfaces:**
- Produces: CSS vars per the spec token table; utility classes `bg-ember` (gradient) and `shadow-ember` (glow) used by Tasks 3–6.

- [ ] **Step 1: Replace color tokens** in `styles.css` — light block (`:root`): `--background:#ffffff; --foreground:#111111; --card:#ffffff; --card-foreground:#111111; --popover:#ffffff; --muted:#f6f4f1; --muted-foreground:#716c66; --border:#eae6e1; --input:#eae6e1; --primary:#ff5a00; --primary-foreground:#ffffff; --secondary:#f6f4f1; --secondary-foreground:#111111; --accent:#f6f4f1; --accent-foreground:#111111; --ring:#ff5a0080`. Dark block: `--background:#0c0c0d; --foreground:#f5f2ee; --card:#161618; --card-foreground:#f5f2ee; --popover:#161618; --muted:#1c1c1f; --muted-foreground:#8f8a84; --border:#ffffff14; --input:#ffffff1f; --primary:#ff6a00; --primary-foreground:#ffffff; --secondary:#1c1c1f; --secondary-foreground:#f5f2ee; --accent:#1c1c1f; --accent-foreground:#f5f2ee; --ring:#ff6a0080`. `--destructive` stays. Keep var structure/names identical to current file (hex allowed — Tailwind v4 accepts any CSS color; exact brand values beat oklch conversion).

- [ ] **Step 2: Add utilities** at the end of `styles.css`:

```css
@utility bg-ember {
  background-image: linear-gradient(100deg, #ff6a00, #ffb25c);
  color: #fff;
}
@utility shadow-ember {
  box-shadow: 0 4px 28px #ff6a0045;
}
```

- [ ] **Step 3: theme-color meta** in `__root.tsx`: `#0a0a0a` → `#0c0c0d`.

- [ ] **Step 4: Verify** — dev server: both themes flip correctly (system toggle), buttons/links pick up ember via `--primary`; `bun run typecheck` + biome + tests green.

- [ ] **Step 5: Commit** — `feat(ui): ember theme tokens for both modes + bg-ember utilities`

**Checkpoint: KJ eyeballs prod-like dev on phone (dark+light) before Phase B starts.**

---

### Task 2: Status pills (PR-B)

**Files:**
- Modify: `src/shared/components/StatusBadge.tsx`

- [ ] **Step 1:** Reskin: ended → pill `bg-primary/15 text-primary` with `✓` glyph replaced by lucide `Check` (size-3); active → same tint + pulsing dot `<span class="size-1.5 rounded-full bg-primary animate-pulse">` (respects reduced-motion via `motion-safe:animate-pulse`). Keep the component API (`endedAt` prop) unchanged.
- [ ] **Step 2:** Verify + commit — `feat(ui): status pills with ember tint and live pulse`

### Task 3: Session cards + dashboard hero (PR-B)

**Files:**
- Modify: `src/features/strength/components/SessionListItem.tsx`
- Modify: `src/features/strength/views/HomeView.tsx`

- [ ] **Step 1 (SessionListItem):** headline stays; top-set weight value gets `text-primary` (currently `text-foreground`); set-count stays muted; card border/bg from tokens (no change needed beyond verification).
- [ ] **Step 2 (HomeView):** primary CTA `+ Rozpocznij sesję siłową` → `bg-ember shadow-ember` (replace default button variant classes via `className`); replace 🏋️ emoji with lucide `Dumbbell` in the hero card title.
- [ ] **Step 3:** Verify + commit — `feat(ui): ember session cards and dashboard hero`

### Task 4: MovementRow (PR-B)

**Files:**
- Modify: `src/features/strength/components/MovementRow.tsx` (read first — not yet touched this epic)

- [ ] **Step 1:** Add leading icon tile `size-9 rounded-lg bg-primary/12 text-primary grid place-items-center` with lucide `Dumbbell` (size-5); last-set summary on the right in `text-primary font-bold tabular-nums`; name `font-semibold`; set count muted small. No logic changes (tap target and props untouched).
- [ ] **Step 2:** Verify + commit — `feat(ui): movement rows with icon tile and ember last set`

### Task 5: Set drawer reskin — variant A (PR-B)

**Files:**
- Modify: `src/features/strength/components/ExerciseDrawer.tsx` (className only)

- [ ] **Step 1:** Kind chips: active `bg-ember border-transparent` (white text), inactive `border-border text-muted-foreground` (drop per-kind text colors from chips; kind colors stay in the set list). RPE chips: selected → `border-primary text-primary`. Weight `NumericFormat` input: `text-primary font-extrabold text-xl`; reps input `font-extrabold text-xl`. Submit CTA → `bg-ember shadow-ember`; replace ⚡ with lucide `Zap` (size-4 inline). Set list: top-set rows' weight `text-primary`.
- [ ] **Step 2:** Verify on dev (chips switch, seeding, save flow untouched) + commit — `feat(ui): ember set drawer (variant A skin)`

### Task 6: Footers, remaining emoji → lucide, sweep (PR-B)

**Files:**
- Modify: `src/features/strength/views/ActiveSessionView.tsx` (CTA `bg-ember`, 🔁→`RotateCcw`, ✏️→`NotebookPen`, 📝→`NotebookPen`, 📊→`ChartNoAxesColumn`)
- Modify: `src/features/strength/views/NewSessionView.tsx` (🆕 → lucide `Sparkles`, CTA variants)
- Modify: `src/features/strength/components/ExercisePickerDrawer.tsx`, `EndSessionDrawer.tsx`, `NotesDrawer.tsx`, `DeleteSessionDrawer.tsx` (primary action `bg-ember`; destructive stays red)
- Modify: `src/features/auth/views/LoginView.tsx` + `MeView.tsx` (CTA sweep)

- [ ] **Step 1:** Apply the sweep file-by-file; grep for leftover UI emoji: `grep -rn "🏋️\|📝\|🔁\|✏️\|⚡\|🆕\|📊" src --include="*.tsx"` → expect zero hits outside user content.
- [ ] **Step 2:** Verify + commit — `feat(ui): ember CTAs and lucide icons across views`

**Checkpoint: PR-B → KJ visual pass (dark+light, iPhone), merge, promote.**

---

### Task 7: View Transitions (PR-C)

**Files:**
- Modify: router setup (find via `grep -rn "createRouter" src`) — add `defaultViewTransition: true`
- Modify: `src/styles.css` — `::view-transition-old(root), ::view-transition-new(root){ animation-duration:180ms }` + reduced-motion kill switch

- [ ] **Step 1:** Enable + tune duration; verify no double-animation with the tab bar collapse (they compose: bar is inside the transitioning root — acceptable; if it doubles, scope the bar out via `view-transition-name: tab-bar`).
- [ ] **Step 2:** Verify (Chrome desktop + KJ's iPhone) + commit — `feat(ui): view transitions between routes`

### Task 8: Micro-interactions (PR-C)

**Files:**
- Modify: `src/components/ui/button.tsx` — base classes gain `active:scale-[.97] transition-transform motion-reduce:transition-none motion-reduce:active:scale-100`
- Modify: kind/RPE chips in `ExerciseDrawer.tsx` — `transition-colors`

- [ ] **Step 1:** Apply; verify hover/active/focus on Button across variants (regression memory!).
- [ ] **Step 2:** Verify + commit — `feat(ui): press feedback micro-interactions`

**Checkpoint: PR-C → KJ visual pass, merge, promote.**

---

### Task 9: Skeleton loaders (PR-D)

**Files:**
- Create: `src/shared/components/SessionCardSkeleton.tsx` (uses existing `components/ui/skeleton.tsx`)
- Modify: route `pendingComponent`s for `/_shell/index`, `/_shell/sessions/index`, `/_shell/sessions/new` (find current spinner/pending usage via `grep -rn "Spinner\|pendingComponent" src/routes src/features`)

- [ ] **Step 1:** Skeleton mirrors card layout (headline bar, 3 rows); wire as `pendingComponent`; keep `Spinner` for in-flight buttons.
- [ ] **Step 2:** Verify (throttled network in dev) + commit — `feat(ui): skeleton loaders for session lists`

**Checkpoint: PR-D → KJ visual pass, merge, promote. Celebracja PR czeka na epic Statystyk (spec, Ruch pkt 4).**

## Self-Review

- Spec coverage: tokens (T1), typografia liczb (T3/T4/T5), pille (T2), karty (T3), MovementRow (T4), drawer A (T5), ikony/emoji (T3/T5/T6), ruch 1-2 (T7/T8), ruch 3 (T9), ruch 4 deferred per spec. ✔
- No logic edits anywhere; NumericFormat/form flow untouched (T5 className-only). ✔
- Kind-color chips decision (drop per-kind colors on CHIPS, keep in list) matches mockup. ✔
