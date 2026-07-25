import { Pause, Play, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { HyroxLive } from "@/features/strength/components/useHyroxLive";
import {
  blockMs,
  canUndo,
  effectiveRounds,
  type HyroxBlockPlan,
  restRemainingMs,
  roundMs,
  roxMs,
  runningMs,
} from "@/features/strength/lib/hyrox-timer";

export function blockLetter(blockIndex: number): string {
  return String.fromCharCode(65 + blockIndex);
}

export function formatMs(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Live counter: m:ss as the headline, tenths as a smaller trailing fraction.
function formatMsTenths(ms: number): { main: string; tenths: string } {
  const clamped = Math.max(0, ms);
  const totalTenths = Math.floor(clamped / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenth = totalTenths % 10;
  return { main: `${minutes}:${String(seconds).padStart(2, "0")}`, tenths: `.${tenth}` };
}

function formatRestSeconds(restSeconds: number | null): string | null {
  if (restSeconds === null) return null;
  return formatMs(restSeconds * 1000);
}

function SyncErrorBar({ syncError }: { syncError: string | null }) {
  if (!syncError) return null;
  return (
    <p className="text-destructive text-xs" role="alert">
      {syncError}
    </p>
  );
}

function StationDots({ count, currentIndex }: { count: number; currentIndex: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {Array.from({ length: count }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-order dots
          key={i}
          className={`size-2 rounded-full ${
            i < currentIndex ? "bg-muted-foreground/40" : i === currentIndex ? "bg-primary" : "bg-muted-foreground/20"
          }`}
        />
      ))}
    </div>
  );
}

function TimerControls({ live }: { live: HyroxLive }) {
  const paused = live.state.pausedAtMs !== null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label="Cofnij"
          disabled={!canUndo(live.state)}
          onClick={live.undo}
        >
          <RotateCcw className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label={paused ? "Wznów" : "Pauza"}
          onClick={live.pauseToggle}
        >
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </Button>
      </div>
      {paused && (
        <p className="mx-auto w-fit rounded-full border border-primary border-dashed bg-primary/10 px-3 py-1 font-semibold text-primary text-xs">
          PAUZA — zegar zatrzymany
        </p>
      )}
    </div>
  );
}

// What comes right after this station, in Polish, for the "następnie: …" line.
function stationNextUpLabel(block: HyroxBlockPlan, stationIndex: number, round: number, rounds: number): string {
  const isLastStation = stationIndex === block.stations.length - 1;
  if (!isLastStation) {
    return `rox zone → ${block.stations[stationIndex + 1].label}`;
  }
  if (round >= rounds) {
    return "koniec bloku";
  }
  const restLabel = formatRestSeconds(block.restSeconds) ?? "—";
  return `przerwa ${restLabel} · runda ${round + 1}`;
}

export function HyroxIdleScreen({ live }: { live: HyroxLive }) {
  const { state, plan } = live;
  const block = plan[state.blockIndex];
  const letter = blockLetter(state.blockIndex);
  const rounds = effectiveRounds(state, plan, state.blockIndex);
  const restLabel = formatRestSeconds(block.restSeconds);

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4 pb-0">
      <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
        Sesja Hyrox · Blok {letter}
      </p>

      {state.round > 1 && (
        <span className="inline-flex w-fit items-center rounded-full bg-primary/15 px-2.5 py-1 font-semibold text-primary text-xs">
          Wznowienie od rundy {state.round}
        </span>
      )}

      <ul className="space-y-2">
        {block.stations.map((station) => (
          <li key={station.blockMovementId}>
            <Card className="bg-muted">
              <CardContent className="flex items-center justify-between gap-2 py-3 text-sm">
                <span className="truncate font-medium">{station.label}</span>
                {station.target && <span className="text-muted-foreground text-xs">{station.target}</span>}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground text-sm italic">„Telefon trzyma trener. Ekran nie zgaśnie.”</p>

      <div className="sticky bottom-0 -mx-4 mt-auto space-y-2 border-t bg-background px-4 pt-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)-1.75rem))]">
        <SyncErrorBar syncError={live.syncError} />
        <Button type="button" className="w-full bg-ember py-5 font-extrabold text-lg shadow-ember" onClick={live.tap}>
          Start: Blok {letter}
        </Button>
        <p className="text-center text-muted-foreground text-xs">
          {rounds} rund × {block.stations.length} stacji{restLabel ? ` · przerwa ${restLabel}` : ""}
        </p>
      </div>
    </main>
  );
}

// Covers both "station" and "rox" phases — same skeleton, the rox zone swaps
// the name/target slots for the transition text and tints the screen.
export function HyroxStationScreen({ live }: { live: HyroxLive }) {
  const { state, plan, nowMs } = live;
  const block = plan[state.blockIndex];
  const letter = blockLetter(state.blockIndex);
  const isRox = state.phase === "rox";
  const rounds = effectiveRounds(state, plan, state.blockIndex);
  const station = block.stations[state.stationIndex];
  const nextStation = isRox ? block.stations[state.stationIndex + 1] : null;

  const running = formatMsTenths(runningMs(state, nowMs));
  const round = formatMs(roundMs(state, nowMs, state.blockIndex, state.round));
  const total = formatMs(blockMs(state, nowMs, state.blockIndex));

  const currentDotIndex = isRox ? state.stationIndex + 1 : state.stationIndex;

  return (
    <main
      className={`mx-auto flex min-h-full max-w-md flex-col gap-3 p-4 pb-0 ${
        isRox
          ? "bg-[color-mix(in_srgb,var(--primary)_7%,var(--background))] dark:bg-[color-mix(in_srgb,var(--primary)_13%,var(--background))]"
          : ""
      }`}
    >
      {isRox ? (
        <p className="font-bold text-[10px] text-primary uppercase tracking-widest">ROX ZONE · zmiana stacji</p>
      ) : (
        <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-widest">
          BLOK {letter} · RUNDA {state.round}/{rounds} · STACJA {state.stationIndex + 1}/{block.stations.length}
        </p>
      )}

      <div className="space-y-1">
        <h1 className="font-extrabold text-3xl">{isRox ? "Rox zone" : station.label}</h1>
        {isRox
          ? nextStation && (
              <p className="text-muted-foreground text-sm">
                → {nextStation.label}
                {nextStation.target ? ` · ${nextStation.target}` : ""}
              </p>
            )
          : station.target && <p className="text-muted-foreground text-sm">{station.target}</p>}
      </div>

      <StationDots count={block.stations.length} currentIndex={currentDotIndex} />

      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-4">
        <p className="font-extrabold text-7xl tabular-nums">
          {running.main}
          <span className="text-4xl">{running.tenths}</span>
        </p>
        <p className="text-center text-muted-foreground text-sm">
          Runda <b className="text-foreground">{round}</b> · Blok <b className="text-foreground">{total}</b>
        </p>
      </div>

      <TimerControls live={live} />

      <div className="sticky bottom-0 -mx-4 mt-auto space-y-2 border-t bg-background px-4 pt-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)-1.75rem))]">
        <SyncErrorBar syncError={live.syncError} />
        <Button type="button" className="w-full bg-ember py-5 font-extrabold text-lg shadow-ember" onClick={live.tap}>
          {isRox ? `Start: ${nextStation?.label}` : "Koniec stacji"}
        </Button>
        {!isRox && (
          <p className="text-center text-muted-foreground text-xs">
            następnie: {stationNextUpLabel(block, state.stationIndex, state.round, rounds)}
          </p>
        )}
      </div>
    </main>
  );
}

export function HyroxRestScreen({ live }: { live: HyroxLive }) {
  const { state, plan, nowMs } = live;
  const block = plan[state.blockIndex];
  const restLabel = formatRestSeconds(block.restSeconds);
  const remaining = restRemainingMs(state, nowMs, plan);

  const roundTotal = roundMs(state, nowMs, state.blockIndex, state.round);
  const roxTotal = roxMs(state, nowMs, state.blockIndex, state.round);
  const roxPct = roundTotal > 0 ? Math.round((roxTotal / roundTotal) * 100) : 0;

  const nextRound = state.round + 1;
  const firstStation = block.stations[0];

  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4 pb-0">
      <Card>
        <CardContent className="space-y-1 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">Runda {state.round}</span>
            <span className="font-semibold tabular-nums">{formatMs(roundTotal)}</span>
          </div>
          <p className="text-muted-foreground text-xs">
            w tym rox zone <span className="font-semibold text-primary">{formatMs(roxTotal)}</span> ·{" "}
            <span className="font-semibold text-primary">{roxPct}%</span>
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-4">
        <p
          className={`font-extrabold text-8xl tabular-nums ${remaining !== null && remaining < 0 ? "text-destructive" : ""}`}
        >
          {remaining === null
            ? formatMs(runningMs(state, nowMs))
            : remaining < 0
              ? `+${formatMs(-remaining)}`
              : formatMs(remaining)}
        </p>
        {restLabel && <p className="text-muted-foreground text-sm">przerwa {restLabel}</p>}
      </div>

      <TimerControls live={live} />

      <div className="sticky bottom-0 -mx-4 mt-auto space-y-2 border-t bg-background px-4 pt-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)-1.75rem))]">
        <SyncErrorBar syncError={live.syncError} />
        <Button type="button" variant="outline" className="w-full" onClick={live.endBlockEarly}>
          Zakończ blok
        </Button>
        <Button type="button" className="w-full bg-ember py-5 font-extrabold text-lg shadow-ember" onClick={live.tap}>
          Start rundy {nextRound}
        </Button>
        <p className="text-center text-muted-foreground text-xs">{firstStation.label}</p>
      </div>
    </main>
  );
}
