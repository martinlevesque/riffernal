import { test, expect } from "bun:test";
import { pickGuardedFields } from "../../../../backend/api/helpers/fields.ts";

test("extracts whitelisted fields whose values pass their guards", () => {
  const result = pickGuardedFields<{ enabled: boolean; name: string | null }>(
    { enabled: true, name: "Solo", unknown: "ignored" },
    {
      enabled: (value): value is boolean => typeof value === "boolean",
      name: (value): value is string | null => typeof value === "string" || value === null,
    },
  );

  // Unknown keys never reach the result, even when present in the body.
  expect(result).toEqual({ enabled: true, name: "Solo" });
  expect("unknown" in result).toBe(false);
});

test("drops values that fail their guard", () => {
  const result = pickGuardedFields<{ enabled: boolean; endTime: number }>(
    { enabled: "yes", endTime: -3 },
    {
      enabled: (value): value is boolean => typeof value === "boolean",
      endTime: (value): value is number => typeof value === "number",
    },
  );

  expect(result).toEqual({ endTime: -3 });
});

test("accepts null through a guard that allows it", () => {
  const result = pickGuardedFields<{ name: string | null }>(
    { name: null },
    {
      name: (value): value is string | null => typeof value === "string" || value === null,
    },
  );

  expect(result).toEqual({ name: null });
});

test("returns an empty object when the body has no valid field", () => {
  const result = pickGuardedFields<{ enabled: boolean }>(
    {},
    { enabled: (value): value is boolean => typeof value === "boolean" },
  );

  expect(result).toEqual({});
  expect(Object.keys(result)).toHaveLength(0);
});
