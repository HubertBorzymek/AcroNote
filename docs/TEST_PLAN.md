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
| T12 | Zmiana rodzaju wejścia | Wcześniejsza czynność zachowuje skopiowany rodzaj |
| T13 | Edycja historycznej migawki | Zmienia się tylko wskazana czynność, nie szablon ani inne treningi |
| T14 | Statystyki po edycji historii | Agregacja odzwierciedla nową treść bez pozostawienia starego wyniku |
| T15 | Kilka treningów jednego dnia | Podsumowanie dnia sumuje je, zachowując odrębne treningi |
| T16 | Tydzień i miesiąc | Granice okresu i agregacje są prawidłowe |
| T17 | Ukrycie/usunięcie elementu | Historia oraz jej statystyki pozostają dostępne |
| T18 | Zmiana/usunięcie układu | Historyczna migawka pozostaje kompletna |

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
4. ostrzeżenie po próbie opuszczenia brudnego formularza;
5. zachowanie formularza po symulowanym błędzie API;
6. czy sukces pojawia się dopiero po odpowiedzi API;
7. czy główne cele dotykowe nie są zbyt małe i nie nakładają się;
8. widok desktopowy bez poziomego przewijania głównych ekranów.

## Macierz przeglądarek

Minimalna kontrola: aktualny Chromium na Windowsie oraz emulowany rozmiar popularnego telefonu. Przed publicznym wdrożeniem należy dodać aktualny Firefox i Safari/iOS.

## Warunki wydania lokalnego prototypu

- `npm test`, `npm run typecheck` i `npm run build` kończą się powodzeniem;
- migracje działają na pustej bazie;
- zapisane dane są dostępne po restarcie;
- scenariusze T01–T18 odpowiadają zaimplementowanemu zakresowi, a brakujące testy są jawnie wymienione w `PROGRESS.md`;
- nie ma znanego błędu naruszającego migawki historyczne lub separację użytkowników;
- baza, pliki `.env`, `node_modules`, build i coverage nie są śledzone przez Git.
