# Postęp prac nad AcroNote

> Ten plik opisuje faktycznie zweryfikowany stan repozytorium. Wymagania docelowe znajdują się w `REQUIREMENTS.md`; obecność wymagania w tamtym dokumencie nie oznacza, że zostało wdrożone.

## Stan bieżący

**Aktualizacja:** 2026-09-25  
**Etap:** działający lokalny prototyp podstawowego dziennika zawodnika  
**Weryfikacja:** testy, kontrola typów, build i smoke test produkcyjnego serwera zakończone powodzeniem

Prototyp pozwala założyć konto, prowadzić prywatną listę elementów i układów, zapisywać oraz edytować treningi z wejściami i czynnościami, a następnie wyświetlać podstawowe agregacje. Backend przechowuje historyczne migawki niezależnie od aktualnych szablonów. Nie jest to jeszcze wersja gotowa do publicznego Internetu.

## Zrealizowane funkcje

### Fundamenty

- Monorepo npm workspaces: `apps/api`, `packages/web` i `packages/shared`.
- Fastify + TypeScript, React + Vite oraz lokalny SQLite przez `better-sqlite3`.
- Automatyczny bootstrap pustej bazy, klucze obce, WAL i transakcyjne zapisy złożone.
- Jednopoleceniowe skrypty `dev`, `build`, `start`, `test`, `seed` i `typecheck`.
- Produkcyjny serwer API serwuje również build frontendu.
- `start.bat`, `.env.example` i `.gitignore` dla Windowsa.

### Konta i izolacja

- Rejestracja i logowanie nazwą użytkownika oraz hasłem.
- Hasła haszowane `bcrypt`; losowy token sesji jest przechowywany jako skrót i przesyłany w ciasteczku `HttpOnly`, `SameSite=Strict`.
- Wylogowanie, odczyt bieżącego użytkownika i zmiana hasła.
- Ograniczanie częstotliwości żądań oraz ostrzejsze limity rejestracji/logowania i przyjmowania zaproszeń.
- Właściciel jest sprawdzany przez API; test integracyjny potwierdza brak dostępu niezalogowanego klienta i izolację list elementów dwóch użytkowników.

### Elementy i układy

- Tworzenie, edycja, wyszukiwanie, ulubione, ukrywanie/przywracanie i miękkie usuwanie elementów.
- Przy usuwaniu elementu użytkownik wybiera usunięcie go z aktualnych układów albo zachowanie migawki w szablonie.
- Tworzenie, edycja, zmiana kolejności i usuwanie układów.
- Powtórzony element wymaga potwierdzenia i jest wyróżniony w edytorze.
- Usunięcie aktualnego układu lub elementu nie usuwa historycznych wykonań.

### Dziennik treningowy

- Dowolna liczba odrębnych treningów tego samego dnia.
- Tworzenie, edycja i usuwanie treningu oraz dowolnej liczby wejść.
- Czynności pojedynczych elementów, pełnych układów i wybranych fragmentów.
- Dodatni licznik powtórzeń z przyciskami i polem liczbowym.
- Domyślny rodzaj wykonania wejścia, osobny rodzaj czynności i osobne rodzaje elementów migawki układu.
- Ostrzeżenia o niezapisanych zmianach przy nawigacji i `beforeunload`.
- Formularz zachowuje stan po błędzie API, a komunikat sukcesu pojawia się po odpowiedzi serwera.

### Historia i statystyki

- Migawki zapisują kody, nazwy, kolejność, rodzaje wykonania, źródłowy układ, wersję i zakres.
- Zmiana kodu/nazwy elementu, rodzaju wykonania albo bieżącego szablonu nie aktualizuje dawnych zapisów.
- Ręczna edycja treningu zastępuje tylko wskazany trening i powoduje ponowne obliczenie agregacji.
- API oblicza łączną liczbę wejść i elementów, liczniki kodów, pełne układy, pełne układy zgodne z migawką oraz fragmenty dla dowolnego zakresu dat.
- Interfejs pokazuje agregacje dla ostatnich 7/30 dni i całej historii, ranking kodów oraz liczbę elementów w czasie.

### Profile trenerów — backend

- Konto może aktywować profil zawodnika i trenera w API.
- API tworzy 24-godzinne, jednorazowe zaproszenie zawierające token, krótki kod i dane obrazu QR.
- Zaproszenie może zainicjować zawodnik lub trener; przyjęcie wymaga zalogowania i aktywnych właściwych profili.
- Zawodnik może wskazać trenera głównego i usuwać połączenia, a trener może odłączyć zawodnika.
- Połączony trener ma endpointy tylko do odczytu treningów i statystyk zawodnika; dostęp przed połączeniem jest zabroniony.

### Dane demonstracyjne

- `npm run seed` tworzy konto `demo`, elementy, układ i trening tylko wtedy, gdy baza nie zawiera jeszcze użytkowników.
- Seeder nie nadpisuje istniejącej bazy. Dane logowania i ostrzeżenie bezpieczeństwa są opisane w README.

## Ograniczenia i funkcje pozostające do wykonania

### Ważne braki pierwszego prototypu

- Interfejs trenera, przełączanie profilu oraz ekrany tworzenia/przyjmowania zaproszeń nie są jeszcze dostępne; funkcje te istnieją tylko w REST API.
- Zarządzanie własnymi rodzajami wykonania (tworzenie, kolejność, ukrywanie) istnieje w API, ale nie ma jeszcze formularza w interfejsie.
- Edytor wejścia nie pozwala utworzyć nowego elementu bez opuszczenia treningu.
- Interfejs pozwala zmieniać rodzaje elementów migawki, lecz nie umożliwia jeszcze zmiany jej składu/kodów. Backend przyjmuje zmodyfikowaną migawkę.
- Nowy układ ma w bazie domyślny `slot_count=10`, ale edytor nie prezentuje dziesięciu pustych, jawnie regulowanych miejsc; użytkownik dodaje kolejne pozycje sekwencyjnie.
- Widok statystyk używa przedziałów kroczących 7 i 30 dni, a nie kalendarzowego tygodnia/miesiąca. Brakuje osobnej historii wybranego elementu.
- Bootstrap tworzy tabele dla nowej bazy, ale nie ma jeszcze wersjonowanych migracji aktualizujących istniejący schemat.

### Funkcje przyszłe

- Pełna procedura odzyskiwania konta, w tym niezależne uprawnienie pomocy trenera.
- PWA, offline i synchronizacja, import/eksport, kluby i grupy.
- Komentarze, cele, notatki, generator kodów, trudność/punktacja i zaawansowane filtry.
- Utwardzenie do publicznego wdrożenia: HTTPS, `Secure` cookie, polityka CORS/CSRF odpowiednia dla hostingu, kopie zapasowe, obserwowalność i przegląd bezpieczeństwa.

## Wyniki testów z 2026-09-25

| Polecenie | Wynik | Szczegóły |
|---|---|---|
| `npm test` | **PASS** | Vitest 5.0.1; 2 pliki, 8 testów |
| `npm run typecheck` | **PASS** | `shared`, `web` i `api` |
| `npm run build` | **PASS** | TypeScript oraz produkcyjny build Vite i API |
| `npm start` + smoke | **PASS** | na `PORT=3011`: `/api/health` 200 i `/` 200 z dokumentem AcroNote |
| `npm audit` | **PASS** | 0 znanych podatności według wyniku bieżącej sesji |

Automatyczne testy używają SQLite `:memory:`. Obejmują:

- pojedyncze i różne elementy oraz liczby powtórzeń;
- pełny układ, fragment, wielokrotne wykonanie i duplikaty kodów bez podwójnego liczenia;
- zachowanie migawki po zmianie/usunięciu źródłowego elementu, układu i rodzaju wykonania;
- edycję starego treningu i ponowne przeliczenie bez wpływu na drugi trening;
- sumowanie wielu treningów dnia oraz zakresu tygodniowego i miesięcznego;
- odrzucenie zerowej liczby powtórzeń;
- brak dostępu bez sesji i izolację danych dwóch użytkowników;
- odmowę dostępu trenera przed połączeniem oraz odczyt po jednorazowym zaproszeniu.

Testy nie pokrywają jeszcze wszystkich interakcji przeglądarkowych, interfejsu mobilnego, pełnego CRUD każdego zasobu ani migracji istniejącej bazy. Osiemnaście scenariuszy z `TEST_PLAN.md` jest częściowo grupowanych w obecnych testach, ale nie każdy ma osobny przypadek E2E.

## Znane błędy

- Nie wykryto błędu powodującego niepowodzenie testów, typechecku, builda lub podstawowego startu serwera.
- Znane luki funkcjonalne interfejsu są wymienione wyżej i nie powinny być przedstawiane jako ukończone.

## Następne zalecane zadanie

Rozszerzyć test przeglądarkowy o układ i zmodyfikowaną migawkę, a następnie dodać tworzenie elementu bezpośrednio z edytora wejścia oraz edycję składu historycznej migawki. Kolejnym etapem powinien być interfejs trenera, zaproszeń i zarządzania rodzajami wykonania.

W tej sesji ręcznie potwierdzono w przeglądarce produkcyjny frontend, logowanie, utworzenie elementu, zapis treningu, poprawne podsumowanie na liście, restart serwera oraz ponowne otwarcie treningu z pełnym wejściem i czynnością.
