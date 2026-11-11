# AcroNote — instrukcje dla agentów

Przed rozpoczęciem pracy przeczytaj w całości:

1. `docs/WORKLOG.md` — aktualny kontekst, zgłoszone problemy i decyzje.
2. `docs/PROGRESS.md` — faktycznie ukończony zakres.
3. `docs/ARCHITECTURE.md` — model danych i granice modułów.
4. `docs/REQUIREMENTS.md` oraz `docs/TEST_PLAN.md`.

Po pracy zaktualizuj `docs/WORKLOG.md` i `docs/PROGRESS.md`. Nie deklaruj ukończenia funkcji bez testu proporcjonalnego do ryzyka.

## Nienaruszalne zasady

- Historyczne wykonania przechowują własne migawki. Zmiana katalogu elementów, układu lub miejsca lądowania nie może zmienić dawnych treningów.
- Statystyki liczą zapisane migawki, nie bieżące szablony.
- Każdy odczyt i zapis danych użytkownika wymaga kontroli właściciela po stronie API.
- Administrator nigdy nie otrzymuje haseł, skrótów haseł ani tokenów sesji.
- Nie modyfikuj ani nie usuwaj `data/acronote.db` podczas testów. Używaj SQLite `:memory:` albo jawnie wskazanej bazy testowej.
- Cały interfejs użytkownika jest po polsku; nazwy w kodzie są po angielsku.
- Profil trenera jest wyłącznie do odczytu danych połączonego zawodnika. Nie dodawaj trenerowi operacji zapisu ani nie obchodź kontroli relacji po stronie API.
- Ocena i komentarz treningu są prywatne: widzi je tylko zawodnik. Nie zwracaj ich trenerowi, administratorowi ani w migawce zgłoszenia.
- Panel administratora wymaga weryfikacji dwuetapowej. Nie dodawaj administratorowi wejścia na cudze konto ani ustawiania haseł użytkowników.
- Techniczne pola i tabela `execution_types` pozostają dla kompatybilności, ale w interfejsie i dokumentacji oznaczają **miejsca lądowania**.

## Kontrola przed commitem

```powershell
npm test
npm run typecheck
npm run build
npm audit --audit-level=moderate
```

Zmiany UI dodatkowo sprawdź w przeglądarce na szerokim i telefonicznym widoku. Nie commituj baz SQLite, `node_modules`, `dist`, sekretów ani danych testowych.

## Produkcja (Fly.io)

- Aplikacja działa pod `https://acronote.fly.dev` (aplikacja Fly `acronote`, region `fra`). Baza z prawdziwymi danymi użytkowników leży na wolumenie `acronote_data` zamontowanym w `/data`.
- Zawsze dokładnie jedna maszyna: każda kolejna miałaby własny plik SQLite. Nie zwiększaj liczby maszyn, nie usuwaj `[[mounts]]` i nie zmieniaj nazwy wolumenu ani `DATABASE_PATH`.
- Migracje muszą zachować istniejące dane produkcyjne. Sprawdzaj je na kopii bazy, nigdy na produkcji.
- Nie wdrażaj i nie zmieniaj konfiguracji Fly (deploy, skala, sekrety, wolumeny) bez wyraźnej prośby użytkownika.
- Aktualny stan gałęzi i wdrożenia opisuje `docs/WORKLOG.md`.
