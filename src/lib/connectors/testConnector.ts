import { getApiKey } from "@/lib/db/queries";
import type { KeyTestResult } from "@/lib/ai/testKey";
import { searchBrave, searchTavily } from "./search";
import { geocodeLocation, searchPlacesText } from "./places";
import { runPageSpeed } from "./pagespeed";

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

export async function testGooglePlacesKey(): Promise<KeyTestResult> {
  const key = await getApiKey("google_places");
  if (!key) return { ok: false, message: "No key saved" };
  try {
    const center = await geocodeLocation("New York, NY");
    const results = await searchPlacesText("coffee", center, 1, 1);
    return {
      ok: true,
      message: `Key works — geocoding and Places search both responded (${results.length} result)`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function testPageSpeedKey(): Promise<KeyTestResult> {
  const key = await getApiKey("google_pagespeed");
  if (!key) return { ok: false, message: "No key saved" };
  try {
    const scores = await runPageSpeed("https://www.google.com");
    return { ok: true, message: `Key works (performance: ${scores.performance ?? "?"})` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
