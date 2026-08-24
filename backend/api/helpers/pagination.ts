export const DEFAULT_LIMIT = 10;

/** Parse and clamp the `limit`/`offset` query params from a request URL. */
export function parsePagination(url: URL, defaultLimit = DEFAULT_LIMIT): { limit: number; offset: number } {
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || defaultLimit));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  return { limit, offset };
}
