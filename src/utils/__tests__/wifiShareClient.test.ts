import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invokeMock = vi.fn();
const isTauriMock = vi.fn(() => true);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('../videoUtils', () => ({
  isTauri: () => isTauriMock(),
}));

describe('wifiShareClient', () => {
  beforeEach(() => {
    vi.resetModules();
    invokeMock.mockReset();
    isTauriMock.mockReset();
    isTauriMock.mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('deduplicates concurrent token requests and trims whitespace', async () => {
    invokeMock.mockResolvedValueOnce('  secret-lan-token  ');
    const { getWifiShareToken } = await import('../wifiShareClient');

    const [t1, t2] = await Promise.all([getWifiShareToken(), getWifiShareToken()]);

    expect(t1).toBe('secret-lan-token');
    expect(t2).toBe('secret-lan-token');
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('get_wifi_share_token');
  });

  it('normalizes relative paths and injects X-Cosmo-Token header', async () => {
    invokeMock.mockResolvedValueOnce('tok-123');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { wifiShareFetch, WIFI_SHARE_BASE_URL } = await import('../wifiShareClient');
    const res = await wifiShareFetch('api/files');

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(`${WIFI_SHARE_BASE_URL}/api/files`);
    expect((calledInit.headers as Headers).get('X-Cosmo-Token')).toBe('tok-123');
  });

  it('refreshes cached token and retries once on HTTP 401', async () => {
    invokeMock
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response('OK', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { wifiShareFetch } = await import('../wifiShareClient');
    const res = await wifiShareFetch('/api/ping');

    expect(res.status).toBe(200);
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1][1].headers as Headers).get('X-Cosmo-Token')).toBe('fresh-token');
  });

  it('returns empty token and skips IPC outside Tauri runtime', async () => {
    isTauriMock.mockReturnValue(false);
    const { getWifiShareToken } = await import('../wifiShareClient');

    const tok = await getWifiShareToken();
    expect(tok).toBe('');
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
