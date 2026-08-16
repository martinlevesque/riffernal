import { getAuthToken } from "./AuthApi.js";

export async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const msg = (body as { error?: string }).error;
    if (res.status === 401 && msg && (msg.includes("Authentication required") || msg.includes("Invalid or expired token"))) {
      localStorage.removeItem("riffernal_token");
      localStorage.removeItem("riffernal_user");
      window.location.reload();
    }
    return msg ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

/** Fetch wrapper that attaches the Authorization header when a token exists. */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
