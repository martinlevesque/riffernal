import { db } from "./connection.ts";

export interface CategoryRow {
  id: number;
  name: string;
  created_at: string;
}

export function getAllCategories(): CategoryRow[] {
  return db
    .query("SELECT id, name, created_at FROM song_categories ORDER BY name COLLATE NOCASE ASC")
    .all() as CategoryRow[];
}

export function createCategory(name: string): CategoryRow {
  const trimmed = name.trim();

  if (!trimmed) {
    throw new Error("Category name cannot be empty");
  }

  const existing = db
    .query("SELECT id, name, created_at FROM song_categories WHERE name = ?")
    .get(trimmed) as CategoryRow | undefined;

  if (existing) {
    return existing;
  }

  db.run("INSERT INTO song_categories (name) VALUES (?)", [trimmed]);
  return db
    .query("SELECT id, name, created_at FROM song_categories WHERE name = ?")
    .get(trimmed) as CategoryRow;
}
