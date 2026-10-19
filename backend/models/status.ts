import { pingDatabase } from "../db/index.ts";

export type DbState = "ok" | "unreachable";

export interface StatusReport {
  status: "ok" | "error";
  db: DbState;
}

export function getStatus(): StatusReport {
  try {
    pingDatabase();
    return { status: "ok", db: "ok" };
  } catch (err) {
    console.error(err);
    return { status: "error", db: "unreachable" };
  }
}
