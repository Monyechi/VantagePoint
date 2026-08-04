import { fetch } from "@tauri-apps/plugin-http";
import { completeWithRouting } from "@/lib/ai/complete";
import {
  appendJobEvent,
  getApiKey,
  getJob,
  updateJob,
  updateProspectSearchStatus,
  upsertLead,
  type JobRow,
} from "@/lib/db/queries";
import { nowIso } from "@/lib/db/client";

async function assertNotCancelled(jobId: string): Promise<void> {
  const current = await getJob(jobId);
  if (!current || current.state === "cancelled") {
    throw new Error("Job cancelled");
  }
}

export interface ProspectSearchPayload {
  searchId: string;
  queryText: string;
  niche?: string;
  location?: string;
  audience?: string;
  ticketSize?: string;
  sources: string[];
  extraUrls?: string;
  maxResults?: number;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

function extractEmails(text: string): string[] {
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  return [...new Set(matches ?? [])].slice(0, 5);
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.origin + (u.pathname === "/" ? "" : u.pathname.replace(/\/$/, ""));
  } catch {
    return url;
  }
}

function offerBrief(payload: ProspectSearchPayload): string {
  return [
    `What the user SELLS (their offer): ${payload.niche || "their service"}`,
    payload.audience && `Ideal BUYER: ${payload.audience}`,
    payload.location && `Location focus: ${payload.location}`,
    payload.ticketSize && `Buyer budget / ticket: ${payload.ticketSize}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Fallback Google queries that hunt for buyers, not peers in the niche. */
function fallbackBuyerQueries(payload: ProspectSearchPayload): string[] {
  const offer = payload.niche || "service";
  const loc = payload.location || "";
  const audience = payload.audience || "";
  return [
    `"looking for" OR "need" OR "hire" OR "seeking" (${offer}) ${loc}`.trim(),
    `${audience} ${loc} (need OR looking for OR hire) ${offer}`.trim(),
    `${loc} small business OR startup "need a website" OR "need an app" OR "looking for developer" OR "looking for coach"`.trim(),
  ].filter((q) => q.length > 8);
}

async function buildBuyerSearchQueries(
  payload: ProspectSearchPayload,
): Promise<string[]> {
  try {
    const result = await completeWithRouting("lead_research", {
      system: `You help a salesperson find LEADS — people or businesses who might BUY their offer.
Never invent queries that find competitors or peers who sell the same thing.
Return strict JSON: { "queries": string[] } with 3-5 Google search queries that surface buyer intent
(e.g. "looking for", "need", "hire", pain points, RFPs, outdated tech, "recommend a …").`,
      prompt: `${offerBrief(payload)}

Generate Google queries to find potential CLIENTS for this offer in the target location/audience.
Bad example for a relationship coach: "relationship coaches United States" (that finds peers).
Good example: "looking for relationship coach", "need marriage counseling [city]", dating/communication help forums.`,
      json: true,
      temperature: 0.4,
    });
    const parsed = parseJsonLoose<{ queries?: string[] }>(result.text);
    const queries = (parsed.queries ?? []).map((q) => q.trim()).filter(Boolean);
    if (queries.length > 0) return queries.slice(0, 5);
  } catch {
    // fall through
  }
  return fallbackBuyerQueries(payload);
}

async function searchSerpApi(
  query: string,
  maxResults: number,
): Promise<{ title: string; link: string; snippet: string }[]> {
  const key = await getApiKey("serp");
  if (!key) {
    throw new Error(
      "No SerpAPI key. Add it in Settings, or paste website URLs in Extra URLs.",
    );
  }
  const params = new URLSearchParams({
    engine: "google",
    q: query,
    api_key: key,
    num: String(Math.min(maxResults, 20)),
  });
  const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
    method: "GET",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`SerpAPI error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    organic_results?: { title?: string; link?: string; snippet?: string }[];
  };
  return (data.organic_results ?? [])
    .filter((r) => r.link)
    .map((r) => ({
      title: r.title ?? "",
      link: r.link!,
      snippet: r.snippet ?? "",
    }))
    .slice(0, maxResults);
}

async function fetchPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ClientPilot/0.1; +https://clientpilot.local)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return "";
    const html = await res.text();
    return stripHtml(html);
  } catch {
    return "";
  }
}

function parseJsonLoose<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error("Model did not return valid JSON");
  }
}

export async function runProspectSearchJob(job: JobRow): Promise<void> {
  const payload = JSON.parse(job.payload_json) as ProspectSearchPayload;
  const maxResults = payload.maxResults ?? 10;
  const log = (msg: string, level: "info" | "warn" | "error" = "info") =>
    appendJobEvent(job.id, msg, level);

  try {
    await log(`Starting prospect search: ${payload.queryText}`);
    await updateJob(job.id, { progress: 5 });

    const urls: { title: string; link: string; snippet: string }[] = [];

    // Extra URLs always included
    if (payload.extraUrls?.trim()) {
      for (const line of payload.extraUrls.split(/[\n,]+/)) {
        const u = line.trim();
        if (!u) continue;
        urls.push({ title: u, link: normalizeUrl(u), snippet: "" });
      }
      await log(`Added ${urls.length} URL(s) from Extra URLs`);
    }

    if (payload.sources.includes("google")) {
      await log("Planning buyer-intent Google queries (not competitor search)...");
      const queries = await buildBuyerSearchQueries(payload);
      for (const q of queries) {
        await log(`Search: ${q}`);
      }
      try {
        for (const q of queries) {
          const results = await searchSerpApi(q, maxResults);
          await log(`Found ${results.length} results for query`);
          for (const r of results) {
            if (!urls.some((u) => u.link === r.link)) urls.push(r);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (urls.length === 0) throw err;
        await log(`Google search skipped: ${msg}`, "warn");
      }
    }

    const comingSoon = payload.sources.filter((s) =>
      ["linkedin", "facebook", "reddit", "podcasts", "blogs"].includes(s),
    );
    if (comingSoon.length) {
      await log(
        `Sources not yet available (coming soon): ${comingSoon.join(", ")}`,
        "warn",
      );
    }

    if (urls.length === 0) {
      throw new Error(
        "No URLs to process. Add a SerpAPI key for Google search, or paste website URLs.",
      );
    }

    const target = urls.slice(0, maxResults);
    await log(`Processing ${target.length} potential client leads...`);
    await updateJob(job.id, { progress: 15 });

    const icp = offerBrief(payload);

    let processed = 0;
    for (const item of target) {
      await assertNotCancelled(job.id);
      const website = normalizeUrl(item.link);
      await log(`Reading ${website}...`);
      const pageText = await fetchPage(website);
      const emailsFromPage = extractEmails(pageText);

      let analysis: {
        business_name?: string;
        contact_name?: string;
        email?: string;
        summary?: string;
        pain_points?: string[];
        fit_notes?: string;
        likely_buyer?: boolean;
      } = {};

      if (pageText.length > 100) {
        await log(`Analyzing as potential client for your offer...`);
        const result = await completeWithRouting("website_analysis", {
          system: `You research sales LEADS for a seller. The prospect should be someone who might BUY the seller's offer — not a competitor who sells the same thing.
Return strict JSON: business_name, contact_name, email, summary, pain_points (string[]), fit_notes, likely_buyer (boolean).
Mark likely_buyer false if this looks like a peer/competitor (e.g. another coach when the seller IS a coach).`,
          prompt: `${icp}

Candidate page: ${website}
Search snippet: ${item.snippet}

Page content:
${pageText.slice(0, 9000)}

Extract who they are and whether they might need the seller's offer.`,
          json: true,
          temperature: 0.2,
        });
        analysis = parseJsonLoose(result.text);
      } else {
        await log(`Thin or blocked content for ${website}; scoring from snippet`, "warn");
        analysis = {
          business_name: item.title,
          summary: item.snippet || "Could not fetch page content.",
          pain_points: [],
          fit_notes: "Limited data",
          likely_buyer: true,
        };
      }

      await log(`Scoring lead fit (buyer for your offer)...`);
      const scoreResult = await completeWithRouting("lead_scoring", {
        system: `Score 0-100 how good this lead is as a CLIENT for the seller's offer.
Penalize heavily if they appear to be a competitor/peer selling the same service.
Reward clear need, budget fit, location fit, and outreachability.
Return JSON: { score: number, reasons: string[] }`,
        prompt: `${icp}

Prospect:
${JSON.stringify({
  website,
  ...analysis,
  snippet: item.snippet,
})}

Score as a sales lead for the seller (someone to sell TO).`,
        json: true,
        temperature: 0.1,
      });
      const scored = parseJsonLoose<{ score: number; reasons: string[] }>(
        scoreResult.text,
      );

      let score = Math.max(0, Math.min(100, Math.round(scored.score ?? 0)));
      if (analysis.likely_buyer === false) {
        score = Math.min(score, 35);
      }

      const email = analysis.email || emailsFromPage[0] || null;

      await upsertLead({
        searchId: payload.searchId,
        name: analysis.contact_name,
        business: analysis.business_name || item.title,
        email: email ?? undefined,
        website,
        score,
        summary: analysis.summary,
        painPoints: (analysis.pain_points ?? []).join("\n"),
        scoreReasons: (scored.reasons ?? []).join("\n"),
        campaign: payload.niche || payload.queryText.slice(0, 60),
      });

      processed += 1;
      const progress = 15 + Math.round((processed / target.length) * 80);
      await updateJob(job.id, { progress });
      await log(
        `Saved lead ${analysis.business_name || website} (score ${score})`,
      );
    }

    await updateProspectSearchStatus(payload.searchId, "completed");
    await updateJob(job.id, {
      state: "completed",
      progress: 100,
      completed_at: nowIso(),
    });
    await log(`Done. Processed ${processed} prospects.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const cancelled = msg === "Job cancelled";
    await log(msg, cancelled ? "warn" : "error");
    await updateProspectSearchStatus(
      payload.searchId,
      cancelled ? "cancelled" : "failed",
    );
    const current = await getJob(job.id);
    if (current?.state !== "cancelled") {
      await updateJob(job.id, {
        state: cancelled ? "cancelled" : "failed",
        error: msg,
        completed_at: nowIso(),
      });
    }
  }
}
