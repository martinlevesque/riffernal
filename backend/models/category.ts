import {
  findAllCategories,
  findCategoryByName,
  insertCategoryRow,
  type CategoryRow,
} from "../db/category.ts";
import { ValidationError } from "./validation.ts";

export type Category = CategoryRow;

/** List all song categories, alphabetically by name. */
export function listCategories(): Category[] {
  return findAllCategories();
}

/** Validate that a category name is non-empty (after trim). Returns the
 *  trimmed value. Throws on invalid input. */
function validateCategoryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ValidationError("Category name cannot be empty");
  }
  return trimmed;
}

/** Create a category with the given name, applying domain rules:
 *  - name is validated and trimmed
 *  - existing category (case-sensitive) is returned as-is (idempotent). */
export function createCategory(name: string): Category {
  const trimmed = validateCategoryName(name);

  const existing = findCategoryByName(trimmed);

  if (existing) {
    return existing;
  }

  insertCategoryRow(trimmed);
  return findCategoryByName(trimmed)!;
}