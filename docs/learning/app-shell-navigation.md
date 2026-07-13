# App shell i nawigacja w PWA — koncepcje

Notatki do decyzji z [ADR-0019](../adr/ADR-0019-app-shell-fixed-viewport.md): dlaczego okno przeglądarki przestało scrollować i skąd taki, a nie inny układ nawigacji.

## Dwa modele scrollowania strony

**Window scroll (domyślny w webie):** dokument jest dłuższy niż viewport, scrolluje `window`/`<html>`. Wszystko, co manipuluje scrollem okna — scroll-locki modali, `scrollIntoView` przy klawiaturze, restoracja scrolla po nawigacji — operuje na wspólnym, globalnym stanie. Każda biblioteka, która go dotknie, może przesunąć całą stronę.

**App shell (fixed viewport):** `html/body` mają dokładnie wysokość viewportu (`100dvh`) i `overflow: hidden`; scrolluje wewnętrzny kontener (`<main class="overflow-y-auto">`). Okno ma zawsze `scrollY = 0`, więc globalne sztuczki scrollowe stają się no-opami. Tak działają aplikacje natywne i większość poważnych PWA.

Nasz przeskok drawerów to podręcznikowy przykład różnicy: vaul przy otwarciu robi `window.scrollTo(0, 0)` + `position: fixed` na body (z kompensacją `top: -scrollY`), a przy zamknięciu przywraca scroll w `requestAnimationFrame`. Kroki rozjeżdżają się o 1–2 klatki → strona „skacze" o tyle, ile była przescrollowana. W app shellu `scrollY` to zawsze 0 — nie ma czego przesuwać.

### `dvh` vs `svh` vs `vh`

Na iOS pasek adresu Safari zmienia wysokość viewportu. `100vh` = największy viewport (treść wpada pod pasek), `100svh` = najmniejszy (bezpieczny, ale zostawia pustkę po schowaniu paska), `100dvh` = **dynamiczny** — podąża za faktyczną wysokością. Dla stałego szkieletu chcemy `dvh`. W standalone PWA nie ma paska, więc wszystkie trzy są równe.

## Safe-area insets

Z `viewport-fit=cover` (mamy) treść wchodzi pod notch i home indicator; `env(safe-area-inset-*)` mówi, ile miejsca „zjada" sprzęt. Wcześniej padding dostawał `body` — globalnie, także tam, gdzie niepotrzebny. W app shellu insety należą do konkretnych elementów chrome'u:

- `env(safe-area-inset-top)` → górny header (jedyny element dotykający górnej krawędzi),
- `env(safe-area-inset-bottom)` → dolny tab bar i fixed stopki akcji (np. w aktywnej sesji).

Wzorzec `pb-[max(1rem,env(safe-area-inset-bottom))]` = „padding co najmniej 1rem, a więcej jeśli sprzęt wymaga".

## Wzorce nawigacji mobilnej

**Dolny tab bar** wygrywa w aplikacjach mobilnych (Strong, Hevy, Strava…), bo kciuk sięga dołu ekranu, a 4–5 stałych zakładek daje natychmiastową orientację „gdzie jestem". Konwencje, które przyjęliśmy:

- tab bar tylko na trasach głównych; **widoki szczegółowe go chowają** (fokus + miejsce na własne akcje — u nas stopka „Dodaj ćwiczenie / Zakończ sesję"),
- logo w headerze działa jak „home",
- akcje konta nie zasługują na zakładkę — mieszkają w **avatar dropdown** w headerze (wzorzec znany z każdej aplikacji SaaS).

Na desktopie ten sam model nawigacji obsługuje **sidebar** (shadcn Sidebar): więcej miejsca, pionowa lista rośnie wraz z feature'ami (Statystyki, rehab, wellness), zwijanie do ikon w gratisie.

## Pathless layout route (TanStack Router)

Plik `routes/_shell.tsx` + katalog `routes/_shell/` tworzą **layout bez segmentu URL**: `/sessions/new` dalej jest `/sessions/new`, ale renderuje się wewnątrz `<AppShell>`. Podkreślnik w nazwie = „nie dodawaj do ścieżki". Za to **route id** dostaje prefiks (`/_shell/sessions/new`) — stąd zmiany w `getRouteApi(...)`. Strony logowania zostały poza katalogiem, więc nie dostają szkieletu.

## Pułapki, o których pamiętać

- Nowy widok w shellu **nie może** zakładać scrollowania okna (`min-h-svh`, `window.scrollTo`, sticky liczone od okna). Scroll żyje w `<main>` shell-a.
- `position: fixed` nadal działa (viewport jest stabilny), ale element musi sam zadbać o safe-area.
- Shadcn Sidebar ma wbudowany wariant mobilny (Sheet) — u nas martwy, bo mobile nie renderuje triggera; nawigacją mobilną jest tab bar.
