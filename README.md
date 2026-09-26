# AcroNote

AcroNote to polskojęzyczny, responsywny dziennik treningów akrobatycznych na trampolinie. Aplikacja łączy frontend React/Vite, REST API Fastify i lokalną bazę SQLite w jednym monorepo npm.

> Dostępna jest kompletna, lokalna wersja dziennika zawodnika, profilu trenera tylko do odczytu oraz panelu administratora. Aktualny, zweryfikowany zakres opisuje [docs/PROGRESS.md](docs/PROGRESS.md).

## Wymagania

- Windows 10/11;
- Node.js 22 lub nowszy (zalecana aktualna wersja LTS);
- npm dostarczany z Node.js;
- nowoczesna przeglądarka.

SQLite działa jako biblioteka projektu — nie trzeba instalować osobnego serwera bazy danych. Node.js można pobrać z [nodejs.org](https://nodejs.org/).

## Instalacja

W PowerShell przejdź do katalogu projektu i zainstaluj lokalne zależności:

```powershell
cd "C:\Users\leemi\Documents\Visual Studio 2022\Projects\AcroNote"
npm install
```

Nie jest wymagana instalacja globalnych pakietów npm.

## Tryb deweloperski

Jedno polecenie uruchamia frontend i backend:

```powershell
npm run dev
```

Frontend deweloperski jest zwykle dostępny pod adresem `http://localhost:5173`, a API pod `http://127.0.0.1:3001`. Dokładny adres pokazują logi terminala. Oba procesy zatrzymasz skrótem `Ctrl+C`.

Migracje oraz utworzenie lokalnej bazy powinny wykonać się automatycznie przy starcie API.

## Build i uruchomienie lokalnego buildu

```powershell
npm run build
npm start
```

Po uruchomieniu buildu otwórz `http://localhost:3001`. Serwer domyślnie nasłuchuje na interfejsie lokalnym i nie wystawia aplikacji do Internetu.

Alternatywnie po wcześniejszym `npm install` można dwukrotnie kliknąć `start.bat`. Skrypt uruchamia zbudowaną aplikację; jeżeli build jeszcze nie istnieje, najpierw wykonaj `npm run build`.

## Testy i kontrola typów

```powershell
npm test
npm run typecheck
```

`npm test` uruchamia testy backendu i frontendu. Obejmują one migawki historyczne, statystyki lądowań, izolację danych, profil trenera, zaproszenia i zgody, administrację, migrację istniejącej bazy, seeder, parser kodów i klienta HTTP. Szczegółowy zakres znajduje się w [docs/TEST_PLAN.md](docs/TEST_PLAN.md).

## Dane demonstracyjne

Opcjonalny mechanizm danych demonstracyjnych uruchamia się jawnie:

```powershell
npm run seed
```

Seeder nie nadpisuje istniejących rekordów.

Seeder tworzy brakujące konta, nie zmieniając istniejących użytkowników ani ich haseł:

- `demo` / `AcroNote-demo-2026` — 30 zróżnicowanych elementów, dwa układy i historia treningów;
- `admin` / `AcroNote-admin-2026` — panel zarządzania kontami i ich danymi, bez dostępu do haseł, skrótów haseł i tokenów sesji.

Są to jawne dane startowe do lokalnych testów. Przed udostępnieniem aplikacji innym osobom zmień hasło administratora i nie traktuj konta demo jako prywatnego.

## Konfiguracja

Przykładowe wartości znajdują się w `.env.example`:

```dotenv
PORT=3001
HOST=127.0.0.1
DATABASE_PATH=./data/acronote.db
SESSION_SECRET=replace-with-a-long-random-value-in-production
```

Bieżący serwer odczytuje zmienne ze środowiska procesu; samo skopiowanie `.env.example` do `.env` nie ładuje ich automatycznie. Domyślne wartości wystarczają do lokalnego prototypu. Aby jawnie ustawić konfigurację w PowerShell przed startem, można użyć:

```powershell
$env:PORT = '3001'
$env:HOST = '127.0.0.1'
$env:DATABASE_PATH = './data/acronote.db'
npm start
```

`SESSION_SECRET` jest zarezerwowany dla konfiguracji bezpieczeństwa, ale bieżąca implementacja generuje losowe tokeny sesji i zapisuje ich skróty w bazie. Pliki `.env` z sekretami nie powinny trafić do repozytorium.

## Baza danych i kopie zapasowe

Domyślna baza znajduje się w `data/acronote.db`. Katalog `data` jest trwałą częścią projektu, ale pliki bazy — także w podkatalogu `data/backups` — są ignorowane przez Git. Migracja schematu uruchamia się automatycznie i zachowuje istniejące rekordy.

Przed ręcznym kopiowaniem bazy zatrzymaj aplikację. Przy wdrożeniu na serwerze katalog bazy musi znajdować się na trwałym dysku i podlegać regularnym kopiom zapasowym. Hosting wyłącznie plików statycznych nie wystarczy — aplikacja wymaga działającego procesu Node.js.

## Najważniejsze założenie danych historycznych

Wykonania układów są zapisywane jako niezależne migawki kodów, nazw, kolejności i miejsc lądowania. Dzięki temu późniejsza zmiana szablonu układu albo elementu nie powinna zmienić dawnych treningów i statystyk. Szczegóły zawiera [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Rozwiązywanie problemów

- **`npm` nie jest rozpoznawane:** zainstaluj Node.js 22+ i otwórz nowy terminal.
- **Brak `node_modules`:** uruchom `npm install` w głównym katalogu.
- **Brak buildu podczas `npm start`:** uruchom wcześniej `npm run build`.
- **Port 3001 lub 5173 jest zajęty:** zatrzymaj poprzedni proces albo zmień port w lokalnej konfiguracji.
- **Błąd bazy:** sprawdź uprawnienia zapisu do katalogu `data`; nie usuwaj istniejącej bazy bez kopii.

## Dokumentacja

- [Wymagania](docs/REQUIREMENTS.md)
- [Architektura](docs/ARCHITECTURE.md)
- [Plan testów](docs/TEST_PLAN.md)
- [Stan prac](docs/PROGRESS.md)

## Funkcje przyszłe

PWA i offline, import/eksport, kluby i grupy, komentarze trenera, cele, pomoc trenera w odzyskiwaniu konta, generator kodów oraz punktacja pozostają poza bieżącym zakresem.
