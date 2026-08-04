import { fetch } from "@tauri-apps/plugin-http";
import { completeWithRouting } from "@/lib/ai/complete";
import { getSellerProfile, sellerProfileBrief } from "@/lib/settings/sellerProfile";
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
  /** Deterministic queries computed client-side from taxonomy selections. When present,
   * these are used directly and the LLM query planner is skipped entirely. */
  queries?: string[];
  /** Free-text supplement to the structured taxonomy fields, folded into the AI context. */
  notes?: string;
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

const EMAIL_ASSET_EXTENSIONS = /\.(png|jpe?g|gif|svg|webp|ico|bmp|css|js)$/i;
const EMAIL_NOISE_DOMAINS = new Set([
  "sentry.io",
  "sentry.wixpress.com",
  "wixpress.com",
  "example.com",
  "godaddy.com",
  "wordpress.com",
  "wp.com",
  "schema.org",
  "w3.org",
]);

function extractEmails(text: string): string[] {
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  const filtered = matches.filter((email) => {
    if (EMAIL_ASSET_EXTENSIONS.test(email)) return false;
    const domain = email.split("@")[1]?.toLowerCase() ?? "";
    return !EMAIL_NOISE_DOMAINS.has(domain);
  });
  return [...new Set(filtered)].slice(0, 5);
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.origin + (u.pathname === "/" ? "" : u.pathname.replace(/\/$/, ""));
  } catch {
    return url;
  }
}

/** Domains that are directories, aggregators, or social platforms — never real leads. */
const BLOCKED_DOMAINS = new Set([
  "yelp.com",
  "wikipedia.org",
  "en.wikipedia.org",
  "indeed.com",
  "reddit.com",
  "facebook.com",
  "linkedin.com",
  "glassdoor.com",
  "angi.com",
  "bbb.org",
  "manta.com",
  "yellowpages.com",
  "superpages.com",
  "mapquest.com",
  "tripadvisor.com",
  "foursquare.com",
  "thumbtack.com",
  "houzz.com",
  "homeadvisor.com",
  "craigslist.org",
  "ziprecruiter.com",
  "monster.com",
  "careerbuilder.com",
  "simplyhired.com",
  "google.com",
  "bing.com",
  "yahoo.com",
  "amazon.com",
  "ebay.com",
  "etsy.com",
  "pinterest.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "tiktok.com",
  "medium.com",
  "quora.com",
  "stackoverflow.com",
  "crunchbase.com",
  "builtwith.com",
  "similarweb.com",
  "apps.apple.com",
  "play.google.com",
  "nextdoor.com",
  "alignable.com",
]);

function getRegistrableDomain(url: string): string {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return url.toLowerCase();
  }
}

function isBlockedDomain(domain: string): boolean {
  if (BLOCKED_DOMAINS.has(domain)) return true;
  for (const blocked of BLOCKED_DOMAINS) {
    if (domain.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

function offerBrief(payload: ProspectSearchPayload): string {
  return [
    `What the user SELLS (their offer): ${payload.niche || "their service"}`,
    payload.audience && `Ideal BUYER: ${payload.audience}`,
    payload.location && `Location focus: ${payload.location}`,
    payload.ticketSize && `Buyer budget / ticket: ${payload.ticketSize}`,
    payload.notes && `Additional context: ${payload.notes}`,
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
  jobId: string,
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
    }, jobId);
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

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_CHARS = 2_000_000;

async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ClientPilot/0.1; +https://clientpilot.local)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    if (!res.ok) return "";
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) return "";
    const html = await res.text();
    return stripHtml(html.slice(0, MAX_HTML_CHARS));
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
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

const FETCH_CONCURRENCY = 5;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
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
    const seenDomains = new Set<string>();

    function addUrl(item: { title: string; link: string; snippet: string }): boolean {
      const domain = getRegistrableDomain(item.link);
      if (isBlockedDomain(domain) || seenDomains.has(domain)) return false;
      seenDomains.add(domain);
      urls.push(item);
      return true;
    }

    // Extra URLs are explicit user picks — always included, uncapped by maxResults.
    if (payload.extraUrls?.trim()) {
      let added = 0;
      for (const line of payload.extraUrls.split(/[\n,]+/)) {
        const u = line.trim();
        if (!u) continue;
        if (addUrl({ title: u, link: normalizeUrl(u), snippet: "" })) added += 1;
      }
      await log(`Added ${added} URL(s) from Extra URLs`);
    }

    if (payload.sources.includes("google")) {
      const remainingSlots = maxResults - urls.length;
      if (remainingSlots <= 0) {
        await log("Extra URLs already cover the requested result count; skipping Google search.");
      } else {
        const deterministicQueries = (payload.queries ?? []).filter(Boolean);
        let queries: string[];
        if (deterministicQueries.length > 0) {
          await log("Using deterministic buyer-intent queries from your selections...");
          queries = deterministicQueries;
        } else {
          await log("Planning buyer-intent Google queries (not competitor search)...");
          queries = await buildBuyerSearchQueries(payload, job.id);
        }
        for (const q of queries) {
          await log(`Search: ${q}`);
        }
        try {
          const perQueryTarget = Math.min(
            20,
            Math.max(5, Math.ceil((remainingSlots * 1.5) / Math.max(queries.length, 1))),
          );
          const resultSets: { title: string; link: string; snippet: string }[][] = [];
          for (const q of queries) {
            const results = await searchSerpApi(q, perQueryTarget);
            await log(`Found ${results.length} results for query`);
            resultSets.push(results);
          }
          // Round-robin across queries so no single query crowds out the rest.
          let addedFromSearch = 0;
          const maxRounds = Math.max(0, ...resultSets.map((r) => r.length));
          for (let round = 0; round < maxRounds && urls.length < maxResults; round++) {
            for (const set of resultSets) {
              if (urls.length >= maxResults) break;
              const item = set[round];
              if (!item) continue;
              if (addUrl(item)) addedFromSearch += 1;
            }
          }
          await log(`Added ${addedFromSearch} unique result(s) from Google search`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (urls.length === 0) throw err;
          await log(`Google search skipped: ${msg}`, "warn");
        }
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

    const target = urls;
    await log(`Processing ${target.length} potential client leads...`);
    await updateJob(job.id, { progress: 15 });

    await log(`Fetching ${target.length} website(s)...`);
    const pages = await mapWithConcurrency(target, FETCH_CONCURRENCY, async (item) => {
      await assertNotCancelled(job.id);
      const website = normalizeUrl(item.link);
      await log(`Reading ${website}...`);
      const pageText = await fetchPage(website);
      return { website, pageText };
    });
    await updateJob(job.id, { progress: 30 });

    const sellerProfile = await getSellerProfile();
    const icp = `${sellerProfileBrief(sellerProfile)}\n${offerBrief(payload)}`;

    let processed = 0;
    for (let i = 0; i < target.length; i++) {
      const item = target[i]!;
      const { website, pageText } = pages[i]!;
      await assertNotCancelled(job.id);
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
      let scored: { score: number; reasons: string[] } = { score: 0, reasons: [] };

      if (pageText.length > 100) {
        await log(`Analyzing and scoring as a potential client for your offer...`);
        const result = await completeWithRouting("website_analysis", {
          system: `You research sales LEADS for a seller. The prospect should be someone who might BUY the seller's offer — not a competitor who sells the same thing.
Analyze the page AND score the lead in a single pass.
Return strict JSON: { business_name, contact_name, email, summary, pain_points: string[], fit_notes, likely_buyer: boolean, score: number (0-100), reasons: string[] }.
Mark likely_buyer false if this looks like a peer/competitor (e.g. another coach when the seller IS a coach), and penalize score heavily in that case.
Score 0-100 on fit as a CLIENT for the seller's offer — reward clear need, budget fit, location fit, and outreachability.`,
          prompt: `${icp}

Candidate page: ${website}
Search snippet: ${item.snippet}

Page content:
${pageText.slice(0, 9000)}

Extract who they are, whether they might need the seller's offer, and score them as a sales lead.`,
          json: true,
          temperature: 0.2,
        }, job.id);
        const parsed = parseJsonLoose<{
          business_name?: string;
          contact_name?: string;
          email?: string;
          summary?: string;
          pain_points?: string[];
          fit_notes?: string;
          likely_buyer?: boolean;
          score?: number;
          reasons?: string[];
        }>(result.text);
        analysis = parsed;
        scored = { score: parsed.score ?? 0, reasons: parsed.reasons ?? [] };
      } else {
        await log(`Thin or blocked content for ${website}; scoring conservatively from snippet`, "warn");
        analysis = {
          business_name: item.title,
          summary: item.snippet || "Could not fetch page content.",
          pain_points: [],
          fit_notes: "Limited data",
          likely_buyer: true,
        };
        scored = {
          score: 25,
          reasons: ["Website content could not be fetched; scored conservatively."],
        };
      }

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
      const progress = 30 + Math.round((processed / target.length) * 65);
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
