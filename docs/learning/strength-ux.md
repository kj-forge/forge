# Strength UX — for someone strong on frontend

The mental model behind the strength session logging flow in Forge. How the screens fit together, why the set-kind enum exists, what "from last session" really matches against, and the small UX rules that make the difference between "I'll log later" and "I'll log now."

> See [`docs/learning/server-functions.md`](server-functions.md) for the patterns used in `src/lib/strength.ts` (auth check, transactions, Drizzle queries, multi-tenant ownership). This doc focuses on UX + product semantics.

## 1. The data model in plain terms

A strength session in Forge looks like this in the DB:

```
session              ← row #1: date, type=STRENGTH, athleteId, notes (markdown)
  └ session_block    ← row #2: kind=STRAIGHT_SETS, orderIndex=0 (one per strength session)
      └ block_movement × N ← one row per exercise in order: siady, drążek, OHP, RDL
          └ set × M  ← individual sets (reps, weightKg, rpe, kind, notes)
```

The `session_block` row feels redundant for strength (there's always exactly one), but the same shape carries Hyrox EMOM / AMRAP / WORK with multiple blocks per session, so we accept the extra row to keep one data model across session types.

The interesting per-set columns:
- `setNumber` — ordinal within the movement
- `reps` — int, nullable (bodyweight or time-only sets may skip)
- `weightKg` — double precision, nullable (bodyweight)
- `rpe` — 1-10, nullable (optional rate-of-perceived-exertion)
- `kind` — set_kind enum, NOT NULL DEFAULT 'WORK'
- `notes` — free text per set, rarely used in MVP

## 2. Why `set_kind` exists (and why a boolean wasn't enough)

Real strength sessions don't fit a `4×5 @ 110kg` mould any more. Modern intermediate lifting routinely uses:

| Set kind | Purpose | Example |
|---|---|---|
| `WARMUP` | Ramp-up sets, don't count for volume | 60×8, 80×5, 100×3 before a 115 top set |
| `TOP_SET` | One heavy working set, often a single max | 115×5 (PR attempt) |
| `WORK` | Standard straight working set (no top/back-off scheme) | 110×5 × 4 sets for siady |
| `BACK_OFF` | Volume sets after the top set, lighter weight | 100×5 × 3 sets after the 115 top set |
| `FAILURE` | Set that broke down — incomplete | OHP 12/10/9/7 — the 7 is failure |
| `DROP_SET` | Mid-set weight drop technique | Rare, but exists |

A `is_warmup: boolean` could only encode 2 of these 6. Volume calculations (warmup excluded), color coding ("which sets count as work?"), and progression suggestions (TOP_SET RPE drives the next session's prescription) all need the richer distinction. Hence the `set_kind` enum.

## 3. The auto-detect heuristic

The exercise drawer pre-selects a set kind chip so the user can save in one tap without scrolling chips first. Rules (in `src/routes/sessions/$sessionId.tsx`):

| Situation | Suggested kind |
|---|---|
| No sets logged yet for this movement | `WORK` |
| Last set was `TOP_SET` AND new weight is lower | `BACK_OFF` |
| Otherwise | Mirror the kind of the previous set (carry-over) |

This is deliberately dumb. Auto-detecting `WARMUP` from a "ramp pattern" needs context (what's the user's intended top weight?) which we don't have until the user picks the top set. Better to suggest `WORK` and let the user override on the chip selector — one tap, always available.

## 4. "Z poprzedniej sesji" — what it really matches

When the user opens `/sessions/new` and chooses "Z poprzedniej sesji", we query:

```sql
SELECT * FROM sessions
WHERE athlete_id = $athleteId
  AND type = $type            -- STRENGTH today, but the function generalises
  AND EXTRACT(DOW FROM date) = $dayOfWeek
ORDER BY date DESC
LIMIT 1
```

Falls back to the most recent session of the same type if no day-of-week match exists.

Why day-of-week:
- Real routines are weekly (Tuesday = strength A, Thursday = strength B, Saturday = compromised run).
- A Thursday session should not be pre-populated from last Tuesday's lifts (different program day).
- New users with no Thursday history yet just get the type fallback.

Implementation detail: `getDay()` returns `0=Sunday, 6=Saturday` in JS; same convention as Postgres `EXTRACT(DOW)`. We pass the integer directly — no string mapping needed.

## 5. Progression suggestion — deterministic, no AI

The `suggestProgression(exerciseId)` server fn looks at the most recent **completed** session containing the exercise and inspects non-warmup sets:

```
let maxRpe = max(all working sets' RPE)

if no working sets:        "Brak serii roboczych w historii."
if no RPE recorded:        "Brak danych RPE — zaloguj RPE..."
if maxRpe ≤ 8:
   if lastWeight present:  +2.5 kg
   else (bodyweight):      +1 rep
otherwise:                 "Utrzymaj obecny ciężar, dopracuj formę."
```

The 2.5 kg increment matches standard plate fractions (Olympic 1.25 kg per side = 2.5 kg added). The +1 rep fallback for bodyweight matches typical pull-up / dip progression.

This isn't AI. AI-driven progression (taking sleep, HRV, week-on-week fatigue into account) is a P1 follow-up that needs the daily wellness epic data first.

## 6. The carry-over rule for set defaults

When you open the exercise drawer:
- **First set** → defaults from the last set of the most recent same-day-of-week session for this exercise (template path), or `5 × 0` if there's nothing.
- **Subsequent sets** → defaults from the previous set in *this* session (carry-over).

Why: real strength training is repeating the same target. `5×100, 5×100, 5×100, 5×100` is 1 tap per set after the first.

The state lives in the `ExerciseDrawer` component and is **intentionally not reset** when the drawer closes — closing and re-opening keeps the user's just-finished set numbers, ready to be saved again. The only thing that resets per-save is the optional RPE field (RPE is usually different per set).

When the user wants different numbers (top set going up, back-off going down), they edit the +/− steppers or the input directly. String state in the input lets backspace clear the field without React snapping back to "0" — see `docs/learning/server-functions.md` §"Input UX gotchas".

## 7. The screens — flow

### Home (`/`)

```
┌─────────────────────────────────────┐
│ Cześć, Krzysztof 👋        [Konto] │
├─────────────────────────────────────┤
│  🏋️ Czas na trening?                │
│  Ostatni: Siła · wtorek 2.05        │
│                                     │
│  [ + Rozpocznij sesję siłową ]      │
│                                     │
│  Niedawne sesje    [Zobacz wszyst.] │
│  ─────                              │
│  Siła [🔵 W trakcie]  wt 2.05  →    │
│  Siła [✅ Zakończona] cz 28.04 →    │
└─────────────────────────────────────┘
```

- Only one CTA. Strength is the only domain shipped — Hyrox / cardio CTAs land with their epics.
- Recent sessions show a status badge (W trakcie / Zakończona) — orange / green — so the user can spot an unfinished session at a glance.

### Choose how to start (`/sessions/new?type=STRENGTH`)

```
┌─────────────────────────────────────┐
│ ← Wróć                              │
│                                     │
│ Nowa sesja siłowa                   │
│ wtorek · 7.05                       │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 🔄 Z poprzedniej sesji          │ │
│ │ wtorkowa · 2 maja               │ │
│ │ [ Użyj jako template ]          │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 🆕 Pusta sesja                  │ │
│ │ Zacznij od zera                 │ │
│ │ [ Pusta sesja ]                 │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

- If no prior same-DoW session exists, the "Z poprzedniej" card is hidden — pusta sesja is the default.

### Active session (`/sessions/$sessionId`)

```
┌─────────────────────────────────────┐
│ ← Wróć                  wtorek 7.05 │
│                                     │
│ Sesja siłowa                        │
│ 💪 W trakcie · 4 ćwiczeń            │
│                                     │
│ Siady             4/4 ✅            │
│   110×0kg · 110×0kg · 110×0kg ...   │
│                                     │
│ Drążki            2/2 🔵            │
│   bw · 12×bw · 12×bw                │
│                                     │
│ OHP               ⚪ pending     ✕  │
│                                     │
│ RDL               ⚪ pending     ✕  │
│                                     │
│ ─── (fixed bottom) ───────────      │
│ [ + Dodaj ćwiczenie ]               │
│ [ Zakończ sesję ]                   │
│ Usuń sesję                          │
└─────────────────────────────────────┘
```

- Pending movements (no sets yet) show an inline `✕` button to remove them — accidentally added wrong exercise → one tap to undo.
- Once a set is logged, the `✕` disappears. Server-side guard re-checks the empty invariant in case the client state is stale.
- After the session is ended, the bottom bar swaps "Zakończ" for "Edytuj notatki", and the notes preview card shows above the bottom bar.

### Exercise drawer (set logging)

Tap any movement card and a Vaul drawer slides up:

```
┌──── Drawer ─────────────────────────┐
│  Siady                       ✕      │
│  3 serii w tej sesji                │
│                                     │
│  📊 W tej sesji:                    │
│   1. 🔥 Rozgrzewka · 60×8           │
│   2. 🔥 Rozgrzewka · 80×5         ✕ │
│   3. ⭐ Top set · 115×5          ✕  │
│                                     │
│  Następna seria:                    │
│                                     │
│  Typ serii                          │
│  [🔥 roz | ⭐ top | • prac | 💪 bk | ⚠️ fail | ↘ drop]
│                                     │
│  Powtórzenia                        │
│  [−]  [ 5 ]  [+]                    │
│                                     │
│  Ciężar (kg)                        │
│  [−2.5] [ 100 ] [+2.5]              │
│  0 = bodyweight                     │
│                                     │
│  RPE (opcjonalne)                   │
│  [6]  [7]  [8]  [9]  [10]           │
│                                     │
│  [ ⚡ Zapisz serię (Back-off) ]     │
└─────────────────────────────────────┘
```

- Kind chip is auto-suggested per the heuristic above; one tap to override.
- Reps / weight are string-typed in state — backspace clears the field cleanly, parse happens on submit.
- The save button label echoes the currently-selected kind so the user gets a last visual confirmation of what they're recording.
- Each logged set has its own `✕` for inline delete (no confirm; common to mis-tap weight).

### Exercise picker

Tap "+ Dodaj ćwiczenie" → a Vaul drawer with a search input:

- Search hits `namePl`, `nameEn`, AND any string in the `aliases` jsonb array — so "siady", "przysiady", "back squat", "BS" all find the squat row.
- Component is mounted only while `open === true` (conditional child render). Closing the drawer unmounts the form; opening again mounts fresh. No stale "siad" left in the search box after a successful add.

### End-of-session

Tap "Zakończ sesję" → drawer with optional notes textarea + summary placeholder:

- Notes are pure markdown (no editor toolbar yet); user's free-form `Wnioski z dzisiejszego treningu` paste straight into the field.
- After end, the same notes can be edited any time via `updateSessionNotes` — the page swaps the bottom bar to "Edytuj notatki" and shows a notes preview card.

### Delete session

A separate confirm drawer (not a modal — drawer for consistency with the rest of the flow):

- Warns differently for "in progress" vs "ended" sessions (mentions the data that'll be lost).
- One destructive red button + one cancel.
- Cascade-deletes session → blocks → movements → sets via FK on the database side; the server fn is a single DELETE.

## 8. The "what about…" list (deliberate omissions)

| Q | Where it lands |
|---|---|
| Edit set values after save? | Phase 2 — pattern: tap a set row in the summary list, drawer pre-filled |
| Save session as template / training plan? | Phase 2 — needs `training_plans` table |
| Rest timer? | "Only if asked" — user trains dual-bout, per-set timer doesn't fit |
| Volume / 1RM chart? | Separate analytics epic |
| AI-driven progression? | After daily wellness epic (we need sleep / HRV inputs) |
| Hyrox-specific session UI (EMOM / AMRAP / WORK with time caps)? | Own epic |
| Cardio / compromised-run logging? | Own epic |
| Daily wellness / journal? | Own epic |
| Coach dashboard / multi-athlete? | Monetisation epic (P1+) |
| Push notifications for unfinished sessions? | After PWA service worker lands (Electric SQL epic) |
| Voice logging "siady 4×5 100kg drugi set ciężko"? | AI / conversational logging epic (P1) |

## 9. Where this fits in the docs

- `docs/learning/database-concepts.md` — the schema primitives this UX maps to (FK, cascade, jsonb, enums).
- `docs/learning/database-workflow.md` — migration cheat sheet that handled `0002_set_kind.sql` + `0003_drop_is_warmup.sql`.
- `docs/learning/auth-concepts.md` — sessions / cookies / OAuth that gate all the strength routes.
- `docs/learning/curl-basics.md` — how to drive the strength server fns by hand for debugging.
- `docs/learning/server-functions.md` — the patterns that built `src/lib/strength.ts`.
- `docs/adr/ADR-0009` — original session/blocks/movements/sets data model.
- `docs/adr/ADR-0016` — implementation decisions captured for this epic.
