export interface IntentSignal {
  id: string;
  label: string;
  /** Shown as help text under the chip. */
  description: string;
}

export const INTENT_SIGNALS: Record<string, IntentSignal> = {
  no_website: {
    id: "no_website",
    label: "Has no website",
    description: "Businesses with only a social page or listing, no site of their own",
  },
  outdated_site: {
    id: "outdated_site",
    label: "Outdated website",
    description: "Sites that look neglected, stale, or technically dated",
  },
  hiring_dev: {
    id: "hiring_dev",
    label: "Hiring for this need",
    description: "Actively posting jobs related to this offer",
  },
  looking_for_help: {
    id: "looking_for_help",
    label: "Publicly asking for help",
    description: "Forum posts, threads, or requests asking for exactly this kind of help",
  },
  recent_funding: {
    id: "recent_funding",
    label: "Recently funded / growing",
    description: "Recent funding, launch, or expansion news — budget likely available",
  },
  rfp_posted: {
    id: "rfp_posted",
    label: "Posted an RFP",
    description: "Published a formal request for proposal for this kind of work",
  },
  competitor_switch: {
    id: "competitor_switch",
    label: "Looking to switch providers",
    description: "Publicly unhappy with, or looking to replace, their current provider",
  },
  local_no_presence: {
    id: "local_no_presence",
    label: "Underserved in this area",
    description: "Local demand signals with few providers already serving the area",
  },
};

export interface QueryContext {
  /** What the SELLER sells. Only ever used inside "someone is publicly asking for
   * this" phrasings — never as the bare subject of a query, since searching a
   * service name returns the agencies who rank for it, not the businesses needing it. */
  vertical: string;
  /** The kind of business being looked FOR (e.g. "pizza restaurant"). This is the
   * real subject of most queries. Falls back to the buyer type when unset. */
  targetVertical?: string;
  buyerType: string;
  city: string;
  state: string;
  country: string;
}

function loc(ctx: QueryContext): string {
  return [ctx.city, ctx.state].filter(Boolean).join(" ").trim() || ctx.country;
}

/** Who we're hunting for. Never the seller's own service. */
function target(ctx: QueryContext): string {
  return (ctx.targetVertical ?? "").trim() || ctx.buyerType;
}

/** Appended to any query that has to mention the seller's service by name, to push
 * down the agencies/freelancers/directories that SEO for exactly those words — they
 * are competitors, not leads. */
const EXCLUDE_PROVIDERS =
  '-agency -agencies -freelancer -portfolio -"our services" -"our work" -"hire us" -"contact us today" -pricing';

/** Deterministic Google query templates per intent signal — no LLM call required. */
export const INTENT_QUERY_TEMPLATES: Record<string, (ctx: QueryContext) => string[]> = {
  // NOTE: a business with no website has no page for a text search to return, so this
  // signal is only truly answerable by Local Business Hunter (Google Places, which
  // audits each business directly). These queries are a weak proxy — social-only
  // listings — and the UI should steer no-website hunting at that tool instead.
  no_website: (c) => [
    `"${target(c)}" ${loc(c)} site:facebook.com "call us" -"www."`,
    `"${target(c)}" ${loc(c)} "find us on facebook" -"visit our website"`,
  ],
  outdated_site: (c) => [
    `"${target(c)}" ${loc(c)} "under construction" OR "coming soon"`,
    `"${target(c)}" ${loc(c)} "copyright 201" -squarespace -wix`,
  ],
  hiring_dev: (c) => [
    `"${target(c)}" ${loc(c)} "we're hiring" ${c.vertical} ${EXCLUDE_PROVIDERS}`,
    `"${target(c)}" ${loc(c)} "help wanted" ${c.vertical} ${EXCLUDE_PROVIDERS}`,
  ],
  looking_for_help: (c) => [
    `"looking for a" ${c.vertical} ${loc(c)} site:reddit.com`,
    `"can anyone recommend" ${c.vertical} ${loc(c)} ${EXCLUDE_PROVIDERS}`,
    `"${target(c)}" ${loc(c)} "need help with" ${c.vertical} ${EXCLUDE_PROVIDERS}`,
  ],
  recent_funding: (c) => [
    `"${target(c)}" ${loc(c)} "raised" "seed" OR "series a"`,
    `"${target(c)}" ${loc(c)} "just opened" OR "now open" OR "newly opened"`,
  ],
  rfp_posted: (c) => [
    `"request for proposal" ${c.vertical} ${loc(c)} ${EXCLUDE_PROVIDERS}`,
    `"RFP" ${c.vertical} ${loc(c)} "submit" ${EXCLUDE_PROVIDERS}`,
  ],
  competitor_switch: (c) => [
    `"switching from" OR "alternative to" ${c.vertical} site:reddit.com`,
    `"not happy with our" ${c.vertical} ${loc(c)} ${EXCLUDE_PROVIDERS}`,
  ],
  local_no_presence: (c) => [
    `"${target(c)}" ${loc(c)} -directory -yelp -yellowpages -tripadvisor`,
    `"${target(c)}" ${loc(c)} "family owned" OR "locally owned"`,
  ],
};

export function buildDeterministicQueries(
  signalIds: string[],
  ctx: QueryContext,
  customSignalLabels: string[] = [],
): string[] {
  const queries: string[] = [];
  for (const id of signalIds) {
    const build = INTENT_QUERY_TEMPLATES[id];
    if (build) queries.push(...build(ctx));
  }
  for (const label of customSignalLabels) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    queries.push(`"${target(ctx)}" ${loc(ctx)} "${trimmed}" ${EXCLUDE_PROVIDERS}`);
  }
  return [...new Set(queries)].slice(0, 8);
}
