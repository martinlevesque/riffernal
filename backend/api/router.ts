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

export function numOrNull(val: FormDataEntryValue | null): number | null {
  if (!val || String(val) === "") {
    return null;
  }

  return Number(val);
}
