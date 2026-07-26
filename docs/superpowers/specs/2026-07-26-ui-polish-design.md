# Audyt UI + poprawki Hyrox — runda 3 — Design Spec

Decyzje KJ 2026-07-25/26 (makiety: claude.ai/code/artifact/131d6403-f628-4204-8bb6-7794d4edbf35; Historia wariant **C**, Plany wariant **A**). Branch `ui-polish` (zawiera już fix placeholderów modala obwodu, commit 8a29e21).

## Decyzje zamknięte

1. **Karta sesji — jeden komponent dla Historii i „Ostatnich sesji" (Dziennik), wariant C wzbogacony.** Blok daty po lewej (dzień tygodnia skrótem + numer dnia, separator pionowy), headline (tytuł/pierwsze ćwiczenie + „+N"), subline `Typ · {serie/rundy} · {czas}`, lista top-setów jak dziś na Dzienniku (do 3, ember ciężar), ChevronRight (lucide, koniec z tekstowym „→"), StatusBadge TYLKO dla „W trakcie" (+ delikatna ember ramka karty). Karta może być wyższa — czytelność > zwięzłość. Sekcje miesięcy w Historii bez zmian.
2. **Czas trwania treningu:** liczony od **pierwszej zapisanej serii** do `endedAt` (sesję odpala się przed treningiem — czas od otwarcia kłamie). Fallbacki: brak serii → `endedAt − startedAt`; brak obu → bez czasu. HYROX: czas z osi segmentów (suma jak w podsumowaniu bloków). Sesja w trakcie: bez czasu na karcie.
3. **Plany:** przycisk „+ Nowy" w wierszu z wyszukiwarką (ember, prawa strona); dolny „+ Nowy plan" znika (pusty stan bez zmian). Wzbogacenie kart: ember lewa krawędź aktywnego planu, postęp „tydzień X/Y" (z zakresu dat), pasek 7 dni tygodnia z podświetlonymi dniami treningów, wiersze treningów z ikoną typu i pillem intensywności, szkice przygaszone.
4. **Drobiazgi audytu (hurtem):** ChevronRight zamiast „→"; badge tylko „W trakcie"; krótka data na karcie („pt 25"); `DeleteSessionDrawer` przepięty na współdzielony `ConfirmDialog` + lucide `TriangleAlert` zamiast emoji ⚠️.
5. **Nawigacja:** Cele wypadają z dolnego paska → sekcja w hubie profilu (obok Katalogu ćwiczeń), `/goals` dostaje „‹ Profil". Na ich miejsce w pasku wchodzi **Plan**; `/plan` traci „‹ Profil" (dodany w r2) i wypada z sekcji huba (bez duplikacji wejść).

## Hyrox — bugi i szlify (feedback z sesji)

6. **Copy wake-locka** „Telefon trzyma trener. Ekran nie zgaśnie." — usunąć (mechanizm zostaje, tekst zbędny).
7. **Spójny hint „następnie:"** we wszystkich fazach live: zawsze **pod głównym przyciskiem**, zawsze z prefiksem „następnie:" (stacja, rox zone, przerwa — dziś rox zone ma hint pod nazwą fazy, przerwa bez prefiksu).
8. **Ostatnie ćwiczenie rundy:** button „Zakończ rundę" (zamiast generycznego), hint „następnie: przerwa".
9. **Długie nazwy ćwiczeń** na ekranie timera — truncate z ellipsis, bez wyjeżdżania poza ekran.
10. **Dźwięki:** gong ostrzegawczy **15 s przed końcem przerwy** + **2–3 uderzenia gongu na koniec rundy**; brzmienie „ringowy gong bokserski" (obecny sample brzmi obco) — przestroić syntezę.
11. **Edycja bloku w sesji przed startem:** będąc w sesji Hyrox przed wystartowaniem bloku można dodać/wymienić/usunąć stację bloku (dziś deklaracja tylko w planie). Zakres minimalny: edycja stacji nieusztywnionego (niewystartowanego) bloku.
12. **Ćwiczenie „Bieganie":** naprawa u źródła — create-flow w pickerze ćwiczeń pozwala wybrać **jednostkę** (Powtórzenia/Czas/Dystans/Kalorie; dziś sztywno powtórzenia). KJ dodaje „Bieganie" (aliasy: bieg, run, running) sam w katalogu. **Incline bieżni: poza zakresem** — zapisane pod epik statystyk Hyrox (Etap 3, notatka fizjo już istnieje).

## Poza zakresem

- Incline/tryb biegu w segmentach (Etap 3 Hyrox).
- Dashboard i statystyki poza kartą sesji — audyt uznał za spójne.
- Zmiany typografii globalnej.

## Testy

- Lib: liczenie czasu trwania (pierwsza seria→koniec, fallbacki, hyrox z segmentów) — testy jednostkowe; „tydzień X/Y" planu — testy; nav (TAB_BAR/hub) — aktualizacja istniejących testów nav.
- Reszta UI: typecheck/lint/bun test + dev-test KJ (w tym dźwięki na telefonie).
