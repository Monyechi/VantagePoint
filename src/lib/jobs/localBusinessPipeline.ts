import { completeWithRouting } from "@/lib/ai/complete";
import { getAuditLens } from "@/lib/settings/auditLens";
import { geocodeLocation, sweepPlacesText, type PlaceResult } from "@/lib/connectors/places";
import { runPageSpeed, type PageSpeedScores } from "@/lib/connectors/pagespeed";
import { detectTech, DIY_BUILDER_IDS } from "@/lib/connectors/techDetect";
import { lookupDomain, domainAgeYears } from "@/lib/connectors/domain";
import {
  appendJobEvent,
  getApiKey,
  getJob,
  updateJob,
  updateProspectSearchStatus,
  recordSearchCoverage,
  getOrCreateMarket,
  createMarketSnapshot,
  completeMarketSnapshot,
  insertMarketEntity,
  type JobRow,
} from "@/lib/db/queries";
import { nowIso } from "@/lib/db/client";
import {
  assertNotCancelled,
  fetchRawHtml,
  getRegistrableDomain,
  mapWithConcurrency,
  normalizeUrl,
  parseJsonLoose,
  stripHtml,
} from "./shared";

export interface LocalBusinessSearchPayload {
  searchId: string;
  queryText: string;
  location: string;
  businessType: string;
  radiusMiles: number;
  /** Hard cap on Google Places calls this sweep is allowed to spend, so a dense
   * category + large radius can't silently balloon into hundreds of calls. The sweep
   * reports back whether it stayed under this cap with full coverage or ran out of
   * budget first (see `coverage_complete` on the search row). */
  maxPlacesCalls: number;
  /** Pre-geocoded center, when the caller already resolved it (e.g. for a ledger
   * dedup check before the job was even created). Skips a redundant geocode call. */
  center?: { lat: number; lng: number };
}

/** ~$35/1000 calls is the Places Text Search "Enterprise" SKU rate at moderate volume —
 * this mask pulls phone/rating/review-count, which puts every call in that tier. Used
 * only to show the user a rough cost estimate; not billed by this app. */
export const PLACES_CALL_COST_USD = 0.035;

export const DEFAULT_MAX_PLACES_CALLS = 40;

/** Sentinel value for a broad search across all business types. */
export const BROAD_BUSINESS_TYPE = "__all__";

export function businessTypeLabel(businessType: string): string {
  return businessType === BROAD_BUSINESS_TYPE ? "All business types" : businessType;
}

export function businessTypeSearchQuery(businessType: string): string {
  return businessType === BROAD_BUSINESS_TYPE ? "local business" : businessType;
}

const SITE_CONCURRENCY = 3;

async function fetchFirstNonEmpty(urls: string[]): Promise<string> {
  for (const url of urls) {
    const html = await fetchRawHtml(url);
    if (html.length > 200) return html;
  }
  return "";
}

interface AnalyzedSite {
  place: PlaceResult & { locationCount: number };
  url: string;
  combinedText: string;
  combinedRaw: string;
  pageSpeed: PageSpeedScores;
}

export async function runLocalBusinessSearchJob(job: JobRow): Promise<void> {
  const payload = JSON.parse(job.payload_json) as LocalBusinessSearchPayload;
  const log = (msg: string, level: "info" | "warn" | "error" = "info") =>
    appendJobEvent(job.id, msg, level);

  try {
    const typeLabel = businessTypeLabel(payload.businessType);
    await log(`Starting local business search: ${typeLabel} near ${payload.location}`);
    await updateJob(job.id, { progress: 5 });

    const center = payload.center ?? (await geocodeLocation(payload.location));
    await assertNotCancelled(job.id);

    const maxPlacesCalls = payload.maxPlacesCalls || DEFAULT_MAX_PLACES_CALLS;
    await log(`Sweeping ${payload.radiusMiles} mi radius (budget: ${maxPlacesCalls} Places calls)...`);
    const sweep = await sweepPlacesText(
      businessTypeSearchQuery(payload.businessType),
      center,
      payload.radiusMiles,
      maxPlacesCalls,
    );
    const places = sweep.places;
    if (places.length === 0) {
      throw new Error(
        `No ${typeLabel.toLowerCase()} businesses found near ${payload.location}. Try a wider radius or a different business type.`,
      );
    }
    await log(
      `Found ${places.length} business(es) across ${sweep.callsMade} Places call(s). ` +
        (sweep.complete
          ? "Coverage looks complete for this radius."
          : `Coverage is partial — ${sweep.saturatedUnexpandedCells} dense area(s) may hold more than what's shown. Raise the search budget to expand further.`),
      sweep.complete ? "info" : "warn",
    );
    await recordSearchCoverage(payload.searchId, {
      placesCallCount: sweep.callsMade,
      coverageComplete: sweep.complete,
    });

    const market = await getOrCreateMarket({
      name: `${typeLabel} — ${payload.location}`,
      category: payload.businessType,
      location: payload.location,
      lat: center.lat,
      lng: center.lng,
      radiusMiles: payload.radiusMiles,
    });
    const snapshot = await createMarketSnapshot({ marketId: market.id, searchId: payload.searchId });

    await updateJob(job.id, { progress: 15 });

    // Multi-location businesses (e.g. two branches of the same dental practice) show up as
    // separate Places results sharing one website. These used to be silently dropped after the
    // first location found; now they're collapsed into one entity with a location count instead
    // of losing the "this is a N-location chain" signal entirely.
    const byDomain = new Map<string, { place: PlaceResult; locationCount: number }>();
    const deduped: (PlaceResult & { locationCount: number })[] = [];
    for (const place of places) {
      if (place.website) {
        const domain = getRegistrableDomain(place.website);
        const existing = byDomain.get(domain);
        if (existing) {
          existing.locationCount += 1;
          await log(`${place.name} — additional location of an already-found business (now ${existing.locationCount}).`);
          continue;
        }
        const entry = { place, locationCount: 1 };
        byDomain.set(domain, entry);
        deduped.push({ ...place, locationCount: 1 });
      } else {
        deduped.push({ ...place, locationCount: 1 });
      }
    }
    // Reconcile final counts (a chain's first-seen entry may have gotten more locations
    // added after it was pushed into `deduped`).
    for (const d of deduped) {
      if (d.website) {
        const domain = getRegistrableDomain(d.website);
        const entry = byDomain.get(domain);
        if (entry) d.locationCount = entry.locationCount;
      }
    }

    const withWebsite = deduped.filter((p) => p.website);
    const noWebsite = deduped.filter((p) => !p.website);
    await log(`${noWebsite.length} have no website — automatic high-priority leads.`);

    const hasPageSpeedKey = Boolean(await getApiKey("google_pagespeed"));
    if (withWebsite.length > 0 && !hasPageSpeedKey) {
      await log(
        "No Google PageSpeed key configured — scoring websites without speed/accessibility/SEO data.",
        "warn",
      );
    }

    await log(`Analyzing ${withWebsite.length} website(s)...`);
    const analyzed = await mapWithConcurrency(withWebsite, SITE_CONCURRENCY, async (place) => {
      await assertNotCancelled(job.id);
      const url = normalizeUrl(place.website!);
      await log(`Reading ${url}...`);

      const [homepageRaw, aboutRaw, contactRaw] = await Promise.all([
        fetchRawHtml(url),
        fetchFirstNonEmpty([`${url}/about`, `${url}/about-us`]),
        fetchFirstNonEmpty([`${url}/contact`, `${url}/contact-us`]),
      ]);
      const combinedRaw = [homepageRaw, aboutRaw, contactRaw].join(" ");

      let pageSpeed: PageSpeedScores = { performance: null, accessibility: null, seo: null };
      if (hasPageSpeedKey) {
        try {
          pageSpeed = await runPageSpeed(url);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await log(`PageSpeed unavailable for ${url}: ${msg}`, "warn");
        }
      }

      return {
        place,
        url,
        combinedText: stripHtml(combinedRaw),
        combinedRaw,
        pageSpeed,
      } satisfies AnalyzedSite;
    });
    await updateJob(job.id, { progress: 30 });

    const lens = await getAuditLens();
    const total = noWebsite.length + analyzed.length;
    let processed = 0;

    // No-website businesses have zero digital presence by definition — no LLM call
    // needed, the maturity score is 0 regardless of how well-reviewed the business is.
    for (const place of noWebsite) {
      await assertNotCancelled(job.id);
      await insertMarketEntity({
        snapshotId: snapshot.id,
        placeId: place.placeId,
        name: place.name,
        address: place.address || undefined,
        lat: place.location?.lat,
        lng: place.location?.lng,
        phone: place.phone ?? undefined,
        rating: place.rating ?? undefined,
        reviewCount: place.reviewCount ?? undefined,
        locationCount: place.locationCount,
        deterministicFlags: ["no_website"],
        digitalMaturityScore: 0,
        summary: `No website linked from their Google Business Profile (${place.reviewCount ?? 0} reviews, ${place.rating ?? "unrated"} rating).`,
      });
      processed += 1;
      await updateJob(job.id, { progress: 30 + Math.round((processed / total) * 65) });
      await log(`Profiled ${place.name} (no website found)`);
    }

    for (const site of analyzed) {
      await assertNotCancelled(job.id);
      const { place, url, combinedText, combinedRaw, pageSpeed } = site;
      const tech = detectTech(combinedRaw);
      const domain = getRegistrableDomain(url);

      const deterministicFlags: string[] = [];
      if (!url.startsWith("https://")) deterministicFlags.push("no_ssl");
      if (pageSpeed.performance !== null && pageSpeed.performance < 50) deterministicFlags.push("slow");
      if (pageSpeed.accessibility !== null && pageSpeed.accessibility < 50) {
        deterministicFlags.push("poor_accessibility");
      }
      if (tech.some((t) => DIY_BUILDER_IDS.has(t.id))) deterministicFlags.push("outdated_builder");

      // Free (no API key) business-age signal — how long this domain has existed,
      // via RDAP. Best-effort: some registries don't answer, or rate-limit.
      let domainRegisteredAt: string | undefined;
      let domainAge: number | null = null;
      try {
        const info = await lookupDomain(domain);
        domainRegisteredAt = info.registeredAt;
        domainAge = domainAgeYears(info);
      } catch {
        // RDAP lookup failed — leave domain age unknown rather than fail the entity.
      }

      let contactName: string | undefined;
      let email: string | undefined;
      let summary: string | undefined;
      let notableFacts: string[] = [];
      let attributes: Record<string, boolean> = {};
      let maturityScore = 45;

      if (combinedText.length > 100) {
        await log(`Profiling ${place.name}...`);
        try {
          const attributeIds = lens.attributes.map((a) => a.id);
          const result = await completeWithRouting("website_analysis", {
            system: `${lens.systemPrompt}
Return strict JSON: { contact_name, email, summary, notable_facts: string[], attributes: { ${attributeIds.join(", ")}: boolean }, digital_maturity_score: number (0-100, where 0 = no meaningful digital presence and 100 = a fully modern, fast, accessible, secure site with complete functionality) }.
Name the apparent owner/manager/founder in contact_name if mentioned anywhere in the page content.
Attribute questions to answer as true/false:
${lens.attributes.map((a) => `- ${a.id}: ${a.question}`).join("\n")}`,
            prompt: `Business: ${place.name}
Website: ${url}
Google rating: ${place.rating ?? "unknown"} (${place.reviewCount ?? 0} reviews)
PageSpeed — Performance: ${pageSpeed.performance ?? "unknown"}, Accessibility: ${pageSpeed.accessibility ?? "unknown"}, SEO: ${pageSpeed.seo ?? "unknown"}
Detected technology: ${tech.map((t) => t.label).join(", ") || "none detected"}
HTTPS: ${url.startsWith("https://") ? "yes" : "no"}
Domain age: ${domainAge !== null ? `${domainAge} year(s)` : "unknown"}

Page content (homepage + about/contact if found):
${combinedText.slice(0, 9000)}`,
            json: true,
            temperature: 0.2,
            // Denser homepages push the model's reasoning + JSON output past the default 2048
            // cap, truncating the response mid-JSON — give it more room before falling back.
            maxTokens: 4096,
          }, job.id);
          const parsed = parseJsonLoose<{
            contact_name?: string;
            email?: string;
            summary?: string;
            notable_facts?: string[];
            attributes?: Record<string, boolean>;
            digital_maturity_score?: number;
          }>(result.text);
          contactName = parsed.contact_name;
          email = parsed.email;
          summary = parsed.summary;
          notableFacts = parsed.notable_facts ?? [];
          attributes = parsed.attributes ?? {};
          maturityScore = Math.max(0, Math.min(100, Math.round(parsed.digital_maturity_score ?? 45)));
        } catch (err) {
          // A malformed/truncated model response used to throw out of this loop entirely,
          // aborting the whole job and losing every business not yet processed — one bad
          // completion shouldn't cost the rest of the batch. Fall back and keep going.
          const msg = err instanceof Error ? err.message : String(err);
          await log(`AI profiling failed for ${place.name}: ${msg}`, "warn");
          summary = "Website analyzed, but AI profiling failed — worth a manual look.";
          notableFacts = [`AI profiling error: ${msg}`];
          deterministicFlags.push("ai_profiling_failed");
          maturityScore = 50;
        }
      } else {
        summary = "Website exists but returned little or no crawlable content.";
        notableFacts = ["Website content could not be fetched; scored conservatively."];
        deterministicFlags.push("thin_site");
        maturityScore = 35;
      }

      await insertMarketEntity({
        snapshotId: snapshot.id,
        placeId: place.placeId,
        name: place.name,
        address: place.address || undefined,
        lat: place.location?.lat,
        lng: place.location?.lng,
        phone: place.phone ?? undefined,
        website: url,
        rating: place.rating ?? undefined,
        reviewCount: place.reviewCount ?? undefined,
        locationCount: place.locationCount,
        domainRegisteredAt,
        domainAgeYears: domainAge ?? undefined,
        techStack: tech.map((t) => t.label),
        pagespeedPerformance: pageSpeed.performance ?? undefined,
        pagespeedAccessibility: pageSpeed.accessibility ?? undefined,
        pagespeedSeo: pageSpeed.seo ?? undefined,
        deterministicFlags,
        attributes,
        digitalMaturityScore: maturityScore,
        summary: [summary, ...notableFacts].filter(Boolean).join(" "),
        contactName,
        email,
      });
      processed += 1;
      await updateJob(job.id, { progress: 30 + Math.round((processed / total) * 65) });
      await log(`Profiled ${place.name} (digital maturity ${maturityScore}/100)`);
    }

    await completeMarketSnapshot(snapshot.id, {
      placesCallCount: sweep.callsMade,
      coverageComplete: sweep.complete,
      entityCount: processed,
    });
    await updateProspectSearchStatus(payload.searchId, "completed");
    await updateJob(job.id, { state: "completed", progress: 100, completed_at: nowIso() });
    await log(`Done. Profiled ${processed} business(es).`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const cancelled = msg === "Job cancelled";
    await log(msg, cancelled ? "warn" : "error");
    await updateProspectSearchStatus(payload.searchId, cancelled ? "cancelled" : "failed");
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
