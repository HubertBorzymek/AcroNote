# AcroNote — wymagania

## Cel i zakres

AcroNote jest responsywnym, polskojęzycznym dziennikiem treningów akrobatycznych na trampolinie. W pierwszej kolejności ma umożliwiać zawodnikowi szybkie zapisywanie treningów na telefonie, trwałe przechowywanie danych lokalnie oraz wyliczanie statystyk z historycznie zapisanych wykonań.

Dokument rozróżnia wymagania bieżącego produktu od kierunków rozwoju. Faktyczny stan implementacji i weryfikacji znajduje się w [PROGRESS.md](PROGRESS.md).

## Priorytety jakościowe

- **Historyczna niezmienność:** zmiany bieżących elementów, układów i miejsc lądowania nie mogą zmieniać dawnych wykonań.
- **Poprawne statystyki:** obliczenia bazują na migawkach zapisanych czynności, nie na aktualnych szablonach.
- **Mobile first:** najczęstsze czynności muszą być wygodne do wykonania dotykiem bezpośrednio po zejściu z trampoliny.
- **Trwałość i bezpieczeństwo:** dane mają przetrwać restart; hasła nie mogą być przechowywane jawnie; separacja użytkowników musi być egzekwowana przez API.
- **Proste uruchomienie lokalne:** instalacja, tryb deweloperski, build, start i testy są dostępne z głównego katalogu.

## Wymagania funkcjonalne — zakres podstawowy

### Konta i profile

- **ACC-01:** użytkownik może utworzyć konto za pomocą unikalnej nazwy użytkownika i hasła; e-mail nie jest wymagany.
- **ACC-02:** użytkownik może się zalogować i wylogować, a sesja jest obsługiwana bezpiecznym ciasteczkiem.
- **ACC-03:** hasło jest przechowywane wyłącznie jako bezpieczny skrót.
- **ACC-04:** każde zapytanie do danych zawodnika jest autoryzowane po stronie serwera i ograniczone do właściwego użytkownika.
- **ACC-05:** po zalogowaniu użytkownik może zmienić hasło.
- **ACC-06:** konto może mieć profil zawodnika, trenera albo oba i przełączać się bez ponownego logowania.
- **ACC-07:** nazwa użytkownika może być imieniem i nazwiskiem ze spacją oraz polskimi znakami, np. `Łukasz Żółć`; typowe spacje z klawiatur mobilnych są normalizowane, a znaki nowej linii i znaki sterujące niedozwolone.

### Własne elementy

- **EL-01:** nowy zawodnik rozpoczyna z pustą listą elementów.
- **EL-02:** element zawiera kod, opcjonalną nazwę, oznaczenie ulubionego oraz stan aktywny/ukryty.
- **EL-03:** kod identyfikuje element na liście użytkownika; lista nie jest globalna.
- **EL-04:** użytkownik może tworzyć i edytować elementy oraz wyszukiwać po kodzie lub nazwie.
- **EL-05:** użytkownik może filtrować ulubione oraz ukrywać i przywracać elementy.
- **EL-06:** usunięcie lub ukrycie elementu nie usuwa jego historycznych wykonań ani nie zmienia statystyk.
- **EL-07:** element utworzony podczas edycji wejścia trafia na stałą listę użytkownika i może zostać od razu wybrany.
- **EL-08:** aplikacja waliduje i interpretuje kod wyłącznie na potrzeby filtrów; nie tworzy globalnego katalogu elementów ani nie dopisuje nazwy automatycznie.
- **EL-09:** kod kończy się `o`, `<` albo `/`; zawiera liczbę ćwiartek od 1 do 12 oraz dokładnie `max(1, floor(ćwiartki / 4))` cyfr opisujących półobroty śrub.
- **EL-10:** filtry obejmują liczbę salt, sumę śrub, kierunek wyliczony z parzystości sumy półobrotów oraz pozycję końcową.
- **EL-11:** te same filtry są dostępne na głównej liście oraz podczas wyboru istniejącego elementu do układu i wejścia treningowego.

### Układy

- **ROU-01:** użytkownik może tworzyć dowolną liczbę nazwanych układów z uporządkowaną listą elementów.
- **ROU-02:** nowy układ domyślnie oferuje 10 pozycji, a użytkownik może zmieniać ich liczbę, zawartość i kolejność.
- **ROU-03:** ten sam element może wystąpić wielokrotnie; ponowne dodanie wymaga potwierdzenia, a duplikaty są wyróżnione w edytorze.
- **ROU-04:** użytkownik może zapisać wykonanie całego układu lub dowolnego spójnego fragmentu.
- **ROU-05:** skład konkretnego wykonania można zmienić bez zmiany szablonu układu.
- **ROU-06:** powtórzenia o różnym składzie są zapisywane jako osobne czynności.
- **ROU-07:** zmiana lub usunięcie aktualnego szablonu nie narusza historii.
- **ROU-08:** szablon można edytować bezpośrednio podczas dodawania układu do treningu; zmiana dotyczy tego szablonu i przyszłych użyć, a nie zapisanych wcześniej migawek.

### Treningi, wejścia i czynności

- **TRN-01:** trening ma edytowalną datę kalendarzową, domyślnie dzisiejszą; wiele treningów tego samego dnia pozostaje odrębnymi obiektami.
- **TRN-02:** trening zawiera dowolną liczbę uporządkowanych wejść, które można później dodawać i edytować.
- **TRN-03:** wejście zawiera dowolną liczbę uporządkowanych czynności: pojedyncze elementy, pełne układy i fragmenty układów.
- **TRN-04:** każda czynność ma własną dodatnią liczbę powtórzeń, początkowo równą 1; wartość można zmieniać przyciskami lub polem liczbowym.
- **TRN-05:** czynności z liczbą powtórzeń mniejszą niż 1 nie są zapisywane.
- **TRN-06:** trening, wejście i czynność można poprawić po zapisaniu, także po długim czasie.
- **TRN-07:** zapis jest potwierdzany dopiero po sukcesie API; błąd zachowuje dane formularza i umożliwia ponowienie.
- **TRN-08:** formularz z niezapisanymi zmianami ostrzega przy nawigacji i, o ile pozwala przeglądarka, przy zamykaniu lub odświeżaniu karty.
- **TRN-09:** dla wykonania nadal istniejącej, niezmienionej wersji układu można skorygować wykonany zakres. Gdy źródłowy szablon usunięto lub zmieniono, aplikacja chroni migawkę i podpowiada usunięcie czynności oraz dodanie elementów pojedynczo.
- **TRN-10:** przy wielu wejściach edytor jednoznacznie pokazuje numer wejścia i sumaryczną liczbę wykonanych elementów; okna wyboru i edycji wskazują numer bieżącego wejścia.
- **TRN-11:** edytor pokazuje najnowsze wejścia na górze i umieszcza tam przycisk dodawania. Domyślnie widocznych jest pięć ostatnich wejść; starsze można odsłaniać po pięć, pokazać wszystkie, zwijać po pięć lub wrócić do samych pięciu ostatnich.

### Miejsca lądowania

- **EXE-01:** użytkownik otrzymuje miejsca lądowania „Siatka”, „Materac” i „Gąbki”.
- **EXE-02:** użytkownik może dodawać własne miejsca, zmieniać ich nazwy i kolejność oraz je ukrywać.
- **EXE-03:** domyślne miejsce wejścia jest kopiowane do nowo dodanej czynności, ale późniejsza zmiana wejścia nie modyfikuje tej czynności.
- **EXE-04:** miejsce czynności można nadpisać, a w wykonaniu układu można wskazać inne lądowanie każdego elementu.
- **EXE-05:** zmiana nazwy lub usunięcie miejsca nie zmienia zapisanej historii.
- **EXE-06:** statystyki pokazują rozkład miejsc lądowania łącznie i dla wybranego kodu, uwzględniając osobno elementy wewnątrz układów.

### Migawki historyczne

- **HIS-01:** wykonanie układu zapisuje niezależną migawkę rzeczywistej zawartości: kody i nazwy elementów, kolejność oraz miejsca lądowania.
- **HIS-02:** migawka zachowuje także źródłowy układ, jego nazwę i wybrany zakres z chwili zapisu.
- **HIS-03:** zmiany nazwy lub składu układu, kolejności pozycji oraz kodu lub nazwy elementu nie aktualizują dawnych migawek.
- **HIS-04:** ręczna edycja historycznej czynności zmienia wyłącznie tę czynność i jej statystyki.
- **HIS-05:** wartości domyślne są kopiowane w chwili tworzenia, a nie przechowywane jako dynamiczne zależności.

### Statystyki i historia

- **STA-01:** podsumowanie treningu pokazuje liczbę wejść, łączną liczbę elementów, liczbę wykonań każdego kodu, pełne układy i fragmenty.
- **STA-02:** statystyki dzienne sumują wszystkie odrębne treningi z tej samej daty.
- **STA-03:** podsumowania tygodniowe i miesięczne obejmują wejścia, elementy, poszczególne kody i wykonane układy.
- **STA-04:** historia elementu prezentuje wykonania w treningach oraz agregację tygodniową i miesięczną.
- **STA-05:** wykresy przedstawiają w czasie wybrany element, liczbę wejść i łączną liczbę elementów.
- **STA-06:** element zapisany osobno i w układzie jest liczony w obu miejscach; każde wystąpienie powtarzającego się kodu w układzie jest liczone.
- **STA-07:** fragment z `n` elementami wykonany `r` razy zwiększa sumę elementów o `n × r`.
- **STA-08:** układ nie jest doliczany drugi raz obok jego elementów do łącznej liczby elementów.
- **STA-09:** pełne wykonania zgodne z zapisaną wersją są rozróżniane od pełnych wykonań zmodyfikowanych i fragmentów.
- **STA-10:** statystyki są przeliczane z aktualnej treści historycznych czynności po ich świadomej edycji.

### Interfejs

- **UI-01:** interfejs jest po polsku, responsywny i projektowany przede wszystkim dla telefonu.
- **UI-02:** przyciski, liczniki i pola mają wygodne cele dotykowe i czytelne odstępy.
- **UI-03:** główna nawigacja obejmuje treningi/kalendarz, elementy, układy, statystyki oraz profil/ustawienia.
- **UI-04:** użytkownik może szybko wrócić do edytowanego wejścia i sprawnie dodawać elementy.
- **UI-05:** interfejs pozostaje funkcjonalny na komputerze; nie wymaga instalacji PWA.
- **UI-06:** użytkownik może wybrać jasny lub ciemny motyw; wybór jest zapamiętywany lokalnie, a zielony pozostaje kolorem głównym.

### Administracja

- **ADM-01:** dostęp do panelu wynika z roli zweryfikowanej po stronie API.
- **ADM-02:** administrator może tworzyć konta, zmieniać ich nazwę i rolę, ustawiać tymczasowe hasło, miękko usuwać i odzyskiwać konto.
- **ADM-03:** administrator może przeglądać elementy, układy i treningi konta oraz usuwać lub odzyskiwać elementy i układy; usunięcie treningu wymaga ostrzeżenia, ponieważ jest nieodwracalne.
- **ADM-04:** administrator nigdy nie otrzymuje aktualnego hasła, skrótu hasła ani tokenu sesji; reset hasła unieważnia istniejące sesje użytkownika.
- **ADM-05:** aktywny administrator nie może odebrać roli ani usunąć samemu sobie z poziomu panelu.

## Wymagania techniczne i operacyjne

- **OPS-01:** stos: React + TypeScript + Vite, Fastify + TypeScript oraz lokalny SQLite.
- **OPS-02:** projekt jest monorepo npm workspaces i nie wymaga zewnętrznego serwera bazy danych.
- **OPS-03:** `npm install` instaluje zależności, `npm run dev` uruchamia frontend i API, `npm run build` buduje całość, `npm start` uruchamia build, a `npm test` uruchamia testy.
- **OPS-04:** migracje i utworzenie pliku bazy wykonują się automatycznie.
- **OPS-05:** `start.bat` uruchamia aplikację na Windowsie albo informuje o konieczności instalacji zależności.
- **OPS-06:** serwer domyślnie nasłuchuje wyłącznie na adresie lokalnym.
- **OPS-07:** plik bazy znajduje się poza `node_modules` i katalogami tymczasowymi; baza, sekrety, artefakty builda i zależności nie trafiają do Git.
- **OPS-08:** mechanizm danych demonstracyjnych jest opcjonalny, jawnie uruchamiany i nie nadpisuje istniejących danych.
- **OPS-09:** docelowe środowisko serwerowe musi udostępniać Node.js oraz trwały zapis pliku SQLite; statyczny hosting bez procesu Node.js nie wystarczy.

## Profile trenerów i połączenia

- Konto może przełączać się między osobnym interfejsem zawodnika i trenera bez ponownego logowania.
- Zawodnik może mieć dowolną liczbę równorzędnych trenerów, a trener dowolną liczbę zawodników.
- Zawodnik może odłączyć trenera, co natychmiast odbiera dostęp; po połączeniu trener widzi całą historię.
- Użytkownik może wyłączyć i ponownie aktywować profil trenera. Wyłączenie natychmiast wstrzymuje dostęp, ale nie usuwa relacji z zawodnikami.
- Obie strony mogą inicjować zaproszenie linkiem, QR lub krótkim kodem, lecz zawodnik zawsze świadomie zatwierdza dostęp.
- Zaproszenia wygasają, a próby kodów są limitowane; sam link nie przyznaje dostępu.
- Zaimplementowany zakres nie obejmuje pomocy w odzyskiwaniu konta, komentarzy, celów ani grup klubowych.

## Poza bieżącym zakresem

Do przyszłego rozwoju pozostają: PWA, tryb offline i synchronizacja, import/eksport, kluby i grupy, komentarze trenerów, cele, notatki, generator oraz pełna interpretacja kodów, punktacja i trudność, analiza prób nieudanych, zaawansowane filtry statystyk i kompletne odzyskiwanie konta.

Nie należy tworzyć dla tych funkcji rozbudowanej infrastruktury przed ukończeniem i zweryfikowaniem podstawowego dziennika.
