import { completeWithRouting } from "@/lib/ai/complete";
import { getSellerProfile, sellerProfileBrief } from "@/lib/settings/sellerProfile";
import { geocodeLocation, searchPlacesText, type PlaceResult } from "@/lib/connectors/places";
import { runPageSpeed, type PageSpeedScores } from "@/lib/connectors/pagespeed";
import { detectTech, DIY_BUILDER_IDS } from "@/lib/connectors/techDetect";
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
import {
  assertNotCancelled,
  fetchRawHtml,
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
  maxResults: number;
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
  place: PlaceResult;
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
    await log(`Starting local business search: ${payload.businessType} near ${payload.location}`);
    await updateJob(job.id, { progress: 5 });

    const center = await geocodeLocation(payload.location);
    await assertNotCancelled(job.id);

    const places = await searchPlacesText(
      payload.businessType,
      center,
      payload.radiusMiles,
      payload.maxResults,
    );
    if (places.length === 0) {
      throw new Error(
        `No "${payload.businessType}" businesses found near ${payload.location}. Try a wider radius or a different business type.`,
      );
    }
    await log(`Found ${places.length} business(es) on Google Places.`);
    await updateJob(job.id, { progress: 15 });

    const withWebsite = places.filter((p) => p.website);
    const noWebsite = places.filter((p) => !p.website);
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

    const sellerProfile = await getSellerProfile();
    const sellerBrief = sellerProfileBrief(sellerProfile);
    const campaign = `Local Business Hunter: ${payload.businessType} in ${payload.location}`;
    const total = noWebsite.length + analyzed.length;
    let processed = 0;

    // No-website businesses are the clearest possible lead — demand exists (reviews,
    // rating) with nowhere online to send it. No LLM call needed for this case.
    for (const place of noWebsite) {
      await assertNotCancelled(job.id);
      const reasons = [
        `${place.reviewCount ?? 0} Google review(s) at ${place.rating ?? "an unrated"} rating, but no website linked from their Google Business Profile.`,
        "Customers researching services, pricing, or booking have nowhere to go but the phone.",
      ];
      await upsertLead({
        searchId: payload.searchId,
        business: place.name,
        phone: place.phone ?? undefined,
        rating: place.rating ?? undefined,
        reviewCount: place.reviewCount ?? undefined,
        placeId: place.placeId,
        score: 92,
        summary: `${place.name} has no website despite ${place.reviewCount ?? 0} Google reviews (${place.rating ?? "unrated"}).`,
        scoreReasons: reasons.join("\n"),
        opportunityFlags: ["no_website"],
        campaign,
      });
      processed += 1;
      await updateJob(job.id, { progress: 30 + Math.round((processed / total) * 65) });
      await log(`Saved high-priority lead: ${place.name} (no website)`);
    }

    for (const site of analyzed) {
      await assertNotCancelled(job.id);
      const { place, url, combinedText, combinedRaw, pageSpeed } = site;
      const tech = detectTech(combinedRaw);

      const opportunityFlags: string[] = [];
      if (!url.startsWith("https://")) opportunityFlags.push("no_ssl");
      if (pageSpeed.performance !== null && pageSpeed.performance < 50) opportunityFlags.push("slow");
      if (pageSpeed.accessibility !== null && pageSpeed.accessibility < 50) {
        opportunityFlags.push("poor_accessibility");
      }
      if (tech.some((t) => DIY_BUILDER_IDS.has(t.id))) opportunityFlags.push("outdated_builder");

      let contactName: string | undefined;
      let email: string | undefined;
      let summary: string | undefined;
      let painPoints: string[] = [];
      let reasons: string[] = [];
      let score = 45;

      if (combinedText.length > 100) {
        await log(`Scoring website opportunity for ${place.name}...`);
        const result = await completeWithRouting("website_analysis", {
          system: `You audit small-business websites to find sales opportunities for a seller who builds or improves websites.
Given the page content, PageSpeed scores, and detected technology, identify concrete, specific opportunity signals a salesperson can use as talking points — prefer real findings (missing SSL, slow load, no booking, dated DIY builder, no contact form) over vague impressions.
Return strict JSON: { contact_name, email, summary, pain_points: string[], reasons: string[], has_contact_form: boolean, has_online_booking: boolean, score: number (0-100) }.
Find the decision maker (owner/manager/founder) by name if mentioned anywhere in the page content.`,
          prompt: `${sellerBrief}

Business: ${place.name}
Website: ${url}
Google rating: ${place.rating ?? "unknown"} (${place.reviewCount ?? 0} reviews)
PageSpeed — Performance: ${pageSpeed.performance ?? "unknown"}, Accessibility: ${pageSpeed.accessibility ?? "unknown"}, SEO: ${pageSpeed.seo ?? "unknown"}
Detected technology: ${tech.map((t) => t.label).join(", ") || "none detected"}
HTTPS: ${url.startsWith("https://") ? "yes" : "no"}

Page content (homepage + about/contact if found):
${combinedText.slice(0, 9000)}

Score this as a website-opportunity lead for the seller's offer.`,
          json: true,
          temperature: 0.2,
        }, job.id);
        const parsed = parseJsonLoose<{
          contact_name?: string;
          email?: string;
          summary?: string;
          pain_points?: string[];
          reasons?: string[];
          has_contact_form?: boolean;
          has_online_booking?: boolean;
          score?: number;
        }>(result.text);
        contactName = parsed.contact_name;
        email = parsed.email;
        summary = parsed.summary;
        painPoints = parsed.pain_points ?? [];
        reasons = parsed.reasons ?? [];
        score = Math.max(0, Math.min(100, Math.round(parsed.score ?? 45)));
        if (parsed.has_contact_form === false) opportunityFlags.push("no_contact_form");
        if (parsed.has_online_booking === false) opportunityFlags.push("no_online_booking");
      } else {
        summary = "Website exists but returned little or no crawlable content.";
        reasons = ["Website content could not be fetched; scored conservatively."];
        opportunityFlags.push("thin_site");
        score = 55;
      }

      await upsertLead({
        searchId: payload.searchId,
        name: contactName,
        business: place.name,
        email,
        website: url,
        phone: place.phone ?? undefined,
        rating: place.rating ?? undefined,
        reviewCount: place.reviewCount ?? undefined,
        placeId: place.placeId,
        score,
        summary,
        painPoints: painPoints.join("\n"),
        scoreReasons: reasons.join("\n"),
        opportunityFlags,
        campaign,
      });
      processed += 1;
      await updateJob(job.id, { progress: 30 + Math.round((processed / total) * 65) });
      await log(`Saved lead ${place.name} (score ${score})`);
    }

    await updateProspectSearchStatus(payload.searchId, "completed");
    await updateJob(job.id, { state: "completed", progress: 100, completed_at: nowIso() });
    await log(`Done. Processed ${processed} business(es).`);
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
