# ADR-0018: Folder architecture — feature-first with thin routes

- **Status:** Accepted
- **Date:** 2026-06-10
- **Deciders:** @kj-ninja

## Context

Through FRG-9 (strength MVP) and FRG-10 (deploy foundation), the `src/` tree grew without an explicit organizational rule. The pattern that emerged by accident was:

- `src/routes/<path>.tsx` — TanStack Start file-based routing.
- `src/lib/<feature>.ts` — server functions and domain logic for one feature.
- `src/components/<name>.tsx` — both shadcn primitives (inside `ui/`) and cross-cutting business components at the top level.

Concretely after FRG-9:

- `src/routes/sessions/$sessionId.tsx` reached ~900 lines containing the active-session view plus seven inline drawer components (`ExerciseDrawer`, `ExercisePickerDrawer`, `MovementRow`, `NotesDrawer`, `ViewOnlyExerciseDrawer`, `EndSessionDrawer`, `DeleteSessionDrawer`).
- `src/lib/strength.ts` held 16 server functions in 600 lines, mixing read paths, write paths, and atomic transactions.
- `src/lib/auth.ts`, `auth-signup.ts`, `auth-client.ts`, `auth-errors.ts` all sat as siblings to truly cross-cutting helpers like `utils.ts`, `env.ts`, `session.ts`.
- `src/components/{spinner,status-badge,global-pending}.tsx` sat next to `ui/` (shadcn) without a label distinguishing "pure UI primitive" from "cross-cutting business component."

A solo dev couldn't tell at a glance where new code should go for the next epic (wellness, rehab, AI). When future contributors join, or the project goes on the CV, the answer needs to be obvious.

## Decision

Adopt a **feature-first, Bulletproof React-style** architecture, applied pragmatically (no empty folders just to satisfy the pattern, but every folder type exists as soon as the first file justifies it).

### Canonical layout

```
src/
  routes/                              # TanStack Start — thin (~20 lines per file)
    __root.tsx
    sessions/$sessionId.tsx            # createFileRoute + <ActiveSessionView />

  features/
    strength/
      server/                          # SERVER runtime — RPC fns, one file per resource
        sessions.ts                    # session CRUD + atomic create transaction
        exercises.ts                   # exercise catalog queries
        movements.ts                   # adding / removing exercises within a session
        sets.ts                        # set logging + progression suggestion
      views/                           # CLIENT runtime — route-level entry views
        ActiveSessionView.tsx
        SessionHistoryView.tsx
        NewSessionView.tsx
      components/                      # CLIENT runtime — reusable WITHIN the feature
        ExerciseDrawer.tsx
        MovementRow.tsx
        …
      lib/                             # UNIVERSAL — pure helpers, no React, no server-only API
        format-set.ts
        suggest-kind.ts
      constants.ts                     # UNIVERSAL — feature-scoped enums, label maps
      types.ts                         # UNIVERSAL — feature-scoped TypeScript types

    auth/
      server/                        # SERVER runtime
        better-auth.ts               # Better Auth instance (singleton config)
        signup-hook.ts               # atomic signup side-effects (called from better-auth.ts)
        current-athlete.ts           # session → athlete resolution; imported by ALL features
      client.ts                      # CLIENT runtime — Better Auth browser SDK
      forms/                         # CLIENT runtime — schema + RHF + submit, per form
        LoginForm.tsx
      views/
        LoginView.tsx
        MeView.tsx
      components/
        GoogleSignInButton.tsx
      lib/
        auth-errors.ts

  shared/
    components/                        # cross-feature business components
      Spinner.tsx
      StatusBadge.tsx
      GlobalPending.tsx

  components/
    ui/                                # shadcn primitives — UNTOUCHED, shadcn CLI default path

  lib/                                 # cross-cutting non-React utilities
    utils.ts                           # cn()
    env.ts
    session.ts                         # getSession()
```

### Three-tier component model

| Tier | Where | Owns business logic? | Example |
|---|---|---|---|
| UI primitive | `src/components/ui/` | No | `Button`, `Input`, `Drawer` |
| Cross-feature shared | `src/shared/components/` | Yes (cross-feature) | `Spinner`, `StatusBadge`, `GlobalPending` |
| Feature-specific | `src/features/<feat>/components/` | Yes (one feature) | `ExerciseDrawer`, `MovementRow` |

### View vs. component (the key distinction)

| Folder | What lives here | Import rule |
|---|---|---|
| `features/<feat>/views/` | Top-level entry components | Imported by exactly one route file |
| `features/<feat>/components/` | Reusable building blocks | Imported by views and/or sibling components |

A view is "the thing the page renders." A component is "a building block of a view." The route file becomes a thin shim.

Example — a route file is ~20 lines:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

import { getSessionDetails } from "@/features/strength/server/sessions";
import { ActiveSessionView } from "@/features/strength/views/ActiveSessionView";
import { getSession } from "@/lib/session";

export const Route = createFileRoute("/sessions/$sessionId")({
  beforeLoad: async () => {
    const session = await getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  loader: ({ params }) => getSessionDetails({ data: { sessionId: params.sessionId } }),
  component: ActiveSessionView,
});
```

All UI, all state, all event handlers live in `ActiveSessionView` and its descendants. The route stays a routing concern.

### Runtime layout — folders are named by where the code runs

The original draft of this ADR used an `api/` folder for "server fns + client wrappers." That folder accumulated three different runtime contexts (RPC endpoints, server-only library config, browser SDK re-exports) distinguished only by naming conventions (`server.ts`/`client.ts` suffixes, `_` prefixes for internals). Two conventions encoding two orthogonal dimensions (runtime + visibility) in one flat folder proved confusing in practice. Superseded by **runtime-first folders**:

| Folder / file | Runtime | What lives here |
|---|---|---|
| `server/` | Server-only | `createServerFn` RPC endpoints (one file per **resource** — the noun acted on, not per endpoint), third-party server instances (Better Auth config), server-only helpers |
| `views/`, `components/`, `forms/` | Client (React) | All UI |
| `client.ts` (or `client/` when it outgrows one file) | Client-only, non-React | Browser SDK wrappers (Better Auth React SDK, Stripe.js, …) |
| `lib/` | Universal | Pure helpers — no React, no server-only APIs. Importable from anywhere |
| `constants.ts`, `types.ts` | Universal | Feature-scoped constants and types |

Rules of thumb inside `server/`:

- One file per **resource** (sessions, exercises, movements, sets), not per endpoint. Split a file when it passes ~400 lines or mixes three resource concepts.
- Name files after **what they provide** (`current-athlete.ts`, `signup-hook.ts`), never `utils.ts`/`helpers.ts` grab-bags. No `_` prefixes, no `internal/` subfolder — everything in `server/` shares the same runtime, and the folder name already communicates "not part of the client-facing surface."
- Helpers used by a single file stay private in that file (no `export`) — e.g. `runCreateSession` inside `server/sessions.ts`. Module-private beats file-split until a second consumer exists.
- **A helper belongs to the feature that owns its domain, not the feature that happened to need it first.** `getCurrentAthleteOrThrow` resolves session → athlete — that's identity, so it lives in `auth/server/current-athlete.ts` even though strength was its first consumer. Litmus test: if a future feature (wellness, rehab) would import it, it's in the wrong place inside `strength/`.
- A feature that wraps a third-party SDK instead of exposing own RPC endpoints uses the same layout: `auth/server/better-auth.ts` is the Better Auth instance, `auth/client.ts` is its browser SDK. No special casing.

The runtime split is a soft documentation contract (the bundler enforces the real boundary via `createServerFn` extraction — see the RSC vs RPC section below). For a hard build-time guarantee, the escalation path is the `server-only` npm package — `import "server-only"` at the top of a file makes any client-side import chain a build error. Currently not in use; introduce when the discipline-only contract starts costing us.

### Forms — vertical slice with co-located schema

Forms are a fourth category alongside `views/` and `components/`. They live in `features/<feat>/forms/`. A form is everything that makes a user-submitted vertical slice work as one cohesive unit:

- the Zod schema
- the inferred `LoginValues` / `SetFormValues` TS type
- the `useForm` hook and its config
- the submit handler (including API call + error mapping)
- the form-shaped JSX (`<Form><form><FormField></form></Form>`)

The view that mounts a form should not need to import `zodResolver`, `z.infer`, or know what fields the form has — it just renders `<LoginForm />`.

| Folder | Owns what | Example |
|---|---|---|
| `forms/` | Schema + RHF + submit + form JSX | `LoginForm`, `ExerciseSetForm` |
| `components/` | Everything else (rendering, local state, button + handler combos that aren't a form) | `GoogleSignInButton`, `SessionListItem`, `ExerciseDrawer` |

A `Drawer` containing a form is a **component** that mounts a **form** inside it. The split: `components/ExerciseDrawer.tsx` (drawer chrome, header, footer) imports `forms/ExerciseSetForm.tsx` (schema + RHF + fields).

Schema placement inside a form file: keep it inline at the top until a second consumer exists, then extract to `forms/<name>-schema.ts`. YAGNI by default.

### Server/client split — RSC convention vs TanStack Start RPC

Files inside `server/` that export `createServerFn` builders are named plainly (`sessions.ts`), **not** `sessions.server.ts`. The reason is worth understanding rather than memorizing as a rule, because the two patterns come from two different paradigms in the React ecosystem and a contributor coming from Next.js will reach for `.server.ts` by reflex.

#### Two paradigms, two boundaries

| Mechanism | Origin | What defines the boundary | Frameworks |
|---|---|---|---|
| `.server.ts` / `.server.tsx` | React Server Components (RSC) | **File** — the whole module is server-only and unimportable from client code | Next.js App Router |
| `createServerFn()` builder | TanStack Start | **Function call** — only the body of the `.handler(...)` is server-only; the symbol itself is imported and called from the client | TanStack Start |

TanStack Start does not use RSC. It uses a simpler primitive: `createServerFn`. The boundary is not the file — it's the `createServerFn().handler(...)` call. A single file can sit alongside route loaders, client components, and shared helpers; what matters is what is wrapped.

#### How the build transformation actually works

When the build runs, the TanStack Start Vite plugin walks the AST and performs a per-function transformation:

Source (`src/features/strength/server/sessions.ts`):
```ts
export const listRecentSessions = createServerFn({ method: "GET" }).handler(async () => {
  const { athleteId } = await getCurrentAthleteOrThrow();
  return db.select({...}).from(sessions).where(...);
});
```

Client bundle output (a chunk of ~1.5 KB containing every server fn in the file):
```js
var n = t({method:'GET'}).handler(e('e61c2347af63945907b92aebb74669fd7feca1147f0354d58ef417a656ff5db6'));
```

The plugin physically replaces the async handler body with `e('<hash>')`, where `e` is a stub factory and `<hash>` is the RPC route ID. At call time, the client invokes `listRecentSessions()` and the stub fires `POST /_serverFn/e61c2347...` with the args as payload. The real body — Drizzle queries, `auth.api.getSession`, `getCurrentAthleteOrThrow` — lives only in the server bundle.

What this implies in practice:

- **No naming convention is needed for safety.** The boundary is enforced by build-time AST extraction, not by filename matching.
- **Regular helper functions are safe too.** `getCurrentAthleteOrThrow` (in `auth/server/current-athlete.ts`) is a plain `async function` referenced only inside handlers. After the plugin extracts the handlers, nothing in the client bundle references it, and Vite's tree-shaking drops it — along with its whole import chain. Verifiable: `grep getCurrentAthleteOrThrow dist/client/assets/*.js` returns nothing.

#### Why `.server.ts` actively breaks this

Renaming `strength.ts` → `strength.server.ts` does not "add a second safety layer." It conflicts with the RPC mechanism:

1. The client code must `import { addSet } from "@/features/strength/server/sets"` so the call site has a symbol to invoke — at build time the plugin replaces the call with a `fetch` to the RPC route.
2. TanStack Start's `envOnly`-style import-protection plugin refuses to resolve `*.server.*` files from the client environment (matching the RSC convention where such files must be unimportable from client code).
3. Result: the build fails with `[import-protection] Import denied in client environment` the moment any client-side code (route loader, view component, shared helper) tries to import the symbol.

So `.server.ts` is not a stricter version of `createServerFn` — it's a different paradigm that assumes file-level isolation. The two cannot coexist on the same module.

#### When `.server.ts` would actually be appropriate

For pure server-only modules with **no** `createServerFn` export and **no** client-side imports — for example, a background-job script, a CLI entry point, or a server-only initialization module that the client must not even be able to attempt to import. Forge currently has none.

#### Verifying the split

For any new `server/` module, two checks confirm the split is clean:

```bash
# 1. Server-only symbols absent from client bundle:
grep -l "drizzle-orm\|better-auth/api\|<your-server-helper>" dist/client/assets/*.js

# 2. Server fn chunks are stub-sized (sub-2 KB for a file of N functions):
ls -la dist/client/assets/<feature>-*.js
```

Both checks should return empty / small. If a server-only symbol shows up in the client bundle, the cause is almost always **a non-`createServerFn` export from a `server/` file being imported by client code** — not a problem with the naming convention.

### Empty-folder rule

A folder is created the moment its first file exists. Don't pre-create empty `hooks/` or `stores/` "for the pattern." Don't refuse to create a folder because there's only one file — `lib/auth-errors.ts` is fine even though `lib/` currently has only that file in the auth feature.

### Promotion path

When a feature-specific component becomes used by a second feature: move from `features/A/components/X` to `shared/components/X`, update imports. No earlier than the second consumer existing.

### Import conventions

| Source | Path |
|---|---|
| Shadcn UI primitive | `@/components/ui/<name>` |
| Cross-feature shared | `@/shared/components/<Name>` |
| Feature-specific component | `@/features/<feat>/components/<Name>` |
| Feature form | `@/features/<feat>/forms/<Name>Form` |
| Route-level view | `@/features/<feat>/views/<Name>View` |
| Server functions / server-only code | `@/features/<feat>/server/<resource>` (e.g. `…/server/sessions`, `…/server/sets`) |
| Client-only SDK wrapper | `@/features/<feat>/client` |
| Feature constants/types/lib | `@/features/<feat>/{constants,types}` or `@/features/<feat>/lib/<helper>` |
| Cross-cutting utility | `@/lib/<name>` |

No barrel files (`index.ts` re-exporting everything). Import the concrete file. Barrels hurt tree-shaking and obscure where code physically lives.

## Alternatives considered

### Pattern B — pragmatic feature (minimal subfolders)

Only `components/` is an obligatory subfolder per feature; everything else (`server/`, `lib/`, types, constants) sits as bare files at `features/<feat>/`. Subfolders emerge only when a single file becomes 2+.

- **Pro:** Less ceremony for tiny features; minimum decision fatigue.
- **Con:** Inconsistent skeleton across features — strength might have `utils.ts` while auth has `lib/auth-errors.ts` after just enough growth, and the inconsistency makes pattern-matching harder for a future contributor. Mixed signals about where to put new things.
- **Verdict:** Rejected. Consistency across features wins; the ceremony cost is small.

### Pattern C — route co-location

Per-route folders with leading `-` (so TanStack Start ignores them), e.g., `routes/sessions/-components/ExerciseDrawer.tsx`. Components live next to the route they belong to.

- **Pro:** TanStack Start-native. Easy to see what a route touches.
- **Con:** Cross-route sharing gets awkward. The "Ostatnie sesje" card on `/` would want to import from `routes/sessions/-components/` which feels backwards. Less industry-standard.
- **Verdict:** Rejected. The cross-route sharing case is real (Forge has a home dashboard, history list, active session view all touching the same domain) and the route-folder pattern doesn't accommodate it cleanly.

### Pattern D — atomic design (atoms / molecules / organisms)

- **Pro:** Famous methodology.
- **Con:** Doesn't capture domain knowledge; "is this an atom or a molecule?" is a worse question than "which feature does this belong to?".
- **Verdict:** Rejected as the organizing principle. (We do informally use these labels within a feature — e.g., `MovementRow` is more molecular than `ActiveSessionView`.)

### Pattern E — `api/` folder with naming conventions (tried, superseded)

The first iteration of this ADR used `features/<feat>/api/` for "server fns + client wrappers," with suffix conventions (`server.ts`, `client.ts`) and `_` prefixes to distinguish runtime contexts and visibility within the flat folder.

- **Pro:** Bulletproof React-native naming; one folder for "everything backend-ish."
- **Con:** "api" reads as "HTTP calls" but held three runtime contexts (RPC endpoints, server-only library config, browser SDK re-exports). Two orthogonal dimensions (runtime + visibility) were encoded in filename conventions, which a reader had to decode. In review the folder was repeatedly described as confusing.
- **Verdict:** Superseded by runtime-first folders (`server/`, `client.ts`) the same day it was introduced. Folder name now answers the only question that matters at a glance: where does this code run?

## Consequences

### Positive

- **Predictable.** New code has an obvious home. New contributor reading the tree understands the project in five minutes.
- **Scales to N features.** Adding wellness, rehab, AI is "copy the strength skeleton, fill in domain code."
- **Routes stay readable.** ~20-line route files document the route's intent (auth gate, loader, view) without burying it in 900 lines of JSX.
- **Refactor surface is bounded.** A change to strength logic touches `features/strength/`; auth touches `features/auth/`. Cross-cutting changes touch `shared/` or `lib/` explicitly.
- **CV / portfolio value.** Demonstrates intentional architecture vs. accident-driven growth.

### Negative / trade-offs

- **Initial refactor cost.** Moving the existing `~900-line $sessionId.tsx`, `src/lib/strength.ts`, `src/lib/auth*.ts`, and `src/components/{spinner,status-badge,global-pending}.tsx` into the new layout is significant churn. Done in one PR (this one) to minimize the time the codebase has two conventions.
- **More files for first-time readers.** Eight drawer components in their own files in `features/strength/components/` is harder to skim than one big file. Trade-off accepted — search and IDE jump-to-definition are faster than scrolling.
- **Boilerplate around imports.** Eight import lines from `@/features/strength/components/<Drawer>` in `ActiveSessionView.tsx`. Acceptable.
- **One more concept to teach.** "View vs. component" is one more distinction. ADR + memory + README pointer cover it.

### Follow-ups

- README.md gets a "Project structure" section pointing to this ADR.
- When the third or fourth feature lands (wellness, rehab), revisit whether the skeleton stays canonical or evolves (e.g., explicit `hooks/`, `stores/` subfolders if multiple features end up using local state mgmt).
- If `shared/components/` grows past ~10 files, consider sub-categorizing (`shared/components/feedback/`, `shared/components/data-display/`).

## References

- [Bulletproof React](https://github.com/alan2207/bulletproof-react) — primary influence for the feature-first pattern.
- [forge-folder-architecture](memory) — operational rule for new code.
- [ADR-0001: TanStack Start frontend](ADR-0001-tanstack-start-frontend.md) — sets the routing context that makes `routes/` thin.
