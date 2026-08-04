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
  vertical: string;
  buyerType: string;
  city: string;
  state: string;
  country: string;
}

function loc(ctx: QueryContext): string {
  return [ctx.city, ctx.state].filter(Boolean).join(" ").trim() || ctx.country;
}

/** Deterministic Google query templates per intent signal — no LLM call required. */
export const INTENT_QUERY_TEMPLATES: Record<string, (ctx: QueryContext) => string[]> = {
  no_website: (c) => [
    `"${c.buyerType}" ${loc(c)} "find us on facebook" -website -"www."`,
    `${loc(c)} ${c.vertical} "call us" -site:facebook.com -"www."`,
  ],
  outdated_site: (c) => [
    `${loc(c)} ${c.vertical} "under construction" OR "coming soon" site`,
    `${loc(c)} ${c.vertical} "est. 20" -"www.squarespace" -"www.wix"`,
  ],
  hiring_dev: (c) => [
    `${loc(c)} "hiring" ${c.vertical} "looking for" -jobs`,
    `${loc(c)} "we need" ${c.vertical} "help wanted"`,
  ],
  looking_for_help: (c) => [
    `"looking for" ${c.vertical} ${loc(c)}`,
    `"need" ${c.vertical} "recommend" ${loc(c)}`,
    `"anyone know a good" ${c.vertical} ${loc(c)}`,
  ],
  recent_funding: (c) => [
    `${loc(c)} "${c.buyerType}" "raised" "seed" OR "series a"`,
    `${loc(c)} "${c.buyerType}" "just launched" OR "newly opened"`,
  ],
  rfp_posted: (c) => [
    `${loc(c)} "RFP" ${c.vertical}`,
    `"request for proposal" ${c.vertical} ${loc(c)}`,
  ],
  competitor_switch: (c) => [
    `"switching from" OR "looking for an alternative to" ${c.vertical}`,
    `"not happy with our" ${c.vertical} ${loc(c)}`,
  ],
  local_no_presence: (c) => [
    `${loc(c)} ${c.vertical} "near me" -directory -yelp -yellowpages`,
    `best ${c.vertical} ${loc(c)} "${c.buyerType}"`,
  ],
};

export function buildDeterministicQueries(
  signalIds: string[],
  ctx: QueryContext,
): string[] {
  const queries: string[] = [];
  for (const id of signalIds) {
    const build = INTENT_QUERY_TEMPLATES[id];
    if (build) queries.push(...build(ctx));
  }
  return [...new Set(queries)].slice(0, 8);
}
