import { completeWithRouting } from "@/lib/ai/complete";
import { getSellerProfile, sellerProfileBrief } from "@/lib/settings/sellerProfile";
import { searchWeb } from "@/lib/connectors/search";
import { searchReddit } from "@/lib/connectors/reddit";
import {
  appendJobEvent,
  getJob,
  updateJob,
  updateProspectSearchStatus,
  upsertLead,
  type JobRow,
} from "@/lib/db/queries";
import { nowIso } from "@/lib/db/client";
import {
  assertNotCancelled,
  extractEmails,
  fetchPage,
  getRegistrableDomain,
  isBlockedDomain,
  mapWithConcurrency,
  normalizeUrl,
  parseJsonLoose,
} from "./shared";

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

const FETCH_CONCURRENCY = 5;

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

    async function runSourceSearch(
      sourceLabel: string,
      queries: string[],
      searchFn: (query: string, n: number) => Promise<{ title: string; link: string; snippet: string }[]>,
    ): Promise<void> {
      const remainingSlots = maxResults - urls.length;
      if (remainingSlots <= 0) return;
      try {
        const perQueryTarget = Math.min(
          20,
          Math.max(5, Math.ceil((remainingSlots * 1.5) / Math.max(queries.length, 1))),
        );
        const resultSets: { title: string; link: string; snippet: string }[][] = [];
        for (const q of queries) {
          const results = await searchFn(q, perQueryTarget);
          await log(`Found ${results.length} ${sourceLabel} result(s) for query`);
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
        await log(`Added ${addedFromSearch} unique result(s) from ${sourceLabel}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (urls.length === 0) throw err;
        await log(`${sourceLabel} search skipped: ${msg}`, "warn");
      }
    }

    const wantsGoogle = payload.sources.includes("google");
    const wantsReddit = payload.sources.includes("reddit");

    if (wantsGoogle || wantsReddit) {
      if (maxResults - urls.length <= 0) {
        await log("Extra URLs already cover the requested result count; skipping search.");
      } else {
        const deterministicQueries = (payload.queries ?? []).filter(Boolean);
        let queries: string[];
        if (deterministicQueries.length > 0) {
          await log("Using deterministic buyer-intent queries from your selections...");
          queries = deterministicQueries;
        } else {
          await log("Planning buyer-intent queries (not competitor search)...");
          queries = await buildBuyerSearchQueries(payload, job.id);
        }
        for (const q of queries) {
          await log(`Search: ${q}`);
        }
        if (wantsGoogle) await runSourceSearch("Google", queries, searchWeb);
        if (wantsReddit) await runSourceSearch("Reddit", queries, searchReddit);
      }
    }

    const comingSoon = payload.sources.filter((s) =>
      ["linkedin", "facebook", "podcasts", "blogs"].includes(s),
    );
    if (comingSoon.length) {
      await log(
        `Sources not yet available (coming soon): ${comingSoon.join(", ")}`,
        "warn",
      );
    }

    if (urls.length === 0) {
      throw new Error(
        "No URLs to process. Add a search connector (Google/Reddit) in Connectors, or paste website URLs.",
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
    let skipped = 0;
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
        try {
          const result = await completeWithRouting("website_analysis", {
            system: `You research sales LEADS for a seller. The prospect must be someone who might BUY the seller's offer — never someone who SELLS it.
Analyze the page AND score the lead in a single pass.
Return strict JSON: { business_name, contact_name, email, summary, pain_points: string[], fit_notes, likely_buyer: boolean, score: number (0-100), reasons: string[] }.

CRITICAL — set likely_buyer=false for ALL of these, they are not leads:
- Any business that PROVIDES the seller's offer: agencies, studios, firms, freelancers, consultancies, "we build X" companies. If the seller sells web design, every web design/development/SEO/marketing agency is a COMPETITOR.
- Directories, listicles, or "top 10 providers" roundups.
- Job boards, hiring pages, training courses, or classes about the offer.
- Government pages, chambers of commerce, news releases, event listings, and membership organizations.
A REAL lead is a business in a DIFFERENT line of work that would PAY for the offer — e.g. a pizzeria, brewery, dentist, plumber, boutique, gym, or salon that needs the seller's help.

Score 0-100 on fit as a CLIENT for the seller's offer — reward clear need, budget fit, location fit, and outreachability.`,
            prompt: `${icp}

Candidate page: ${website}
Search snippet: ${item.snippet}

Page content:
${pageText.slice(0, 9000)}

Extract who they are, whether they might need the seller's offer, and score them as a sales lead.`,
            json: true,
            temperature: 0.2,
            // Denser pages push the model's output past the default 2048-token cap,
            // truncating the response mid-JSON — same failure mode found and fixed in
            // localBusinessPipeline.ts; give it more room before falling back.
            maxTokens: 4096,
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
        } catch (err) {
          // A malformed/truncated model response used to throw out of this loop
          // entirely, aborting the whole job and losing every candidate not yet
          // processed — one bad completion shouldn't cost the rest of the batch.
          const msg = err instanceof Error ? err.message : String(err);
          await log(`AI scoring failed for ${website}: ${msg}`, "warn");
          analysis = {
            business_name: item.title,
            summary: "Website analyzed, but AI scoring failed — worth a manual look.",
            pain_points: [],
            fit_notes: "AI scoring error",
            likely_buyer: true,
          };
          scored = {
            score: 40,
            reasons: [`AI scoring error: ${msg}`],
          };
        }
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

      // Competitors/directories/job pages used to be saved with a capped score, which
      // meant a search for "who needs web design" filled the list with web design
      // agencies. They aren't low-quality leads, they're not leads at all — drop them.
      if (analysis.likely_buyer === false) {
        skipped += 1;
        await log(
          `Skipped ${analysis.business_name || website} — sells/lists this service, not a buyer.`,
        );
        processed += 1;
        await updateJob(job.id, {
          progress: 30 + Math.round((processed / target.length) * 65),
        });
        continue;
      }

      const score = Math.max(0, Math.min(100, Math.round(scored.score ?? 0)));
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
    await log(
      `Done. Processed ${processed} prospect(s), saved ${processed - skipped} lead(s)` +
        (skipped > 0 ? `, skipped ${skipped} that sell this service rather than buy it.` : "."),
    );
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
