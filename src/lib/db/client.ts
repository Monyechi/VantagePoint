import Database from "@tauri-apps/plugin-sql";
import { LEGACY_TABLES, MIGRATIONS } from "./schema";

let dbPromise: Promise<Database> | null = null;

async function runMigrations(db: Database): Promise<void> {
  const versionRows = await db.select<{ user_version: number }[]>("PRAGMA user_version");
  let current = versionRows[0]?.user_version ?? 0;

  if (current === 0) {
    // Pre-versioning dev databases had no user_version tracking. Detect one by checking
    // for a table this app has always created, and rebuild fresh at version 1 rather than
    // hand-writing a migration for a schema that predates migrations entirely.
    const existing = await db.select<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'jobs'",
    );
    if (existing.length > 0) {
      for (const table of LEGACY_TABLES) {
        await db.execute(`DROP TABLE IF EXISTS ${table}`);
      }
    }
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    for (const statement of migration.statements) {
      await db.execute(statement);
    }
    await db.execute(`PRAGMA user_version = ${migration.version}`);
    current = migration.version;
  }
}

export async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await Database.load("sqlite:clientpilot.db");
      await db.execute("PRAGMA foreign_keys = ON");
      await db.execute("PRAGMA journal_mode = WAL");
      await db.execute("PRAGMA busy_timeout = 5000");
      await runMigrations(db);
      return db;
    })();
  }
  return dbPromise;
}

export function nowIso(): string {
  return new Date().toISOString();
}
