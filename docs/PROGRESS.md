# Postęp prac nad AcroNote

> Ten plik opisuje faktycznie zweryfikowany stan repozytorium. Wymagania docelowe znajdują się w `REQUIREMENTS.md`.

## Stan bieżący

**Aktualizacja:** 2026-10-05

**Etap:** kompletna lokalna wersja profilu zawodnika, profilu trenera tylko do odczytu i panelu administratora

**Weryfikacja:** 63 testy automatyczne, kontrola typów, build, audyt zależności, migracja kopii istniejącej bazy oraz testy przeglądarkowe desktop/mobile na odizolowanej bazie

## Zrealizowany zakres

### Konta i bezpieczeństwo

- Rejestracja, logowanie, wylogowanie i zmiana hasła (minimum 10 znaków).
- Nazwa konta może zawierać pojedyncze spacje, np. `Maria Kowalska`; aplikacja normalizuje nadmiarowe spacje i blokuje znaki nowej linii.
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
- Na telefonie elementy zapisanych układów układają się w trzy kolumny, nie poszerzają strony i pozostawiają dostępną dolną nawigację.
- Element można utworzyć bezpośrednio z wyboru w wejściu, po czym aplikacja wraca do tego samego miejsca bez utraty formularza.
- Cofnięcie z niezapisanymi zmianami pokazuje „Zapisz”, „Odrzuć” i „Zostań”; zapis wykonuje prawdziwe żądanie do API.
- „Zapisz i kontynuuj” utrzymuje identyfikator zapisanego treningu, więc kolejne zapisy aktualizują ten sam rekord i są od razu widoczne trenerowi po odświeżeniu.
- Dowolna liczba wejść, elementów, układów i fragmentów oraz liczniki powtórzeń.
- Techniczny nagłówek migawki zastąpiono prostym „Gdzie lądował każdy element?”.
- Klient HTTP nie wysyła `Content-Type: application/json` dla żądań bez ciała, co naprawia DELETE elementów, układów i połączeń.
- Pełne filtry elementów są wspólne dla katalogu, wyboru do wejścia i wyboru podczas tworzenia lub edycji układu.
- Szablon układu można edytować w trakcie dodawania go do treningu; zapis tworzy nową wersję tylko dla bieżących i przyszłych użyć.
- Zakres wykonanego układu można skorygować, dopóki wersja szablonu jest zgodna. Po zmianie/usunięciu źródła aplikacja blokuje automatyczną przebudowę i wyjaśnia bezpieczną alternatywę.
- Karty wejść mają wyraźny numer i sumaryczną liczbę wykonanych elementów zamiast technicznej liczby czynności; okna edycji wskazują numer bieżącego wejścia.
- Najnowsze wejście i przycisk dodawania są na górze. Przy długim treningu domyślnie widać 5 ostatnich wejść, ze sterowaniem do dokładania starszych po 5, pokazania wszystkich, zwijania i powrotu do ostatnich 5.

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
- Profil trenera można wyłączyć i ponownie włączyć; wyłączenie natychmiast blokuje odczyt, ale zachowuje połączenia.

### Wygląd i dostęp lokalny

- Tryb jasny i ciemny zachowują zielony motyw przewodni. Pierwsze uruchomienie respektuje motyw systemu, a ręczny wybór jest zapamiętywany w przeglądarce.
- Oba motywy sprawdzono na szerokim widoku, a tryb ciemny dodatkowo na telefonicznym widoku 390×844.
- README opisuje ograniczone udostępnienie produkcyjnego buildu telefonowi w tej samej prywatnej sieci Wi-Fi oraz ryzyka wynikające z braku HTTPS.

### Konto demo i administrator

- `demo` / `AcroNote-demo-2026`: 30 zróżnicowanych elementów, dwa układy (drugi zawiera duplikat) oraz trening startowy z pięcioma różnymi wejściami obok historii treningów.
- `trener_demo` / `AcroNote-trener-2026`: profil zawodnika i trenera, połączony z kontem `demo`; seeder nie nadpisuje istniejącego hasła ani nie powiela relacji.
- `admin` / `AcroNote-admin-2026`: osobny panel kont.
- Administrator może tworzyć konto, zmieniać jego nazwę i rolę, ustawić hasło tymczasowe, miękko usunąć i odzyskać konto.
- Może przeglądać i usuwać/odzyskiwać elementy i układy użytkownika oraz przeglądać i usuwać treningi.
- Reset hasła unieważnia sesje. API ani UI nie zwracają aktualnego hasła, skrótu hasła lub tokenów sesji.

## Wyniki weryfikacji z 2026-09-26

| Kontrola | Wynik | Szczegóły |
|---|---|---|
| `npm test` | **PASS** | API: 6 plików / 39 testów; web: 5 plików / 24 testy; razem 63 |
| `npm run typecheck` | **PASS** | `shared`, `web`, `api` |
| `npm run build` | **PASS** | produkcyjny build Vite i API |
| `npm audit --audit-level=moderate` | **PASS** | 0 znanych podatności |
| `git diff --check` | **PASS** | brak błędów białych znaków; tylko informacyjne ostrzeżenia CRLF |
| migracja bazy | **PASS** | najpierw kopia, potem baza lokalna: v3, zachowane 3 konta / 8 treningów / 34 elementy, idempotencja i `integrity_check=ok` |
| dodanie demo trenera | **PASS** | kopia przed zmianą; po seedzie 4 konta / 8 treningów / 34 elementy, jedno połączenie `trener_demo` → `demo`, `integrity_check=ok` |
| trening demo wielu wejść | **PASS** | kopia przed zmianą; po seedzie 4 konta / 9 treningów / 34 elementy, maks. 5 wejść, `integrity_check=ok` |
| profil trenera — przeglądarka | **PASS** | dwa kierunki zaproszeń, aktywacja/przełączanie, zgoda, historia/elementy/układy/statystyki i nowy wpis po odświeżeniu |
| bezpieczeństwo relacji | **PASS** | zapis cudzej historii zwraca 404; po odłączeniu odczyt trenera zwraca 403 |
| responsywność | **PASS** | widok trenera i statystyk sprawdzony przy 390×844 |
| motyw jasny/ciemny | **PASS** | oba motywy na desktopie, ciemny przy 390×844, wybór zachowany po przeładowaniu |
| demo i dezaktywacja trenera | **PASS** | `trener_demo` widzi `demo`; wyłączenie daje 403, ponowne włączenie 200 bez utraty relacji |
| nazwa Unicode ze spacją | **PASS** | rejestracja/logowanie `Łukasz Żółć`, NFC, spacja nierozdzielająca z telefonu, administracja i odrzucenie Entera |
| układy mobile | **PASS** | lista i edytor przy 390×844; pełna siatka elementów bez poziomego przepełnienia, widoczna dolna nawigacja |
| trening mobile | **PASS** | pięć wejść przy 390×844, pełne filtry, edycja szablonu, korekta zakresu i blokada po zmianie wersji |
| długi trening | **PASS** | 20 wejść / 100 elementów na izolowanej bazie; kolejność od najnowszego, domyślne 5, +5, wszystkie i zwinięcie sprawdzone przy 390×844 oraz 1280×900 |

## Pokrycie automatyczne

- zapis elementów, układów, fragmentów, powtórzeń, duplikatów i indywidualnych lądowań;
- historyczna niezmienność po zmianie/usunięciu źródeł;
- przeliczenie po edycji treningu, zakresy dat i filtrowanie elementu wewnątrz układu;
- agregacja lądowań ogólna i dla konkretnego kodu;
- parser kodów, migracje, seeder oraz klient HTTP bez pustego JSON;
- autoryzacja właściciela i bezpieczne operacje administratora;
- zaproszenia: wygaśnięcie, anulowanie, jednokrotność, błędny profil i próba połączenia z samym sobą;
- pełny odczyt trenera, odmowa obcemu trenerowi i natychmiastowe odebranie dostępu.
- wspólne filtry wyboru elementów, zachowanie wersji układu przy ponownym zapisie oraz wielowejściowe dane demo.

## Świadomie odłożone

- Komentarze, cele treningowe i grupy klubowe. (Odzyskiwanie konta działa przez administratora: prośba z ekranu logowania i jednorazowy kod.)
- PWA/offline i synchronizacja, import/eksport, generator kodów i punktacja.
- Monitoring i alerty dla wersji online (HTTPS, `Secure` cookie, SameSite=Strict, kopie bazy i prywatny panel admina są już zrobione — zob. `docs/DEPLOY.md`).
- Automatyczne E2E w CI dla wielu przeglądarek; krytyczne ścieżki wykonano ręcznie w Chromium desktop i 390×844.

## Ważne informacje operacyjne

- Nie uruchamiaj testów na `data/acronote.db`; używaj `:memory:` albo jawnej kopii.
- Spójna kopia sprzed migracji profilu trenera znajduje się w `data/backups/acronote-before-coach-20260925.db`.
- Spójna kopia sprzed dodania konta `trener_demo` znajduje się w `data/backups/acronote-before-demo-coach-20260926.db`.
- Spójna kopia sprzed dodania wielowejściowego treningu demo znajduje się w `data/backups/acronote-before-multi-entry-demo-20260926.db`.
- Link i QR zawierają adres, z którego otwarto aplikację. Przy użyciu na drugim urządzeniu serwer musi być dostępny pod adresem sieciowym zamiast domyślnego `127.0.0.1`.
- Dostęp z telefonu po HTTP jest przeznaczony tylko do krótkich testów w zaufanej sieci prywatnej. Nie przekierowuj portu na routerze i nie wyłączaj zapory.
- Jawne hasło startowe administratora trzeba zmienić przed udostępnieniem aplikacji innym osobom.
