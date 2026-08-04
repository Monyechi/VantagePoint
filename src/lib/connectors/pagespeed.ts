import { fetch } from "@tauri-apps/plugin-http";
import { getApiKey } from "@/lib/db/queries";

export interface PageSpeedScores {
  performance: number | null;
  accessibility: number | null;
  seo: number | null;
}

/** Best-effort — PageSpeed can be slow or fail on sites it can't crawl; callers
 * should treat a thrown error as "scores unavailable", not a hard failure. */
export async function runPageSpeed(url: string): Promise<PageSpeedScores> {
  const key = await getApiKey("google_pagespeed");
  if (!key) throw new Error("No Google PageSpeed key. Add one in Connectors.");

  const params = new URLSearchParams({ url, key });
  for (const category of ["PERFORMANCE", "ACCESSIBILITY", "SEO"]) {
    params.append("category", category);
  }

  const res = await fetch(
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`,
    { method: "GET" },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`PageSpeed error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    lighthouseResult?: {
      categories?: {
        performance?: { score?: number };
        accessibility?: { score?: number };
        seo?: { score?: number };
      };
    };
  };
  const categories = data.lighthouseResult?.categories;
  const toPercent = (score: number | undefined): number | null =>
    typeof score === "number" ? Math.round(score * 100) : null;

  return {
    performance: toPercent(categories?.performance?.score),
    accessibility: toPercent(categories?.accessibility?.score),
    seo: toPercent(categories?.seo?.score),
  };
}
