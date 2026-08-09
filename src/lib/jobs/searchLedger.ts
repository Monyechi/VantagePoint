import {
  countMarketEntitiesBySearchId,
  listLeadsBySearchId,
  listRecentSearchesByType,
  type ProspectSearch,
} from "@/lib/db/queries";

export const LEDGER_RECENCY_DAYS = 14;

export interface LedgerMatch {
  search: ProspectSearch;
  ageDays: number;
  leadCount: number;
  /** Present for geo matches (local_business_search) only. */
  distanceMiles?: number;
}

const EARTH_RADIUS_MILES = 3958.8;

function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function ageDaysOf(search: ProspectSearch): number {
  return (Date.now() - new Date(search.created_at).getTime()) / 86_400_000;
}

async function withLeadCount(search: ProspectSearch, rest: Omit<LedgerMatch, "search" | "leadCount">): Promise<LedgerMatch> {
  // Local business searches no longer write to `leads` — they populate market_entities
  // (see localBusinessPipeline.ts) — so the "N found last time" count has to come from
  // there instead, or it would always read zero for a real match.
  const count =
    search.job_type === "local_business_search"
      ? await countMarketEntitiesBySearchId(search.id)
      : (await listLeadsBySearchId(search.id)).length;
  return { search, leadCount: count, ...rest };
}

/** Geo dedup for Local Business Hunter: same normalized business-type label, with
 * overlapping search circles (distance between centers <= sum of both radii),
 * searched within LEDGER_RECENCY_DAYS. Keeps the nearest/most-overlapping match. */
export async function checkLocalBusinessLedger(input: {
  businessTypeLabel: string;
  center: { lat: number; lng: number };
  radiusMiles: number;
}): Promise<LedgerMatch | null> {
  const since = new Date(Date.now() - LEDGER_RECENCY_DAYS * 86_400_000).toISOString();
  const candidates = await listRecentSearchesByType("local_business_search", since);
  const wantType = normalize(input.businessTypeLabel);

  let best: { search: ProspectSearch; ageDays: number; distanceMiles: number } | null = null;
  for (const search of candidates) {
    if (search.lat == null || search.lng == null) continue;
    if (normalize(search.niche ?? "") !== wantType) continue;
    const distance = haversineMiles(input.center, { lat: search.lat, lng: search.lng });
    if (distance > input.radiusMiles + (search.radius_miles ?? 10)) continue;
    const ageDays = ageDaysOf(search);
    if (!best || ageDays < best.ageDays) {
      best = { search, ageDays, distanceMiles: Math.round(distance * 10) / 10 };
    }
  }
  if (!best) return null;
  return withLeadCount(best.search, { ageDays: best.ageDays, distanceMiles: best.distanceMiles });
}

/** Text dedup for Prospect Search: normalized niche + normalized location match,
 * within LEDGER_RECENCY_DAYS. Keeps the most recent match. */
export async function checkProspectLedger(input: {
  niche: string;
  location: string;
}): Promise<LedgerMatch | null> {
  const since = new Date(Date.now() - LEDGER_RECENCY_DAYS * 86_400_000).toISOString();
  const candidates = await listRecentSearchesByType("prospect_search", since);
  const wantNiche = normalize(input.niche);
  const wantLocation = normalize(input.location);

  let best: { search: ProspectSearch; ageDays: number } | null = null;
  for (const search of candidates) {
    if (normalize(search.niche ?? "") !== wantNiche) continue;
    if (normalize(search.location ?? "") !== wantLocation) continue;
    const ageDays = ageDaysOf(search);
    if (!best || ageDays < best.ageDays) best = { search, ageDays };
  }
  if (!best) return null;
  return withLeadCount(best.search, { ageDays: best.ageDays });
}
