# Fixy z feedbacku — runda 2 (po dev-teście KJ) — Design Spec

Decyzje KJ 2026-07-25 (screeny z dev). Branch `feedback-fixes-2`, jeden PR. Poprzednia runda: `2026-07-24-brother-feedback-fixes-design.md`.

## Decyzje zamknięte

1. **Boks „W tej sesji" w obwodzie — korekta niezrozumienia rundy 1.** Ołówki per wiersz rundy znikają. Jeden ołówek w prawym górnym rogu boksu (jak w pojedynczym ćwiczeniu) otwiera modal z WSZYSTKIMI seriami obwodu: każda seria = label `{Ćwiczenie} · Seria {n}` + wiersz `[powtórzenia] [kg] [RPE] [✕]` (TIME: `[sekundy] [RPE] [✕]`). Kasowanie per seria (✕ natychmiast, jak w modalu pojedynczego ćwiczenia); zapis = `updateSet` dla zmienionych. Grupowanie: po rundzie rosnąco, w rundzie kolejność ćwiczeń. `EditRoundDialog` znika (funkcja „Usuń rundę N" zastąpiona kasowaniem serii; `savedRounds` liczy odporne na dziury).
2. **Placeholdery inputów numerycznych: BRAK.** Label nad inputem wystarcza; usuwamy `powt./kg/sek./RPE/—` z obwodu i modali. Dotyczy tylko pól numerycznych z widocznym labelem.
3. **Hyrox ad-hoc:** w Nowej sesji przy chipie Hyrox karta „Pusta sesja" ma przycisk **disabled** i wyjaśnienie „Trening Hyrox deklarujesz w planie — pusta sesja Hyrox nie ma czego logować." + link „Przejdź do planu" (`/plan`). Karta „z planu" bez zmian.
4. **Strzałka wstecz na sesji: tylko ZAKOŃCZONA.** Aktywna sesja (zwykła i Hyrox, także pusty stan aktywny) bez strzałki — skupiony flow; stały cel „Historia" kłamał przy wejściu z Dziennika. `HyroxDoneSummary` już jest warunkowane `isEnded`.
5. **„‹ Profil"** na wszystkich ekranach linkowanych z huba profilu (`/me`), które chowają tab bar i nie mają własnej strzałki (audyt linków MeView + nav.ts; min. katalog ćwiczeń).
6. **Koniec inline-confirmów „Na pewno?".** Nowy współdzielony `ConfirmDialog` (mobileSheet, wzorzec DeleteSessionDrawer: tytuł/opis/destrukcyjny confirm/anuluj/pending). Zastępuje: ScheduleTab (usuń wpis), UnitDrawer (usuń trening), PlansTab (usuń plan — patrz pkt 7).
7. **Karty planów:** przycisk „Usuń" znika z karty (dla każdego statusu). „Usuń plan" ląduje w modalu edycji planu (`PlanFormDialog`, tylko tryb edycji) jako destrukcyjny przycisk pod submitem, za `ConfirmDialog`; działa też dla planu AKTYWNEGO. Na karcie nieaktywnego planu ostatnią akcją zostaje „Edytuj".
8. **Pusta sesja Hyrox musi dać się usunąć:** ekran pustego stanu Hyrox dostaje „Usuń sesję" (wzorzec ActiveSessionView: tekstowy przycisk + `DeleteSessionDrawer` + istniejący `removeSession` z inwalidacją i powrotem na Historię).

## Poza zakresem

- Tekstowy przycisk „Usuń" zamiast ✕ w wierszach modala (spójność z modalem pojedynczego ćwiczenia; do zmiany, jeśli KJ zgłosi).
- Dynamiczna strzałka wstecz wg punktu wejścia (odrzucona — pkt 4).
- Placeholder-przykłady liczbowe (odrzucone — pkt 2).

## Testy

- Lib: ekstrakcja helperów draftów serii (`toDraft`/`draftDirty`/`draftToPayload`) z testami; reszta to UI — typecheck/lint/`bun test` + dev-test KJ.
