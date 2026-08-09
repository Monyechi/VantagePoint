import type { MarketEntity } from "@/lib/db/queries";

export interface DistributionBucket {
  label: string;
  count: number;
}

export interface MarketStats {
  totalCount: number;
  /** Sum of location_count across entities — distinct from totalCount when chains
   * were collapsed into one profiled entity (see localBusinessPipeline.ts). */
  totalLocationCount: number;
  avgRating: number | null;
  avgReviewCount: number | null;
  websiteCount: number;
  noWebsiteCount: number;
  pctNoWebsite: number;
  chainCount: number;
  /** Counts of objective, non-LLM flags (no_ssl, slow, poor_accessibility, etc). */
  deterministicFlagCounts: Record<string, number>;
  /** Counts of entities where an audit-lens attribute question came back false —
   * e.g. how many sites have no online booking. */
  attributeFalseCounts: Record<string, number>;
  digitalMaturityBuckets: DistributionBucket[];
  domainAgeBuckets: DistributionBucket[];
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseAttributes(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>;
    }
    return {};
  } catch {
    return {};
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

const MATURITY_BUCKETS = [
  { label: "0–25", min: 0, max: 25 },
  { label: "25–50", min: 25, max: 50 },
  { label: "50–75", min: 50, max: 75 },
  { label: "75–100", min: 75, max: 101 },
];

const DOMAIN_AGE_BUCKETS = [
  { label: "< 1 yr", min: 0, max: 1 },
  { label: "1–3 yrs", min: 1, max: 3 },
  { label: "3–7 yrs", min: 3, max: 7 },
  { label: "7–15 yrs", min: 7, max: 15 },
  { label: "15+ yrs", min: 15, max: Infinity },
];

export function computeMarketStats(entities: MarketEntity[]): MarketStats {
  const websiteEntities = entities.filter((e) => e.website);
  const ratings = entities.map((e) => e.rating).filter((r): r is number => r !== null);
  const reviewCounts = entities
    .map((e) => e.review_count)
    .filter((r): r is number => r !== null);

  const deterministicFlagCounts: Record<string, number> = {};
  for (const e of entities) {
    for (const flag of parseJsonArray(e.deterministic_flags)) {
      deterministicFlagCounts[flag] = (deterministicFlagCounts[flag] ?? 0) + 1;
    }
  }

  const attributeFalseCounts: Record<string, number> = {};
  for (const e of entities) {
    const attrs = parseAttributes(e.attributes_json);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === false) attributeFalseCounts[key] = (attributeFalseCounts[key] ?? 0) + 1;
    }
  }

  const digitalMaturityBuckets = MATURITY_BUCKETS.map((b) => ({
    label: b.label,
    count: entities.filter(
      (e) => e.digital_maturity_score !== null && e.digital_maturity_score >= b.min && e.digital_maturity_score < b.max,
    ).length,
  }));

  const domainAgeBuckets = DOMAIN_AGE_BUCKETS.map((b) => ({
    label: b.label,
    count: entities.filter(
      (e) => e.domain_age_years !== null && e.domain_age_years >= b.min && e.domain_age_years < b.max,
    ).length,
  }));

  return {
    totalCount: entities.length,
    totalLocationCount: entities.reduce((sum, e) => sum + (e.location_count || 1), 0),
    avgRating: average(ratings),
    avgReviewCount: average(reviewCounts),
    websiteCount: websiteEntities.length,
    noWebsiteCount: entities.length - websiteEntities.length,
    pctNoWebsite:
      entities.length === 0 ? 0 : Math.round(((entities.length - websiteEntities.length) / entities.length) * 100),
    chainCount: entities.filter((e) => e.location_count > 1).length,
    deterministicFlagCounts,
    attributeFalseCounts,
    digitalMaturityBuckets,
    domainAgeBuckets,
  };
}
