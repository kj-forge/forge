import { NotebookPen } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteSessionDrawer } from "@/features/strength/components/DeleteSessionDrawer";
import { blockLetter, formatMs } from "@/features/strength/components/HyroxLiveScreens";
import { NotesDrawer } from "@/features/strength/components/NotesDrawer";
import type { HyroxLive } from "@/features/strength/components/useHyroxLive";
import {
  blockMs,
  type HyroxBlockPlan,
  type LiveSegment,
  type PersistedSegment,
  roundMs,
  roxMs,
} from "@/features/strength/lib/hyrox-timer";
import { SESSION_ORIGIN_TARGET, type SessionOrigin } from "@/features/strength/lib/session-origin";
import { BackLink } from "@/shared/components/BackLink";

function SyncErrorBar({ syncError }: { syncError: string | null }) {
  if (!syncError) return null;
  return (
    <p className="text-destructive text-xs" role="alert">
      {syncError}
    </p>
  );
}

// Converts a live block's still-in-memory segments into the same shape the
// DB round-trips (PersistedSegment), so HyroxDoneSummary's aggregation runs
// identically whether the numbers come from the server or from state. Only
// closed segments carry a duration — at the "done" phase there is no open
// tail, but the filter is defensive rather than assumed.
export function liveSegmentsToPersisted(plan: HyroxBlockPlan[], segments: LiveSegment[]): PersistedSegment[] {
  return segments
    .filter((s): s is LiveSegment & { durationMs: number } => s.durationMs !== null)
    .map((s) => ({
      blockId: plan[s.blockIndex].blockId,
      roundNumber: s.roundNumber,
      orderIndex: s.orderIndex,
      kind: s.kind,
      blockMovementId: s.blockMovementId,
      durationMs: s.durationMs,
    }));
}

interface RoundSummary {
  round: number;
  roundMs: number; // STATION + ROX_ZONE, excludes REST — same definition as the roundMs selector
  roxMs: number;
  isExtra: boolean;
}

interface BlockSummary {
  blockIndex: number;
  blockId: string;
  totalMs: number; // whole block including rests
  workMs: number; // STATION only
  roxMs: number; // ROX_ZONE only
  restMs: number; // REST only
  rounds: RoundSummary[];
}

// Pure aggregation over PersistedSegment[] — deliberately not reusing the
// HyroxTimerState-based selectors from hyrox-timer.ts (blockMs/roundMs/roxMs
// take live state + a clock reading), since a DB read has neither. Same
// groupings, recomputed locally so both call sites (live "done" phase and the
// ended-session view) produce identical numbers for identical segments.
function summarizeSegments(plan: HyroxBlockPlan[], segments: PersistedSegment[]): BlockSummary[] {
  const blockIndexOf = new Map(plan.map((b, i) => [b.blockId, i]));
  return plan.map((block, blockIndex) => {
    const blockSegs = segments.filter((s) => blockIndexOf.get(s.blockId) === blockIndex);
    const sumBy = (predicate: (s: PersistedSegment) => boolean) =>
      blockSegs.filter(predicate).reduce((sum, s) => sum + s.durationMs, 0);

    const totalMs = sumBy(() => true);
    const workMs = sumBy((s) => s.kind === "STATION");
    const roxTotalMs = sumBy((s) => s.kind === "ROX_ZONE");
    const restMs = sumBy((s) => s.kind === "REST");

    const roundNumbers = [...new Set(blockSegs.map((s) => s.roundNumber))].sort((a, b) => a - b);
    const rounds: RoundSummary[] = roundNumbers.map((round) => ({
      round,
      roundMs: sumBy((s) => s.roundNumber === round && s.kind !== "REST"),
      roxMs: sumBy((s) => s.roundNumber === round && s.kind === "ROX_ZONE"),
      isExtra: round > block.targetRounds,
    }));

    return { blockIndex, blockId: block.blockId, totalMs, workMs, roxMs: roxTotalMs, restMs, rounds };
  });
}

// Shown right after the last station of a block closes: this block's totals
// (with rests) + round-by-round breakdown, then either the next block's
// start button or — on the last block — the finish CTA that opens the
// confirmation drawer owned by the caller.
export function HyroxBlockDoneScreen({ live, onRequestFinish }: { live: HyroxLive; onRequestFinish: () => void }) {
  const { state, plan, nowMs } = live;
  const blockIndex = state.blockIndex;
  const letter = blockLetter(blockIndex);
  const hasNextBlock = blockIndex + 1 < plan.length;

  const total = blockMs(state, nowMs, blockIndex);
  let roxTotal = 0;
  let roundWorkTotal = 0; // sum of roundMs (STATION + ROX_ZONE) across every round
  const roundRows: RoundSummary[] = [];
  // Rounds actually present (>=1 STATION/ROX_ZONE segment), like summarizeSegments —
  // an early endBlockEarly must not render never-happened rounds as "0:00".
  const presentRounds = [
    ...new Set(
      state.segments
        .filter((s) => s.blockIndex === blockIndex && (s.kind === "STATION" || s.kind === "ROX_ZONE"))
        .map((s) => s.roundNumber),
    ),
  ].sort((a, b) => a - b);
  for (const round of presentRounds) {
    const rMs = roundMs(state, nowMs, blockIndex, round);
    const rRoxMs = roxMs(state, nowMs, blockIndex, round);
    roxTotal += rRoxMs;
    roundWorkTotal += rMs;
    roundRows.push({ round, roundMs: rMs, roxMs: rRoxMs, isExtra: round > plan[blockIndex].targetRounds });
  }
  const workTotal = roundWorkTotal - roxTotal;
  const restTotal = total - roundWorkTotal;

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4 pb-0">
      <div className="space-y-2 text-center">
        <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">Blok {letter}</p>
        <h1 className="font-extrabold text-2xl">Blok {letter} zakończony</h1>
        <p className="font-extrabold text-3xl tabular-nums">{formatMs(total)}</p>
      </div>

      <Card>
        <CardContent className="space-y-1.5 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Praca na stacjach</span>
            <span className="font-semibold tabular-nums">{formatMs(workTotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Rox zone łącznie</span>
            <span className="font-semibold text-primary tabular-nums">{formatMs(roxTotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Przerwy</span>
            <span className="font-semibold tabular-nums">{formatMs(restTotal)}</span>
          </div>
        </CardContent>
      </Card>

      <ul className="space-y-1.5 text-sm">
        {roundRows.map((r) => (
          <li key={r.round} className="flex items-center justify-between">
            <span>
              Runda {r.round}
              {r.isExtra ? " (ekstra)" : ""}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {formatMs(r.roundMs)} · rox {formatMs(r.roxMs)}
            </span>
          </li>
        ))}
      </ul>

      <div className="sticky bottom-0 -mx-4 mt-auto space-y-2 border-t bg-background px-4 pt-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)-1.75rem))]">
        <SyncErrorBar syncError={live.syncError} />
        <Button type="button" variant="outline" className="w-full" onClick={live.extraRound}>
          + Ekstra runda
        </Button>
        {hasNextBlock ? (
          <>
            <Button
              type="button"
              className="w-full bg-ember py-5 font-extrabold text-lg shadow-ember"
              onClick={live.tap}
            >
              Start: Blok {blockLetter(blockIndex + 1)}
            </Button>
            <p className="text-center text-muted-foreground text-xs">przejście poza zegarem</p>
          </>
        ) : (
          <Button
            type="button"
            className="w-full bg-ember py-5 font-extrabold text-lg shadow-ember"
            onClick={onRequestFinish}
          >
            Zakończ trening
          </Button>
        )}
      </div>
    </main>
  );
}

export interface HyroxDoneSummaryProps {
  plan: HyroxBlockPlan[];
  segments: PersistedSegment[];
  notes: string | null;
  isEnded: boolean;
  // Where the session was opened from — drives the ended-only BackLink's
  // target/label. See session-origin.ts.
  origin: SessionOrigin;
  onSaveNotes: (notes: string) => Promise<void>;
  onDeleteSession: () => Promise<void>;
  // Present only for the live, pre-finish "done" phase — absent for the
  // ended-session view, which has nothing left to finish.
  onRequestFinish?: () => void;
  syncError?: string | null;
}

// Pure summary over PersistedSegment[] + plan — no live state read here. Both
// call sites (the live "done" phase, fed from state segments converted via
// liveSegmentsToPersisted, and the ended-session view, fed straight from the
// loader) share this one component and this one aggregation.
export function HyroxDoneSummary({
  plan,
  segments,
  notes,
  isEnded,
  origin,
  onSaveNotes,
  onDeleteSession,
  onRequestFinish,
  syncError = null,
}: HyroxDoneSummaryProps) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const blocks = summarizeSegments(plan, segments);
  const totalMs = blocks.reduce((sum, b) => sum + b.totalMs, 0);

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4 pb-0">
      {isEnded && (
        <header className="flex items-center pt-2">
          <BackLink to={SESSION_ORIGIN_TARGET[origin].to} label={SESSION_ORIGIN_TARGET[origin].label} />
        </header>
      )}

      <div className="space-y-1 text-center">
        <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">Trening Hyrox</p>
        <h1 className="font-extrabold text-3xl tabular-nums">{formatMs(totalMs)}</h1>
      </div>

      <ul className="space-y-2">
        {blocks.map((block) => (
          <li key={block.blockId}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>Blok {blockLetter(block.blockIndex)}</span>
                  <span className="tabular-nums">{formatMs(block.totalMs)}</span>
                </CardTitle>
              </CardHeader>
              {block.rounds.length > 0 && (
                <CardContent className="space-y-1.5">
                  {block.rounds.map((r) => (
                    <div key={r.round} className="flex items-center justify-between text-sm">
                      <span>
                        Runda {r.round}
                        {r.isExtra ? " (ekstra)" : ""}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatMs(r.roundMs)} · rox {formatMs(r.roxMs)}
                      </span>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          </li>
        ))}
      </ul>

      <Card>
        <CardContent className="space-y-2 py-3">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 font-medium text-sm">
              <NotebookPen className="size-3.5 text-primary" />
              Notatki
            </p>
            <button
              type="button"
              className="text-muted-foreground text-xs underline-offset-4 hover:underline"
              onClick={() => setNotesOpen(true)}
            >
              {notes ? "Edytuj" : "Dodaj"}
            </button>
          </div>
          {notes ? (
            <p className="whitespace-pre-wrap text-muted-foreground text-sm">{notes}</p>
          ) : (
            <p className="text-muted-foreground text-xs italic">Brak notatek</p>
          )}
        </CardContent>
      </Card>

      <Card className="opacity-70">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Statystyki Hyrox
            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-[10px] text-muted-foreground">
              Wkrótce
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">
            Estymata czasu zawodów pojawi się po zebraniu większej ilości danych.
          </p>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 mt-auto space-y-2 border-t bg-background px-4 pt-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)-1.75rem))]">
        <SyncErrorBar syncError={syncError} />
        {onRequestFinish && (
          <Button
            type="button"
            className="w-full bg-ember py-5 font-extrabold text-lg shadow-ember"
            onClick={onRequestFinish}
          >
            Zakończ trening
          </Button>
        )}
        <button
          type="button"
          className="w-full text-muted-foreground text-xs underline-offset-4 hover:text-destructive hover:underline"
          onClick={() => setDeleteOpen(true)}
        >
          Usuń sesję
        </button>
      </div>

      <NotesDrawer
        open={notesOpen}
        onOpenChange={setNotesOpen}
        initialNotes={notes ?? ""}
        onSave={async (next) => {
          await onSaveNotes(next);
          setNotesOpen(false);
        }}
      />

      <DeleteSessionDrawer
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        isEnded={isEnded}
        onConfirm={onDeleteSession}
      />
    </main>
  );
}
