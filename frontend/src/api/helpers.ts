import { getAuthToken, clearAuth } from './AuthApi.js';

export async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return (body as { error?: string }).error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

/** Fetch wrapper that attaches the Authorization header when a token exists.
 *  A 401 response means the session is gone (logged out / expired) — clear
 *  the stored credentials and reload to drop the user back on the auth
 *  screen. The rejected request still propagates as a thrown Error to the
 *  caller via `parseError`. */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(input, { ...init, headers });

  if (res.status === 401 && token) {
    clearAuth();
    window.location.reload();
  }
  return res;
}
