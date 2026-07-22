# Trening Hyrox — deklaracja w planie + stoper trenera — Design Spec

Zatwierdzony kierunek (makieta: claude.ai/code/artifact/d8bc25f9-8d37-425e-ba77-d83f4da1c29c, wariant **A · Wielki zegar**). Decyzje podjęte przez KJ 2026-07-22.

## Wizja

Trener trzyma telefon atlety i klika trening: **Koniec stacji** → rox zone (automatycznie) → **Start stacji** → … → przerwa z odliczaniem → następna runda. Każdy segment liczy od zera, czasy sumują się w rundę i blok. Po treningu: podsumowanie (rundy + udział rox zone), notatki, wejście do statystyk Hyrox. Dane z segmentów są paliwem pod przyszłą estymatę czasu zawodów (Etap 3).

## Decyzje zamknięte

1. **Struktura treningu**: trening = **bloki** (A, B, …); blok = sekwencja stacji (ta sama w każdej rundzie) × liczba rund + zadeklarowana **przerwa między rundami**. Bieg jest zwykłą pozycją sekwencji. W rundzie między stacjami zawsze rox zone; po ostatniej stacji rundy — przerwa (nie rox zone); między blokami — poza zegarem.
2. **Przerwa**: odliczanie w dół od zadeklarowanej, po 0:00 czerwony nadmiar `+0:07` + wibracja; następna runda startuje **na klik** — zapisujemy faktyczny czas przerwy.
3. **Deklaracja w planie** (edytor jednostek, typ HYROX), nie ad-hoc w sesji. Stacja = ćwiczenie z katalogu + **opcjonalny target** (powtórzenia albo metry, wg jednostki ćwiczenia).
4. **Kontrolki live**: Cofnij (misclick — czas wraca, jakby kliknięcia nie było), Pauza/Wznów (mrozi cały zegar), Zakończ blok wcześniej (z przerwy) / Ekstra runda (z podsumowania bloku). Pominięcie stacji — poza v1.
5. **Model danych: podejście 1** — nowa tabela-dziennik `session_segments` (oś czasu = pierwszoklasowy byt) + lustro czasów stacji w `sets`.
6. **UI live: wariant A** — ogromny licznik, nazwa stacji + target nad nim, statystyki rundy/bloku pod spodem, jeden wielki przycisk w strefie kciuka z podpisem „co dalej”; rox zone przebarwia cały ekran (ember tint).
7. **Ekran końcowy bez estymaty**: podsumowanie + Notatki + karta „Statystyki Hyrox”. Estymata mieszka w statystykach (Etap 3) i odblokowuje się po zebraniu danych albo po ręcznym uzupełnieniu celów brakujących stacji; w Etapie 2 karta w stanie „wkrótce” (nieaktywna).
8. Czas: na żywym liczniku `m:ss.d` (dziesiątki), podsumowania `m:ss`. Czas rundy = stacje + rox zone (bez przerw); czas bloku liczy też przerwy; suma sesji bez przejść między blokami.

## Podział na etapy

| Etap | Zakres | Dostarczenie |
|---|---|---|
| **1 — Deklaracja** | schema planu + edytor jednostki HYROX + materializacja do sesji | PR 1 (Linear issue, EN) |
| **2 — Live** | `session_segments` + `HyroxSessionView` (wariant A) + zapis + ekran końcowy | PR 2 (Linear issue, EN) |
| **3 — Statystyki** | strona statystyk Hyrox: estymata na wierzchu, ręczne cele, algorytmy ze zmęczeniem, wykresy/animowane wizualizacje | osobny brainstorm + spec, poza tym dokumentem |

Workflow: epic-level → pełna ceremonia (Linear issue → branch z Lineara verbatim → PR). Commity/push tylko po zatwierdzeniu w sesji.

## Model danych

### Nowa tabela `session_segments` (Etap 2)

| Kolumna | Typ | Uwagi |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `athleteId` | uuid FK → athletes, cascade | denormalizacja per ADR-0010 |
| `sessionId` | uuid FK → sessions, cascade | |
| `blockId` | uuid FK → session_blocks, cascade | |
| `roundNumber` | integer NOT NULL | 1-based; > `targetRounds` = runda ekstra |
| `orderIndex` | integer NOT NULL | rosnący w obrębie bloku (globalna oś czasu bloku) |
| `kind` | enum `segment_kind` NOT NULL | `STATION \| ROX_ZONE \| REST` (nowy pg enum) |
| `blockMovementId` | uuid FK → block_movements, cascade, NULL | wymagane ⇔ `kind = STATION` (walidacja w zod, nie CHECK) |
| `durationMs` | integer NOT NULL | milisekundy — dziesiątki sekundy bez strat |
| `createdAt` | timestamptz NOT NULL | `defaultNow()` |

Unikalny indeks **`(blockId, roundNumber, orderIndex)`** — retry zapisu jest idempotentny (`onConflictDoNothing`).

Semantyka: `REST` po rundzie N ma `roundNumber = N` (przerwa domyka rundę, którą wieńczy). Ostatnia runda bloku nie ma segmentu REST (chyba że Ekstra runda — wtedy REST poprzedza rundę N+1, ale nadal z `roundNumber = N`).

### Lustro w `sets` (Etap 2)

Każdy segment `STATION` zapisuje w tej samej transakcji wiersz `sets`: `blockMovementId`, `setNumber = roundNumber`, `durationSeconds = round(durationMs/1000)`, `kind = WORK`. Historia i statystyki ćwiczeń (sled push, wall balls…) działają bez zmian w ich kodzie. Źródłem prawdy osi czasu pozostaje `session_segments`.

### Zmiany w istniejących tabelach (Etap 1)

- `training_plan_unit_steps` **+ `restSeconds`** (integer, NULL) — przerwa między rundami bloku Hyrox (`targetRounds` już istnieje).
- `training_plan_unit_step_exercises` **+ `targetReps`, `targetDistanceM`** (integer, NULL) — target stacji.
- `block_movements` **+ `targetReps`** (integer, NULL) — cel materializacji (`targetDistanceM` już istnieje).
- **DROP unikalnego indeksu `block_movements_block_exercise_uq`** `(blockId, exerciseId)` — sekwencja Hyrox może zawierać to samo ćwiczenie wielokrotnie (Blok A: „Bieg 500 m” ×2). Analogiczny constraint przy `training_plan_unit_step_exercises` (jeśli istnieje) też do zdjęcia. Ochronę przed duplikatem w siłowym „morph” (`addExerciseToStep`) przenosimy do kodu (guard w server fn).
- `blockKind` bez zmian — bloki Hyrox mają `kind = STRAIGHT_SETS`; widok branchuje po `session.type === "HYROX"` (pierwszy render-branch po typie w apce, świadoma decyzja — kształt danych pozostaje uniwersalny per ADR-0022).

## Etap 1 — deklaracja w planie

**Edytor jednostki** (rozszerzenie wzorców z PR #66, `UnitDrawer`/`UnitStepsEditor`):
- Jednostka `sessionType: HYROX` dostaje edytor kroków (dziś gate `=== "STRENGTH"`). Krok = blok Hyrox: lista stacji (wiersz: ćwiczenie + input targetu) + stepper **Rundy** + input **Przerwa** (mm:ss → `restSeconds`).
- Target: jednostka ćwiczenia `REPS` → `targetReps`; `DISTANCE` → `targetDistanceM`; `TIME`/`CALORIES` → v1 bez pola targetu. Target zawsze opcjonalny.
- Zod (`upsertUnitInput`): kroki przestają być dropowane dla HYROX (`plan.ts:227`); walidacja targetów (int > 0, sensowne maksima), `restSeconds` 5–3600, `targetRounds` 1–30.

**Zdjęcie blokad STRENGTH** (trzy miejsca): `upsertUnit` (drop kroków), `UnitDrawer.tsx:283` (render edytora), `loadStartableUnits` (filtr typu) + gate w `NewSessionView` („start z planu” dla HYROX).

**Materializacja** (`runCreateSession` z `fromUnitId`): kroki jednostki HYROX → `session_blocks` (`orderIndex`, `kind = STRAIGHT_SETS`, `targetRounds`, `restSeconds`) + `block_movements` (`orderIndex`, `exerciseId`, `targetReps`/`targetDistanceM`). Sesja dostaje `type = HYROX`.

**Sesja HYROX bez bloków** (ad-hoc z `/sessions/new`): ekran pusty z komunikatem „Zadeklaruj trening Hyrox w planie i wystartuj go stamtąd” + link do planu. Builder w sesji — poza v1.

## Etap 2 — live

### Silnik: `src/features/strength/lib/hyrox-timer.ts`

Czysty reducer (wzorzec `step-progress.ts`), unit-testowany. Stan: `phase (idle | station | rox | rest | blockDone | done)`, `blockIndex`, `round`, `stationIndex`, log segmentów domkniętych, segment bieżący (kotwica czasu), `pausedTotal`. Zdarzenia: `tap` (główny przycisk), `undo`, `pauseToggle`, `endBlockEarly`, `extraRound`, `finish`.

- **Czas**: kotwice `Date.now()` (odporne na uśpienie karty/lock screen), elapsed = `now − anchor − pausedTotal`; rAF tylko do renderu. Pauza = zamrożenie wirtualnego zegara.
- **Undo**: porzuca bieżący segment i otwiera poprzedni z jego pierwotną kotwicą (czas ciągły, jakby kliknięcia nie było). Dostępne tylko dla segmentów **niezapisanych** (bufor); po granicy zapisu przycisk disabled.
- **Ekstra runda**: z `blockDone` → REST (`roundNumber` = ostatnia runda) → runda N+1. **Zakończ blok**: z `rest` → domyka REST → `blockDone`.

### Zapis: `saveHyroxSegments` (server fn)

Klient buforuje segmenty i **flushuje na granicach**: koniec rundy, koniec bloku, koniec treningu. Payload: `sessionId`, `blockId` + tablica `{roundNumber, orderIndex, kind, blockMovementId?, durationMs}`. Handler w jednej transakcji (WebSocket pool): insert `session_segments` (`onConflictDoNothing` po unikalnym indeksie) + lustro `sets` dla STATION. Kolejka retry po stronie klienta (ponowienie przy kolejnym flushu / online); po powtarzających się błędach nieblokujący toast.

**Odporność**: mirror stanu reduktora w `localStorage` (`hyrox-live:<sessionId>`) po każdym zdarzeniu; rehydracja przy wejściu na sesję (pad karty/sieci nie gubi nawet bieżącej rundy). Czyszczony po `endSession`. „Zakończ trening” = flush bufora → istniejące `endSession`.

### Widok: `src/features/strength/views/HyroxSessionView.tsx`

`routes/_shell/sessions/$sessionId.tsx` wybiera widok po `session.type === "HYROX"`; loader dokłada `segments` dla sesji Hyrox. Ekrany 1:1 z makietą:

1. **Pre-start**: lista bloków (stacje + targety, rundy, przerwa), „Telefon trzyma trener”, CTA `Start: Blok A`.
2. **Stacja** (wariant A): eyebrow `BLOK A · RUNDA 1/3 · STACJA 2/5`, nazwa + target, kropki postępu stacji, licznik `m:ss.d` (76px, tabular-nums), pod nim `Runda … · Blok …`, rząd Cofnij/Pauza, CTA `Koniec stacji` z podpisem „następnie: …”.
3. **Rox zone**: tło ember-tint (`color-mix` 7% light / 13% dark), eyebrow ember, CTA `Start: <następna stacja>`.
4. **Przerwa**: karta podsumowania rundy („Runda 2 — 6:12 · w tym rox zone 0:38 · 10%”), odliczanie (84px), nadmiar czerwony `+0:07` + `navigator.vibrate` przy 0:00 (iOS: no-op), CTA `Start rundy N`, obok „Zakończ blok”.
5. **Podsumowanie bloku**: czas bloku, praca/rox/przerwy, lista rund; `+ Ekstra runda` (secondary) i CTA `Start: Blok B` / `Zakończ trening`.
6. **Koniec treningu**: suma + bloki z rundami, **Notatki** (istniejący `NotesDrawer` + `updateSessionNotes`), karta **„Statystyki Hyrox — wkrótce”** (nieaktywna, copy o estymacie po zebraniu danych). Zakończona sesja Hyrox (historia) renderuje ten sam widok podsumowania.

**Wake lock**: `navigator.wakeLock.request("screen")` przy wejściu w live, ponowne pozyskanie na `visibilitychange`; zwolnienie po zakończeniu.

Motywy: oba (tokeny Żaru kuźni); ember nigdy jako kolor tekstu body; ikony lucide; animacje za `prefers-reduced-motion`.

## Obsługa błędów

- Utrata sieci w trakcie: trening liczy dalej (stan lokalny autorytatywny), zapisy dosyłane kolejką; komunikat dopiero po powtarzających się porażkach.
- Zabita karta / restart telefonu: rehydracja z `localStorage` — wraca dokładny stan (z pauzą ustawioną, jeśli była).
- Podwójny flush (retry po timeout, który jednak doszedł): idempotencja przez unikalny indeks.
- Wejście w aktywną sesję Hyrox z innego urządzenia: v1 poza zakresem (jeden telefon); stan żyje lokalnie + w zapisanych rundach.

## Poza zakresem v1 (świadomie)

Ad-hoc builder bloków w sesji · edycja/korekta segmentów po fakcie · pominięcie stacji · dźwięki · multi-device live · Etap 3 w całości (strona statystyk, ręczne cele, estymata, wizualizacje).

Dług strukturalny (decyzja KJ 2026-07-22): `HyroxSessionView` i silnik żyją w `features/strength`, bo sesje/bloki/sety tam mieszkają — do przemyślenia później lepszy podział featurów (np. wydzielenie `sessions`/`hyrox`).

## Testy

- `hyrox-timer.ts`: pełne przejścia maszyny stanów — sekwencja szczęśliwa (2 bloki), undo z rox/stacji/przerwy/blockDone, granica undo po flushu, pauza w każdej fazie, ekstra runda, wcześniejszy koniec bloku, blok 1-stacyjny (bez rox zone) — przeniesienie scenariuszy z harnessu makiety (70 asercji).
- Materializacja: jednostka HYROX → bloki/movements z targetami i kolejnością (w tym duplikat ćwiczenia w sekwencji).
- `saveHyroxSegments`: idempotencja (podwójny insert tej samej rundy), lustro `sets` spójne w transakcji.
- Lint/typecheck przed handoffem (`bun run typecheck` + `bun run lint`), po `db:generate` także `bun run format`.

## Dokumentacja (w ramach PR-ów)

- **ADR**: `session_segments` + lustro w `sets` + zdjęcie unikalnego indeksu + branch widoku po typie sesji (Etap 1/2, jeden ADR).
- **`docs/learning/hyrox-live-timing.md`** (Phase E epiku): wake lock, kotwice czasu vs throttling, idempotentny zapis, localStorage-journal.
- Aktualizacja `docs/architecture/data-model.md`.
