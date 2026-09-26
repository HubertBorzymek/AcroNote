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
- Techniczne pola i tabela `execution_types` pozostają dla kompatybilności, ale w interfejsie i dokumentacji oznaczają **miejsca lądowania**.

## Kontrola przed commitem

```powershell
npm test
npm run typecheck
npm run build
npm audit --audit-level=moderate
```

Zmiany UI dodatkowo sprawdź w przeglądarce na szerokim i telefonicznym widoku. Nie commituj baz SQLite, `node_modules`, `dist`, sekretów ani danych testowych.
