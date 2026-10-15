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
