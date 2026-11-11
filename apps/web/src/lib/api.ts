const TOKEN_KEY = "commitirl.dev.token";

// In the production Compose stack, Nginx proxies API paths to the API service.
// A separately hosted API can still be supplied through VITE_API_URL at build time.
export const apiUrl = import.meta.env.VITE_API_URL || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3001");

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(
  path: string,
  init: RequestInit & { version?: number; idempotencyKey?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.version !== undefined) headers.set("If-Match", `"${init.version}"`);
  if (init.idempotencyKey) headers.set("Idempotency-Key", init.idempotencyKey);
  const response = await fetch(`${apiUrl}${path}`, { ...init, headers });
  if (response.status === 204) return undefined as T;
  const json = await response.json();
  if (!response.ok) {
    const error = new Error(json?.error?.message ?? "Request failed") as Error & {
      code?: string;
      requestId?: string;
      status?: number;
    };
    error.code = json?.error?.code;
    error.requestId = json?.error?.requestId;
    error.status = response.status;
    throw error;
  }
  return json as T;
}

export function newIdempotencyKey() {
  return crypto.randomUUID();
}
