# Architektura AcroNote

## Kontekst systemu

AcroNote jest lokalnie uruchamianą aplikacją webową typu monolit modularny. Przeglądarka komunikuje się z REST API Fastify, a API jako jedyna warstwa uzyskuje dostęp do SQLite. Taki układ pozostaje prosty w rozwoju lokalnym i może zostać później wdrożony na serwerze klubu obsługującym Node.js i trwały dysk.

```text
Przeglądarka (React/Vite)
          │ HTTP / JSON
          ▼
       Fastify API
          │ zapytania + transakcje
          ▼
     SQLite (lokalny plik)
```

## Organizacja repozytorium

Projekt używa npm workspaces:

```text
AcroNote/
├── apps/
│   └── api/              # Fastify, SQLite, migracje, logika domenowa, testy
├── packages/
│   ├── shared/           # współdzielone kontrakty TypeScript
│   └── web/              # React, Vite, responsywny interfejs
├── data/                 # lokalna baza; ignorowana przez Git
├── docs/                 # wymagania, architektura, postęp i plan testów
├── .env.example
├── package.json          # skrypty orkiestrujące workspace'y
└── start.bat
```

Frontend nie uzyskuje bezpośredniego dostępu do bazy. Pakiet `shared` powinien zawierać wyłącznie stabilne typy/kontrakty przydatne po obu stronach, bez logiki zależnej od przeglądarki albo SQLite.

## Uruchamianie

- `npm run dev` uruchamia API i serwer Vite równolegle.
- `npm run build` buduje `shared`, `web` i `api` w wymaganej kolejności.
- `npm start` uruchamia zbudowane API; w trybie produkcyjnym API serwuje również statyczny build frontendu.
- `npm test` uruchamia testy API, logiki biznesowej oraz krytycznych funkcji frontendu.
- `npm run seed` opcjonalnie dodaje dane demonstracyjne bez nadpisywania istniejących danych.
- `npm run typecheck` sprawdza wszystkie workspace'y bez generowania plików.

Domyślne ustawienia środowiska opisuje `.env.example`. Serwer ma domyślnie używać `127.0.0.1`, aby aplikacja nie została przypadkowo udostępniona w sieci. Plik `data/acronote.db` nie jest wersjonowany.

## Warstwy backendu

Backend jest podzielony według odpowiedzialności:

1. **HTTP/routes** — walidacja granicy systemu, odczyt sesji, mapowanie odpowiedzi i kodów błędów.
2. **Domena/services** — reguły zapisu treningu, tworzenie migawek, autoryzacja zasobów i statystyki.
3. **Persistence/database** — połączenie SQLite, migracje, transakcje i zapytania.

Reguły historycznej niezmienności i statystyk nie powinny być duplikowane w komponentach React. API jest źródłem prawdy; frontend odpowiada za formularze, lokalny stan niezapisanych danych i prezentację odpowiedzi.

## Model danych

Nazwy fizycznych tabel mogą ewoluować, lecz model logiczny obejmuje:

- **users / sessions** — tożsamość, rola, stan miękkiego usunięcia, skrót hasła i sesje;
- **users** przechowują niezależne flagi aktywnego profilu zawodnika i trenera; jedno konto może mieć oba;
- **elements** — bieżąca, prywatna lista elementów zawodnika;
- **execution_types** — prywatne miejsca lądowania i ich kolejność (nazwa techniczna zachowana dla kompatybilności);
- **routines / routine_items** — aktualne szablony układów i uporządkowane pozycje;
- **trainings** — odrębne treningi przypisane do daty i właściciela;
- **entries** — uporządkowane wejścia należące do treningu;
- **activities** — uporządkowane czynności elementowe lub układowe z liczbą powtórzeń;
- **activity_elements** — uporządkowane, historyczne migawki elementów składających się na czynność układową;
- **coach_links / invitations** — aktywne relacje trener–zawodnik oraz ograniczone czasowo zaproszenia.

Każda tabela z danymi użytkownika jest powiązana z właścicielem bezpośrednio lub przez nadrzędny zasób. API nie ufa identyfikatorowi przekazanemu przez klienta: przed odczytem lub zmianą weryfikuje właściciela na podstawie sesji.

## Historyczna niezmienność

To centralna decyzja architektoniczna. Identyfikator aktualnego elementu lub układu służy jedynie jako opcjonalna informacja o źródle. Historyczny zapis przechowuje skopiowane wartości potrzebne do samodzielnego odtworzenia wykonania.

Dla pojedynczego elementu migawka obejmuje co najmniej kod, opcjonalną nazwę oraz miejsce lądowania. Dla układu czynność przechowuje:

- identyfikator i nazwę źródłowego układu z chwili zapisu;
- początek i koniec wybranego zakresu oraz informację, czy zakres był pełny;
- liczbę powtórzeń i domyślne miejsce lądowania czynności;
- uporządkowaną listę elementów z kodem, nazwą, pozycją i indywidualnym miejscem lądowania;
- informację pozwalającą rozpoznać wykonanie zmodyfikowane względem zapisanej wersji.

Identyfikatory źródłowe mogą być puste po usunięciu encji i nie są wymagane do statystyk. Zmiana szablonu nie uruchamia aktualizacji dawnych `activities` ani `activity_elements`. Edycja starego wykonania zastępuje wyłącznie wskazaną migawkę, najlepiej w jednej transakcji.

## Miejsca lądowania jako wartości kopiowane

Domyślne miejsce lądowania wejścia jest wartością startową formularza. Podczas utworzenia czynności jego identyfikator i nazwa są kopiowane. Analogicznie ustawienie czynności jest kopiowane do nowych elementów migawki. Każda pozycja układu może mieć inne miejsce, np. `41o` na siatkę i następujące `800o` na materac. Późniejsze zmiany ustawień nadrzędnych nie propagują się wstecz.

Przechowanie historycznej nazwy obok opcjonalnego identyfikatora zabezpiecza zapis przed zmianą nazwy lub usunięciem miejsca z bieżącej listy. Fizyczne nazwy `execution_types`, `execution_type_id` i `execution_type_name` pozostają bez zmian dla kompatybilności migracji.

## Statystyki

Statystyki są wyprowadzane z zapisanych czynności i ich migawek:

- czynność pojedynczego elementu wnosi `repetitions` wykonań jego kodu;
- czynność układowa wnosi po `repetitions` dla każdego wystąpienia elementu w migawce;
- łączna liczba elementów dla układu to `liczba elementów migawki × repetitions`;
- liczba wejść jest liczona niezależnie od liczby czynności;
- pełne układy, pełne zmodyfikowane wykonania i fragmenty są klasyfikowane z danych zapisanych w czynności, a nie z aktualnego szablonu.
- statystyki miejsc lądowania liczą pojedyncze elementy bezpośrednie i każdą pozycję migawki układu osobno; można je filtrować po kodzie.

Agregacje dzienne, tygodniowe i miesięczne używają daty kalendarzowej treningu. Na obecnym etapie obliczenia mogą być wykonywane zapytaniem na żądanie; materializowane statystyki byłyby przedwczesną optymalizacją i utrudniałyby poprawną edycję historii.

Oś czasu agreguje wiele treningów tej samej daty do jednego punktu. Opcjonalny filtr elementu uwzględnia jego wystąpienia bezpośrednie oraz wszystkie pozycje zapisanych migawek układów, w tym duplikaty.

## Frontend

Frontend organizuje widoki według zadań użytkownika: treningi, elementy, układy, statystyki i profil. Stan serwerowy pochodzi z REST API, natomiast stan niezapisanego formularza pozostaje lokalny do momentu potwierdzonego zapisu.

Formularze edycyjne powinny:

- zachowywać dane po błędzie API;
- oznaczać stan „brudny” i blokować przypadkową nawigację;
- używać `beforeunload` wyłącznie jako zabezpieczenia zamknięcia/odświeżenia;
- nie pokazywać sukcesu przed odpowiedzią serwera;
- udostępniać duże cele dotykowe i poprawne etykiety pól.

## Bezpieczeństwo

- Hasła są haszowane algorytmem przeznaczonym do haseł; nigdy nie są logowane ani zwracane przez API.
- Sesja jest identyfikowana ciasteczkiem `HttpOnly`; w środowisku produkcyjnym wymaga również `Secure` i odpowiedniego `SameSite`.
- Sekret sesji pochodzi ze środowiska i nie jest umieszczany w repozytorium.
- Walidacja danych odbywa się po stronie API, niezależnie od walidacji interfejsu.
- Wszystkie zapytania danych użytkownika filtrują po właścicielu. Endpointy trenera dodatkowo wymagają aktywnego profilu i bieżącej relacji `coach_links`; udostępniają wyłącznie metody GET.
- Krótkie kody zaproszeń mają czas wygaśnięcia, limit prób i wymagają jawnej akceptacji obu stron oraz świadomej zgody zawodnika.

## Schemat bazy i transakcje

Przy uruchomieniu API implementacja tworzy brakujące tabele i wykonuje idempotentne migracje. V2 dodaje rolę, stan usunięcia użytkownika i metadane kodu oraz zmienia bieżącą nazwę „Na płasko” na „Siatka”. V3 rozszerza zaproszenia o datę utworzenia, odbiorcę akceptacji i anulowanie. Historyczne migawki nie są przepisywane.

Zmiany obejmujące trening, czynności i elementy migawki są wykonywane transakcyjnie, aby przerwany zapis nie pozostawił częściowych danych. SQLite ma włączone klucze obce i tryb WAL.

## Granice wdrożenia

Build może działać na komputerze lokalnym lub serwerze klubu, ale wymaga procesu Node.js i trwałego, regularnie kopiowanego pliku SQLite. Hosting wyłącznie statyczny nie uruchomi API. Bieżąca konfiguracja nie jest deklaracją gotowości do publicznego Internetu: przed zewnętrznym wdrożeniem wymagane są HTTPS, silny sekret, kopie zapasowe, kontrola pochodzenia żądań, limity prób logowania i przegląd bezpieczeństwa.

Profil trenera wykorzystuje te same mapowania treningów i statystyk co profil zawodnika. Połączenie wymaga dwóch świadomych działań: utworzenie zaproszenia jest zgodą twórcy, a druga osoba podgląda nadawcę i jawnie je akceptuje. Gdy zaprasza trener, zawodnik dodatkowo zaznacza zgodę na udostępnienie całej historii. Zaproszenie ma krótki kod, link i QR, wygasa, może zostać anulowane i jest atomowo zużywane tylko raz. Odłączenie lub wyłączenie profilu natychmiast unieważnia dostęp.

## Świadomie odłożone decyzje

Synchronizacja offline, PWA, kluby, import/eksport, rozbudowane filtry i pełny mechanizm odzyskiwania kont nie są obecnie projektowane w szczegółach. Pozostawienie prostych granic modułów i kompletnych migawek historycznych daje możliwość ich późniejszego dodania bez budowania przedwczesnej infrastruktury.
