# Plan testów AcroNote

## Cel

Testy mają potwierdzić rzeczywiste reguły zapisu i obliczeń, a nie jedynie to, że frontend się uruchamia. Najwyższy priorytet mają niezmienność historii, poprawność liczników oraz separacja danych użytkowników.

## Poziomy testów

- **Jednostkowe:** czyste funkcje agregacji statystyk, klasyfikacja pełnego/zmodyfikowanego układu i walidacja liczby powtórzeń.
- **Integracyjne API + SQLite:** operacje na tymczasowej bazie, migracje, transakcje, autoryzacja i odpowiedzi HTTP.
- **Komponentowe UI:** krytyczne formularze, liczniki, ostrzeżenie o niezapisanych zmianach i zachowanie danych po błędzie.
- **Smoke/E2E:** główna ścieżka od rejestracji do ponownego otwarcia zapisanego treningu.

Testy nie używają pliku `data/acronote.db`. Każdy zestaw integracyjny otrzymuje osobną bazę tymczasową i sprząta ją po zakończeniu.

## Krytyczne scenariusze automatyczne

| ID | Scenariusz | Oczekiwany wynik |
|---|---|---|
| T01 | Utworzenie elementu i dodanie do wejścia | Czynność ma migawkę kodu/nazwy i jest widoczna po ponownym odczycie |
| T02 | Kilka różnych elementów w jednym wejściu | Kolejność i niezależne liczniki są zachowane |
| T03 | Powtórzenia 1, 3 i wartość wpisana ręcznie | API zapisuje wartości dodatnie; odrzuca 0 i liczby ujemne |
| T04 | Pełny układ i fragment | Obie czynności mają prawidłowy zakres i migawkę |
| T05 | Wielokrotne wykonanie fragmentu | Każdy element fragmentu jest liczony razy liczba powtórzeń |
| T06 | Zmodyfikowane wykonanie układu | Zapisany skład różni się od szablonu bez zmiany szablonu |
| T07 | Podliczenie elementów układu | Suma odpowiada liczbie pozycji migawki razy powtórzenia |
| T08 | Ten sam kod dwa razy w układzie | Oba wystąpienia zwiększają licznik |
| T09 | Brak podwójnego liczenia | Łączna liczba elementów nie dolicza „układu” obok jego pozycji |
| T10 | Zmiana aktualnego szablonu | Odczyt i statystyki starszego treningu pozostają bez zmian |
| T11 | Zmiana kodu/nazwy elementu | Starsza migawka zachowuje dawny kod i nazwę |
| T12 | Zmiana miejsca lądowania wejścia | Wcześniejsza czynność zachowuje skopiowane miejsce |
| T13 | Edycja historycznej migawki | Zmienia się tylko wskazana czynność, nie szablon ani inne treningi |
| T14 | Statystyki po edycji historii | Agregacja odzwierciedla nową treść bez pozostawienia starego wyniku |
| T15 | Kilka treningów jednego dnia | Podsumowanie dnia sumuje je, zachowując odrębne treningi |
| T16 | Tydzień i miesiąc | Granice okresu i agregacje są prawidłowe |
| T17 | Ukrycie/usunięcie elementu | Historia oraz jej statystyki pozostają dostępne |
| T18 | Zmiana/usunięcie układu | Historyczna migawka pozostaje kompletna |
| T19 | Walidacja kodów i metadane filtrów | Poprawne kody są klasyfikowane, skróty i niejednoznaczne kody odrzucane |
| T20 | Puste DELETE w kliencie | Żądanie nie wysyła nagłówka JSON bez ciała |
| T21 | Migracja istniejącej bazy | Rekordy pozostają, a nowe kolumny i „Siatka” są dodane idempotentnie |
| T22 | Seeder na niepustej bazie | Dodaje tylko brakujące `demo`/`admin`, nie zmienia innych kont i jest idempotentny |
| T23 | Administracja | Rola jest wymagana; operacje nie ujawniają haseł/tokenów; reset unieważnia sesje |
| T24 | Lądowania w układzie | `41o` na siatkę i `800o` na materac trafiają do właściwych agregacji i filtra kodu |
| T25 | Zaproszenie trener–zawodnik | Utworzenie + akceptacja tworzą relację; własne, wygasłe, anulowane i ponownie użyte zaproszenia są odrzucane |
| T26 | Uprawnienia trenera | Połączony trener widzi wszystkie zasoby tylko do odczytu; obcy i zapis otrzymują odmowę |
| T27 | Odłączenie/profil | Odłączenie lub wyłączenie profilu natychmiast odbiera dostęp bez usunięcia historii |
| T28 | Zapis w trakcie treningu | „Zapisz i kontynuuj” publikuje bieżące wejścia i kolejne PUT są widoczne po odświeżeniu trenera |
| T29 | Dane demo trenera | Seeder tworzy `trener_demo`, łączy go z `demo` i pozostaje idempotentny |
| T30 | Wyłączenie profilu trenera | Dostęp znika od razu, relacja pozostaje, a reaktywacja przywraca odczyt |
| T31 | Motyw | Jawny wybór jasny/ciemny ma pierwszeństwo, a pierwszy start respektuje ustawienie urządzenia |
| T32 | Nazwa użytkownika ze spacją | Rejestracja, logowanie i administracja akceptują `Maria Kowalska`, normalizują nadmiarowe spacje i odrzucają nową linię |
| T33 | Filtry we wszystkich selektorach | Ulubione, salta, śruby, kierunek i pozycja dają ten sam wynik na liście, w układzie i w wejściu |
| T34 | Korekta zakresu układu | Niezmieniony szablon pozwala skrócić wykonanie; nowsza/usunięta wersja blokuje przebudowę i zachowuje migawkę |
| T35 | Ponowny zapis historycznego treningu | Wersja źródłowa i elementy migawki pozostają bez zmian po aktualizacji bieżącego szablonu |
| T36 | Dane demonstracyjne wielu wejść | Seeder idempotentnie zapewnia trening demo z pięcioma różnymi wejściami, układami, fragmentem i różnymi lądowaniami |

## Konta i uprawnienia

Po wdrożeniu uwierzytelniania obowiązkowe są co najmniej:

- rejestracja haszuje hasło, a logowanie poprawnym hasłem ustanawia sesję;
- błędne dane nie ujawniają skrótu hasła ani nadmiarowych informacji;
- niezalogowany klient nie odczytuje chronionych zasobów;
- użytkownik A nie może odczytać, zmienić ani usunąć elementów, układów i treningów użytkownika B, również po ręcznej podmianie identyfikatora w URL/body;
- trener bez aktywnego połączenia nie widzi historii zawodnika;
- połączony trener ma odczyt, ale każda próba zapisu kończy się odmową;
- odłączenie natychmiast odbiera dostęp;
- samo otwarcie zaproszenia nie udostępnia danych.

## Kontrole manualne UI

Na telefonowym rozmiarze widoku należy sprawdzić:

1. rejestrację/logowanie i nawigację po głównych sekcjach;
2. utworzenie elementu z samego formularza wejścia i poprawny powrót;
3. obsługę `+`, `−` oraz klawiatury ekranowej;
4. ostrzeżenie po próbie opuszczenia brudnego formularza oraz działanie „Zapisz”, „Odrzuć” i „Zostań”;
5. zachowanie formularza po symulowanym błędzie API;
6. czy sukces pojawia się dopiero po odpowiedzi API;
7. czy główne cele dotykowe nie są zbyt małe i nie nakładają się;
8. widok desktopowy bez poziomego przewijania głównych ekranów.
9. filtry elementów, pusty stan zakładki „Ukryte” i przywracanie elementu;
10. obecność obu wykresów i historii wybranego elementu;
11. panel administratora na koncie z rolą `admin`, bez wyświetlania danych logowania.
12. aktywację i przełączanie profilu trenera bez wylogowania;
13. zaproszenie w obu kierunkach przez kod oraz link/QR, podgląd nadawcy i zgodę zawodnika;
14. pełny podgląd zawodnika tylko do odczytu oraz utratę dostępu po odłączeniu;
15. rozkład miejsc lądowania ogółem i dla kodu, również w układzie `41o + 800o`.
16. jasny i ciemny motyw na desktopie i telefonie, w tym zapamiętanie wyboru po odświeżeniu;
17. wyłączenie profilu trenera po potwierdzeniu i możliwość ponownej aktywacji bez utraty połączeń.
18. pełne filtry w wyborze elementu do wejścia, układu i edytowanego szablonu;
19. czytelne numery i liczniki przy co najmniej pięciu wejściach;
20. zmianę zakresu wykonania układu oraz komunikat po zmianie wersji jego szablonu.

## Macierz przeglądarek

Minimalna kontrola: aktualny Chromium na Windowsie oraz emulowany rozmiar popularnego telefonu. Przed publicznym wdrożeniem należy dodać aktualny Firefox i Safari/iOS.

## Warunki wydania lokalnego prototypu

- `npm test`, `npm run typecheck` i `npm run build` kończą się powodzeniem;
- migracje działają na pustej bazie;
- zapisane dane są dostępne po restarcie;
- scenariusze T01–T18 odpowiadają zaimplementowanemu zakresowi, a brakujące testy są jawnie wymienione w `PROGRESS.md`;
- nie ma znanego błędu naruszającego migawki historyczne lub separację użytkowników;
- baza, pliki `.env`, `node_modules`, build i coverage nie są śledzone przez Git.
