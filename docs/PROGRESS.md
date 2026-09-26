# Postęp prac nad AcroNote

> Ten plik opisuje faktycznie zweryfikowany stan repozytorium. Wymagania docelowe znajdują się w `REQUIREMENTS.md`.

## Stan bieżący

**Aktualizacja:** 2026-09-26

**Etap:** kompletna lokalna wersja profilu zawodnika, profilu trenera tylko do odczytu i panelu administratora

**Weryfikacja:** 53 testy automatyczne, kontrola typów, build, audyt zależności, migracja kopii istniejącej bazy oraz testy przeglądarkowe desktop/mobile na odizolowanej bazie

## Zrealizowany zakres

### Konta i bezpieczeństwo

- Rejestracja, logowanie, wylogowanie i zmiana hasła (minimum 10 znaków).
- Limit serii rejestracji wynosi 10 prób na 5 minut; komunikat błędu jest po polsku.
- Hasła `bcrypt`; losowe sesje przechowywane jako skróty i przesyłane w `HttpOnly`, `SameSite=Strict`.
- Kontrola właściciela zasobu w API i test izolacji użytkowników.
- Automatyczne, idempotentne migracje istniejącej bazy do v3 bez usuwania historii.
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
- „Zapisz i kontynuuj” utrzymuje identyfikator zapisanego treningu, więc kolejne zapisy aktualizują ten sam rekord i są od razu widoczne trenerowi po odświeżeniu.
- Dowolna liczba wejść, elementów, układów i fragmentów oraz liczniki powtórzeń.
- Techniczny nagłówek migawki zastąpiono prostym „Gdzie lądował każdy element?”.
- Klient HTTP nie wysyła `Content-Type: application/json` dla żądań bez ciała, co naprawia DELETE elementów, układów i połączeń.

### Miejsca lądowania i statystyki

- „Siatka”, „Materac” i „Gąbki” są konsekwentnie opisane jako miejsca lądowania, nie rodzaje wykonania.
- Miejsca można dodawać, zmieniać, ukrywać/przywracać i porządkować w profilu.
- Migawka zachowuje miejsce każdego elementu osobno, także wewnątrz układu; np. `41o` może być na siatkę, a następujące `800o` na materac.
- Statystyki miejsc lądowania pokazują rozkład ogólny i rozkład po wybraniu konkretnego elementu.
- Pozostałe statystyki uwzględniają elementy bezpośrednie, układy, fragmenty, powtórzenia i duplikaty.
- Widoki: bieżący tydzień kalendarzowy, miesiąc kalendarzowy i cała historia.
- Wykresy: wykonane elementy oraz wejścia w czasie; wiele treningów jednego dnia jest jednym punktem wykresu, ale jest prawidłowo sumowane.

### Profil trenera

- Jedno konto może mieć profil zawodnika i trenera oraz przełączać się bez ponownego logowania.
- Relacje są równorzędne i wiele-do-wielu; nie ma trenera głównego.
- Zaproszenie może utworzyć każda strona. Dostępne są krótki kod, pełny link i QR z adresem aplikacji.
- Zaproszenia wygasają, można je anulować, są atomowo jednorazowe i mają limit prób podglądu/akceptacji.
- Podgląd pokazuje nadawcę przed akceptacją. Gdy zaprasza trener, zawodnik musi zaznaczyć świadomą zgodę na udostępnienie całej historii.
- Trener widzi listę zawodników, historię i szczegóły treningów, elementy z historią, układy oraz te same statystyki co zawodnik.
- Dostęp jest wyłącznie do odczytu. Każdy endpoint trenera weryfikuje aktywny profil i bieżące połączenie po stronie API.
- Nowe zapisane wejścia są widoczne po użyciu „Odśwież”, bez potrzeby zamykania treningu przez zawodnika.
- Zawodnik i trener mogą zakończyć połączenie; utrata dostępu jest natychmiastowa i nie usuwa historii.

### Konto demo i administrator

- `demo` / `AcroNote-demo-2026`: 30 zróżnicowanych elementów, dwa układy (drugi zawiera duplikat) i siedem treningów startowych.
- `admin` / `AcroNote-admin-2026`: osobny panel kont.
- Administrator może tworzyć konto, zmieniać jego nazwę i rolę, ustawić hasło tymczasowe, miękko usunąć i odzyskać konto.
- Może przeglądać i usuwać/odzyskiwać elementy i układy użytkownika oraz przeglądać i usuwać treningi.
- Reset hasła unieważnia sesje. API ani UI nie zwracają aktualnego hasła, skrótu hasła lub tokenów sesji.

## Wyniki weryfikacji z 2026-09-26

| Kontrola | Wynik | Szczegóły |
|---|---|---|
| `npm test` | **PASS** | API: 6 plików / 36 testów; web: 2 pliki / 17 testów; razem 53 |
| `npm run typecheck` | **PASS** | `shared`, `web`, `api` |
| `npm run build` | **PASS** | produkcyjny build Vite i API |
| `npm audit --audit-level=moderate` | **PASS** | 0 znanych podatności |
| `git diff --check` | **PASS** | brak błędów białych znaków; tylko informacyjne ostrzeżenia CRLF |
| migracja bazy | **PASS** | najpierw kopia, potem baza lokalna: v3, zachowane 3 konta / 8 treningów / 34 elementy, idempotencja i `integrity_check=ok` |
| profil trenera — przeglądarka | **PASS** | dwa kierunki zaproszeń, aktywacja/przełączanie, zgoda, historia/elementy/układy/statystyki i nowy wpis po odświeżeniu |
| bezpieczeństwo relacji | **PASS** | zapis cudzej historii zwraca 404; po odłączeniu odczyt trenera zwraca 403 |
| responsywność | **PASS** | widok trenera i statystyk sprawdzony przy 390×844 |

## Pokrycie automatyczne

- zapis elementów, układów, fragmentów, powtórzeń, duplikatów i indywidualnych lądowań;
- historyczna niezmienność po zmianie/usunięciu źródeł;
- przeliczenie po edycji treningu, zakresy dat i filtrowanie elementu wewnątrz układu;
- agregacja lądowań ogólna i dla konkretnego kodu;
- parser kodów, migracje, seeder oraz klient HTTP bez pustego JSON;
- autoryzacja właściciela i bezpieczne operacje administratora;
- zaproszenia: wygaśnięcie, anulowanie, jednokrotność, błędny profil i próba połączenia z samym sobą;
- pełny odczyt trenera, odmowa obcemu trenerowi i natychmiastowe odebranie dostępu.

## Świadomie odłożone

- Pomoc trenera w odzyskiwaniu konta, komentarze, cele treningowe i grupy klubowe.
- PWA/offline i synchronizacja, import/eksport, generator kodów i punktacja.
- Utwardzenie do publicznego Internetu: HTTPS, `Secure` cookie, polityka CORS/CSRF dla docelowej domeny, automatyczne kopie i monitoring.
- Automatyczne E2E w CI dla wielu przeglądarek; krytyczne ścieżki wykonano ręcznie w Chromium desktop i 390×844.

## Ważne informacje operacyjne

- Nie uruchamiaj testów na `data/acronote.db`; używaj `:memory:` albo jawnej kopii.
- Spójna kopia sprzed migracji profilu trenera znajduje się w `data/backups/acronote-before-coach-20260925.db`.
- Link i QR zawierają adres, z którego otwarto aplikację. Przy użyciu na drugim urządzeniu serwer musi być dostępny pod adresem sieciowym zamiast domyślnego `127.0.0.1`.
- Jawne hasło startowe administratora trzeba zmienić przed udostępnieniem aplikacji innym osobom.
