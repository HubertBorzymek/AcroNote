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

Commity funkcjonalne:

- `90ba3ab` — bezpieczne API profilu trenera, migracja v3, lądowania w statystykach i testy;
- `7634413` — profil trenera w UI, zaproszenia, zgoda, wspólne statystyki i poprawka „Zapisz i kontynuuj”.

Końcowe zmiany tej iteracji obejmują bezwzględny adres linku/QR, test jego kontraktu, pełną aktualizację dokumentacji oraz wyniki migracji i ręcznej kontroli UI.

## Migracja danych i kopie

- Nie modyfikowano `data/acronote.db` podczas testów.
- Spójna kopia sprzed migracji trenerskiej: `data/backups/acronote-before-coach-20260925.db`.
- Kopię przeniesiono do `data/coach-migration-check.db` i otwarto dwukrotnie przez aktualną warstwę bazy.
- Po migracji istnieją wersje 1–3, zaproszenia mają wszystkie nowe kolumny, a liczby 3 kont / 8 treningów / 34 elementów pozostały bez zmian.
- Ponowne otwarcie nie dodało migracji ani rekordów; `PRAGMA integrity_check` zwróciło `ok`.
- Po tej weryfikacji otwarto właściwą `data/acronote.db` aktualną warstwą bazy. Migracja v3 została zastosowana; pozostały 3 konta / 8 treningów / 34 elementy, a `integrity_check` nadal zwraca `ok`.
- Przed dodaniem konta demo trenera wykonano spójną kopię `data/backups/acronote-before-demo-coach-20260926.db`. Seeder dodał wyłącznie `trener_demo` i relację z `demo`: baza ma teraz 4 konta / 8 treningów / 34 elementy, a `integrity_check` zwraca `ok`.
- Pliki testowych baz są ignorowane przez Git.

## Weryfikacja 2026-09-26

- `npm test`: 57/57 (API: 6 plików / 38, web: 3 pliki / 19).
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
