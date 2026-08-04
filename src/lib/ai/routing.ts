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
  if (existing.length === 0) {
    for (const row of DEFAULT_ROUTING) {
      await upsertRouting(row);
    }
    cache = [...DEFAULT_ROUTING];
  } else {
    cache = existing;
  }
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
