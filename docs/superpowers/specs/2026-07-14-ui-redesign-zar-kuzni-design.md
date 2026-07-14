# UI Redesign „Żar kuźni" — Design Spec

Zatwierdzony kierunek wizualny (makieta: claude.ai/code/artifact/150c1002-dbda-43e1-ac94-1a7b7099482b, wersja `zar-kuzni-v2`). Decyzje podjęte przez KJ 2026-07-14.

## Wizja

Trzy kolory: **pomarańcz · czerń · biel**. Dark mode = „żar kuźni" (grafitowa stal, rozgrzany metal jako akcent). Light mode = „athletic" (biel, czarna typografia, ten sam pomarańcz jako jedyny akcent). Liczby (ciężary, powtórzenia) są bohaterem interfejsu — nie tekst.

## Decyzje zamknięte

1. **Logowanie serii: wariant A** — dzisiejszy układ (steppery przy edytowalnych polach, RPE-chipy, lista serii) w nowej skórze. Wariant B („wyświetlacz") NIE wchodzi; ewentualny eksperyment po epiku.
2. **Ember zatwierdzony**: `#FF6A00 → #FFB25C` (gradient), flat `#FF5A00` w light.
3. **CTA gradientowe w OBU motywach** (light nie dostaje czarnych CTA à la Nike).
4. **Oba motywy od razu** (dark + light, podążanie za systemem jak dziś).
5. **Ruch: pełny pakiet, etapami** (kolejność niżej).

## Tokeny (mapowanie na istniejące zmienne shadcn w styles.css)

| Token | Dark | Light | Uwagi |
|---|---|---|---|
| `--background` | `#0C0C0D` (stal) | `#FFFFFF` | |
| `--card` / `--popover` | `#161618` (grafit) | `#FFFFFF` + border | druga warstwa: `#1C1C1F` / `#F6F4F1` |
| `--foreground` | `#F5F2EE` (ciepła biel) | `#111111` | neutrale z ciepłym odchyleniem, nie czyste szarości |
| `--muted-foreground` | `#8F8A84` | `#716C66` | |
| `--primary` | ember `#FF6A00` | ember `#FF5A00` | CTA jako gradient `100deg, #FF6A00 → #FFB25C` (utility `bg-ember`) |
| `--ring` / focus | ember 50% | ember 50% | |
| `--destructive` | bez zmian | bez zmian | czerwień zostaje semantyczna, NIE miesza się z ember |

Konwersja na oklch przy implementacji (spójnie z obecnym styles.css). Gradient jako klasa narzędziowa (np. `bg-ember`), glow w dark: `shadow-[0_4px_28px_#ff6a0045]` na CTA i PR-badge.

## Typografia

- Liczby: waga 800–900, `tabular-nums`, top set w kolorze ember; rozmiar min. 1 stopień większy niż etykieta.
- Hierarchia: każdy ekran ma 3 poziomy — bohater (bój/liczba), kontekst (typ, data), szczegół (serie) — bez dwóch sąsiednich elementów tej samej wielkości i wagi.
- Fonty bez zmian (obecny stack + `font-heading`).

## Komponenty (skóra, bez zmian układu poza wskazanymi)

- **Karta sesji (dashboard/historia):** headline = główny bój; status jako pill — „Zakończona" = wypełniony ember-tint pill z ✓, „W trakcie" = pill z pulsującą kropką; wiersze ćwiczeń: nazwa + liczba serii (muted), top set bold z ember na wadze.
- **Wiersz ćwiczenia w aktywnej sesji (MovementRow):** ikona w kwadracie ember-tint (lucide Dumbbell/warianty), nazwa + liczba serii, ostatni set po prawej (ember), chevron.
- **Drawer serii (wariant A):** kind-chipy — aktywny z gradientem ember (biały tekst), nieaktywne outline; pola liczb: waga w ember, powiększone; RPE-chipy outline → ember border gdy wybrane; CTA gradient.
- **Stopki akcji / tab bar / sidebar:** aktywna zakładka ember (już jest przez tokeny), CTA gradient, secondary jako ghost/outline.
- **Ikony:** lucide (Dumbbell, Flame, Trophy, Timer, NotebookPen) zastępują emoji 🏋️📝🔁✏️⚡ w UI. Emoji zostają tylko w treściach użytkownika.
- **Empty states:** dashed border + muted, jeden ember akcent.

## Ruch (etapy = kolejne PR-y)

1. **View Transitions** między stronami (router `defaultViewTransition`; no-op poza iOS/Chrome z obsługą).
2. **Micro-interactions:** CTA press scale + hover lift, chip switch, tap-highlight wierszy.
3. **Skeleton loadery** zamiast spinnerów (karty sesji, lista ćwiczeń, templates).
4. **Celebracja PR** (pulsujący ember-badge jak na makiecie). ZALEŻNOŚĆ: wymaga detekcji rekordu — dane z epiku Statystyk; ten etap wchodzi PO nim.

Wszystko za `prefers-reduced-motion` (redukcja do zera).

## Dostępność / kontrast

- Ember NIE jest kolorem tekstu akapitowego — tylko liczby ≥ 16 px bold, ikony, bordery, tła pill (kontrast dużego bold tekstu wystarcza; body zostaje foreground/muted).
- Focus states: ring ember na obu tłach; weryfikacja hover/active po każdym `shadcn`owym komponencie (pamiętamy regres Buttona).

## Poza zakresem

- Wariant B logowania, przebudowa układów ekranów (tylko skóra + wskazane detale), landing/marketing, motyw systemowy → przełącznik ręczny w ustawieniach (osobny mały task po epiku), detekcja PR (epic Statystyk).

## Plan PR-ów (szkic — do rozpisania w plan implementacji)

1. `tokens`: styles.css (oba motywy, oklch), utility `bg-ember` + glow, theme-color meta.
2. `komponenty`: karty, pille, chipy, MovementRow, drawer A, stopki, ikony lucide za emoji.
3. `ruch 1-2`: View Transitions + micro-interactions.
4. `ruch 3`: skeletony.
5. (po Statystykach) `ruch 4`: celebracja PR.

Każdy PR z osobnym testem wizualnym na iPhonie (dark + light) przed merge.
