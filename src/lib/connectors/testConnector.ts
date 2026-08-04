import { getApiKey } from "@/lib/db/queries";
import type { KeyTestResult } from "@/lib/ai/testKey";
import { searchBrave, searchTavily } from "./search";

export async function testTavilyKey(): Promise<KeyTestResult> {
  const key = await getApiKey("tavily");
  if (!key) return { ok: false, message: "No key saved" };
  try {
    const results = await searchTavily("test", 1, key);
    return { ok: true, message: `Key works (${results.length} result${results.length === 1 ? "" : "s"})` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function testBraveKey(): Promise<KeyTestResult> {
  const key = await getApiKey("brave");
  if (!key) return { ok: false, message: "No key saved" };
  try {
    const results = await searchBrave("test", 1, key);
    return { ok: true, message: `Key works (${results.length} result${results.length === 1 ? "" : "s"})` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
