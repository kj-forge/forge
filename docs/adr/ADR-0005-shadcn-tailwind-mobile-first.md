# ADR-0005: shadcn/ui + Tailwind v4, mobile-first PWA

- **Status:** Accepted
- **Date:** 2026-05-07
- **Deciders:** @kj-ninja

## Context

Forge is a single web app, delivered as a mobile-first PWA. There is no native (Expo) mobile app — that decision was made deliberately to avoid the cross-platform tax (monorepo, separate API, universal design system) at the cost of native-feel UX. We compensate with a deliberately strong PWA experience: install-on-home-screen, gesture-friendly drawers, offline-first behaviour, native-like animation.

## Decision

- **Component library:** **shadcn/ui** (copy-in components, Radix under the hood).
- **Styling:** **Tailwind v4**.
- **Mobile-specific:** **Vaul** for bottom-sheet drawers (the core quick-log UX), **Framer Motion** for micro-animations and gesture feedback.
- **PWA:** Vite PWA Plugin + Workbox for the service worker, manifest, offline shell.
- **Charts:** Tremor or Recharts (decide when first chart is needed).

## Alternatives considered

### Tamagui

- Pros: cross-platform (web + native).
- Cons: we're not building native (see context). The cross-platform value disappears, but the learning curve and SSR overhead remain.

### MUI / Mantine / Chakra

- Pros: large ecosystem, polished components.
- Cons: opinionated styling, larger bundle, less idiomatic with Tailwind.

### Pure Tailwind without component lib

- Pros: minimal dependencies.
- Cons: rebuilding accessible primitives by hand is slow and error-prone.

## Consequences

### Positive

- shadcn components live in our repo — full control to customise mobile UX.
- Tailwind v4 is fast and modern; classnames stay readable with Biome.
- Vaul is purpose-built for the bottom-sheet pattern that quick-log relies on.

### Negative / trade-offs

- Native UX has a ceiling on the web — no real haptics, no system-level gesture handlers.
- Charts are deferred; we pick Tremor vs Recharts when the analytics views ship.

### Follow-ups

- Build `SetInput`, `ExercisePicker`, `RPESlider`, `RestTimer` as first-class mobile components — these define the gym-floor UX.
- Add Playwright mobile-viewport tests (iPhone 14, Pixel 7) from day 1.
- Re-evaluate Tamagui only if we ever decide to build a native app (would be a new ADR).
