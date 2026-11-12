# AcroNote — dziennik implementacji

Ten plik jest operacyjnym punktem wejścia dla kolejnych agentów. Przed zmianami należy przeczytać `AGENTS.md`, `README.md`, `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md` oraz ten dokument. Po sesji należy dopisać decyzje, testy, problemy i dokładny stan pracy.

## Cel produktu i bieżący zakres

AcroNote jest lokalnym, polskojęzycznym dziennikiem zawodnika trenującego akrobatykę na trampolinie. Bieżąca wersja obejmuje pełny interfejs zawodnika, profil trenera tylko do odczytu i panel administratora.

Najważniejsze zasady:

- historia jest zapisywana jako samodzielne migawki i nie zmienia się po edycji katalogu;
- statystyki wynikają z migawek, nie z bieżących szablonów;
- „Siatka”, „Materac” i „Gąbki” to miejsca lądowania, a miejsce może różnić się dla każdego elementu układu;
- każda operacja użytkownika ma kontrolę właściciela w API;
- trener ma tylko odczyt połączonego zawodnika, a dostęp zależy od aktywnej relacji sprawdzanej przy każdym żądaniu;
- administrator nie widzi haseł, skrótów haseł ani tokenów sesji;
- `data/acronote.db` nie służy do testów.

## Reguły kodu elementu

- Kod kończy się pozycją: `o` — kuczna, `<` — łamana, `/` — prosta.
- Początek to liczba ćwiartek salta od 1 do 12: `4` = jedno, `8` = dwa, `12` = trzy. Liczba niepodzielna przez 4 opisuje inne przejście niż z nóg na nogi.
- Dalej występuje dokładnie `max(1, floor(liczba ćwiartek / 4))` cyfr śrub. Cyfra liczy półobroty: `1` = 0,5 śruby, `2` = 1 śruba.
- `800/` to dwa salta bez śrub, `801<` ma pół śruby w drugim salcie, `831o` ma 1,5 w pierwszym i 0,5 w drugim.
- Suma parzystej liczby półobrotów oznacza kierunek „tył”, nieparzystej — „przód”.
- Parser w `packages/shared/src/element-code.ts` jest źródłem prawdy backendu. Frontendowa funkcja w `packages/web/src/elementCode.ts` odpowiada temu samemu kontraktowi i ma testy zgodności.

## Iteracja 2026-09-25 — profil zawodnika i administrator

Ukończono naprawy elementów/układów, dodawanie elementu z wejścia, dialog zapisu przy cofaniu, filtry i ściągawkę kodów, migawki, wykresy, konto demo oraz panel administratora. Szczegółowy stan zachowują commity:

- `d43d0c9` — dziennik i instrukcje dla kolejnych agentów;
- `372bdc5` — parser, migracje, administracja API, seeder i testy;
- `76b4a61` — przepływy zawodnika, filtry, wykresy i panel admina;
- `76b6edc` — podgląd i usuwanie treningów z panelu admina;
- `8127211` — dokumentacja zweryfikowanej wersji zawodnika.

## Iteracja 2026-09-26 — lądowania i profil trenera

### Decyzje domenowe

- Techniczne `execution_types`, `execution_type_id` i `execution_type_name` pozostają w schemacie, aby nie ryzykować migracji danych. W interfejsie i dokumentacji zawsze oznaczają miejsca lądowania.
- Domyślne miejsce wejścia inicjuje nową czynność; miejsce czynności inicjuje elementy migawki. Każdy element układu zachowuje jednak własną skopiowaną wartość.
- Statystyki lądowań rozwijają zapisane migawki układów. Dzięki temu `41o` na siatkę i `800o` na materac są liczone osobno, również przy powtórzeniach i filtrze kodu.
- Wszyscy trenerzy są równorzędni. Starsza kolumna `is_primary` nie jest używana przez logikę ani interfejs.
- Utworzenie zaproszenia jest zgodą jego twórcy; odbiorca widzi nadawcę i akceptuje. Jeśli odbiorcą jest zawodnik, musi dodatkowo zaznaczyć wyraźną zgodę na udostępnienie pełnej historii.
- Dostęp trenera wykorzystuje osobne endpointy GET i wspólne mapowania treningów/statystyk. Nie ma endpointów zapisu w przestrzeni trenera.
- Relacja jest sprawdzana na każde żądanie. Odłączenie lub wyłączenie profilu natychmiast odbiera dostęp.
- Wyłączenie profilu trenera nie usuwa relacji; po ponownej aktywacji dostęp wraca bez nowego zaproszenia.

### Zaimplementowane

- migracja v3 zaproszeń (`accepted_by_id`, `cancelled_at`, `created_at`) bez utraty danych;
- limit rejestracji skrócony z godziny do 5 minut i polski komunikat 429;
- tworzenie, listowanie, podgląd, anulowanie i akceptacja zaproszeń z kodem/linkiem/QR;
- link i QR używają pełnego adresu bieżącej aplikacji, a nie ścieżki względnej;
- aktywacja profilu trenera i przełącznik profili bez ponownego logowania;
- lista zawodników i pełny podgląd tylko do odczytu: historia, szczegół treningu, elementy/historia, układy i statystyki;
- przycisk „Odśwież” pobierający także trening zapisany w toku;
- zarządzanie trenerami zawodnika i zakończenie połączenia przez obie strony;
- „Zapisz i kontynuuj” aktualizuje zapisany trening zamiast tworzyć kolejne rekordy;
- nazewnictwo miejsc lądowania oraz rozkład ogólny i dla wybranego kodu w statystykach.
- profil demonstracyjny `trener_demo`, połączony z zawodnikiem `demo`;
- lokalny tryb jasny/ciemny, domyślnie zgodny z ustawieniem systemu i zapamiętywany w przeglądarce;
- możliwość wyłączenia i ponownego włączenia profilu trenera bez usuwania zapisanych połączeń;
- instrukcja krótkiego testu na telefonie w tej samej zaufanej sieci Wi-Fi.
- wspólne filtry elementów także w selektorach wejścia i układu;
- edycja szablonu układu bezpośrednio z treningu, z zachowaniem dawnych migawek;
- korekta zakresu wykonanego układu tylko dla zgodnej wersji szablonu oraz zrozumiałe ostrzeżenie po jego zmianie/usunięciu;
- czytelniejsze numerowanie i podsumowania wielu wejść;
- trening demonstracyjny z pięcioma zróżnicowanymi wejściami;
- normalizacja znaków Unicode w nazwach kont: polskie litery, NFC i typowe spacje z klawiatur mobilnych.
- nagłówek wejścia pokazuje sumaryczną liczbę wykonanych elementów zamiast liczby technicznych czynności; wartość nie jest powtarzana po prawej stronie.

Commity funkcjonalne:

- `90ba3ab` — bezpieczne API profilu trenera, migracja v3, lądowania w statystykach i testy;
- `7634413` — profil trenera w UI, zaproszenia, zgoda, wspólne statystyki i poprawka „Zapisz i kontynuuj”.

Końcowe zmiany tej iteracji obejmują bezwzględny adres linku/QR, test jego kontraktu, pełną aktualizację dokumentacji oraz wyniki migracji i ręcznej kontroli UI.

## Iteracja 2026-10-05 — długie treningi

- Kolejność kart w edytorze jest odwrócona wyłącznie prezentacyjnie: ostatnie wejście znajduje się na górze, ale zapis i prawdziwe numery wejść zachowują kolejność domenową.
- Przycisk „Dodaj wejście” znajduje się nad listą, a nowe wejście natychmiast pojawia się jako pierwsza karta.
- Domyślny zakres to 5 ostatnich wejść. Sterowanie pozwala pokazywać starsze partiami po 5, wszystkie, zwijać po 5 albo wrócić do 5 ostatnich.
- Nad listą widoczny jest zwięzły licznik, np. `5 z 20`, oraz informacja, że najnowsze są na górze.
- Test przeglądarkowy wykonano na izolowanym treningu z 20 wejściami i 100 elementami przy 390×844 oraz 1280×900.

## Migracja danych i kopie

- Nie modyfikowano `data/acronote.db` podczas testów.
- Spójna kopia sprzed migracji trenerskiej: `data/backups/acronote-before-coach-20260925.db`.
- Kopię przeniesiono do `data/coach-migration-check.db` i otwarto dwukrotnie przez aktualną warstwę bazy.
- Po migracji istnieją wersje 1–3, zaproszenia mają wszystkie nowe kolumny, a liczby 3 kont / 8 treningów / 34 elementów pozostały bez zmian.
- Ponowne otwarcie nie dodało migracji ani rekordów; `PRAGMA integrity_check` zwróciło `ok`.
- Po tej weryfikacji otwarto właściwą `data/acronote.db` aktualną warstwą bazy. Migracja v3 została zastosowana; pozostały 3 konta / 8 treningów / 34 elementy, a `integrity_check` nadal zwraca `ok`.
- Przed dodaniem konta demo trenera wykonano spójną kopię `data/backups/acronote-before-demo-coach-20260926.db`. Seeder dodał wyłącznie `trener_demo` i relację z `demo`: baza ma teraz 4 konta / 8 treningów / 34 elementy, a `integrity_check` zwraca `ok`.
- Pliki testowych baz są ignorowane przez Git.
- Przed uzupełnieniem treningu demo wykonano spójną kopię `data/backups/acronote-before-multi-entry-demo-20260926.db`. Seeder dodał jeden trening; baza ma 4 konta / 9 treningów / 34 elementy, konto `demo` ma trening z 5 wejściami, a `integrity_check` zwraca `ok`.

## Weryfikacja 2026-10-05

- `npm test`: 63/63 (API: 6 plików / 39, web: 5 plików / 24).
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npm audit --audit-level=moderate`: 0 podatności.
- `git diff --check`: PASS; ostrzeżenia LF/CRLF są informacyjne.
- Ręczny test Chromium na izolowanej bazie: statystyki lądowań, filtr `800o` = Materac 100%, aktywacja/przełączenie profilu, zaproszenie zawodnik→trener, kod/link/QR, pełny odczyt zawodnika i brak przycisków edycji.
- Drugi kierunek trener→zawodnik: podgląd nadawcy, wymagane zaznaczenie świadomej zgody i udane połączenie.
- Po dopisaniu nowego wejścia przez zawodnika otwarty widok trenera po „Odśwież” zmienił sumę z 30 na 31 bez wylogowania ani zamykania treningu.
- Próba zapisu treningu zawodnika z sesji trenera zwróciła 404; po zakończeniu relacji ponowny odczyt zwrócił 403.
- Responsywność profilu trenera i statystyk sprawdzona przy 390×844; przełącznik profili, zakładki i dolna nawigacja pozostają dostępne.
- Tryb jasny i ciemny sprawdzono na szerokim widoku, a ciemny także przy 390×844; zielony pozostaje głównym kolorem interfejsu, a wybór przetrwał przeładowanie strony.
- Na izolowanej bazie `trener_demo` widzi połączonego zawodnika `demo`; dezaktywacja zwróciła 403 dla jego historii, reaktywacja przywróciła 200 i zachowane połączenie.
- Rejestracja, logowanie oraz panel administratora akceptują nazwy ze spacją, np. `Maria Kowalska`; nadmiarowe spacje są normalizowane, a Enter i tabulatory odrzucane.
- Karty układów na telefonie pokazują elementy w trzykolumnowej siatce bez poszerzania strony. Lista i edytor zostały sprawdzone przy 390×844, wraz z widoczną dolną nawigacją.
- Edytor treningu z pięcioma wejściami, oba selektory elementów, edycję szablonu i korektę zakresu sprawdzono przy 390×844. Po zapisaniu nowej wersji szablonu dawna czynność pokazała blokadę przebudowy, zachowując pełną migawkę.
- Rejestracja i logowanie `Łukasz Żółć` przeszły z polskimi znakami, spacją nierozdzielającą z telefonu i wejściem w postaci Unicode NFD; zapisano postać NFC ze zwykłą spacją.
- Nagłówki pięciu wejść sprawdzono w przeglądarce: pokazują odpowiednio `5 elementów`, `8 elementów`, `3 elementy`, `10 elementów` i `3 elementy`, bez powielania wartości po prawej stronie.

## Konta startowe

- `demo` / `AcroNote-demo-2026`
- `trener_demo` / `AcroNote-trener-2026` — połączony z zawodnikiem `demo`
- `admin` / `AcroNote-admin-2026`

Hasła są jawne wyłącznie dlatego, że są to lokalne konta startowe. Hasło `admin` należy zmienić przed udostępnieniem aplikacji.

## Pozostały zakres i ograniczenia

- Odłożone zgodnie z wymaganiami: pomoc trenera w odzyskiwaniu konta, komentarze, cele treningowe i grupy klubowe.
- Link/QR działa na urządzeniach, które mogą otworzyć adres aplikacji. Domyślne `127.0.0.1` jest osiągalne tylko na tym samym komputerze; udostępnienie w sieci wymaga jawnej konfiguracji `HOST`, adresu sieciowego i późniejszego utwardzenia bezpieczeństwa.
- Tryb dostępu z telefonu używa zwykłego HTTP. Jest przeznaczony wyłącznie do krótkich testów w zaufanej, prywatnej sieci; nie należy wystawiać portu w Internecie ani używać publicznego Wi-Fi.
- Nie ma automatycznego E2E w wielu silnikach przeglądarek; krytyczne ścieżki mają testy integracyjne i zostały dodatkowo wykonane ręcznie w Chromium.
- Przed każdym kolejnym wydaniem trzeba powtórzyć komplet kontroli z `AGENTS.md`.

## Iteracja 2026-10-08 — przeniesienie i uruchamianie jednym plikiem

- Projekt przeniesiono do `C:\Users\leemi\Documents\Projects\Visual Studio\AcroNote` i podłączono zdalne repozytorium `https://github.com/HubertBorzymek/AcroNote.git`. Skopiowano najnowszą bazę (`acronote.db` z plikami WAL/SHM) ze starej lokalizacji.
- `start.bat` sam sprawdza Node.js, instaluje zależności (`npm ci`) przy pierwszym uruchomieniu lub po zmianie `package-lock.json`, buduje aplikację, wykrywa działającą instancję i otwiera przeglądarkę dopiero, gdy serwer odpowiada.
- `npm start` wczytuje opcjonalny plik `.env` (`--env-file-if-exists`).
- `npm test`, `npm run typecheck` i `npm run dev` najpierw budują `@acronote/shared`, więc działają na świeżym klonie.
- Zależności `packages/web` przypięto do zakresów zamiast `latest`; `npm audit fix` usunął 3 podatności narzędzi deweloperskich.

Naprawione błędy:

- Układu zawierającego usunięty element (opcja „zachowaj w układach”) nie dało się ponownie zapisać — klient wysyłał `elementId: "null"` bez kodu. Odłączone pozycje są teraz zapisywane jako migawka kodu i nazwy.
- Ponowne dodanie kodu usuniętego elementu kończyło się błędem 409; teraz przywraca dawny rekord. Analogicznie dla miejsc lądowania, które wcześniej zwracały surowy komunikat SQLite.
- Zmiana kodu elementu lub nazwy miejsca lądowania na zajętą zwracała surowy błąd SQLite; teraz zwraca czytelny 409.
- API przyjmowało nieistniejące daty treningu (np. `2026-02-30`).

Weryfikacja: `npm test` 69/69 (API 7 plików / 44, web 5 plików / 25), `npm run typecheck`, `npm run build`, `npm audit --audit-level=moderate` (0 podatności), uruchomienie `start.bat` na przeniesionej bazie.

## Iteracja 2026-10-08 — samodzielna paczka Windows (v0.2.0)

- `npm run package:win` (`scripts/package-release.mjs`) buduje `release/AcroNote-<wersja>-win-x64.zip`: kod API i frontendu, produkcyjne zależności przypięte do `package-lock.json`, `node.exe` w tej samej wersji co Node budujący paczkę (suma SHA-256 sprawdzana z nodejs.org) oraz test dymny ładujący `better-sqlite3`.
- W paczce `AcroNote.bat` używa wbudowanego Node.js, zapisuje dane w `%LOCALAPPDATA%\AcroNote` (aktualizacja nie usuwa danych; `DATABASE_PATH` w `.env` lub w środowisku ma pierwszeństwo) i ogranicza logi do ostrzeżeń.
- Pusta baza dostaje przy starcie serwera konta `demo` i `trener_demo` (połączone); konto `admin` tworzy wyłącznie jawne `npm run seed`, bo jego hasło jest publiczne. Wyłączenie: `ACRONOTE_DEMO=0`.
- `.github/workflows/release.yml`: po wypchnięciu tagu `v*` uruchamia testy i typecheck na `windows-latest`, buduje paczkę i publikuje GitHub Release przez `gh`.
- Wbudowany w Windows `tar.exe` ulegał awarii przy tworzeniu ZIP; paczkę pakuje `System.IO.Compression.ZipFile`.

Weryfikacja: `npm test` 70/70 (API 45, web 25), `npm run typecheck`, lokalna paczka 44 MB rozpakowana do pustego folderu ze spacją w ścieżce. `AcroNote.bat` uruchomił serwer na nowej bazie, logowanie `demo` i `trener_demo` działa, trener widzi zawodnika `demo`, `admin` nie istnieje.

## Iteracja 2026-10-09 — wersja online (Fly.io), zgłoszenia błędów (v0.3.0)

- Przepływ `dev → PR → main → automatyczne wdrożenie`: `ci.yml` (testy, typecheck, build, audit, budowa i test dymny obrazu Docker) dla PR i `dev`; `deploy.yml` wdraża `main` na Fly.io, a bez sekretu `FLY_API_TOKEN` pomija wdrożenie. Instrukcja: `docs/DEPLOY.md`.
- `ACRONOTE_ENV=production`: brak kont demo, ciasteczko `Secure`, `TRUST_PROXY` z jawną funkcją zaufania (numeryczny `trustProxy` Fastify 5 był ignorowany), kopia bazy `VACUUM INTO` przed pierwszym startem nowej wersji i co dobę (14 ostatnich).
- Panel administratora działa tylko na `ADMIN_PORT` w prywatnej sieci Fly (`fly proxy 3002`). Port publiczny nie rejestruje tras `/api/admin` i zwraca `isAdmin: false`. Konta admina: `admin-cli.js create-admin|reset-password|list-admins` z losowym hasłem. Debug frontendu na danych serwera: `npm run dev:prod-admin`.
- Zgłoszenia błędów: tabela `bug_reports` (migracja v4), dialog z profilu i ekranów błędu, diagnostyka klienta (wersja, przeglądarka, ostatnie ekrany, zapytania i błędy, bez treści żądań, query stringów i tokenów zaproszeń) oraz opcjonalna migawka danych konta. Zakładka *Zgłoszenia* w panelu admina (podgląd, JSON, rozwiązanie, usunięcie) i `npm run import-report` odtwarzające konto lokalnie.
- Dodano `ErrorBoundary`; wcześniej błąd renderowania zostawiał pustą stronę.

Naprawione błędy:

- Rejestracja przyjmowała w formularzu hasło 8–9 znaków, które serwer odrzucał niejasnym komunikatem; teraz obie strony wymagają 10 znaków i podają czytelny powód.
- Wersja w profilu była na sztywno ustawiona na `0.1.0`.
- Błąd sieci pokazywał angielskie „Failed to fetch”.
- Błędy 500 nie były logowane przez własny `setErrorHandler`.
- Zależności frontendu przeniesiono do `devDependencies`, więc obraz produkcyjny nie zawiera Vite ani Reacta w `node_modules`.

Weryfikacja: `npm test` 81/81 (API 52, web 29), typecheck, build, audit 0. Ręcznie (Chromium, izolowana baza): wysłanie zgłoszenia z migawką, lista w profilu, podgląd w panelu admina, pobranie JSON i import do osobnej bazy (30 elementów / 2 układy / 7 treningów), dialog przy 375×812. Tryb produkcyjny lokalnie: `/api/admin` na porcie publicznym 404, na porcie admina 200, ciasteczko `Secure`, kopia bazy przed startem. Obraz Docker budowany i testowany w CI, bo lokalnie Dockera nie ma.

## Iteracja 2026-10-15 — hasła, reset przez administratora, wejście na konto (v0.4.0)

- Hasło: minimum 8 znaków, bez reguł składu, jednakowo w formularzach i w API. Czytelny komunikat zamiast „Hasło jest nieprawidłowe”.
- Nazwy kont: migracja v5 dodaje `username_key` (NFC + małe litery) z unikalnym indeksem i triggerami. Dotąd SQLite `NOCASE` pozwalało założyć „Łukasz” obok „łukasz”. Logowanie nie rozróżnia wielkości liter, także polskich. Spacje w imieniu i nazwisku działają jak wcześniej.
- Reset hasła bez znajomości haseł przez administratora (zgodnie z AGENTS.md): administrator generuje jednorazowy kod (72 h, przechowywany jako skrót). Logowanie kodem otwiera sesję, która może wyłącznie ustawić nowe hasło (`PUT /api/auth/password/new`; pozostałe trasy zwracają 403 `PASSWORD_CHANGE_REQUIRED`). Usunięto endpoint, w którym admin ustawiał hasło użytkownika; konto zakładane przez admina dostaje kod zamiast hasła.
- „Zapomniałeś hasła?”: `POST /api/auth/password-reset-requests` z identyczną odpowiedzią niezależnie od istnienia konta, limitem 3 prośby na godzinę z IP i 1 na dobę na konto. Zakładka *Hasła* w panelu admina z licznikiem.
- „Otwórz konto”: administrator (tylko na porcie admina) wchodzi na konto użytkownika w zwykłym interfejsie; sesja 2 h z `impersonator_id`, pasek z powrotem, sesja admina przywracana z ciasteczka `acronote_admin_return`.
- UI: na liście treningów został jeden przycisk dodawania („Dodaj trening”), zamiast trzech przy pustej liście.

Weryfikacja: `npm test` 90/90 (API 61, web 29), typecheck, build. Migracja v5 na kopii `data/acronote.db` (VACUUM INTO): 4 konta, 10 treningów, 35 elementów, `integrity_check` ok, indeks unikalności utworzony. Ręcznie w Chromium na izolowanej bazie: prośba o reset, licznik i flaga w panelu, wygenerowanie kodu, logowanie kodem (małe litery ze spacją, inna wielkość nazwy), ustawienie nowego hasła, wejście na konto z paskiem i powrót do panelu.

## Iteracja 2026-11-06 — przygotowanie wdrożenia na Fly.io

- Dodano `Dockerfile`, `.dockerignore` i `fly.toml`: region `fra` (Fly nie ma regionu w Polsce), `shared-cpu-1x` 256 MB, wolumen `acronote_data` z bazą w `/data/acronote.db`, `auto_stop_machines = "stop"` i `min_machines_running = 0`. SQLite wymaga dokładnie jednej maszyny, dlatego wdrożenie idzie przez `fly deploy --ha=false`.
- `ACRONOTE_BEHIND_PROXY=1` włącza `trustProxy`, dzięki czemu `request.protocol` to `https` (cookie `Secure`, link i QR zaproszenia). Domyślnie wyłączone, więc uruchomienie lokalne po HTTP działa jak dotąd.
- Limity żądań za proxy liczone są po `Fly-Client-IP`. Bez tego wszyscy użytkownicy dzieliliby jeden limit logowań, a lewy wpis `X-Forwarded-For` pozwalałby go obejść.
- Na produkcji `ACRONOTE_DEMO=0`. Administratora nadaje `apps/api/dist/make-admin.js <nazwa>` istniejącemu kontu, więc nie powstaje konto ze znanym hasłem.
- Serwer zamyka się czysto po `SIGINT`/`SIGTERM`, co ma znaczenie przy automatycznym zatrzymywaniu maszyny.
- `npm audit fix` (bez `--force`) podniósł m.in. `fastify` do 5.12.8, `@fastify/static` do 10.1.10 i `vite` do 8.3.6.

Weryfikacja: `npm test` 74/74 (API 49, web 25), `npm run typecheck`, `npm run build`, `npm audit --audit-level=moderate` (0 podatności). Kroki z `Dockerfile` odtworzono ręcznie w pustym katalogu na Windowsie i uruchomiono wynik ze zmiennymi z `fly.toml` na tymczasowej bazie: frontend, głębokie linki SPA, brak kont demo, cookie `Secure`/`HttpOnly`/`Strict`, link `https`, `make-admin`, zachowanie sesji po restarcie. Zużycie pamięci 77 MB, start około 0,6 s.

Niezweryfikowane (brak Dockera i konta Fly): faktyczny build obrazu na Linuksie, działanie na Fly, obsługa sygnałów na Linuksie oraz to, czy Fly nadpisuje wysłany przez klienta nagłówek `Fly-Client-IP`.

Wynik wdrożenia 2026-11-06: apka działa pod `https://acronote.fly.dev` (uruchomiona z panelu Fly z GitHuba, nie przez `fly deploy`). Kreator utworzył sam wolumen `acronote_data` 1 GB w `fra` i jedną maszynę. Logowanie `demo` zwraca błąd, a konto i wpisany trening przetrwały zatrzymanie i wznowienie maszyny. Build obrazu i działanie na Fly są więc potwierdzone; nadpisywanie `Fly-Client-IP` nadal nie zostało sprawdzone. Nie skalować do 2 maszyn: każda miałaby własny plik SQLite.

## Stan gałęzi 2026-11-11 — przed scaleniem

- Produkcja działa z `main` (772b3e7, wdrożenie opisane wyżej).
- Gałąź `dev` (06fc813, iteracje 2026-10-09 i 2026-10-15, v0.3.0–v0.4.0) **nie jest scalona z `main`**. Odchodzi od v0.2.0 i zawiera własne, pełniejsze wdrożenie na Fly: panel admina tylko na prywatnym porcie (`fly proxy 3002`), `admin-cli.js`, kopie bazy, workflowy CI i automatycznego wdrożenia, `PORT=3001`. Ma też nowe funkcje: zgłoszenia błędów, kody resetu hasła, prośby „Zapomniałeś hasła?”, wejście admina na konto, migracje v4–v5.
- Scalenie `dev` z `main` daje konflikty w: `.dockerignore`, `Dockerfile`, `fly.toml`, `apps/api/src/app.ts`, `apps/api/src/server.ts`, `docs/PROGRESS.md`, `docs/WORKLOG.md`, `package-lock.json`.
- Decyzje przy scalaniu:
  - Który model admina zostaje. Na `main` admin działa w publicznej aplikacji, a na produkcji ma go już konto `Hubert Borzymek`. Na `dev` publiczny port nie ma tras admina.
  - Kto wdraża: integracja Fly z GitHubem (aplikację utworzono z panelu Fly) czy `deploy.yml` z `dev`, ale nie oba naraz.
  - Limit żądań: `dev` ufa jednemu przeskokowi proxy. Według dokumentacji Fly ostatni wpis `X-Forwarded-For` to adres aplikacji, więc wszyscy klienci prawdopodobnie dzieliliby jeden limit. `main` liczy go po `Fly-Client-IP` i ma na to testy.
  - Wolumen, ścieżka bazy i region są takie same na obu gałęziach. Migracje v4–v5 trzeba sprawdzić na kopii bazy produkcyjnej.
- Gałąź `flyio-new-files` (utworzona przez Fly) zmienia tylko formatowanie `fly.toml`. Należy ją scalić albo usunąć dopiero po wyborze ostatecznego `fly.toml`.

### Rozstrzygnięcie (2026-11-11, z użytkownikiem)

- Scalamy `main` do `dev` (na `dev`, produkcja nietknięta). Scalenie jest w toku (`git merge --no-commit`), commit robi użytkownik.
- Model admina: **publiczny panel w zwykłej aplikacji**, bo właściciel pomaga ludziom z telefonu. W zamian wymagana weryfikacja dwuetapowa (TOTP). Prywatny port 3002 i `fly proxy` usunięte.
- Wejście administratora na cudze konto, kody resetu przekazywane SMS-em i zakładanie kont przez admina usunięte na prośbę użytkownika.
- Wdrażanie: docelowo `deploy.yml` (testy przed wdrożeniem, PR do `main`). Przełączenie (odłączenie integracji Fly, `FLY_API_TOKEN`, reguła gałęzi) robimy **na końcu**, po wszystkich zmianach.
- Limit żądań: wersja z `main` (`Fly-Client-IP`).
- Kopie: na serwerze przy każdym wdrożeniu (z `dev`), na komputer właściciela co tydzień (jeden nadpisywany plik) i na żądanie.

## Iteracja 2026-11-11 — scalenie, admin z 2FA, reset z zatwierdzeniem, czas, ocena

Konta i administracja:
- `buildApp` nie ma już `adminRoutes`; `server.ts` nie uruchamia drugiego serwera. Limit żądań za proxy po `Fly-Client-IP` (włączany przez `TRUST_PROXY>0`), testy z `main` przeniesione.
- Weryfikacja dwuetapowa (`totp.ts`, RFC 6238 bez zewnętrznej biblioteki): po haśle sesja `mfa_pending` (10 min) pozwala tylko na `/api/auth/me`, `/logout`, `/2fa/verify`; 5 błędnych kodów usuwa sesję; `totp_last_step` blokuje ponowne użycie kodu. `authenticateAdmin` zwraca 403 `MFA_SETUP_REQUIRED`, dopóki admin nie ustawi 2FA (potwierdzenie hasłem, QR, kod, 10 kodów zapasowych jako SHA-256). Odebranie roli admina czyści 2FA.
- Reset hasła (`password_resets`): prośba z 4-cyfrowym numerem i tokenem w ciasteczku `acronote_reset` (`HttpOnly`, ścieżka `/api/auth/password-reset`); admin zatwierdza; tylko to urządzenie ustawia hasło; jedna aktywna prośba na konto (`repeat_count` pokazuje kolejne próby), 72 h na zatwierdzenie, 24 h na użycie, unieważnienie wszystkich sesji. Reset konta z 2FA nadal wymaga kodu. Odpowiedź dla nieistniejącego konta jest jawna (404), bo rejestracja i tak zdradza zajęte nazwy.
- `admin-cli`: `list-admins`, `grant-admin`, `create-admin` (tylko nowa nazwa), `reset-admin-password` (tylko admin), `disable-2fa`. `make-admin.ts` z `main` zastąpiony przez `grant-admin`.
- Migracja v5 uproszczona do `username_key` (kolumny kodów resetu i impersonacji nigdy nie trafiły na produkcję). Migracja v6 (w transakcji): `activities.time_ms`, `activity_elements.time_ms`, `trainings.rating/comment`, `users.totp_*`, `sessions.mfa_pending/mfa_attempts`; nowe tabele `password_resets`, `admin_recovery_codes`.

Treningi i statystyki:
- Czas w ms tylko przy `repetitions=1` (API zwraca 400 dla ×N). UI: „Dodaj czas” → przy ×N pytanie o rozdzielenie na N pozycji ×1; „Kolejne wykonanie na czas” przechodzi do następnej pustej pozycji albo dodaje nową. Czas całego układu/fragmentu i osobno czasy elementów układu.
- `time-stats.ts` liczy z migawek: rekord (dłuższy = lepszy), średnia, ostatni, trend (średnia z 30 dni minus wcześniejsza), seria na trening (najlepszy/najsłabszy/średnia). Klucz: kod elementu albo nazwa układu + zakres. Czasy elementów w układach liczą się do statystyk elementu. `newRecords` w odpowiedzi zapisu porównuje tylko z wcześniejszymi treningami.
- Ocena 1–10 i komentarz: `getTraining`/`saveTraining` z `includePrivate` tylko na trasach zawodnika; trener, admin i migawka zgłoszenia ich nie dostają; zapis bez pól zachowuje wartości.
- Edytor: zwijane wejścia (klucz `clientKey` po stronie klienta, przy otwarciu rozwinięte tylko najnowsze, nowe wejście zwija poprzednie), lądowanie jako mały `select` w nagłówku, „Usuń wejście” na dole karty. Lista treningów: bez karty „Dzisiaj”, jeden przycisk „Nowy” (na telefonie przypięty w prawym dolnym rogu), ocena „8/10” na karcie.
- Zgłoszony błąd z iPhone'a: niebieska strzałka na środku ekranu to `content:'↗'` w `.hero-card:after`. iOS rysuje znaki z wariantem emoji jako kolorowy kafelek i ignoruje kolor oraz przezroczystość. Wszystkie ozdobne znaki (↗, ☀ i pokrewne) zamieniono na ikony SVG; `symbols.test.ts` blokuje znaki z właściwością Unicode `Emoji` w `.tsx` i `.css`.

Kopie: `backup-cli.js` (VACUUM INTO + `integrity_check`), `scripts/backup-prod.ps1` (budzi maszynę, kopia przez `fly ssh`, pobranie `sftp get`, podmiana pliku dopiero po pełnym pobraniu, `kopie.log`), `pobierz-kopie.bat`, `zaplanuj-kopie.bat` (zadanie Windows w niedzielę 19:00, `StartWhenAvailable`).

Weryfikacja: `npm test` 109/109 (API 73, web 36), `npm run typecheck`, `npm run build`, `npm audit --audit-level=moderate` (0). Migracja: baza utworzona kodem z `main` (worktree 772b3e7, `seed`) otwarta nowym kodem — wersje 1–6, `integrity_check` ok, liczby wierszy, migawki treningów i konta bez zmian, ponowne otwarcie bez zmian, logowanie demo i admina działa. Przeglądarka (Chromium, 375×812 i desktop, baza w katalogu tymczasowym): lista bez karty i z jednym „Nowy”, zwijanie wejść, rozdzielenie 40o ×3, czasy 1,234 i 1,3 s, ocena 8/10, statystyki czasu, konfiguracja 2FA z kodami zapasowymi, prośba o reset z innego klienta (curl), zatwierdzenie w panelu, ustawienie hasła z urządzenia z prośbą. Znalezione i naprawione przy tym: okno pozycji nie przełączało się na pole czasu po rozdzieleniu; panel przeskakiwał na „Konta” po zatwierdzeniu ostatniej prośby.

Niezweryfikowane: migracja na kopii prawdziwej bazy produkcyjnej (zrobić przed wdrożeniem: `scripts\pobierz-kopie.bat`, potem `check` na kopii), `backup-prod.ps1` i zadanie tygodniowe na prawdziwym Fly, build obrazu Docker po zmianach (sprawdzi CI), wygląd na prawdziwym iPhonie, to, czy Fly nadpisuje `Fly-Client-IP` wysłany przez klienta.

Do zrobienia na końcu (z użytkownikiem): przełączenie wdrażania według `docs/DEPLOY.md`, usunięcie gałęzi `flyio-new-files`, pierwsze wdrożenie z `dev` przez PR do `main`, ustawienie 2FA na koncie `Hubert Borzymek` przy pierwszym wejściu do panelu.

### Wdrożenie 2026-11-11 — awaria portu i naprawa

- Pierwsze wdrożenie przez `deploy.yml` (5fbdcf1) zakończyło się błędem kontroli zdrowia: strona zwracała 503. Kreator Fly zapisał 6 listopada ustawienia jako **sekrety** (`PORT=8080`, `HOST`, `DATABASE_PATH`, `ACRONOTE_DEMO`, `ACRONOTE_BEHIND_PROXY`), a sekrety mają pierwszeństwo przed `[env]` z `fly.toml`. Aplikacja słuchała na 8080, a Fly kierował ruch na 3001.
- Migracja v6 i kopia przed nią (`/data/backups/acronote-2026-11-11T14-28-12-015Z-0.4.0_5fbdcf1.db`) wykonały się poprawnie. Kopia lokalna: `Dokumenty\AcroNote-kopie\acronote-przed-v6-2026-11-11.db`.
- Naprawa bez zmiany sekretów: `fly.toml` przestawiony na `PORT`/`internal_port` 8080. Do zrobienia później: usunąć zbędne sekrety (`fly secrets unset PORT HOST DATABASE_PATH ACRONOTE_DEMO ACRONOTE_BEHIND_PROXY`) i wtedy można wrócić do 3001.
- Lekcja: przed wdrożeniem porównać `fly secrets list` z `[env]` w `fly.toml`.

## Iteracja 2026-11-11 (2) — skoki bez salta i kody spoza notacji

Prośba użytkownika: dać się dodać „niepoprawny” element (np. `4o`, `40`) po pytaniu Tak/Nie oraz uznać `o`, `<`, `/` za poprawne samodzielne elementy (skoki bez salt i śrub).

- `@acronote/shared`: `parseElementCode` przyjmuje sam znak pozycji (0 ćwiartek, 0 salt, 0 śrub, `direction: null`). Nowe `checkElementCode(value, allowNonStandard)` zwraca `{code, parsed|null}`; kod spoza notacji tylko z potwierdzeniem, przycięty, 1–20 znaków, bez znaków sterujących.
- API `POST/PUT /api/elements`: flaga `allowNonStandardCode`; PUT bez flagi przyjmuje kod spoza notacji tylko wtedy, gdy się nie zmienia (przełączanie ulubionego/ukrycia). Kontrola właściciela przed walidacją kodu. Kolumny wyliczone dla kodu spoza notacji są `NULL` (schemat już na to pozwalał, migracja niepotrzebna).
- Web: `ConfirmDialog` (Tak/Nie zamiast `window.confirm`), `CodeHint` pod polem kodu (opis, ostrzeżenie albo podpowiedź), oznaczenie „kod spoza notacji” na karcie, opcja „Bez salta” w filtrach. To samo w okienku wyboru elementu w edytorze treningu.

Weryfikacja: `npm test` 130/130 (API 87, web 43), `npm run typecheck`, `npm run build`, `npm audit --audit-level=moderate` (0). Przeglądarka (375×812 i desktop, baza w katalogu tymczasowym, konto testowe): `4o` i `40` pokazują ostrzeżenie i pytanie; „Nie” nic nie zapisuje, „Tak, dodaj” zapisuje z pustymi polami; `/` dodaje się bez pytania z opisem „Skok bez salta i śruby · prosta”; filtr „Bez salta” pokazuje tylko `/`; gwiazdka na `4o` działa bez ponownego pytania. Przy tym skrócono etykiety przycisków, bo „Nie, poprawię” łamało się na telefonie.

Poprawka po uwagach użytkownika (ten sam dzień): elementy bez salta mają nazwy zwyczajowe `o` kuczka, `<` rozkroczka, `/` poziomka (`standardElementName` w `elementCode.ts`; pokazywane zamiast „Bez nazwy”, gdy nie ma własnej nazwy, w podpowiedzi pod kodem i w wyszukiwaniu, niezapisywane w bazie). Opcja filtra: „Element bez salta”. `npm test` 131/131 (API 87, web 44), typecheck, build. Przeglądarka 375×812: karty „Kuczka”, „Rozkroczka”, „Poziomka”, wyszukiwanie „rozkrocz” → `<`, podpowiedzi dla pustego pola, `o`, `<`, `/`, `41o`, `4o`.

### Porządki 2026-11-11 wieczorem (zrobione przez użytkownika, sprawdzone)

- Weryfikacja dwuetapowa ustawiona na koncie administratora.
- Sekrety kreatora usunięte (`fly secrets list` puste); port zostaje 8080 w `fly.toml`, bez PR na 3001. `/api/health` → `0.4.0+b31b246`.
- Gałąź `flyio-new-files` usunięta (na `origin` tylko `main` i `dev`).
- `scripts\pobierz-kopie.bat` zadziałał na prawdziwym Fly (`Dokumenty\AcroNote-kopie\acronote-2026-11-11_2015.db`); zadanie tygodniowe „AcroNote - cotygodniowa kopia bazy” zarejestrowane, najbliższe 15.11.2026 19:00.
- Wciąż niezweryfikowane: wygląd na prawdziwym iPhonie, to, czy Fly nadpisuje `Fly-Client-IP` wysłany przez klienta, pierwsze uruchomienie zadania tygodniowego.

## Plan 2026-11-11 — sprzęty: trampolina, DMT, ścieżka (ustalony, niezaczęty)

Wymagania: `REQUIREMENTS.md`, APP-01..APP-11. Notacje sprawdzone w FIG Code of Points 2025–2028 (Trampoline Gymnastics), dodatki G, I, J, K: trampolina i DMT mają ten sam zapis liczbowy (ćwiartki + półśruby na salto + pozycja), ścieżka ma symbole na salto, kropkę dla kierunku i elementy specjalne. Tabela DMT zapisuje salto w tył `4–`, a w przód `40`; na razie DMT działa dokładnie jak trampolina.

Ważne dla obecnego kodu: kierunek w katalogu trampolinowym jest zgadywany z parzystości półśrub (`40o` = tył), co zostaje bez zmian.

Etap 1 — sprzęty, bez ścieżki (do wdrożenia osobno):
- Migracja v7: tabela `apparatus` (`user_id`, `name`, `sort_order`, `catalog` `trampoline|tumbling`, `tracks_time`, `hidden`, `deleted_at`); każdemu użytkownikowi „Trampolina” i „DMT”; `training_entries.apparatus_id` + migawka `apparatus_name`, `apparatus_catalog`, `apparatus_tracks_time`; `routines.apparatus_id`. Wszystkie istniejące wejścia i układy → „Trampolina”.
- Profil: lista sprzętów jak miejsca lądowania (nazwa, katalog, czas, kolejność, ukrywanie).
- Edytor: wybór sprzętu w nagłówku wejścia, dziedziczenie z poprzedniego wejścia, układy filtrowane po sprzęcie, pole czasu tylko dla sprzętu z czasem.
- Statystyki, czasy i lądowania z przełącznikiem sprzętu; widok trenera z tym samym przełącznikiem (tylko odczyt, kontrola relacji bez zmian).
- Migracja sprawdzona na kopii bazy produkcyjnej przed wdrożeniem.

Etap 2 — ścieżka:
- `elements.catalog` (`trampoline|tumbling`) i unikalność `(user_id, catalog, code)`: w SQLite wymaga przebudowy tabeli `elements` (nowa tabela, kopia, zamiana, odtworzenie indeksów i kluczy obcych) w migracji v8, w transakcji, sprawdzonej na kopii produkcji.
- Parser zapisu ścieżkowego w `@acronote/shared` i w web (APP-09), z nazwami zwyczajowymi elementów specjalnych; filtry dla ścieżki.
- Strona *Elementy* z przełącznikiem katalogu; okno wyboru w wejściu pokazuje katalog sprzętu.
- Każdy użytkownik dostaje sprzęt „Ścieżka” (katalog ścieżkowy, bez czasu).

Otwarte na później: zapis DMT `4–o`/`40` z jawnym kierunkiem, ewentualny osobny katalog DMT.

## Iteracja 2026-11-12 — sprzęty, etap 1

Doprecyzowanie użytkownika: lista sprzętów jest dowolna (jak lądowania), a do sprzętu przy dodawaniu przypisuje się jeden z dwóch zapisów elementów. Nowe konto ma domyślnie trampolinę, „tak jak było”.

- Baza (v7, w transakcji): tabela `apparatus` (`name`, `sort_order`, `catalog` `trampoline|tumbling`, `tracks_time`, `hidden`, `deleted_at`, `UNIQUE(user_id,name)`); `training_entries.apparatus_id` + migawka `apparatus_name`; `routines.apparatus_id`. Każdy użytkownik dostaje Trampolinę (z czasem) i DMT (bez czasu); wszystkie istniejące wejścia i układy → Trampolina. `seedExecutionTypes` sieje też sprzęty; `defaultApparatus` zwraca pierwszy widoczny (i sieje, gdy konto nie ma żadnego).
- API: `GET/POST/PUT /api/apparatus` (bez zmiany `catalog`, `tumbling` odrzucany „wkrótce”, nie da się ukryć ostatniego widocznego, przywracanie usuniętej nazwy tylko z tym samym zapisem), `GET /api/coach/athletes/:id/apparatus`. Zapis treningu i układu sprawdza właściciela sprzętu. `apparatusId` w `/api/stats/summary`, `/api/stats/times` i odpowiednikach trenera (cudzy → 404). Klucze czasów zawierają sprzęt, więc rekordy porównują się w obrębie sprzętu. Listy treningów mają `apparatusNames`. Migawka zgłoszenia i `import-report` obsługują sprzęty (stare zgłoszenia → Trampolina).
- Web: `ApparatusSettings` w profilu; edytor (`nextEntryApparatus`, `routinesForApparatus`, chip sprzętu w nagłówku wejścia tylko przy >1 widocznym sprzęcie, czas ukryty dla sprzętu bez czasu, istniejące czasy nadal widoczne); układy (wybór sprzętu, filtr, oznaczenie); statystyki (`statsApparatusChoice`, wybór w `localStorage`, „Wszystkie sprzęty”); karty treningów i widok trenera z nazwami sprzętów.

Weryfikacja: `npm test` 143/143 (API 96, web 47), `npm run typecheck`. Migracja na kopii `Dokumenty\AcroNote-kopie\acronote-2026-11-11_2015.db` (v6 → v7): `integrity_check` ok, `foreign_key_check` pusty, aktywności, elementy układów, wejścia, konta i treningi identyczne jak w oryginale, 8 kont × 2 sprzęty, 48/48 wejść i 4/4 układy na Trampolinie, ponowne otwarcie bez zmian.
Przeglądarka (375×812 i 1280×800, testowa baza v6 w katalogu tymczasowym zmigrowana przy starcie): profil z listą sprzętów i dodaniem „Airtrack” (zapis ścieżkowy wyłączony „wkrótce”); nowy trening: wejście 1 Trampolina, wejście 2 odziedziczyło Trampolinę i zmienione na DMT, wejście 3 odziedziczyło DMT; na DMT brak przycisków czasu, na Trampolinie „Dodaj czas”; karta treningu „· Trampolina, DMT”; statystyki Trampolina 1 / DMT 2 / wszystkie 3 elementy, wybór zapamiętany; układy z oznaczeniem i filtrem sprzętu, nowy układ z filtra DMT dostaje DMT. Poprawione przy tym: ucięta nazwa sprzętu w chipie (szerszy chip, bez powtórzenia w nagłówku), przełącznik sprzętu w statystykach nieodróżnialny od okresu (wypełniony aktywny), nieostylowany `select` w formularzach (`.form-stack select`), przyciski listy sprzętów łamane na telefonie.

Niezweryfikowane: wygląd na prawdziwym iPhonie; zachowanie przy usuniętym (a nie ukrytym) sprzęcie — API nie ma usuwania, więc dziś nie występuje.
