import {
  getAllRouting,
  upsertRouting,
} from "@/lib/db/queries";
import {
  DEFAULT_ROUTING,
  type ModelRouting,
  type TaskKind,
} from "./types";

let cache: ModelRouting[] | null = null;

export async function ensureDefaultRouting(): Promise<void> {
  const existing = await getAllRouting();
  const existingKinds = new Set(existing.map((r) => r.taskKind));
  // Backfill any task kind missing from the DB rather than only seeding an empty
  // table — otherwise a task kind added after a user's first run (like chat) never
  // gets a DB row, and silently disappears from the AI Models settings list even
  // though getRoutingForTask() still works via the in-memory DEFAULT_ROUTING fallback.
  const missing = DEFAULT_ROUTING.filter((row) => !existingKinds.has(row.taskKind));
  for (const row of missing) {
    await upsertRouting(row);
  }
  cache = missing.length > 0 ? [...existing, ...missing] : existing;
}

export async function getRoutingForTask(taskKind: TaskKind): Promise<ModelRouting> {
  if (!cache) {
    await ensureDefaultRouting();
  }
  const found = cache!.find((r) => r.taskKind === taskKind);
  if (found) return found;
  return DEFAULT_ROUTING.find((r) => r.taskKind === taskKind)!;
}

export async function listRouting(): Promise<ModelRouting[]> {
  await ensureDefaultRouting();
  cache = await getAllRouting();
  return cache;
}

export async function setRouting(routing: ModelRouting): Promise<void> {
  await upsertRouting(routing);
  cache = null;
  await listRouting();
}
