# UI Polish runda 4 (feedback po rundzie 3) — Design Spec

Decyzje KJ 2026-07-26 (makiety: claude.ai/code/artifact/131d6403-f628-4204-8bb6-7794d4edbf35, zakładki 4–5; chipy wariant **W1**). Branch `ui-polish-2`.

## Decyzje zamknięte

1. **Powrót wg wejścia (odwraca decyzję z rundy 3).** Nawigacja do `/sessions/$sessionId` niesie origin (`from: "dziennik" | "historia"`) w stanie routera: karta na Dzienniku → dziennik, w Historii → historia. Konsumenci: (a) `BackLink` na sesji: „‹ Dziennik" (`/`) albo „‹ Historia" (`/sessions`); (b) redirect po usunięciu sesji wraca do origin. Fallback (refresh/deep-link, brak stanu): historia. Dotyczy zwykłych i Hyrox (podsumowanie `HyroxDoneSummary` też).
2. **Nagłówek karty sesji bez sufiksu „+N"** — dubluje listę top-setów i „+N więcej"; zostaje sam tytuł/pierwsze ćwiczenie.
3. **Wyszukiwarka w katalogu ćwiczeń** (`/exercises`): `SearchInput` nad listą, filtr client-side po nazwie PL i aliasach (case-insensitive), pusty wynik z komunikatem.
4. **„Podciąganie nachwytem (chin-up)" znika globalnie:** (a) usunięcie z szablonu `db/seed.ts` (slug `chin-up`); (b) migracja danych: DELETE wiersza szablonowego (`athlete_id IS NULL AND slug='chin-up'` — szablony nie mają historii) + `is_archived = true` dla wszystkich kopii userów (`slug='chin-up' AND athlete_id IS NOT NULL`). Archiwizacja, nie delete — kopie mogą mieć historię; archiwum znika z pickerów, historia czytelna. Weryfikacja: signup-hook nie skopiuje usuniętego szablonu.
5. **Chipy harmonogramu — wariant W1:** na karcie wpisu słońce/księżyc jako sama ikona (bez tekstu) + pill intensywności, jedna zwarta grupa po prawej (gap 4–6 px, wspólna wysokość). Tekst pory pozostaje w arkuszu akcji.
6. **Przycisk „+ Nowy plan":** znika z wiersza wyszukiwarki (rundy 3). Zamiast tego w wierszu tytułu „Plan": ember „+ Nowy plan" widoczny TYLKO na tabie „Moje plany", pojawia się/znika animacją fade + translateX (200 ms, ease-out; wsteczna przy wyjściu); wiersz tytułu ma stałą wysokość (nic nie skacze); ukryty stan `pointer-events-none`; przy `prefers-reduced-motion` bez transitions.

## Poza zakresem

- Persistencja originu przez refresh (sessionStorage) — fallback historia wystarcza.
- Zmiany intensywności per dzień (W3 odrzucone — dzień może mieć 2 treningi o różnych intensywnościach).

## Testy

- Lib: brak nowych czystych funkcji poza ewentualnym helperem originu (test jeśli powstanie); reszta UI — typecheck/lint/`bun test` + dev-test KJ. Migracja: custom SQL w `db/migrations` (drizzle journal), weryfikowana na dev.
