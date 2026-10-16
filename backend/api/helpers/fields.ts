export type FieldGuards<T> = {
  [K in keyof T]: (value: unknown) => value is T[K];
};

/** Whitelist extraction shared by partial-update */
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
