# App Shell + Bottom Tab Navigation — Implementation Plan

> **Executed 2026-07-13 with two mid-flight design pivots (KJ):**
> 1. Desktop nav evolved: plain sidebar → navigation-menu navbar → **full shadcn Sidebar** (logo + links, collapsible) — final.
> 2. Header gained an **avatar dropdown** (shadcn Avatar + DropdownMenu → "Ustawienia konta"); per-view "← Wróć" links and the dashboard "Konto" button were removed (logo → home covers it).
> Task 2's code below reflects the original plain-nav design; the committed result is `AppShell` + `AppSidebar` + `UserMenu` in `src/shared/components/`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fixed-viewport app shell (window never scrolls → vaul's iOS scroll-lock becomes a no-op, killing the drawer page-jump) with a mobile bottom tab bar and a desktop sidebar.

**Architecture:** `html/body` stop scrolling; a pathless TanStack Router layout route (`_shell`) wraps all authed pages in an `AppShell` component: mobile top bar → inner `overflow-y-auto` scroll container → bottom tab bar (mobile) / left sidebar (md+). Safe-area insets move from `body` into the shell chrome. `/login/*` and the API route stay outside the shell.

**Tech Stack:** TanStack Start file-based routing (pathless layout route), Tailwind v4, lucide-react icons, bun:test for pure helpers.

## Global Constraints

- Polish UI copy: tab labels are exactly `Dziennik`, `Historia`, `Nowa`, `Profil`.
- No `FRG-11` in code comments or component names (repo rule; branch/PR carry the ref).
- Comments minimal: only hidden invariants (e.g. why window must not scroll).
- Every commit: `bun run typecheck` + `./node_modules/.bin/biome check` green (local `bunx` shim is broken — use the direct binary), `bun test` green.
- Commit footer: `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Tab bar shows ONLY on `/`, `/sessions`, `/sessions/new`, `/me` — hidden on `/sessions/$sessionId`.

---

### Task 1: Nav model + tab-bar visibility helper (TDD)

**Files:**
- Create: `src/shared/lib/nav.ts`
- Test: `src/shared/lib/nav.test.ts`

**Interfaces:**
- Produces: `NAV_ITEMS: NavItem[]` where `NavItem = { to: "/" | "/sessions" | "/sessions/new" | "/me"; label: string; icon: LucideIcon; exact: boolean }`
- Produces: `showsTabBar(pathname: string): boolean` — consumed by Task 2's `AppShell`.

- [ ] **Step 1: Write the failing test**

```ts
// src/shared/lib/nav.test.ts
import { describe, expect, test } from "bun:test";

import { NAV_ITEMS, showsTabBar } from "./nav";

describe("showsTabBar", () => {
  test("visible on the four top-level destinations", () => {
    expect(showsTabBar("/")).toBe(true);
    expect(showsTabBar("/sessions")).toBe(true);
    expect(showsTabBar("/sessions/")).toBe(true);
    expect(showsTabBar("/sessions/new")).toBe(true);
    expect(showsTabBar("/me")).toBe(true);
  });

  test("hidden inside a session detail", () => {
    expect(showsTabBar("/sessions/123e4567-e89b-12d3-a456-426614174000")).toBe(false);
  });

  test("hidden on unknown routes (fail closed)", () => {
    expect(showsTabBar("/login")).toBe(false);
  });
});

describe("NAV_ITEMS", () => {
  test("four tabs in thumb order", () => {
    expect(NAV_ITEMS.map((i) => i.to)).toEqual(["/", "/sessions", "/sessions/new", "/me"]);
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Dziennik", "Historia", "Nowa", "Profil"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/shared/lib/nav.test.ts`
Expected: FAIL — `Cannot find module './nav'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/lib/nav.ts
import { BookOpen, Home, Plus, User, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: "/" | "/sessions" | "/sessions/new" | "/me";
  label: string;
  icon: LucideIcon;
  // Home must match exactly, otherwise "/" lights up on every route.
  exact: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dziennik", icon: Home, exact: true },
  { to: "/sessions", label: "Historia", icon: BookOpen, exact: true },
  { to: "/sessions/new", label: "Nowa", icon: Plus, exact: true },
  { to: "/me", label: "Profil", icon: User, exact: true },
];

const TAB_BAR_PATHS = new Set(["/", "/sessions", "/sessions/new", "/me"]);

export function showsTabBar(pathname: string): boolean {
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return TAB_BAR_PATHS.has(normalized);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/shared/lib/nav.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/nav.ts src/shared/lib/nav.test.ts
git commit -m "feat(ui): nav model + tab-bar visibility helper"
```

---

### Task 2: Shell chrome components

**Files:**
- Create: `src/shared/components/AppShell.tsx`
- Modify: none (components consumed in Task 4)

**Interfaces:**
- Consumes: `NAV_ITEMS`, `showsTabBar` from `src/shared/lib/nav.ts` (Task 1).
- Produces: `AppShell({ children }: { children: ReactNode })` — the only export Task 4 imports.

- [ ] **Step 1: Implement `AppShell` with internal `TopBar`, `TabBar`, `SidebarNav`**

```tsx
// src/shared/components/AppShell.tsx
import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { NAV_ITEMS, showsTabBar } from "@/shared/lib/nav";

// The window must never scroll (styles.css locks html/body): vaul's iOS
// scroll-lock manipulates window scroll and body position on open/close,
// which visibly shifts a scrolled page. All scrolling lives in <main>.
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tabBarVisible = showsTabBar(pathname);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between border-b px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 md:hidden">
        <span className="font-heading font-semibold">Forge</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-48 shrink-0 flex-col gap-1 border-r p-4 md:flex">
          <span className="px-3 pb-4 font-heading font-semibold text-lg">Forge</span>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-muted-foreground text-sm hover:bg-accent"
              activeProps={{ className: "bg-accent font-medium text-foreground" }}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      {tabBarVisible && (
        <nav className="grid shrink-0 grid-cols-4 border-t bg-background pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className="flex flex-col items-center gap-0.5 pt-2 pb-1 text-muted-foreground text-xs"
              activeProps={{ className: "text-foreground" }}
            >
              <item.icon className="size-5" />
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `bun run typecheck && ./node_modules/.bin/biome check`
Expected: both clean (component unused yet — biome must not flag; if `organizeImports` complains, run `./node_modules/.bin/biome check --write src/shared/components/AppShell.tsx`)

- [ ] **Step 3: Commit**

```bash
git add src/shared/components/AppShell.tsx
git commit -m "feat(ui): AppShell with top bar, tab bar and desktop sidebar"
```

---

### Task 3: Lock window scrolling, move safe-area to shell

**Files:**
- Modify: `src/styles.css:120-135` (the `@layer base` block)

**Interfaces:**
- Produces: global CSS contract — `html, body` fixed to `100dvh`, no window scroll, no body safe-area padding. Tasks 4-5 rely on it.

- [ ] **Step 1: Replace the base layer block**

Old:

```css
  body {
    @apply bg-background text-foreground;
    /* Honor iOS safe-area insets in standalone PWA mode (no browser chrome
       above the content). env() returns 0 outside iOS standalone, so this
       is a no-op for desktop / non-iOS / browser tabs. */
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
```

New:

```css
  body {
    @apply bg-background text-foreground;
  }
  /* The window itself must never scroll: vaul's iOS scroll-lock replays
     window scroll state on drawer open/close, visibly jumping a scrolled
     page. Scrolling happens inside the shell's <main>. Safe-area insets
     are owned by the shell chrome (top bar / tab bar), not body. */
  html,
  body {
    height: 100dvh;
    overflow: hidden;
    overscroll-behavior: none;
  }
```

- [ ] **Step 2: Verify login still renders (outside the shell)**

Run: `bun run dev` (background), open `http://localhost:3000/login`
Expected: login card centered, no window scrollbar; page usable.
Note: LoginView/CheckEmailView use `min-h-svh` — inside a `100dvh` clipped body they render exactly viewport-height; if content overflows on small screens it will be verified in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat(ui): lock window scrolling; shell owns safe-area insets"
```

---

### Task 4: Pathless `_shell` layout route; move authed routes under it

**Files:**
- Create: `src/routes/_shell.tsx`
- Move: `src/routes/index.tsx` → `src/routes/_shell/index.tsx`
- Move: `src/routes/me.tsx` → `src/routes/_shell/me.tsx`
- Move: `src/routes/sessions/index.tsx` → `src/routes/_shell/sessions/index.tsx`
- Move: `src/routes/sessions/$sessionId.tsx` → `src/routes/_shell/sessions/$sessionId.tsx`
- Move: `src/routes/sessions/new.tsx` → `src/routes/_shell/sessions/new.tsx`
- Modify: `src/features/strength/views/ActiveSessionView.tsx:15` (`getRouteApi` id)
- Modify: `src/features/strength/views/NewSessionView.tsx:11` (`getRouteApi` id)
- Modify: any other `getRouteApi("/...")`/`from:` route-id literals found via grep

**Interfaces:**
- Consumes: `AppShell` (Task 2).
- Produces: route ids gain the `/_shell` prefix (e.g. `/_shell/sessions/$sessionId`); URLs unchanged.

- [ ] **Step 1: Create the layout route**

```tsx
// src/routes/_shell.tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AppShell } from "@/shared/components/AppShell";

export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});

function ShellLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
```

- [ ] **Step 2: Move the route files**

```bash
mkdir -p src/routes/_shell/sessions
git mv src/routes/index.tsx src/routes/_shell/index.tsx
git mv src/routes/me.tsx src/routes/_shell/me.tsx
git mv src/routes/sessions/index.tsx src/routes/_shell/sessions/index.tsx
git mv src/routes/sessions/\$sessionId.tsx src/routes/_shell/sessions/\$sessionId.tsx
git mv src/routes/sessions/new.tsx src/routes/_shell/sessions/new.tsx
```

Then update each moved file's `createFileRoute("...")` path literal to the `/_shell`-prefixed id (dev server regenerates `routeTree.gen.ts`; typecheck enforces the literals).

- [ ] **Step 3: Update route-id consumers**

Run: `grep -rn "getRouteApi(\|from: \"/" src/features src/routes --include="*.tsx" | grep -v routeTree`
Update every hit to the new id, e.g. `getRouteApi("/_shell/sessions/$sessionId")` in ActiveSessionView, `getRouteApi("/_shell/sessions/new")` in NewSessionView. `<Link to>` paths (URLs) stay unchanged.

- [ ] **Step 4: Verify**

Run: `bun run dev` (background) — routeTree regenerates; then `bun run typecheck && ./node_modules/.bin/biome check && bun test`
Expected: all green. Open `http://localhost:3000/` — dashboard renders inside shell: top bar, tab bar with active "Dziennik"; `/login` renders WITHOUT shell.

- [ ] **Step 5: Commit**

```bash
git add -A src/routes src/features src/routeTree.gen.ts
git commit -m "feat(ui): wrap authed routes in _shell pathless layout"
```

---

### Task 5: View cleanups for the new shell

**Files:**
- Modify: `src/features/strength/views/HomeView.tsx:26` — `min-h-svh` → remove (keep `mx-auto flex max-w-md flex-col gap-6 p-4`)
- Modify: `src/features/strength/views/SessionsListView.tsx:12` — same removal
- Modify: `src/features/strength/views/NewSessionView.tsx:51` — same removal
- Modify: `src/features/auth/views/MeView.tsx:30` — same removal
- Modify: `src/features/strength/views/ActiveSessionView.tsx:49,105` — remove `min-h-svh`; fixed footer gains its own safe-area: `p-4` → `p-4 pb-[max(1rem,env(safe-area-inset-bottom))]`
- Modify: `src/features/auth/views/LoginView.tsx:7`, `src/features/auth/views/CheckEmailView.tsx:11` — `min-h-svh` → `h-dvh overflow-y-auto` (outside the shell they own their scroll)

**Interfaces:**
- Consumes: CSS contract from Task 3 (body no longer padded/scrollable).

- [ ] **Step 1: Apply the class changes listed above** (each is a one-line `className` edit; no structural changes)

- [ ] **Step 2: Verify each page in dev**

Run: dev server; visit `/`, `/sessions`, `/sessions/new`, `/me`, a session detail, `/login`.
Expected: content scrolls inside the shell only; active-session footer sits above the home indicator; no double bottom bars on session detail (tab bar hidden there).

- [ ] **Step 3: Run all checks**

Run: `bun run typecheck && ./node_modules/.bin/biome check && bun test`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/features
git commit -m "feat(ui): views delegate viewport sizing to the app shell"
```

---

### Task 6: Docs (Phase E) + manual iPhone verification

**Files:**
- Create: `docs/adr/ADR-00XX-app-shell-fixed-viewport.md` (next free number; use the adr-writing skill/template; `Linear:` metadata field carries the issue ref)
- Create: `docs/learning/app-shell-navigation.md`

- [ ] **Step 1: Write the ADR** — decision: fixed-viewport shell + inner scroll container + bottom tab bar / desktop sidebar; alternatives considered: vaul `noBodyStyles` (tried, reverted — doesn't touch the `scrollTo(0,0)` path), per-drawer patches, `modal={false}`; consequences: `window.scrollY` always 0, future views must live inside the shell's scroll container.

- [ ] **Step 2: Write the learning doc** — why PWAs use app shells; window scroll vs inner scroll containers; iOS safe-area insets and where they belong; bottom-tab conventions (thumb reach, 4-5 destinations, detail routes hide tabs).

- [ ] **Step 3: Manual iPhone checklist (KJ, dev over LAN or prod after merge)**

- [ ] Drawer open/close on active session: ZERO page shift (scrolled mid-list before opening — the original bug)
- [ ] Exercise picker (full-screen) open/close: no shift
- [ ] Keyboard up inside drawer: sheet stays above keyboard (vaul repositionInputs intact)
- [ ] Tab bar: active states correct; hidden inside session detail
- [ ] No whole-page rubber-banding; list scroll bounces inside container only
- [ ] Login page renders and scrolls with keyboard open

- [ ] **Step 4: Commit docs**

```bash
git add docs/adr docs/learning
git commit -m "docs: ADR + learning notes for the app shell"
```

---

## Self-Review (done at plan time)

- Spec coverage: scroll lock (T3), safe-area move (T2/T3/T5), tab bar + visibility rule (T1/T2), desktop sidebar (T2), slim top bar (T2), pathless authed layout + login outside (T4), view workaround removal (T5), pure helper + tests (T1), ADR + learning doc (T6). ✔
- No placeholders; code complete in every step. ✔
- Type consistency: `NAV_ITEMS`/`showsTabBar` names match across T1→T2; `AppShell` matches T2→T4. ✔
