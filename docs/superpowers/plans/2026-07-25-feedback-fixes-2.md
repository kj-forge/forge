# Feedback Fixes Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Eight corrections from KJ's dev pass: circuit set-edit modal (one pencil, flat rows with labels), no numeric placeholders, Hyrox ad-hoc guard, back arrow only on ended sessions, Profil back links, ConfirmDialog instead of inline "Na pewno?", plan delete moved into the edit dialog, delete for empty Hyrox sessions.

**Architecture:** Spec: `docs/superpowers/specs/2026-07-25-feedback-fixes-2-design.md`. New shared `ConfirmDialog`; new `EditCircuitSetsDialog` replacing `EditRoundDialog`; draft helpers extracted to `lib/set-draft.ts`. No schema or server changes (reuses `updateSet`/`deleteSet`/`deletePlan`/`removeScheduleEntry`/`deleteUnit`).

**Tech Stack:** unchanged (TanStack Start, RHF+zod, shadcn, bun test).

## Global Constraints

- UI copy Polish; code/comments/commits English; no Linear IDs in code.
- NumericFormat: keep `customInput={Input}` + explicit `inputMode`; REMOVE `placeholder` from numeric inputs that sit under a visible label; keep aria-labels.
- Confirmation modals use `<DialogContent mobileSheet>` (keyboard-less); edit modals with inputs use the default full-screen variant.
- After each task: `bun run typecheck && bun run lint`; tests via `bun test`.
- Commits: Conventional Commits + trailer `Co-Authored-By: Claude <noreply@anthropic.com>`.

---

### Task 1: Set-draft helpers + `EditCircuitSetsDialog` + StepDrawer wiring

**Files:**
- Create: `src/features/strength/lib/set-draft.ts`, `src/features/strength/lib/set-draft.test.ts`, `src/features/strength/components/EditCircuitSetsDialog.tsx`
- Modify: `src/features/strength/components/EditSetsDialog.tsx` (use shared helpers), `src/features/strength/components/StepDrawer.tsx` (RoundBody logged-rounds box)
- Delete: `src/features/strength/components/EditRoundDialog.tsx`

**Interfaces:**
- Produces: `RowDraft`, `toDraft(s)`, `draftDirty(s, d)`, `draftToPayload(setId, d)` in `lib/set-draft.ts` — extracted VERBATIM from the private copies in `EditSetsDialog.tsx` (they are the source of truth; move, do not rewrite).
- Produces: `<EditCircuitSetsDialog step open onOpenChange />`.

- [ ] **Step 1 (TDD): `set-draft.test.ts`** — move the semantics under test:

```ts
import { describe, expect, test } from "bun:test";

import { draftDirty, draftToPayload, toDraft } from "./set-draft";

const set = { reps: 5, weightKg: 100, durationSeconds: null, rpe: 9 };

describe("set drafts", () => {
  test("toDraft round-trips numbers to input strings", () => {
    expect(toDraft(set as never)).toEqual({ reps: "5", weightKg: "100", durationSeconds: "", rpe: "9" });
  });

  test("draftDirty detects any field change and ignores none", () => {
    const d = toDraft(set as never);
    expect(draftDirty(set as never, d)).toBe(false);
    expect(draftDirty(set as never, { ...d, weightKg: "102.5" })).toBe(true);
  });

  test("draftToPayload full-replaces with nulls; weight <= 0 becomes bodyweight", () => {
    expect(draftToPayload("id1", { reps: "8", weightKg: "0", durationSeconds: "", rpe: "" })).toEqual({
      setId: "id1",
      reps: 8,
      weightKg: null,
      durationSeconds: null,
      rpe: null,
    });
  });
});
```

Run: `bun test src/features/strength/lib/set-draft.test.ts` → FAIL (module missing).

- [ ] **Step 2: `lib/set-draft.ts`** — move `RowDraft`, `toDraft`, `draftDirty`, `draftToPayload` from `EditSetsDialog.tsx` verbatim (imports: `numToInputStr` from `./set-form`, `SetRow` type). Export all four. Update `EditSetsDialog.tsx` to import them and delete its local copies. Test → PASS.

- [ ] **Step 3: `EditCircuitSetsDialog.tsx`** — mirror `EditSetsDialog`'s body/state machine (conditional body mount, `deletedIds`, immediate delete with spinner, dirty-only sequential `updateSet` with `wrote` error-path invalidation, bounds validation, cancel guarded), with these differences:

Row model — all sets of the whole step, grouped by round ascending, then movement order:

```ts
const entries = loggedRoundNumbers(step.movements).flatMap((round) =>
  step.movements.flatMap((m) => {
    const s = m.sets.find((x) => x.setNumber === round);
    return s ? [{ movement: m, set: s }] : [];
  }),
);
```

Render per entry: label line `` <p className="font-semibold text-sm">{movement.exerciseNamePl} · Seria {set.setNumber}</p> `` and under it ONE row `[reps][kg][rpe][✕]` (TIME movement → `[sekundy][rpe][✕]`), inputs identical to `EditSetsDialog`'s (NumericFormat, inputMode, `isAllowed` caps, NO placeholders), aria-labels `` `Powtórzenia: ${movement.exerciseNamePl} — seria ${set.setNumber}` `` etc.; delete aria `` `Usuń serię ${set.setNumber}: ${movement.exerciseNamePl}` ``. Dialog title "Edytuj serie", description = joined movement names. Validation message on invalid dirty row: `` `Uzupełnij wartości: ${movement.exerciseNamePl}.` `` Props `{ step: Step; open: boolean; onOpenChange: (open: boolean) => void }`.

- [ ] **Step 4: StepDrawer wiring.** In RoundBody's logged-rounds box: header row becomes justify-between with ONE pencil (pattern from `ExerciseDrawer`'s box header) opening `setEditOpen(true)`; per-row pencils AND their column disappear — rows are plain text lines again. Remove `editingRound` state and the `<EditRoundDialog>` render; add `const [editOpen, setEditOpen] = useState(false);` and `<EditCircuitSetsDialog step={step} open={editOpen} onOpenChange={setEditOpen} />`. Delete `src/features/strength/components/EditRoundDialog.tsx` (no other consumers — verify with grep).

- [ ] **Step 5: Verify** — `bun run typecheck && bun run lint && bun test` → PASS; `grep -rn "EditRoundDialog" src` → empty.

- [ ] **Step 6: Commit** — `feat(strength): circuit set edit in one modal with per-set rows`

---

### Task 2: Placeholder sweep (numeric inputs)

**Files:** Modify: `src/features/strength/components/StepDrawer.tsx`, `src/features/strength/components/EditSetsDialog.tsx`, `src/features/strength/components/EditCircuitSetsDialog.tsx` (should be born clean), any other numeric hit.

- [ ] **Step 1:** `grep -rn "placeholder=" src --include="*.tsx" | grep -iE "powt|kg|sek|RPE|—"` — remove the `placeholder` prop from every `NumericFormat` that sits under a visible column label / FormLabel (RoundBody rows: `powt.`, `kg`, `sek.`, `RPE`; EditSetsDialog RPE `—`). Do NOT touch text-field placeholders (search, notes, plan name, adhoc form).
- [ ] **Step 2:** `bun run typecheck && bun run lint` → PASS.
- [ ] **Step 3:** Commit — `fix(ui): drop redundant placeholders from labeled numeric inputs`

---

### Task 3: Hyrox ad-hoc guard + delete for empty Hyrox session

**Files:** Modify: `src/features/strength/views/NewSessionView.tsx`, `src/features/strength/views/HyroxSessionView.tsx`

- [ ] **Step 1: NewSessionView.** For `type === "HYROX"` the "Pusta sesja" card changes: description "Trening Hyrox deklarujesz w planie — pusta sesja Hyrox nie ma czego logować.", button stays visible but `disabled`, and below it a `variant="outline"` button/link to the plan:

```tsx
{type === "HYROX" ? (
  <div className="space-y-2">
    <Button variant="outline" className="w-full" disabled>
      Pusta sesja
    </Button>
    <Button asChild variant="outline" className="w-full">
      <Link to="/plan">Przejdź do planu</Link>
    </Button>
  </div>
) : (
  /* existing button unchanged */
)}
```

(`Link` from `@tanstack/react-router`; adjust the CardDescription conditionally.)

- [ ] **Step 2: HyroxSessionView empty state** (`steps.length === 0`): add below the info Card the ActiveSessionView-style delete affordance + drawer (state `const [deleteOpen, setDeleteOpen] = useState(false);` — `DeleteSessionDrawer` is already exported from `@/features/strength/components/DeleteSessionDrawer`):

```tsx
        <button
          type="button"
          className="w-full text-muted-foreground text-xs underline-offset-4 hover:text-destructive hover:underline"
          onClick={() => setDeleteOpen(true)}
        >
          Usuń sesję
        </button>

        <DeleteSessionDrawer open={deleteOpen} onOpenChange={setDeleteOpen} isEnded={isEnded} onConfirm={removeSession} />
```

(`removeSession` already invalidates `["history"]` and navigates to `/sessions`.)

- [ ] **Step 3:** `bun run typecheck && bun run lint` → PASS.
- [ ] **Step 4:** Commit — `fix(strength): hyrox ad-hoc guard and delete for empty hyrox session`

---

### Task 4: Back arrow — ended only + Profil links

**Files:** Modify: `src/features/strength/views/ActiveSessionView.tsx`, `src/features/strength/views/HyroxSessionView.tsx`, plus views discovered in Step 2.

- [ ] **Step 1: Ended-only on sessions.** `ActiveSessionView` header: `className={\`flex items-center ${isEnded ? "justify-between" : "justify-end"} pt-2\`}` and `{isEnded && <BackLink to="/sessions" label="Historia" />}`. Same treatment in `HyroxSessionView`'s empty-state header (it has `isEnded` in scope). `HyroxDoneSummary` already gates on `isEnded` — leave.
- [ ] **Step 2: Profil links.** Read `src/features/auth/views/MeView.tsx` and list its outgoing `Link` targets; cross-check `src/shared/lib/nav.ts` `TAB_BAR_PATHS`/`showsTabBar`. For every linked top-level screen that hides the tab bar and has NO back affordance (expected: `/exercises` catalog — `src/features/strength/views/ExercisesView.tsx`; audit `/notes` list too), add `<BackLink to="/me" label="Profil" />` at the top of its `<main>`, matching the ActiveSessionView placement pattern. List each screen + decision in the report.
- [ ] **Step 3:** `bun run typecheck && bun run lint` → PASS.
- [ ] **Step 4:** Commit — `fix(ui): back arrow only on ended sessions, Profil back links`

---

### Task 5: `ConfirmDialog` + inline-confirm sweep + plan card/dialog rework

**Files:**
- Create: `src/shared/components/ConfirmDialog.tsx`
- Modify: `src/features/plan/components/ScheduleTab.tsx` (EntryActionSheet), `src/features/plan/components/UnitDrawer.tsx`, `src/features/plan/components/PlansTab.tsx`, `src/features/plan/components/PlanFormDialog.tsx`

**Interfaces:**
- Produces: `ConfirmDialog` props `{ open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; confirmLabel: string; pending?: boolean; onConfirm: () => void }` — destructive confirm styling, mobileSheet.

- [ ] **Step 1: `ConfirmDialog.tsx`** — mirror `DeleteSessionDrawer`'s structure (read it first; `mobileSheet`, `mx-auto w-full max-w-md` wrapper, header, footer with destructive-styled confirm + "Anuluj"):

```tsx
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/shared/components/Spinner";

// Keyboard-less destructive confirmation — replaces inline "Na pewno?" toggles.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent mobileSheet>
        <div className="mx-auto w-full max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              disabled={pending}
              onClick={onConfirm}
            >
              {pending ? <Spinner size="sm" /> : confirmLabel}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="outline" className="w-full" disabled={pending}>
                Anuluj
              </Button>
            </DialogClose>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

(Adapt the exact wrapper/footer classes to whatever `DeleteSessionDrawer` actually uses — it is the canonical shape.)

- [ ] **Step 2: ScheduleTab EntryActionSheet.** Remove `confirmRemove` state and the two-tap button; the remove button opens `ConfirmDialog` (`title: "Usunąć trening z tego dnia?"`, description for PLAN source: "Usuwa tylko to wystąpienie (ten tydzień) — plan zostaje.", `confirmLabel` = existing button text) which calls the existing `onRemove(entry)`.
- [ ] **Step 3: UnitDrawer.** Replace the `confirmDelete`/"Na pewno usunąć?" two-tap (line ~364) with `ConfirmDialog` (`title: "Usunąć trening z planu?"`, confirmLabel "Usuń trening", pending = deleting) wired to the existing delete handler.
- [ ] **Step 4: PlansTab.** Delete the card's "Usuń" button, `confirmDelete` state and `handleDelete` entirely ("Edytuj" stays as the last action for every status).
- [ ] **Step 5: PlanFormDialog.** Edit mode only (`plan !== null`): under the submit button add a destructive "Usuń plan" button → `ConfirmDialog` (`title: \`Usunąć plan „${plan.name}"?\``, description "Usuwa plan, jego treningi i wpisy w harmonogramie. Zapisane sesje zostają.", confirmLabel "Usuń plan") → `deletePlan({ data: { planId: plan.id } })` (import from `@/features/plan/server/plan`) → `router.invalidate()` → close both dialogs. Works for ACTIVE plans too (verify `deletePlan` server fn has no status guard; report if it does).
- [ ] **Step 6: Sweep check** — `grep -rn "Na pewno" src` → empty. `bun run typecheck && bun run lint && bun test` → PASS.
- [ ] **Step 7:** Commit — `feat(ui): shared ConfirmDialog replaces inline confirms, plan delete moves to edit dialog`

---

### Task 6: Full gate

- [ ] **Step 1:** `bun run check` — lint/typecheck/tests green; knip diff vs baseline only (no new findings from this branch; `EditRoundDialog` removal must not leave dangling exports).
- [ ] **Step 2:** Commit anything outstanding — `chore: round-2 green check` (only if changes exist).

## Dev-test checklist (KJ)

1. Obwód → boks „W tej sesji": jeden ołówek w rogu; modal z „Pompki · Seria 1" + inputy + ✕; edycja i kasowanie działa.
2. Inputy bez placeholderów (obwód + modale), labels wystarczają.
3. Nowa sesja → chip Hyrox: „Pusta sesja" disabled z wyjaśnieniem i linkiem do planu.
4. Pusta sesja Hyrox (stara): da się usunąć.
5. Aktywna sesja bez „‹ Historia"; zakończona z. Katalog ćwiczeń (z Profilu): „‹ Profil".
6. Zero „Na pewno?" — wszędzie modal. Karta planu bez „Usuń"; usuwanie w modalu edycji (także aktywny plan).
