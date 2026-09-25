# AcroNote — dziennik implementacji

Ten plik jest operacyjnym punktem wejścia dla kolejnych agentów. Przed zmianami należy przeczytać `README.md`, `docs/REQUIREMENTS.md`, `docs/ARCHITECTURE.md`, `docs/PROGRESS.md`, `docs/TEST_PLAN.md` oraz ten dokument. Po każdej sesji trzeba uzupełnić stan, decyzje, testy i nierozwiązane problemy.

## Cel bieżącej iteracji

Dostarczyć kompletną i sprawdzoną wersję dziennika zawodnika. Profil trenera pozostaje poza zakresem UI. W zakresie są: naprawa całego CRUD elementów i układów, tworzenie elementu podczas edycji wejścia, bezpieczne cofanie z możliwością zapisu, prosty język dla dzieci, filtry kodów, ściągawka kodowania, wykresy, rozbudowane konto demonstracyjne oraz osobna rola administratora bez dostępu do haseł, skrótów haseł i tokenów sesji.

## Reguły domenowe doprecyzowane 2026-09-25

- Kod kończy się pozycją: `o` — kuczna, `<` — łamana, `/` — prosta.
- Początkowa liczba oznacza liczbę ćwiartek salta: `4` = jedno salto, `8` = dwa, `12` = trzy. Wartość niepodzielna przez 4 oznacza wykonanie nie z nóg na nogi.
- Po liczbie ćwiartek występuje dokładnie tyle cyfr śrub, ile pełnych salt zawiera element. Każda cyfra liczy półobroty: `1` = 0,5 śruby, `2` = 1 śruba itd.
- Przykłady: `800` = dwa salta bez śrub, `801` = pół śruby w drugim salcie, `831` = 1,5 śruby w pierwszym i 0,5 w drugim.
- Kierunek filtrowania wynika z sumy śrub: całkowita liczba = tył, niecałkowita = przód.
- Parser ma być zachowawczy: nie może interpretować niejednoznacznego kodu jako poprawnego. Walidacja formularza powinna podawać prostą przyczynę i przykład.
- Domyślny rodzaj wykonania nazywa się `Siatka` (historyczne migawki zachowują dawną nazwę).

## Zgłoszone błędy i oczekiwane zachowanie

| Obszar | Problem | Oczekiwane rozwiązanie | Stan |
|---|---|---|---|
| Edytor treningu | Nie można utworzyć elementu z wyboru elementów | Przycisk „Dodaj nowy element”, formularz w kontekście i powrót do wyboru bez utraty treningu | w toku |
| Cofanie | Jest tylko pytanie o odrzucenie zmian | Dialog z trzema decyzjami: zapisz, odrzuć, zostań | w toku |
| Elementy | DELETE wysyła pusty JSON i kończy się błędem Fastify | Żądania bez ciała nie ustawiają `Content-Type`; usuwanie działa | w toku |
| Elementy | Ukrywanie wysyła niepełny model i backend odrzuca kod | Aktualizacja pobiera/scala pełny rekord lub API obsługuje PATCH | w toku |
| Ukryte | Pusty stan mówi „dodaj pierwszy element” | Osobny komunikat: brak ukrytych elementów, z możliwością powrotu | w toku |
| Układy | Usuwanie ma analogiczny błąd pustego JSON | Naprawa klienta i test CRUD | w toku |
| Usuwanie elementu | Pytanie o układy pojawia się zawsze | Pytać tylko, gdy element faktycznie występuje w aktywnym układzie | w toku |
| Język UI | „Elementy w zapisanej migawce” jest techniczne | Proste „Jak wykonano elementy układu” i krótkie wyjaśnienie | w toku |
| Statystyki | Wykresy niewidoczne/nieoczywiste | Widoczne, opisane wykresy elementów, wejść i wybranego kodu | w toku |

## Plan realizacji

1. Audyt kontraktu HTTP oraz pełnego CRUD.
2. Parser kodów, walidacja, filtry i ściągawka.
3. Poprawa przepływów edycji treningu i prostoty tekstów.
4. Konto demo z około 30 zróżnicowanymi elementami, dwoma układami i historią treningów.
5. Rola administratora i bezpieczny panel administracyjny.
6. Rozszerzenie testów automatycznych, pełny build, czysta baza i testy przeglądarkowe desktop/mobile.
7. Aktualizacja całej dokumentacji i lokalne commity etapami.

## Decyzje bezpieczeństwa

- Administrator nie otrzymuje endpointu zwracającego `password_hash`, tokeny sesji ani surowe tokeny zaproszeń.
- Administrator może ustawić użytkownikowi tymczasowe hasło, ale API zwraca je tylko w odpowiedzi na świadomą operację; dotychczasowego hasła nie da się odczytać.
- Operacje administracyjne są autoryzowane rolą zapisaną w bazie, nie nazwą użytkownika po stronie frontendu.
- Usuwanie kont będzie miękkie lub blokowane, jeśli bezpieczne odzyskanie nie jest jeszcze wdrożone.

## Przebieg prac

### 2026-09-25 — rozpoczęcie iteracji jakościowej

- Przeanalizowano pięć zrzutów i opis użytkownika.
- Potwierdzono czysty stan Git na `edd7471`.
- Utworzono ten dziennik przed zmianami kodu.
- Uruchomiono równoległy audyt backendu oraz interfejsu w rozłącznych katalogach.

## Wyniki testów

Do uzupełnienia po implementacji.

## Znane problemy

Lista startowa znajduje się w tabeli powyżej. Każdy nowy błąd należy dopisać przed naprawą, aby kolejny agent znał przyczynę zmiany.
