/** Return a comma-separated list of SQL column expressions.
 *  When a table alias is provided, each column is prefixed (e.g.
 *  `columns(["id", "name"], "s")` → `"s.id, s.name"`). */
export function columns(names: readonly string[], table?: string): string {
  const prefix = table ? `${table}.` : "";
  return names.map((c) => `${prefix}${c}`).join(", ");
}
