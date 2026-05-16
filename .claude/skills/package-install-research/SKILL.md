---
name: package-install-research
description: Before running any package installation command (bun add, npm install, pnpm add, yarn add, bunx <pkg> init, etc.), fetch the package's official Getting Started / Installation docs, identify the exact recommended install command (including specific flags like -E for exact version pin, -D for dev dependency, separate init steps), show it to the user with the source URL, and wait for explicit confirmation before executing. Use whenever the user mentions adding a package or the assistant is about to install one.
---

# Package install research

Before installing any package into Forge, validate the install command against the package's current official docs. Convention drifts between versions: a generic `bun add -d <pkg>` may miss the flag the package's docs explicitly recommend, and a default `init` may not match the project's existing config.

## Workflow

### Step 1: Fetch the official Getting Started / Installation page

Use WebFetch to retrieve the package's current install docs. Don't rely on memory — installation conventions evolve.

- Most packages have `https://<package-site>/docs/getting-started/` or `/installation/`
- For framework integrations (Tailwind + TanStack Start, shadcn + TanStack Start, VitePWA + Vue, etc.), prefer the framework-specific guide over the generic one
- Always quote the URL when reporting back to the user

### Step 2: Identify the exact recommended command

Extract from the docs:

- **Package name(s)** to install (sometimes one package, sometimes a peer-dep pair)
- **Production vs dev** flag — `-d` / `-D` / `--save-dev` for dev; no flag for production. Biome ships as dev, Tailwind as production per their own guides.
- **Version pinning** flag — `-E` / `--save-exact` for exact, otherwise caret range. Biome explicitly recommends `-E`.
- **Multiple commands** if needed (e.g., separate `init` step after install creates a config file)
- **Prerequisites** the docs mention (e.g., "make sure Tailwind is already configured before running shadcn init")

### Step 3: Show the command to the user

Present a brief summary, structured like this:

```
Source: <URL>

Install command:
  <exact bash command>

Flags:
  - -D       dev dependency
  - -E       pin exact version (recommended by <pkg> docs for stability)

Followup:
  - bunx --bun <pkg> init  → creates <config-file>
```

### Step 4: Wait for explicit confirmation

Do **not** run the install command on the user's behalf without confirmation. This gate is explicit user policy — see [`memory/package-install-research-first.md`](../../../../.claude/projects/-Users-chris-projects-forge/memory/package-install-research-first.md) for context.

### Step 5: After install, run any init step the docs require

Some tools (Biome, shadcn, husky, ESLint) have a separate `init` command that creates a config file. Run it if the docs say so — also after confirmation.

## Rules

- **Trigger:** every `bun add`, `npm install`, `pnpm add`, `yarn add`, `bunx <pkg> init`, `npx <pkg> create`, or any other command that pulls a new package into `package.json`.
- **Exception:** `bun remove` / `npm uninstall` — removal is uniform across tools, no docs check needed.
- **Even for "obvious" packages** (react, typescript, vite) — pinning conventions vary, and a 30-second docs check costs nothing.
- **Note flag changes in the commit message body** — if the proper command differs from what we used before (e.g., `-d` → `-D -E`), call it out so the convention is preserved as the team grows.
- **Framework-specific guides win over generic ones.** Tailwind + TanStack Start has its own page that differs from the generic Tailwind install.

## Examples

### Biome 2.x
- Docs: https://biomejs.dev/guides/getting-started/
- Install: `bun add -D -E @biomejs/biome`
- Init: `bunx --bun @biomejs/biome init` (creates `biome.json`)
- Notes: `-E` (exact version) is **strongly recommended** by Biome for stability between minor releases.

### Tailwind v4 + TanStack Start
- Docs: https://tailwindcss.com/docs/installation/framework-guides/tanstack-start
- Install: `bun add tailwindcss @tailwindcss/vite` (production deps per the guide, not dev)
- Plugin order in `vite.config.ts`: `tailwindcss()` → `tanstackStart()` → `viteReact()`
- No separate init — Tailwind v4 is CSS-first; `src/styles.css` with `@import "tailwindcss";` is enough.

### shadcn/ui + TanStack Start
- Docs: https://ui.shadcn.com/docs/installation/tanstack
- Init: `bunx shadcn@latest init --preset nova --base radix --no-monorepo --yes` (for existing project — not `-t start`, which scaffolds a new one)
- Pulls deps automatically (`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `radix-ui`, `tw-animate-css`, `@fontsource-variable/geist`)
- Requires `@/*` import alias already configured.

## Verification (after install runs)

- [ ] Dep landed in the correct section of `package.json` (`dependencies` vs `devDependencies`)
- [ ] Version range matches the docs recommendation (`^x.y.z` vs pinned `x.y.z`)
- [ ] Any config file created by `init` is in the expected location and has sensible defaults
- [ ] `bun.lock` (or equivalent) is updated and not corrupted
- [ ] Quick smoke test (`bunx --bun <pkg> --version` or `bun run <new-script>`) confirms the tool works
