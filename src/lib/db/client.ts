import Database from "@tauri-apps/plugin-sql";
import { SCHEMA_SQL } from "./schema";

let dbPromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await Database.load("sqlite:clientpilot.db");
      const statements = SCHEMA_SQL.split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        await db.execute(stmt);
      }
      return db;
    })();
  }
  return dbPromise;
}

export function nowIso(): string {
  return new Date().toISOString();
}
