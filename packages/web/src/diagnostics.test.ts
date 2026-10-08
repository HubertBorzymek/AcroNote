import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, request } from './api';
import { collectDiagnostics, recordError, recordNavigation, sanitizePath } from './diagnostics';

describe('diagnostyka do zgłoszeń', () => {
  afterEach(() => vi.restoreAllMocks());

  it('usuwa parametry zapytań i tokeny zaproszeń ze ścieżek', () => {
    expect(sanitizePath('/coach/invitations/preview?token=SEKRET')).toBe('/coach/invitations/preview');
    expect(sanitizePath('/zaproszenie/abcDEF123')).toBe('/zaproszenie/[ukryte]');
    expect(sanitizePath('/connect/xyz#frag')).toBe('/connect/[ukryte]');
  });

  it('zapisuje ostatnie zapytania, błędy i ekrany bez treści żądań', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'Nie znaleziono treningu.' }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    await expect(request('/trainings/9?from=2026-01-01', { method: 'PUT', body: JSON.stringify({ secret: 'haslo-123' }) })).rejects.toThrow('Nie znaleziono treningu.');
    recordError('error', new Error('Boom'));
    recordNavigation('/stats');
    const snapshot = collectDiagnostics();
    expect(snapshot.requests.at(-1)).toMatchObject({ method: 'PUT', path: '/trainings/9', status: 404, message: 'Nie znaleziono treningu.' });
    expect(snapshot.errors.at(-1)).toMatchObject({ source: 'error', message: 'Boom' });
    expect(snapshot.navigation.at(-1)).toMatchObject({ path: '/stats' });
    expect(JSON.stringify(snapshot)).not.toContain('haslo-123');
    expect(snapshot.appVersion).toBeTruthy();
  });

  it('zamienia błąd sieci na polski komunikat i go rejestruje', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(request('/elements')).rejects.toMatchObject({ status: 0, message: expect.stringContaining('Brak połączenia') });
    expect(collectDiagnostics().requests.at(-1)).toMatchObject({ path: '/elements', status: 'network-error' });
  });

  it('wysyła zgłoszenie z diagnostyką i zgodą na migawkę', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 3, status: 'new' }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    await api.sendBugReport({ description: 'Nie działa zapis', page: '/trainings', includeSnapshot: true, diagnostics: collectDiagnostics() });
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(body).toMatchObject({ description: 'Nie działa zapis', includeSnapshot: true, diagnostics: { page: expect.any(String) } });
  });
});
