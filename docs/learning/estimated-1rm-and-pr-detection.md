# Estimated 1RM & PR detection — for someone strong on frontend

How Forge decides "that set was a record" and what the `e1RM ~131 kg` line in the stats tab actually means. Short version: you can't compare `5× 112.5` against `3× 115` directly, so both get converted to a common currency first.

> Code: `src/features/strength/lib/e1rm.ts` and `pr.ts` (pure, unit-tested), `src/features/strength/server/stats.ts` (PR table + weekday comparison), the PR check inside `addSet` in `server/sets.ts`.

## 1. The problem: sets at different rep counts aren't comparable

A training block rarely repeats the same set scheme week to week. One Tuesday it's `4×5 @ 105`, three weeks later it's a heavy `×3 @ 112.5`. Which one was "better"? Raw weight says 112.5; anyone who's done a hard set of five knows it's not that simple.

**Estimated 1-rep max (e1RM)** answers this by projecting every set onto the same scale: "if this effort were a single all-out rep, how heavy would it be?" Two sets can then be compared as plain numbers.

## 2. Epley, and why we picked it

Forge uses the **Epley formula**:

```
e1RM = weight × (1 + reps / 30)
```

- `100 × 1` → 100 (a single IS the max, no projection)
- `100 × 5` → 116.7 → rounded to **116.5**
- `60 × 10` → 80

We round to the nearest **0.5 kg** — anything finer implies precision the estimate doesn't have (it's a heuristic, not a measurement).

Alternatives we didn't pick:

| Formula | Shape | Why not |
|---|---|---|
| Brzycki `w × 36/(37−r)` | Very close to Epley below ~10 reps, diverges above | No practical difference in our 1–12 rep range; Epley is simpler to read |
| Lombardi `w × r^0.10` | Power curve | Underestimates low-rep sets, the ones main-lift training cares about |
| Wathan / Mayhew | Exponential, research-fitted | More parameters, same ±5% error band in practice |

All of these agree within a few percent for 1–10 reps. The honest statement is: **the choice of formula matters less than using ONE formula consistently**, because we only ever compare Forge numbers against other Forge numbers. Epley is the most widely quoted, trivially explainable, and monotonic in both weight and reps (more weight or more reps always = higher e1RM — important so a PR can't appear by doing *less*).

Above ~12 reps every formula degrades into fiction (a 20-rep squat set is a conditioning event, not a strength test). We still compute it — the number is just read with that grain of salt.

## 3. PR semantics — the small rules that matter

**Warmups never count.** A `WARMUP` set of `120 × 1` before a top set isn't a record attempt, it's part of the ramp. Both the PR table and the celebration check skip `kind = 'WARMUP'`.

**Bodyweight sets (weightKg = NULL) can't hold a weight record.** `12× drążek` with no added load has no bar weight to project. Those sets are excluded rather than treated as 0 kg.

**Added-load exercises (pull-up, dip) show `+kg` and no e1RM.** For weighted chins, `weightKg` stores only the ADDED load (`+20`). Epley over 20 kg would produce a nonsense number (your body is most of the resistance and it isn't in the column). So the PR table shows the heaviest added-load set as `8× +20 kg` with the e1RM cell dashed, and the celebration toast skips the e1RM line. The honest fix would be `(bodyweight + added) × Epley`, but bodyweight-on-that-day is data we don't collect per session (daily metrics may make this possible later).

**Two different "bests" coexist, deliberately:**

| Question | Function | Example winner |
|---|---|---|
| What goes in the table row? | `bestSet` — heaviest set by weight, ties by reps | `110 × 1` beats `100 × 10` |
| Was this set a record? | `bestE1RM` — max e1RM across history | `100 × 10` (e1RM 133.5) beats `110 × 1` (e1RM 110) |

The table answers "what's the most weight I've moved" (that's what you brag about); the celebration answers "was this the strongest I've ever been" (that's what training progress means). Using the table's best for the celebration would fire fake PRs: beating a lonely `110 × 1` single with `105 × 3` (e1RM 115.5) *feels* like a record until you remember the `100 × 10` set from March.

**A PR is a strict improvement.** Equal e1RM is not a new record — repeating your best is consistency, not progress. And the very first set of a new exercise doesn't celebrate: with no history there's nothing beaten.

**The check runs against ALL history, including the in-progress session.** Set a PR mid-session, then beat it two sets later → two toasts. That's correct: each one was the record at the moment it happened.

## 4. Where "main lift" lives: a flag, not the category

The exercises table already had `category = 'MAIN_LIFT'` for exactly the four barbell lifts — so why add an `is_main_lift` boolean that (today) duplicates it?

Because they answer different questions. `category` is **taxonomy** — what kind of movement this is. `is_main_lift` is **product behaviour** — "this exercise appears in the PR table by default". The moment a front squat or paused bench enters the catalogue it will be `category = 'MAIN_LIFT'` by nature, but the PR table should stay the athlete's four tracked lifts unless deliberately changed. Coupling display to taxonomy makes adding an exercise silently reshape the stats screen.

The alternative — a config table (`athlete_id`, `exercise_id`, `tracked`) — is where this goes IF per-athlete tracked lifts become a feature (multi-tenant future). For a single flag on 4 rows, a config table is ceremony. The accessory group lives even lighter: a slug list constant in code (`ACCESSORY_SLUGS`), because it's a display preference of one screen, not a data property.

## 5. The weekday comparison, briefly

The "Zestawienia" segment answers KJ's actual notebook habit: *"what did Tuesday's training look like across the last two months?"* Sessions are filtered in SQL by `EXTRACT(ISODOW FROM date)` (1 = Monday … 7 = Sunday — we shift to 0-indexed Monday to match the PON–ND chips) and a 2-month floor, then pivoted client-side into exercise-rows × session-columns. Cells use the compact notebook notation (`105 4×5`, `110 3/3/3/5`, `112.5 ×3`, bare `12/12/10` for bodyweight) implemented as a pure formatter in `lib/format-sets-compact.ts` — the exact strings are pinned by unit tests, because that notation IS the spec.

One timezone subtlety: "today's weekday" (the default chip) is computed in **Europe/Warsaw**, not server time. Route loaders run on the server during SSR, and Cloudflare Workers live in UTC — at 23:30 in Warsaw, UTC is already tomorrow's date... actually still yesterday's: UTC lags Warsaw, so a late-evening visit would default to *yesterday's* chip. `dayjs().tz("Europe/Warsaw")` (utc + timezone plugins) pins it.
