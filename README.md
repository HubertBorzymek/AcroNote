<div align="center">

# 🤸 AcroNote

**Dziennik treningów akrobatycznych na trampolinie — prosty, szybki, po polsku.**

Zapisuj wejścia, elementy i układy, sprawdzaj gdzie lądujesz i śledź postępy.
Trener widzi Twoje treningi tylko do odczytu, a wszystko działa lokalnie na Twoim komputerze.

![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Fastify](https://img.shields.io/badge/Fastify-5-000000?logo=fastify&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-lokalnie-003B57?logo=sqlite&logoColor=white)

</div>

---

## 🚀 Szybki start (jedno kliknięcie)

1. Zainstaluj **[Node.js 22 lub nowszy](https://nodejs.org/)** (wystarczy wersja LTS).
2. Pobierz projekt:
   ```powershell
   git clone https://github.com/HubertBorzymek/AcroNote.git
   ```
3. Kliknij dwukrotnie **`start.bat`**.

To wszystko. Skrypt sam:

- ✅ sprawdzi, czy masz Node.js,
- 📦 zainstaluje zależności (przy pierwszym uruchomieniu i po aktualizacji),
- 🔨 zbuduje aplikację,
- 🌐 uruchomi serwer i otworzy przeglądarkę pod **http://localhost:3001**.

Jeśli AcroNote już działa, `start.bat` tylko otworzy przeglądarkę. Aby zatrzymać aplikację, zamknij okno konsoli.

> 💡 Pierwsze uruchomienie trwa chwilę (instalacja pakietów). Kolejne zajmują kilka sekund.

## ✨ Co potrafi

| | |
|---|---|
| 📝 **Treningi** | Wejścia z elementami i układami, liczba powtórzeń, miejsce lądowania dla każdego elementu. Długie treningi są zwijane — najnowsze wejścia na górze. |
| 🧩 **Elementy** | Katalog w pełnej notacji (np. `800o`, `831<`, `42/`) z automatycznym rozpoznaniem ćwiartek, salt, śrub, kierunku i pozycji. Ulubione, ukryte, filtry. |
| 🔗 **Układy** | Szablony z dowolną liczbą elementów. Możesz zapisać cały układ albo fragment (np. 3–7). |
| 📊 **Statystyki** | Suma elementów, rozkład lądowań (siatka / materac / gąbki), historia konkretnego elementu w tygodniach i miesiącach. |
| 🧑‍🏫 **Profil trenera** | Połączenie przez kod, link lub QR, za świadomą zgodą. Trener tylko czyta dane zawodnika. |
| 🛡️ **Administrator** | Zarządzanie kontami i danymi, bez dostępu do haseł i sesji. |
| 🌙 **Tryb ciemny** | Domyślnie zgodny z systemem, zapamiętywany w przeglądarce. |

**Najważniejsza zasada:** każdy zapisany trening przechowuje własną *migawkę* kodów, nazw i lądowań. Gdy później zmienisz element albo układ, dawne treningi i statystyki zostaną bez zmian.

## 👤 Konta demonstracyjne

Wypełnij bazę przykładowymi danymi poleceniem `npm run seed` (nie nadpisuje istniejących kont):

| Login | Hasło | Do czego |
|---|---|---|
| `demo` | `AcroNote-demo-2026` | zawodnik z 30 elementami, układami i historią |
| `trener_demo` | `AcroNote-trener-2026` | trener połączony z `demo` (wybierz profil „Trener”) |
| `admin` | `AcroNote-admin-2026` | panel administratora |

> ⚠️ To jawne hasła do lokalnych testów. Zmień hasło `admin`, zanim udostępnisz aplikację komukolwiek.

## 🛠️ Dla programistów

Monorepo npm z trzema pakietami:

```
apps/api         REST API — Fastify + better-sqlite3
packages/web     interfejs — React + Vite
packages/shared  wspólny parser kodów elementów
data/            lokalna baza SQLite (ignorowana przez Git)
docs/            wymagania, architektura, plan testów, stan prac
```

| Polecenie | Opis |
|---|---|
| `npm install` | instalacja zależności |
| `npm run dev` | tryb deweloperski z hot-reload: frontend `http://localhost:5173`, API `http://127.0.0.1:3001` |
| `npm run build` | build produkcyjny |
| `npm start` | uruchomienie buildu pod `http://localhost:3001` |
| `npm test` | testy API i frontendu (Vitest) |
| `npm run typecheck` | kontrola typów TypeScript |
| `npm run seed` | dane demonstracyjne |

Przed commitem uruchom komplet kontroli z [AGENTS.md](AGENTS.md): `npm test`, `npm run typecheck`, `npm run build`, `npm audit --audit-level=moderate`.

### ⚙️ Konfiguracja

Domyślne ustawienia wystarczą. Aby je zmienić, skopiuj `.env.example` do `.env` — `npm start` i `start.bat` wczytają go automatycznie:

```dotenv
PORT=3001
HOST=127.0.0.1
DATABASE_PATH=./data/acronote.db
```

`start.bat` otwiera przeglądarkę pod portem 3001 — jeśli zmienisz `PORT`, otwórz adres ręcznie.

### 📱 Test na telefonie w domowym Wi-Fi

1. Sprawdź adres IPv4 komputera poleceniem `ipconfig`, np. `192.168.1.50`.
2. W `.env` ustaw `HOST=192.168.1.50` i uruchom `start.bat`.
3. Na telefonie w tym samym Wi-Fi otwórz `http://192.168.1.50:3001`.

Gdy Windows zapyta o zaporę, zezwól Node.js **tylko w sieci prywatnej**. Połączenie używa zwykłego HTTP, więc nie korzystaj z tego trybu w publicznym Wi-Fi i nie przekierowuj portu na routerze.

## 💾 Baza danych i kopie

Dane są w `data/acronote.db` (razem z plikami `-wal` i `-shm`). Migracje wykonują się automatycznie przy starcie i zachowują istniejące rekordy. Aby zrobić kopię, **zatrzymaj aplikację** i skopiuj wszystkie trzy pliki `acronote.db*`, np. do `data/backups/`. Pliki baz nie trafiają do repozytorium.

## 🩺 Gdy coś nie działa

- **„Nie znaleziono Node.js”** — zainstaluj Node.js 22+ i uruchom `start.bat` ponownie.
- **Port 3001 zajęty przez inny program** — ustaw inny `PORT` w `.env`.
- **Dziwne błędy po przeniesieniu folderu** — usuń katalog `node_modules` i uruchom `start.bat` (zależności zainstalują się od nowa).
- **Błąd bazy** — sprawdź uprawnienia zapisu do `data/`; nie usuwaj bazy bez kopii.

## 📚 Dokumentacja

[Wymagania](docs/REQUIREMENTS.md) · [Architektura](docs/ARCHITECTURE.md) · [Plan testów](docs/TEST_PLAN.md) · [Stan prac](docs/PROGRESS.md) · [Dziennik zmian](docs/WORKLOG.md)

**W planach:** PWA i tryb offline, import/eksport, kluby i grupy, komentarze trenera, cele treningowe.
