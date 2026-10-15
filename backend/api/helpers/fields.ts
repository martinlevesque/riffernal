/** Guard map describing an operation's updatable fields: only keys in
 *  `guards` are whitelist candidates, and a value must pass its guard. */
export type FieldGuards<T> = {
  [K in keyof T]: (value: unknown) => value is T[K];
};

/** Extract updatable fields from a request body against a whitelist.
 *  Unknown keys are dropped, values failing their guard are dropped —
 *  the partial-update contract shared by PATCH routes. A key present in
 *  the result is guaranteed to have its whitelisted type. */
export function pickGuardedFields<T extends object>(
  body: Record<string, unknown>,
  guards: FieldGuards<T>,
): Partial<T> {
  const updates: Partial<T> = {};

  for (const field of Object.keys(guards) as Array<keyof T & string>) {
    const raw = body[field];

    if (guards[field](raw)) {
      updates[field] = raw as T[typeof field];
    }
  }

  return updates;
}
