# ADR-0019: App shell with a fixed viewport and inner scroll container

- **Status:** Proposed
- **Date:** 2026-07-13
- **Deciders:** @kj-ninja
- **Linear:** [FRG-11](https://linear.app/kj-forge/issue/FRG-11)

## Context

Opening or closing any vaul drawer on iOS (mobile Safari and the installed PWA) visibly shifted the whole page by the current scroll offset. Root cause: vaul's iOS scroll-lock performs `window.scrollTo(0, 0)` plus a `position: fixed` body swap on open, and restores scroll inside `requestAnimationFrame` on close — the steps land across separate frames, so a scrolled page renders 1–2 frames at the wrong offset. `noBodyStyles` was tried earlier and reverted: it disables only the body styling, not the `scrollTo` in the scroll-lock path.

Separately, the app had no global navigation — every view hand-rolled `min-h-svh` wrappers, "← Wróć" links and its own footers — while the roadmap (stats, rehab, wellness, AI) needs room for more destinations.

## Decision

The window never scrolls. `html`/`body` are locked to `100dvh` with `overflow: hidden`; a pathless `_shell` layout route wraps all authed pages in an `AppShell` whose `<main>` is the only scroll container. With `window.scrollY` permanently 0, vaul's scroll-lock degenerates to a no-op and the jump disappears by construction. The shell owns navigation and safe-area insets: shadcn Sidebar on desktop (collapsible, logo + links), bottom tab bar on mobile (hidden on session detail), avatar dropdown for account actions in the header on both breakpoints. `/login/*` renders outside the shell.

## Alternatives considered

### Alternative A — patch vaul per drawer (`noBodyStyles`, `modal={false}`, forks)

- Pros: no global layout change; smallest diff.
- Cons: `noBodyStyles` already tried and reverted — the jump comes from the scroll-lock's `scrollTo(0,0)`, which these flags don't reach; `modal={false}` loses overlay/dismiss semantics; fighting the library at every drawer is unbounded maintenance.

### Alternative B — replace vaul (Base UI dialog, custom sheet)

- Pros: removes the misbehaving dependency entirely.
- Cons: vaul is load-bearing for the iOS keyboard (VisualViewport repositioning) — a replacement must solve that from scratch; Base UI was evaluated during the responsive-dialog work and deferred as not yet mature for this; far larger risk than containing the problem.

### Alternative C — fixed-viewport app shell (chosen)

- Pros: removes the entire class of window-scroll bugs (drawer jump, iOS rubber-banding) rather than one instance; the shell is where global navigation belongs anyway, so one change pays twice; standard PWA architecture.
- Cons: global layout change touches every view; future views must live inside the shell's scroll container (a new convention to remember); `position: fixed` elements now coexist with an inner scroll container, which needs care with safe-area insets.

## Consequences

### Positive

- Drawer open/close causes zero page shift by construction — nothing to re-fix per drawer.
- One navigation system (sidebar / tab bar / avatar menu) replaces per-view headers, back links and the dashboard "Konto" button.
- Safe-area insets live in exactly two places (header top, tab bar / action footers bottom) instead of body-wide padding.

### Negative / trade-offs

- Every future view must render inside the shell's scroll container; a stray `min-h-svh` or window-scroll assumption will misbehave.
- The generated shadcn Sidebar ships desktop-oriented extras (Sheet variant, cookie persistence, ⌘B shortcut) that mobile never uses — dead weight accepted for the component's roadmap value.
- `100dvh` + `overflow: hidden` makes the login pages own their scroll explicitly.

### Follow-ups

- Retest the drawer jump on production iOS PWA after deploy (the original bug report).
- Consider removing vaul-era workarounds that the shell obsoletes once prod verification passes.
- Statystyki tab joins the nav with the exercise-summary epic.

## References

- `docs/learning/app-shell-navigation.md` — concepts behind this decision.
- vaul scroll-lock internals: `usePositionFixed` + `preventScrollMobileSafari` (vaul 1.1.2 source; issues #433, #435).
- shadcn Sidebar: https://ui.shadcn.com/docs/components/sidebar
- ADR-0018 — folder architecture (shared/components placement).
