import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, request } from './api';

describe('request', () => {
  afterEach(() => vi.restoreAllMocks());

  it('nie ustawia Content-Type dla DELETE bez body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await request<void>('/elements/7', { method: 'DELETE' });
    const init = fetchMock.mock.calls[0][1]!;
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('ustawia JSON Content-Type, gdy wysyła body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await request('/example', { method: 'POST', body: JSON.stringify({ value: 1 }) });
    expect(new Headers(fetchMock.mock.calls[0][1]!.headers).get('Content-Type')).toBe('application/json');
  });

  it('mapuje statystyki miejsc lądowania łącznie i osobno dla kodów', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      totalElements: 5,
      byLanding: [{ name: 'Siatka', count: 3 }, { name: 'Materac', count: 2 }],
      landingByCode: [{ code: '800o', landings: [{ name: 'Materac', count: 2 }] }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const result = await api.stats();
    expect(result.byLanding).toEqual([{ name: 'Siatka', count: 3 }, { name: 'Materac', count: 2 }]);
    expect(result.landingByCode[0]).toEqual({ code: '800o', landings: [{ name: 'Materac', count: 2 }] });
  });

  it('korzysta z tras trenera i zachowuje mapowanie identyfikatorów', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ id: 7, username: 'ola' }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const athletes = await api.coachAthletes();
    expect(athletes[0].id).toBe('7');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/coach/athletes');
  });

  it('podgląda zaproszenie przed świadomą akceptacją', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 4, role: 'coach', creatorUsername: 'trener', expiresAt: '2026-09-27 10:00:00', requiredProfile: 'athlete' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const preview = await api.previewInvitation('ABC123');
    expect(preview.requiredProfile).toBe('athlete');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/coach/invitations/preview?shortCode=ABC123');
  });

  it('zachowuje wersję źródłowego układu przy edycji treningu', async () => {
    const payload = { id: 9, date: '2026-09-26', entries: [{ defaultExecutionTypeName: 'Siatka', activities: [{ kind: 'routine', repetitions: 1, sourceRoutineId: 3, sourceRoutineName: 'Układ 1', sourceTemplateVersion: 4, rangeStart: 1, rangeEnd: 1, isFullRange: false, executionTypeName: 'Siatka', elements: [{ code: '40o', executionTypeName: 'Siatka' }] }] }] };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const training = await api.training('9');
    await api.updateTraining('9', { date: training.date, entries: training.entries });
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(body.entries[0].activities[0].sourceTemplateVersion).toBe(4);
  });
});
