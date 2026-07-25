# Fixy z feedbacku brata — obwody, edycja serii, czas, harmonogram, nawigacja — Design Spec

Zatwierdzony kierunek (makieta: claude.ai/code/artifact/c7a10324-7576-40ad-b1b1-0ac60bb47cf9). Decyzje podjęte przez KJ 2026-07-24. Jeden branch / jeden PR na cały batch.

## Zakres

Osiem tematów z feedbacku testera (brat KJ):

1. Nazewnictwo i liczniki rund w obwodach (wariant **1A — „Rundy 1/4"**)
2. Edycja ćwiczeń w trakcie obwodu (wariant **2A — ołówek przy każdym ćwiczeniu**)
3. Edycja zapisanych serii (wariant **3B — jeden modal, wszystkie serie, z RPE w wierszu**)
4. Ćwiczenie na czas w logowaniu pojedynczym (parytet z obwodami)
5. Bug historii po usunięciu treningu (redirect + stale cache)
6. Ujednolicenie klawiatury numerycznej w inputach
7. Harmonogram: pora dnia **Rano/Wieczór** (bez opcji „bez pory"), drag-and-drop wyłączony na mobile
8. Strzałka wstecz na ekranach szczegółów (wspólny `BackLink`)

## Ustalenia z eksploracji (stan obecny)

- Baza (`sets.durationSeconds`) i ścieżka obwodowa **już wspierają** serie na czas; brakuje ich tylko w `ExerciseDrawer` + `addSet` (`lib/set-form.ts`, `server/sets.ts`).
- Edycja zapisanej serii jest dziś **niemożliwa** — istnieją tylko `addSet`/`deleteSet` i `saveRound`/`deleteRound`. Potrzebna nowa mutacja `updateSet`.
- Off-by-one: karta obwodu pokazuje `currentRound` (numer *następnej* rundy), nie liczbę zapisanych (`StepRows.tsx:38`); wyświetlanie nadmiaru ucina `Math.min(...)`.
- Usunięcie sesji nawiguje na `/` i **nigdzie nie ma inwalidacji** cache TanStack Query `["history"]` (`ActiveSessionView.tsx:228-236`, `lib/history-query.ts`).
- Inputy obwodu mają `inputMode`, inputy pojedynczego ćwiczenia nie (`ExerciseDrawer.tsx:221-274`).
- Harmonogram nie ma żadnego pola kolejności w ramach dnia ani pory dnia; DnD to @dnd-kit z `TouchSensor` (long-press 250 ms).
- `/sessions/$sessionId` chowa dolny tab bar i **nie ma żadnej drogi powrotu** na mobile; wzorzec „‹ wstecz" istnieje ręcznie sklejony na 3 ekranach.

---

## 1. Rundy: nazewnictwo i liczniki

**Słownik:** *obwód* = zestaw ćwiczeń (krok sesji z 2+ ćwiczeniami); *runda* = jedno przejście przez obwód. W UI „obwód” zostaje tylko tam, gdzie mowa o zestawie („+ Ćwiczenie do obwodu”, „Notatka do obwodu…”, „Edytuj obwód”); wszystkie konteksty liczenia/zapisu przechodzą na „rundę”.

**Liczenie (`lib/step-progress.ts`):**

- `savedRounds(movements)` — liczba **różnych** `setNumber` w seriach kroku. To jest liczba pokazywana wszędzie („Rundy 2/4”). Odporna na wymianę ćwiczenia w trakcie (temat 2) i na częściowe rundy z danych legacy (częściowa liczy się jako zapisana).
- `currentRound(movements)` = `maxLoggedRound + 1` — po usunięciu zapisu per-ćwiczenie rundy są atomowe, logika „frontier” przestaje być potrzebna. Częściowej rundy legacy nie da się „dokończyć” z poziomu inputów — poprawia się ją w modalu edycji rundy (temat 3).
- `completedRounds` (min po ćwiczeniach) przestaje być używane przez UI.

**Wyświetlanie:**

- Karta obwodu (`SupersetRow`): kropki **znikają**. Status z celem: `Rundy {saved}/{target}` + „ ✓” gdy `saved >= target`; **bez** `Math.min` — nadmiar to uczciwe „Rundy 5/4 ✓”. Bez celu: „1 runda zapisana / 2 rundy zapisane / 5 rund zapisanych” (polskie plurale). Pusty: „Pusty — tapnij, by zacząć” (bez zmian). Prefiks „Obwód ” w podtytule znika — sam status.
- Drawer obwodu (`StepDrawer` RoundBody): nagłówek `Runda {currentRound} / {target}`, kropki znikają. Stopka: „Zapisz rundę” / „Zapisz rundę i dalej →” (warunek auto-przejścia bez zmian). Komunikaty i aria-labels: „Nie udało się zapisać rundy.”, „Usuń rundę {n}” itd.
- Podsumowanie (`EndedStepCard`): podtytuł `Rundy {saved}/{target}`, bez celu `{saved} rund(y)`. Prefiks „obwód · … obwodów” znika. Linie per runda bez zmian.

## 2. Edycja ćwiczeń w trakcie obwodu (wariant A)

**Znika zapis pojedynczego ćwiczenia** (przycisk-ptaszek + `saveOne`). Jedyny zapis to cała runda. Wiersz ćwiczenia w drawerze: nazwa + **ołówek** (zawsze, zastępuje warunkowe ✕) + inputy.

**Ołówek → modal akcji ćwiczenia:**

- „Zamień na inne ćwiczenie” — otwiera istniejący picker ćwiczeń; wybór wykonuje atomowo: soft-usunięcie starego + dodanie nowego do obwodu.
- „Usuń z obwodu (od tej rundy)” — gdy ćwiczenie ma zapisane serie: soft-usunięcie; gdy nie ma żadnej: twarde usunięcie (istniejące `removeExerciseFromSession`), etykieta wtedy po prostu „Usuń z obwodu”.
- „Anuluj”.

**Model danych:** nowa kolumna `session_block_movements.removed_after_round` (int, nullable). Soft-usunięcie w rundzie *n* ustawia `removed_after_round = n − 1`. Ćwiczenie jest *aktywne* w rundzie *n*, gdy kolumna jest NULL lub `n <= removed_after_round`.

- RoundBody renderuje inputy i tytuł drawera tylko z ćwiczeń aktywnych w `currentRound`.
- `saveRound` dostaje wpisy tylko dla aktywnych (filtr po stronie klienta; serwer bez zmian).
- Tytuł karty/podsumowania joinuje wszystkie ćwiczenia kroku (również wymienione — mają zapisaną historię).
- Linie per runda w podsumowaniu i „W tej sesji” zostają pozycyjne z „—” dla brakujących serii — po wymianie widać, w których rundach dane ćwiczenie nie występowało. Zero nowej logiki renderowania.
- Licznik rund liczy numery rund (`savedRounds`), więc wymiana niczego nie psuje — odpowiedź na pytanie KJ „czy sesja będzie wiedziała ile zrobiłem”.

**Zaakceptowany kant:** usunięcie rund po wymianie (np. cofnięcie do rundy 1, gdy wymiana była w 2) nie przywraca starego ćwiczenia — naprawa przez ponowne dodanie z pickera. Analogiczny kant istnieje już przy „ekstra rundzie” w Hyrox (ADR Etap 2).

## 3. Edycja zapisanych serii (wariant B, RPE w wierszu)

**Serwer:** nowa mutacja `updateSet({ setId, reps?, weightKg?, rpe?, durationSeconds? })` — walidacja jak w `addSet`/`saveRound` (refine: reps LUB durationSeconds), sprawdzenie własności jak w `deleteSet`. Bez logiki PR (toast o rekordzie tylko przy dodawaniu; statystyki i tak liczą z danych).

**Pojedyncze ćwiczenie (`ExerciseDrawer`):** małe ✕ przy wierszach „W tej sesji” **znikają**. W nagłówku boxu pojawia się ołówek → modal **„Edytuj serie”**:

- wiersz = `nr · [powtórzenia] [ciężar] [RPE] [X]` (dla TIME: `nr · [sekundy] [RPE] [X]`),
- „Zapisz zmiany” aktualizuje zmienione wiersze (`updateSet` per seria),
- X przy wierszu usuwa serię od razu (spinner, wiersz znika) — świadomy kontekst edycji zastępuje potwierdzenie,
- typ serii (kind) nieedytowalny w v1.

**Rundy obwodu (RoundBody „W tej sesji”):** ten sam wzorzec — ołówek per wiersz rundy (zastępuje ✕) → modal **„Edytuj rundę {n}”**: wiersz per ćwiczenie `[powt] [kg] [RPE]` (dla TIME: `[sekundy] [RPE]`) + „Zapisz zmiany” + destrukcyjny przycisk „Usuń rundę {n}” (istniejące `deleteRound`).

## 4. Ćwiczenie na czas (parytet)

- `lib/set-form.ts`: schema rozgałęzia się po `exerciseDefaultUnit === "TIME"` — pole `durationSeconds` (int 1–36000) zamiast reps/weight; komunikat „Podaj czas w sekundach.”
- `server/sets.ts` `addSet`: przyjmuje `durationSeconds`, refine jak w `steps.ts:147-155`.
- `ExerciseDrawerBody` w trybie TIME: stepper **„Czas (sekundy)” ±5** zamiast stepperów powtórzeń/ciężaru; chipy typu serii i RPE zostają; seed z ostatniej serii (`seedSetFields` uczy się `durationSeconds`).
- Format: gałąź czasu (`"30s"`) przenosi się z `formatRoundSet` (StepDrawer) do `lib/format-set.ts` — jedna implementacja dla „W tej sesji”, kart, podsumowania i podglądów.
- Ikona `Timer` zamiast `Dumbbell` na kartach kroków, których ćwiczenie ma jednostkę TIME (`MovementRow`, `EndedStepCard`).
- PR-y bez zmian (tylko ciężarowe).

## 5. Historia po usunięciu treningu

- Wszystkie ścieżki usunięcia sesji (dziś: `ActiveSessionView.tsx:228-236`; audyt `HyroxSessionView` w planie) po sukcesie: `queryClient.invalidateQueries({ queryKey: ["history"] })` + nawigacja na **`/sessions`** (nie `/`).
- To realny bug braku inwalidacji, nie „chwilowy problem serwera” — cache infinite query żył do naturalnego odświeżenia.

## 6. Klawiatura numeryczna

- `ExerciseDrawer`: reps → `inputMode="numeric"`, weight → `inputMode="decimal"` (jak w obwodzie).
- Audyt wszystkich użyć `NumericFormat` w repo — każde dostaje jawny `inputMode`. Uzupełnienie konwencji w pamięci projektu: NumericFormat zawsze z jawnym inputMode.

## 7. Harmonogram: pora dnia

- **Schema:** enum `day_slot` = `MORNING | EVENING`; kolumna `slot` NOT NULL DEFAULT `'MORNING'` na `training_plan_unit_days` i `schedule_overrides`. Bez opcji „bez pory” (decyzja KJ) — istniejące wpisy dostają Rano.
- **Sortowanie:** `resolveWeek` sortuje wpisy dnia: MORNING przed EVENING, w ramach pory dotychczasowa kolejność (stabilnie).
- **Widok tygodnia:** chip pory na karcie wpisu (`Sun`/`Moon` + „Rano”/„Wieczór”), zawsze widoczny.
- **Arkusz akcji wpisu:** nowa sekcja „Pora dnia” (2 przyciski) nad „Przenieś na inny dzień”. Zmiana pory wpisu z planu tworzy override (mechanizm jak przy przenoszeniu na inny dzień); wpis-override aktualizuje wiersz. Serwer: osobna mutacja `setScheduleEntrySlot` (nie rozszerzamy `moveScheduleEntry` — inna semantyka, prostsze typy).
- **Formularze:** edytor dnia w jednostce planu i dodawanie ad-hoc dostają segment Rano/Wieczór, domyślnie Rano.
- **Drag-and-drop:** `TouchSensor` znika; `PointerSensor` → `MouseSensor` (PointerSensor łapie też dotyk). Desktop: drag zostaje. Mobile: tap → arkusz akcji (przenoszenie dniami + pora dnia załatwiają wszystko).
- Strzałki góra/dół **nie powstają** — zamiana pory pokrywa przypadek „2 treningi dziennie”; 3+ treningi w tej samej porze zachowują kolejność wstawienia (poza zakresem).

## 8. Strzałka wstecz

- Nowy `shared/components/BackLink.tsx` (ChevronLeft + etykieta, `Link`), ujednolica 3 istniejące ręczne implementacje (`/stats/$slug`, `/notes/$noteId`, `/me/konto`).
- Dodany na `/sessions/$sessionId` → „Historia” (`/sessions`) — widoczny też podczas **aktywnej** sesji. Cel stały (nie `history.back()`) — przewidywalny niezależnie od punktu wejścia (Historia, Dziennik, harmonogram).
- Ekrany z widocznym tab barem (`/sessions/new`, główne) — bez strzałki, nie ma potrzeby.

---

## Poza zakresem

- **Błędne podpowiedzi „Ostatnio" przy naprzemiennym drążku bw / z obciążeniem** (zgłoszone przez KJ w trakcie wykonania, 2026-07-25): `loadLastByKind` bierze najnowszą sesję tego samego typu, więc przy schemacie A/B zawsze podpowiada drugi wariant. Decyzja KJ: **bez kodu** — rozdzielenie na dwa ćwiczenia w katalogu („Podciąganie" bw + „Podciąganie z obciążeniem" z isLoadedBodyweight). Rozważane i odrzucone na teraz: dwie linie „Ostatnio" z tap-to-seed; provenance jednostki (sessions.unit_id).

- Inline ✕ przy **pustych** kartach kroków w sesji (40 px, tylko gdy zero serii) — zostaje bez zmian.
- Edycja typu serii (kind) po zapisie.
- Opcja „bez pory” i ręczne strzałki kolejności w harmonogramie; kolejność 3+ treningów w tej samej porze.
- Przywracanie wymienionego ćwiczenia po skasowaniu rund (naprawa: ponowne dodanie).
- Service worker / optymalizacje latencji historii (osobny epik Electric SQL).

## Testy

- `step-progress`: `savedRounds` (rundy ciągłe, z dziurami po wymianie, legacy częściowe), `currentRound`, nadmiar 5/4.
- `set-form`: wariant TIME (walidacja, komunikaty), seed `durationSeconds`.
- `format-set`: gałąź `"30s"`.
- Serwer: `updateSet` (własność, refine, TIME), soft-remove `removed_after_round`, slot w `resolveWeek` (sortowanie MORNING→EVENING, override pory).
- Po edycjach: `bun run typecheck` + `bun run lint`; po `db:generate` także `bun run format`.

## Workflow

Batch jest epic-level (zmiany schematu + kilka funkcji): Linear issue (EN) → branch z Lineara verbatim → jeden PR. Commity/push wyłącznie po zatwierdzeniu KJ w sesji.
