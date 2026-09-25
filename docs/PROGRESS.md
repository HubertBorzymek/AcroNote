# Postęp prac nad AcroNote

> Ten plik opisuje faktycznie zweryfikowany stan repozytorium. Wymagania docelowe znajdują się w `REQUIREMENTS.md`.

## Stan bieżący

**Aktualizacja:** 2026-09-25

**Etap:** kompletna lokalna wersja dziennika zawodnika z panelem administratora

**Weryfikacja:** 45 testów automatycznych, kontrola typów, build, audyt zależności oraz testy przeglądarkowe desktop/mobile

Profil trenera pozostaje celowo poza bieżącym interfejsem. Backend wcześniejszego etapu zawiera relacje i endpointy trenerskie, ale nie należy ich przedstawiać użytkownikowi jako gotowy produkt.

## Zrealizowany zakres

### Konta i dane

- Rejestracja, logowanie, wylogowanie i zmiana hasła (minimum 10 znaków).
- Hasła `bcrypt`; losowe sesje przechowywane jako skróty i przesyłane w `HttpOnly`, `SameSite=Strict`.
- Kontrola właściciela zasobu w API i test izolacji użytkowników.
- Automatyczna, idempotentna migracja istniejącej bazy do v2 bez usuwania historii.
- Miękkie usuwanie kont, elementów i układów tam, gdzie wymagane jest odzyskanie.

### Elementy

- Pełny CRUD, wyszukiwanie, ulubione, ukrywanie, przywracanie i poprawny pusty stan zakładki „Ukryte”.
- Usuwanie pyta o wpływ na układy tylko wtedy, gdy element faktycznie w nich występuje.
- Wspólny parser i walidacja kodów: 1–12 ćwiartek, liczba cyfr śrub wynikająca z liczby salt i końcowy symbol `o`, `<` lub `/`.
- Metadane i filtry: liczba salt, suma śrub co 0,5, przód/tył oraz pozycja.
- Prosta ściągawka dla młodszych zawodników z przykładami `800/`, `831o` itd.

### Układy i treningi

- Tworzenie, edycja, kolejność, duplikaty i usuwanie układów.
- Element można utworzyć bezpośrednio z wyboru w wejściu, po czym aplikacja wraca do tego samego miejsca bez utraty formularza.
- Cofnięcie z niezapisanymi zmianami pokazuje „Zapisz”, „Odrzuć” i „Zostań”; zapis wykonuje prawdziwe żądanie do API.
- Dowolna liczba wejść, elementów, układów i fragmentów, liczniki powtórzeń oraz rodzaje wykonania.
- Termin „Na płasko” został zastąpiony przez „Siatka” w bieżącym katalogu; historyczne migawki zachowują dawną nazwę.
- Techniczny nagłówek migawki zastąpiono prostym „Jak wykonano każdy element?”.
- Rodzaje wykonania można w profilu dodawać, zmieniać, ukrywać/przywracać i porządkować.
- Klient HTTP nie wysyła już `Content-Type: application/json` dla żądań bez ciała, co naprawiało DELETE elementów i układów.

### Historia i statystyki

- Migawki pozostają niezależne od aktualnych elementów, układów i rodzajów wykonania.
- Statystyki uwzględniają elementy bezpośrednie, układy, fragmenty, powtórzenia i duplikaty.
- Widoki: bieżący tydzień kalendarzowy, miesiąc kalendarzowy i cała historia.
- Dwa czytelne wykresy: wykonane elementy oraz wejścia w czasie; opcjonalny filtr pokazuje historię wybranego elementu.
- Kilka treningów jednego dnia jest jednym punktem wykresu, ale pozostaje osobnymi treningami i jest prawidłowo sumowane.

### Konto demo i administrator

- `demo` / `AcroNote-demo-2026`: 30 zróżnicowanych elementów, dwa układy (drugi zawiera duplikat) i siedem treningów startowych.
- `admin` / `AcroNote-admin-2026`: osobny panel kont.
- Administrator może tworzyć konto, zmieniać jego nazwę i rolę, ustawić hasło tymczasowe, miękko usunąć i odzyskać konto.
- Może przeglądać i usuwać/odzyskiwać elementy i układy użytkownika oraz przeglądać i usuwać treningi.
- Reset hasła unieważnia sesje. API ani UI nie zwracają aktualnego hasła, skrótu hasła lub tokenów sesji.
- Panel blokuje odebranie sobie roli administratora i usunięcie własnego aktywnego konta.

## Wyniki weryfikacji z 2026-09-25

| Kontrola | Wynik | Szczegóły |
|---|---|---|
| `npm test` | **PASS** | API: 5 plików / 31 testów; web: 2 pliki / 14 testów; razem 45 |
| `npm run typecheck` | **PASS** | `shared`, `web`, `api` |
| `npm run build` | **PASS** | produkcyjny build Vite i API |
| `npm audit --audit-level=moderate` | **PASS** | 0 znanych podatności |
| `git diff --check` | **PASS** | brak błędów białych znaków; tylko informacyjne ostrzeżenia CRLF |
| migracja kopii bazy | **PASS** | zachowanie danych, v2 i idempotencja |
| produkcyjny smoke test | **PASS** | logowanie, trasy API i frontend z lokalnej bazy testowej |
| testy przeglądarkowe | **PASS** | demo/admin, tworzenie elementu w treningu, dialog cofania, ukrywanie/przywracanie, ściągawka, wykresy, panel admina i viewport 390×844 |

## Pokrycie automatyczne

- zapis elementów, układów, fragmentów, powtórzeń i duplikatów;
- historyczna niezmienność po zmianie/usunięciu źródeł;
- ponowne przeliczenie po edycji treningu oraz zakresy dat;
- filtrowanie historii po elemencie również wewnątrz układu;
- parser poprawnych i błędnych kodów oraz wyliczane metadane;
- puste DELETE bez błędnego nagłówka JSON;
- autoryzacja i izolacja danych;
- bezpieczne operacje administratora;
- migracja starszego schematu i idempotentny seeder.

## Świadomie odłożone

- Interfejs trenera, przełączanie profili i obsługa zaproszeń — zgodnie z decyzją użytkownika kolejny etap.
- PWA/offline i synchronizacja, import/eksport, kluby, komentarze, cele, generator kodów i punktacja.
- Utwardzenie do publicznego Internetu: HTTPS, `Secure` cookie, polityka CORS/CSRF dla docelowej domeny, automatyczne kopie i monitoring.
- Automatyczne E2E w CI dla wielu przeglądarek; krytyczne ścieżki wykonano ręcznie w Chromium desktop i 390×844.

## Ważne informacje operacyjne

- Nie uruchamiaj testów na `data/acronote.db`; używaj `:memory:` albo jawnej kopii.
- Przed tą migracją utworzono kopię pliku bazowego, ale SQLite używał WAL i sam plik nie zawierał stron danych. Poprawna, spójna kopia po migracji i seedzie znajduje się w `data/backups/acronote-after-v2-20260925.db`.
- Jawne hasło startowe administratora trzeba zmienić przed udostępnieniem aplikacji innym osobom.
