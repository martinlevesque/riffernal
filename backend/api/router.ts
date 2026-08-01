export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function parseJson<T = unknown>(req: Request): Promise<T> {
  return (await req.json()) as T;
}

export type Handler = (req: Request, params: Record<string, string>) => Promise<Response> | Response;

export interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

function compile(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = escaped.replace(/\/:([^/]+)/g, (_, key) => {
    keys.push(key);
    return "/([^/]+)";
  });
  return { pattern: new RegExp(`^${regex}$`), keys };
}

export function defineRoutes(routes: Array<{ method: string; path: string; handler: Handler }>): Route[] {
  return routes.map((r) => {
    const { pattern, keys } = compile(r.path);
    return { method: r.method.toUpperCase(), pattern, keys, handler: r.handler };
  });
}

export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Invalid request";
}

/** Error messages mapped to their HTTP status codes. Only generic
 *  HTTP-level errors belong here — model validation errors receive their
 *  status via the `fallback` parameter of `handleErr`. */
const ERROR_STATUS: Record<string, number> = {
  "Not found": 404,
  Forbidden: 403,
};

/** Map a caught error to a JSON Response. Uses `ERROR_STATUS` for known
 *  error messages, falling back to `fallback` (default 500). */
export function handleErr(err: unknown, fallback = 500): Response {
  const msg = errMsg(err);
  return json({ error: msg }, ERROR_STATUS[msg] ?? fallback);
}

export function numOrNull(val: FormDataEntryValue | null): number | null {
  if (!val || String(val) === "") {
    return null;
  }

  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

/** Parse and validate a numeric path parameter. Returns the number or
 *  a 400 Response. Only `id` and `songId` are suitable const names for
 *  the typical param; these two are equivalent. */
export function paramId(raw: string): number | Response {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return json({ error: "Invalid id" }, 400);
  return n;
}
