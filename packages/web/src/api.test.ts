import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from './api';

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
});
