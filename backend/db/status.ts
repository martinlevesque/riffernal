import { db } from "./connection.ts";

export function pingDatabase(): void {
  db.query("SELECT 1").get();
}
