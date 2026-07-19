import {
  findAllCategories,
  findCategoryByName,
  insertCategoryRow,
  type CategoryRow,
} from "../db/category.ts";

export type Category = CategoryRow;

/** List all song categories, alphabetically by name. */
export function listCategories(): Category[] {
  return findAllCategories();
}

/** Create a category with the given name, applying domain rules:
 *  - name is trimmed
 *  - empty name is rejected
 *  - existing category (case-sensitive) is returned as-is (idempotent). */
export function createCategory(name: string): Category {
  const trimmed = name.trim();

  if (!trimmed) {
    throw new Error("Category name cannot be empty");
  }

  const existing = findCategoryByName(trimmed);

  if (existing) {
    return existing;
  }

  insertCategoryRow(trimmed);
  return findCategoryByName(trimmed)!;
}