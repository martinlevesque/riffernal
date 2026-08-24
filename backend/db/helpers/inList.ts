/** Build a comma-separated string of `?` placeholders for a parameterized
 *  IN (...) clause. Returns only `?` characters joined by commas — never
 *  interpolates values — so the result is safe to embed in a SQL string.
 *  Throws on an empty array so callers don't produce invalid `IN ()` SQL;
 *  callers that handle the empty case themselves should short-circuit
 *  before calling this. */
export function inList(values: readonly unknown[]): string {
  if (values.length === 0) throw new Error('inList() requires a non-empty array');

  return values.map(() => '?').join(',');
}
