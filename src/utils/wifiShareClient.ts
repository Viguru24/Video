import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './videoUtils';

export const WIFI_SHARE_BASE_URL = 'http://127.0.0.1:48273';

let cachedToken: string | null = null;
let inflightTokenPromise: Promise<string> | null = null;

export async function getWifiShareToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  if (!isTauri()) return '';

  if (!inflightTokenPromise) {
    inflightTokenPromise = invoke<string>('get_wifi_share_token')
      .then((tok) => {
        if (typeof tok === 'string' && tok.trim().length > 0) {
          cachedToken = tok.trim();
          return cachedToken;
        }
        return '';
      })
      .finally(() => {
        inflightTokenPromise = null;
      });
  }

  return inflightTokenPromise;
}

export async function wifiShareFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getWifiShareToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('X-Cosmo-Token', token);
  }
  const url = path.startsWith('http://') || path.startsWith('https://')
    ? path
    : `${WIFI_SHARE_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, { ...init, headers });
  if (response.status === 401 && isTauri()) {
    cachedToken = null;
    const freshToken = await getWifiShareToken();
    if (freshToken) {
      headers.set('X-Cosmo-Token', freshToken);
      return fetch(url, { ...init, headers });
    }
  }
  return response;
}
