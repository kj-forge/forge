import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { useState } from "react";
import { NumericFormat } from "react-number-format";

import { Input } from "@/components/ui/input";
import type { HyroxBlockDraft, HyroxStationDraft } from "@/features/plan/lib/hyrox-blocks";
import { type ExerciseOption, ExerciseSearchField } from "./ExerciseListPicker";

const emptyBlock = (): HyroxBlockDraft => ({ key: crypto.randomUUID(), stations: [], rounds: "3", restMinutes: "2" });

const targetSuffix = (unit: HyroxStationDraft["defaultUnit"]) =>
  unit === "REPS" ? "powt." : unit === "DISTANCE" ? "m" : null;

interface HyroxBlocksEditorProps {
  blocks: HyroxBlockDraft[];
  onChange: (blocks: HyroxBlockDraft[]) => void;
  allExercises: ExerciseOption[];
  onError: (message: string) => void;
}

export function HyroxBlocksEditor({ blocks, onChange, allExercises, onError }: HyroxBlocksEditorProps) {
  // Which block has its station search open; a pick appends and keeps it open
  // (declaring 5 stations in a row is the common case).
  const [addingIn, setAddingIn] = useState<string | null>(null);

  const update = (key: string, patch: Partial<HyroxBlockDraft>) =>
    onChange(blocks.map((b) => (b.key === key ? { ...b, ...patch } : b)));

  const moveStation = (block: HyroxBlockDraft, index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= block.stations.length) return;
    const next = [...block.stations];
    [next[index], next[j]] = [next[j], next[index]];
    update(block.key, { stations: next });
  };

  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => (
        <div key={block.key} className="space-y-2 rounded-lg border border-primary/40 p-3">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-bold text-[10px] text-primary uppercase tracking-wide">
              Blok {String.fromCharCode(65 + bi)}
            </span>
            <span className="min-w-0 flex-1" />
            <button
              type="button"
              aria-label="Usuń blok"
              onClick={() => onChange(blocks.filter((b) => b.key !== block.key))}
              className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              ✕
            </button>
          </div>

          {block.stations.map((station, si) => {
            const suffix = targetSuffix(station.defaultUnit);
            return (
              <div key={station.key} className="flex items-center gap-1 rounded-lg border bg-card px-2.5 py-2">
                <span className="min-w-0 flex-1 truncate font-medium text-sm">{station.namePl}</span>
                {suffix && (
                  <span className="flex items-center gap-1">
                    <NumericFormat
                      customInput={Input}
                      className="w-16 text-center tabular-nums"
                      placeholder="—"
                      inputMode="numeric"
                      decimalScale={0}
                      allowNegative={false}
                      isAllowed={(v) =>
                        v.value === "" || Number(v.value) <= (station.defaultUnit === "REPS" ? 1000 : 50000)
                      }
                      value={station.target}
                      valueIsNumericString
                      onValueChange={(v) =>
                        update(block.key, {
                          stations: block.stations.map((s) => (s.key === station.key ? { ...s, target: v.value } : s)),
                        })
                      }
                    />
                    <span className="text-muted-foreground text-xs">{suffix}</span>
                  </span>
                )}
                <button
                  type="button"
                  aria-label="W górę"
                  disabled={si === 0}
                  onClick={() => moveStation(block, si, -1)}
                  className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="W dół"
                  disabled={si === block.stations.length - 1}
                  onClick={() => moveStation(block, si, 1)}
                  className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
                >
                  <ArrowDown className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Usuń ${station.namePl}`}
                  onClick={() => update(block.key, { stations: block.stations.filter((s) => s.key !== station.key) })}
                  className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  ✕
                </button>
              </div>
            );
          })}

          {addingIn === block.key ? (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">Dodaj stację</span>
                <button
                  type="button"
                  className="text-muted-foreground text-xs underline-offset-4 hover:underline"
                  onClick={() => setAddingIn(null)}
                >
                  Gotowe
                </button>
              </div>
              <ExerciseSearchField
                allExercises={allExercises}
                excludeIds={[]}
                onPick={(e) => {
                  const opt = allExercises.find((o) => o.id === e.id);
                  update(block.key, {
                    stations: [
                      ...block.stations,
                      {
                        key: crypto.randomUUID(),
                        exerciseId: e.id,
                        namePl: e.namePl,
                        defaultUnit: opt?.defaultUnit ?? "REPS",
                        target: "",
                      },
                    ],
                  });
                }}
                onError={onError}
                autoFocus
              />
            </div>
          ) : (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-2 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setAddingIn(block.key)}
            >
              <Plus className="size-3.5" />
              Stacja
            </button>
          )}

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Rundy:</span>
              <NumericFormat
                customInput={Input}
                className="w-14 text-center tabular-nums"
                inputMode="numeric"
                decimalScale={0}
                allowNegative={false}
                isAllowed={(v) => v.value === "" || (Number(v.value) >= 1 && Number(v.value) <= 30)}
                value={block.rounds}
                valueIsNumericString
                onValueChange={(v) => update(block.key, { rounds: v.value })}
              />
            </span>
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Przerwa (min):</span>
              <NumericFormat
                customInput={Input}
                className="w-16 text-center tabular-nums"
                inputMode="decimal"
                decimalScale={1}
                allowNegative={false}
                value={block.restMinutes}
                valueIsNumericString
                onValueChange={(v) => update(block.key, { restMinutes: v.value })}
              />
            </span>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed py-2 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
        onClick={() => onChange([...blocks, emptyBlock()])}
      >
        <Plus className="size-3.5" />
        Blok
      </button>
    </div>
  );
}
