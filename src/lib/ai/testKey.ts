import { fetch } from "@tauri-apps/plugin-http";
import { getApiKey } from "@/lib/db/queries";
import { complete } from "./complete";
import { PROVIDERS, type ProviderId } from "./types";

export interface KeyTestResult {
  ok: boolean;
  message: string;
}

export async function testProviderKey(providerId: ProviderId): Promise<KeyTestResult> {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  if (!provider) return { ok: false, message: "Unknown provider" };
  const key = await getApiKey(providerId);
  if (!key) return { ok: false, message: "No key saved" };
  try {
    const modelId = provider.models[0]!.id;
    const result = await complete(providerId, modelId, {
      prompt: "Reply with exactly one word: OK",
      maxTokens: 5,
    });
    return { ok: true, message: result.text.trim().slice(0, 30) || "Key works" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function testSerpApiKey(): Promise<KeyTestResult> {
  const key = await getApiKey("serp");
  if (!key) return { ok: false, message: "No key saved" };
  try {
    const res = await fetch(
      `https://serpapi.com/account?api_key=${encodeURIComponent(key)}`,
      { method: "GET" },
    );
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, message: `SerpAPI error ${res.status}: ${text.slice(0, 150)}` };
    }
    const data = (await res.json()) as { plan_searches_left?: number };
    return {
      ok: true,
      message:
        data.plan_searches_left !== undefined
          ? `${data.plan_searches_left} searches left`
          : "Key works",
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
