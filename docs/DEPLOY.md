# Wdrożenie na Fly.io

AcroNote działa na Fly.io jako jedna mała maszyna (`shared-cpu-1x`, 256 MB) z wolumenem na bazę SQLite. HTTPS i adres `https://<nazwa>.fly.dev` zapewnia Fly. Maszyna usypia przy braku ruchu, a pierwsze wejście po przerwie budzi ją w 1–2 s. Szacunkowy koszt to kilka dolarów miesięcznie.

```
dev ──push──► CI (testy) ──PR──► main ──merge──► GitHub Actions ──► Fly.io (https://acronote.fly.dev)
```

## Jak to jest zbudowane

| | Publicznie (`https://…fly.dev`) | Prywatnie (`fly proxy`) |
|---|---|---|
| Port | 3001, za proxy Fly z HTTPS | 3002, tylko w prywatnej sieci Fly |
| Aplikacja | zwykła, **bez** panelu i API administratora | pełna, z panelem administratora |
| Kto ma dostęp | wszyscy | tylko osoba zalogowana na Twoje konto Fly **i** znająca hasło admina |

Na serwerze nie powstają konta demo ani domyślny admin. Administratora tworzysz poleceniem (krok 5), a hasło generuje się losowo.

## Jednorazowa konfiguracja

1. **Konto Fly.io:** załóż je na <https://fly.io>, podepnij kartę i **włącz 2FA**. Konto Fly jest „pierwszym zamkiem” do panelu admina.
2. **flyctl** (PowerShell):
   ```powershell
   iwr https://fly.io/install.ps1 -useb | iex
   fly auth login
   ```
3. **Aplikacja i wolumen** (w folderze projektu):
   ```powershell
   fly apps create acronote
   fly volumes create acronote_data --region fra --size 1
   ```
   Jeśli nazwa `acronote` jest zajęta, wybierz inną i wpisz ją w `app = "…"` w [fly.toml](../fly.toml).
4. **Pierwsze wdrożenie:**
   ```powershell
   fly deploy --ha=false
   ```
   `--ha=false` jest ważne: SQLite wymaga jednej maszyny z jednym wolumenem.
5. **Administrator.** Otwórz najpierw stronę, żeby obudzić maszynę, a potem:
   ```powershell
   fly ssh console -C "node apps/api/dist/admin-cli.js create-admin admin"
   ```
   Hasło pojawi się raz, zapisz je w menedżerze haseł. Reset hasła dowolnego konta działa tak samo: `reset-password "<nazwa>"`.
6. **Automatyczne wdrożenia z GitHuba:**
   ```powershell
   fly tokens create deploy -x 999999h
   ```
   Skopiuj cały wynik (razem z `FlyV1 `) do GitHuba: *Settings → Secrets and variables → Actions → New repository secret*, nazwa `FLY_API_TOKEN`.
7. **Ochrona gałęzi `main`.** W GitHubie: *Settings → Rules → Rulesets → New branch ruleset*:
   - Target: `main`, Enforcement: **Active**,
   - ✅ *Restrict deletions*, ✅ *Block force pushes*,
   - ✅ *Require a pull request before merging*, **Required approvals: 0**, bo własnego PR nie da się zatwierdzić,
   - ✅ *Require status checks to pass* → dodaj **`checks`** (pojawi się na liście po pierwszym uruchomieniu CI).

   W *Settings → General → Pull Requests* zostaw włączone **Allow merge commits**. PR z `dev` do `main` scalaj zwykłym „Create a merge commit”, a nie squashem, bo inaczej gałęzie się rozjadą.

## Codzienna praca

1. Pracujesz na `dev` (`git switch dev`), commitujesz i wypychasz. CI uruchomi testy.
2. Gdy chcesz wydać zmiany, otwórz PR `dev → main`: <https://github.com/HubertBorzymek/AcroNote/compare/main...dev>.
3. Gdy przejdą testy, build i obraz Docker, kliknij **Merge**. Po minucie–dwóch nowa wersja działa na stronie.

Przed każdym startem nowej wersji serwer robi kopię bazy, zanim wykona migracje.

## Panel administratora na danych z serwera

```powershell
fly proxy 3002 acronote.internal
```
Zostaw to okno otwarte i wejdź na <http://localhost:3002>. Zaloguj się na admina i masz zakładki *Konta* i *Zgłoszenia* na prawdziwych danych. Jeśli połączenie nie działa, maszyna śpi: otwórz stronę publiczną albo użyj `fly machine start`.

**Debugowanie frontendu na danych z serwera** (np. z VS albo terminala), przy działającym `fly proxy` jak wyżej:
```powershell
npm run dev:prod-admin
```
Frontend z Twojego komputera (hot reload na `http://localhost:5173`) rozmawia wtedy z API serwera. **Każda zmiana jest prawdziwa.**

## Zgłoszenia błędów

Użytkownicy wysyłają je z *Profil → Pomoc → Zgłoś problem* albo z każdego ekranu błędu. Zgłoszenie zawiera opis, wersję, przeglądarkę, ostatnie ekrany, zapytania i błędy, a opcjonalnie (za zgodą) migawkę danych konta. Nie zawiera haseł, treści formularzy ani tokenów.

Odtwarzanie problemu u siebie:
1. Panel admina → *Zgłoszenia* → *Szczegóły* → **Pobierz JSON**.
2. Lokalnie, w folderze projektu:
   ```powershell
   npm run import-report -- C:\Users\leemi\Downloads\zgloszenie-12.json
   ```
3. Uruchom aplikację lokalnie i zaloguj się na wypisane konto `zgloszenie-12`. Masz te same elementy, układy i treningi co zgłaszający.

## Kopie zapasowe i przywracanie

- Serwer robi kopię `/data/backups/acronote-<data>-<wersja>.db` przy pierwszym starcie każdej nowej wersji (przed migracjami) oraz raz na dobę. Trzyma 14 ostatnich.
- Fly dodatkowo robi codzienne snapshoty wolumenu: `fly volumes snapshots list <id-wolumenu>`.
- Pobranie kopii na swój komputer:
  ```powershell
  fly ssh console -C "ls /data/backups"
  fly ssh sftp get /data/backups/<plik>.db
  ```
- Przywrócenie, tylko awaryjnie:
  ```powershell
  fly ssh console -C "sh -c 'cp /data/backups/<plik>.db /data/restore.db && mv /data/restore.db /data/acronote.db && rm -f /data/acronote.db-wal /data/acronote.db-shm'"
  fly machine restart
  ```

## Własna domena (opcjonalnie)

```powershell
fly certs add acronote.pl
```
U rejestratora domeny ustaw rekordy DNS, które poda `fly certs show acronote.pl`. Certyfikat HTTPS odnawia się sam.

## Zmienne środowiskowe

| Zmienna | Opis | Na Fly |
|---|---|---|
| `ACRONOTE_ENV` | `production`: bez kont demo, ciasteczka `Secure`, kopie bazy | `production` |
| `ADMIN_PORT`, `ADMIN_HOST` | osobny port panelu admina i adres, na którym nasłuchuje | `3002`, `fly-local-6pn` |
| `TRUST_PROXY` | ile proxy przed aplikacją uznać za zaufane (prawdziwe IP do limitów logowania) | `1` |
| `DATABASE_PATH` | plik bazy | `/data/acronote.db` |
| `BACKUP_DIR` | katalog kopii (domyślnie `backups` obok bazy) | — |
| `ACRONOTE_VERSION` | wersja pokazywana w aplikacji i zgłoszeniach | ustawiana przy wdrożeniu |
