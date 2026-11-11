# Wdrożenie na Fly.io

AcroNote działa pod `https://acronote.fly.dev` jako jedna mała maszyna Fly (`shared-cpu-1x`, 256 MB, region `fra`) z wolumenem `acronote_data` na bazę SQLite (`/data/acronote.db`). HTTPS zapewnia Fly. Maszyna usypia przy braku ruchu, a pierwsze wejście po przerwie budzi ją w 1–2 s.

**Zawsze dokładnie jedna maszyna.** Każda kolejna miałaby własny plik SQLite. Wdrożenie ręczne: `fly deploy --ha=false`.

## Docelowy przepływ (do włączenia na końcu, zob. „Przełączenie wdrażania”)

```
gałąź robocza ──push──► PR do main ──► CI: testy, typecheck, build, audit, obraz Docker
                                        │ zielone
                                        ▼
                                  Merge do main ──► deploy.yml: testy ──► fly deploy --ha=false ──► https://acronote.fly.dev
```

- `ci.yml` uruchamia się dla każdego PR i pushu na `dev`.
- `deploy.yml` wdraża `main` po scaleniu. Bez sekretu `FLY_API_TOKEN` pomija wdrożenie (nic się nie psuje).
- Na `main` nie pracuje się bezpośrednio; reguła gałęzi pozwala scalić tylko PR z zielonym `checks`.

**Stan na 2026-11-11:** przełączenie zrobione — integracja Fly z GitHubem odłączona, `FLY_API_TOKEN` ustawiony, reguła na `main` aktywna, gałąź `flyio-new-files` usunięta, sekrety kreatora usunięte. Produkcję wdraża wyłącznie `deploy.yml`.

### Przełączenie wdrażania (jednorazowo, ok. 10 min)

1. Panel Fly → aplikacja `acronote` → odłącz repozytorium GitHub (automatyczne wdrożenia z GitHuba).
2. Klucz do wdrażania:
   ```powershell
   fly tokens create deploy -a acronote -x 999999h
   ```
   Skopiuj cały wynik (razem z `FlyV1 `) do GitHuba: *Settings → Secrets and variables → Actions → New repository secret*, nazwa `FLY_API_TOKEN`.
3. GitHub *Settings → Rules → Rulesets → New branch ruleset*: Target `main`, Enforcement **Active**, ✅ *Restrict deletions*, ✅ *Block force pushes*, ✅ *Require a pull request before merging* (**Required approvals: 0**, bo własnego PR nie da się zatwierdzić), ✅ *Require status checks to pass* → **`checks`**.
4. Usuń gałąź `flyio-new-files` (utworzył ją kreator Fly; obowiązuje `fly.toml` z repozytorium).

## Sekrety Fly

Aplikacja nie potrzebuje żadnych sekretów: cała konfiguracja jest w `[env]` w `fly.toml`, a `fly secrets list -a acronote` ma być puste. Sekrety mają pierwszeństwo przed `[env]`, więc zbędny sekret po cichu zmienia ustawienie (tak było z `PORT=8080` z kreatora, zob. `WORKLOG.md`). Port na Fly to 8080 — numer nie ma znaczenia, ważne, żeby `PORT` i `internal_port` były równe.

## Administrator

Panel admina jest w zwykłej aplikacji (zakładka *Admin*), także na telefonie. Ponieważ jest dostępny z internetu, wymaga **weryfikacji dwuetapowej**:

- Przy pierwszym wejściu do panelu: potwierdź hasło, zeskanuj kod QR aplikacją uwierzytelniającą (Google/Microsoft Authenticator itp.), wpisz 6 cyfr i zapisz 10 kodów zapasowych.
- Każde kolejne logowanie admina: hasło, a potem 6 cyfr z aplikacji (albo jeden kod zapasowy). 5 błędnych kodów kończy próbę logowania.
- Zakładka *Admin* ma licznik: prośby o reset hasła i nowe zgłoszenia błędów.
- Odebranie komuś roli admina wyłącza jego weryfikację dwuetapową.

Administrator nie zakłada kont (robią to użytkownicy), nie wchodzi na cudze konta i nie widzi haseł, ocen ani komentarzy do treningów.

Awaryjnie, na serwerze (`fly ssh console -C "node apps/api/dist/admin-cli.js <polecenie>"`):

| Polecenie | Działanie |
|---|---|
| `list-admins` | lista administratorów i to, czy mają weryfikację dwuetapową |
| `grant-admin "<nazwa>"` | rola admina dla istniejącego konta, hasło bez zmian |
| `create-admin "<nazwa>"` | nowe konto admina z losowym hasłem (tylko dla nowej nazwy) |
| `reset-admin-password "<nazwa>"` | nowe losowe hasło dla konta admina |
| `disable-2fa "<nazwa>"` | wyłącza weryfikację po utracie telefonu i kodów; przy następnym wejściu do panelu ustawia się ją od nowa |

## Reset hasła użytkownika

1. Użytkownik klika *Zapomniałeś hasła?*, wpisuje nazwę konta (i opcjonalnie wiadomość) i dostaje **numer prośby**, np. 4821. Prośba jest przypisana do tej przeglądarki (ciasteczko `HttpOnly`).
2. Daje Ci znać dowolną drogą i podaje numer.
3. *Admin → Hasła*: porównujesz numer i klikasz **Zezwól na reset**.
4. Użytkownik wraca do aplikacji na tym samym urządzeniu, ustawia nowe hasło (dwa razy) i jest zalogowany. Wszystkie jego stare sesje są wylogowane.

Ograniczenia: jedna aktywna prośba na konto (nową można wysłać po odrzuceniu, anulowaniu albo wygaśnięciu), 5 prób na godzinę z jednego adresu. Prośba czeka 72 h, zgoda jest ważna 24 h i działa raz. Jeśli ktoś inny próbował wysłać prośbę o to samo konto, panel to pokazuje; wtedy przy niezgodnym numerze odrzuć prośbę.

## Kopie zapasowe

| Kiedy | Gdzie | Jak |
|---|---|---|
| Przy pierwszym starcie każdej nowej wersji (przed migracjami) i co dobę, o ile maszyna działa (sprawdzane przy starcie i co 6 h) | serwer, `/data/backups`, 14 ostatnich | automatycznie (`ACRONOTE_ENV=production`) |
| Codziennie | snapshot wolumenu Fly (kilka dni wstecz) | automatycznie, `fly volumes snapshots list <id>` |
| Raz w tygodniu (niedziela 19:00 albo przy najbliższym włączeniu komputera) | `Dokumenty\AcroNote-kopie\acronote-tygodniowa.db`, nadpisywany | `scripts\zaplanuj-kopie.bat` uruchom raz |
| Na żądanie, np. przed dużym wdrożeniem | `Dokumenty\AcroNote-kopie\acronote-<data>.db` | dwuklik `scripts\pobierz-kopie.bat` |

Skrypty wymagają `flyctl` zalogowanego raz przez `fly auth login`. Wynik i błędy trafiają do `Dokumenty\AcroNote-kopie\kopie.log`. Kopie zawierają prawdziwe dane użytkowników (z hasłami w postaci skrótów): trzymaj je tylko u siebie, nigdy w repozytorium.

Przywrócenie, tylko awaryjnie:
```powershell
fly ssh console -C "sh -c 'cp /data/backups/<plik>.db /data/restore.db && mv /data/restore.db /data/acronote.db && rm -f /data/acronote.db-wal /data/acronote.db-shm'"
fly machine restart
```

**Wycofanie wersji po migracji v5+:** stary obraz z `main` sprzed scalenia nie obsługuje triggerów `users_username_key` (rejestracja i zmiana nazwy przestałyby działać). Wycofanie oznacza przywrócenie kopii sprzed migracji razem ze starym obrazem, a nie samo cofnięcie wdrożenia.

## Zgłoszenia błędów

Użytkownicy wysyłają je z *Profil → Pomoc → Zgłoś problem* albo z każdego ekranu błędu. Zgłoszenie zawiera opis, wersję, przeglądarkę, ostatnie ekrany, zapytania i błędy, a opcjonalnie (za zgodą) migawkę danych konta bez ocen i komentarzy. Nie zawiera haseł, treści formularzy ani tokenów.

Odtwarzanie u siebie: *Admin → Zgłoszenia → Szczegóły → Pobierz JSON*, potem `npm run import-report -- C:\ścieżka\zgloszenie-12.json` i logowanie na wypisane konto.

## Zmienne środowiskowe

| Zmienna | Opis | Na Fly |
|---|---|---|
| `ACRONOTE_ENV` | `production`: bez kont demo, ciasteczka `Secure`, kopie bazy | `production` |
| `TRUST_PROXY` | liczba zaufanych proxy; za proxy limity żądań liczone są po `Fly-Client-IP` | `1` |
| `PORT`, `HOST` | port i adres serwera; `PORT` musi być równy `internal_port` w `fly.toml` (lokalnie domyślnie 3001) | `8080`, `0.0.0.0` |
| `DATABASE_PATH` | plik bazy, nie zmieniać | `/data/acronote.db` |
| `BACKUP_DIR` | katalog kopii (domyślnie `backups` obok bazy) | — |
| `ACRONOTE_VERSION` | wersja w aplikacji i zgłoszeniach | ustawiana przy wdrożeniu |
