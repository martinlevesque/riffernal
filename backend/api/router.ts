import { DomainError, PayloadTooLargeError } from "../models/validation.ts";

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/** Shorthand for the common 404 response. */
export function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

// Largest JSON body the app legitimately sends is a full PUT /api/songs/:id
// metadata update (notes JSON dominates); 1 MB clears it with room to spare.
const MAX_JSON_BODY_BYTES = 1024 * 1024;

function chunksToBuffer(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return out;
}

/** Read the request body without ever buffering more than `max` bytes:
 *  the guarded stream bails as soon as the cap is exceeded, so a lying or
 *  absent Content-Length (chunked transfer) still cannot balloon memory. */
async function readBodyCapped(req: Request, max: number): Promise<Uint8Array> {
  const contentLength = Number(req.headers.get("content-length") ?? "");

  if (Number.isFinite(contentLength) && contentLength > max) {
    req.body?.cancel().catch(() => {});
    throw new PayloadTooLargeError(`Request body exceeds ${max} bytes`);
  }

  const reader = req.body?.getReader();

  if (!reader) {
    return new Uint8Array(0);
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    total += value.byteLength;

    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new PayloadTooLargeError(`Request body exceeds ${max} bytes`);
    }

    chunks.push(value);
  }

  return chunksToBuffer(chunks, total);
}

/** Read and parse a JSON body, rejecting anything over the shared 1 MB cap
 *  with a 413 instead of buffering the payload first. */
export async function parseJson<T = unknown>(req: Request): Promise<T> {
  const body = await readBodyCapped(req, MAX_JSON_BODY_BYTES);
  return JSON.parse(new TextDecoder().decode(body)) as T;
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

/** Generic HTTP-level error messages mapped to their status codes. Domain
 *  errors that need a specific status use a `DomainError` subclass (e.g.
 *  `ValidationError` → 400, `UnauthorizedError` → 401) instead of adding
 *  domain-specific strings here. */
const ERROR_STATUS: Record<string, number> = {
  "Not found": 404,
};

/** Map a caught error to a JSON Response. `DomainError` instances use their
 *  own `status`; messages in `ERROR_STATUS` map to their generic HTTP
 *  status; anything else falls back to `fallback` (default 500). */
export function handleErr(err: unknown, fallback = 500): Response {
  if (err instanceof DomainError) {
    return json({ error: err.message }, err.status);
  }
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
