# AcroNote — dziennik implementacji

Ten plik jest operacyjnym punktem wejścia dla kolejnych agentów. Przed zmianami należy przeczytać `AGENTS.md`, `README.md`, `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md` oraz ten dokument. Po sesji należy dopisać decyzje, testy, problemy i dokładny stan pracy.

## Cel produktu i bieżący zakres

AcroNote jest lokalnym, polskojęzycznym dziennikiem zawodnika trenującego akrobatykę na trampolinie. Bieżąca wersja obejmuje pełny interfejs zawodnika i panel administratora. Interfejs trenera jest celowo odłożony.

Najważniejsze zasady:

- historia jest zapisywana jako samodzielne migawki i nie zmienia się po edycji katalogu;
- statystyki wynikają z migawek, nie z bieżących szablonów;
- każda operacja użytkownika ma kontrolę właściciela w API;
- administrator nie widzi haseł, skrótów haseł ani tokenów sesji;
- `data/acronote.db` nie służy do testów.

## Reguły kodu elementu

- Kod kończy się pozycją: `o` — kuczna, `<` — łamana, `/` — prosta.
- Początek to liczba ćwiartek salta od 1 do 12: `4` = jedno, `8` = dwa, `12` = trzy. Liczba niepodzielna przez 4 opisuje inne przejście niż z nóg na nogi.
- Dalej występuje dokładnie `max(1, floor(liczba ćwiartek / 4))` cyfr śrub. Cyfra liczy półobroty: `1` = 0,5 śruby, `2` = 1 śruba.
- `800/` to dwa salta bez śrub, `801<` ma pół śruby w drugim salcie, `831o` ma 1,5 w pierwszym i 0,5 w drugim.
- Suma parzystej liczby półobrotów oznacza kierunek „tył”, nieparzystej — „przód”.
- Parser w `packages/shared/src/element-code.ts` jest źródłem prawdy backendu. Frontendowa funkcja w `packages/web/src/elementCode.ts` odpowiada temu samemu kontraktowi i ma testy zgodności.

## Iteracja 2026-09-25 — zakończona

Naprawiono wszystkie zgłoszone problemy:

| Zgłoszenie | Rozwiązanie | Weryfikacja |
|---|---|---|
| Elementu nie dało się dodać z wejścia | Formularz „Dodaj nowy element” działa w pickerze i wraca do tego wejścia | ręczny test produkcyjnego UI |
| Cofnięcie nie proponowało zapisu | Dialog „Zapisz / Odrzuć / Zostań” | ręczny test zapisu przez dialog |
| DELETE elementu/układu kończył się błędem pustego JSON | klient ustawia `Content-Type` tylko, gdy istnieje body | test `api.test.ts` + UI |
| Ukrywanie odrzucało niepełny element | UI scala pełny model przed PUT | ręczne ukrycie i przywrócenie |
| Błędny pusty stan „Ukryte” | osobny komunikat i bez przycisku tworzenia | ręczny test UI |
| Pytanie o układy pojawiało się bez użycia | endpoint `GET /elements/:id/usage` i warunkowy dialog | test API |
| Techniczny opis migawki | „Jak wykonano każdy element?” | kontrola UI |
| Brak wykresów | wykres elementów i wejść, filtr elementu, okresy kalendarzowe | kontrola UI i test statystyk |
| „Na płasko” | bieżący katalog używa „Siatka”; historia bez zmian | test migracji |

Dodatkowo:

- wdrożono filtry i ściągawkę kodów;
- dodano zarządzanie rodzajami wykonania;
- dodano rolę i panel administratora, soft-delete/restore oraz bezpieczny reset hasła;
- dodano seeder 30 elementów, dwóch układów i siedmiu treningów dla `demo` oraz konto `admin`;
- oś wykresu agreguje wiele treningów tego samego dnia;
- minimum hasła jest spójne w UI i API (10 znaków);
- zaktualizowano `.gitignore` o bazy w `data/backups`.

## Migracja danych i kopie

- Migrację sprawdzono najpierw na `data/migration-check.db`.
- Następnie `npm run seed` wykonano na domyślnej bazie bez nadpisania istniejących kont.
- `data/backups/acronote-before-v2-20260925.db` jest niepełnym plikiem utworzonym podczas aktywnego WAL i nie stanowi poprawnej kopii danych.
- Spójna kopia po migracji i seedzie została wykonana przez SQLite Backup API jako `data/backups/acronote-after-v2-20260925.db`.
- Wszystkie pliki `.db`, `.db-wal` i `.db-shm` są ignorowane przez Git.

## Weryfikacja

- `npm test`: 45/45 (API 31, web 14).
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npm audit --audit-level=moderate`: 0 podatności.
- `git diff --check`: PASS (ostrzeżenia konwersji LF/CRLF są informacyjne).
- Produkcyjny serwer uruchomiony na kopii migracyjnej: PASS.
- Ręcznie w Chromium: logowanie demo/admin, lista 30 elementów, filtry, ściągawka, ukrycie/przywrócenie, dodanie `53/` z wejścia, zapis przez dialog cofania, dwa wykresy, panel administratora i podgląd danych konta.
- Responsywność: ręczna kontrola przy 390×844; dolna nawigacja i modal pozostają używalne.

## Konta startowe

- `demo` / `AcroNote-demo-2026`
- `admin` / `AcroNote-admin-2026`

Hasła są jawne wyłącznie dlatego, że są to lokalne konta startowe. Hasło `admin` należy zmienić przed udostępnieniem aplikacji.

## Commity tej iteracji

- `d43d0c9` — dziennik i instrukcje dla kolejnych agentów;
- `372bdc5` — parser, migracje, administracja API, seeder i testy;
- `76b4a61` — naprawione przepływy zawodnika, filtry, wykresy i panel admina;
- `76b6edc` — podgląd i usuwanie treningów z panelu admina.

## Pozostały zakres

Nie ma znanego błędu blokującego lokalną wersję zawodnika. Następny większy etap to profil trenera; nie należy go zaczynać bez nowego polecenia użytkownika. Przed każdym kolejnym wydaniem trzeba powtórzyć komplet kontroli z `AGENTS.md`.
