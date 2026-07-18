import { db } from "./connection.ts";

export interface CategoryRow {
  id: number;
  name: string;
  created_at: string;
}

export function findAllCategories(): CategoryRow[] {
  return db
    .query("SELECT id, name, created_at FROM song_categories ORDER BY name COLLATE NOCASE ASC")
    .all() as CategoryRow[];
}

export function findCategoryByName(name: string): CategoryRow | undefined {
  return db
    .query("SELECT id, name, created_at FROM song_categories WHERE name = ?")
    .get(name) as CategoryRow | undefined;
}

export function insertCategoryRow(name: string): void {
  db.run("INSERT INTO song_categories (name) VALUES (?)", [name]);
}