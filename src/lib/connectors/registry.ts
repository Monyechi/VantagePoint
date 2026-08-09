import type { Connector } from "./types";

export const CONNECTORS: Connector[] = [
  // Search
  {
    id: "serp",
    name: "SerpAPI",
    category: "search",
    description: "Google search results (organic, maps, shopping, images, news).",
    status: "implemented",
    keyHint: "Enter your SerpAPI key in Connectors.",
  },
  {
    id: "tavily",
    name: "Tavily",
    category: "search",
    description: "Search built for AI — clean results, built-in summaries.",
    status: "implemented",
    keyHint: "Enter your Tavily key in Connectors.",
  },
  {
    id: "brave",
    name: "Brave Search",
    category: "search",
    description: "Independent search index, inexpensive, good for company sites and blogs.",
    status: "implemented",
    keyHint: "Enter your Brave Search API key in Connectors.",
  },

  // Email
  {
    id: "resend",
    name: "Resend",
    category: "email",
    description: "Send outreach emails directly instead of mailto/clipboard.",
    status: "implemented",
    keyHint: 'Enter your Resend key and a verified "from" address in Connectors.',
    testCaveat:
      'Resend\'s recommended "sending only" keys can\'t be validated without sending a real email — checked on first send.',
  },

  // Maps
  {
    id: "google_places",
    name: "Google Places",
    category: "maps",
    description: "Market Sweep — enumerate every business by city + type + radius, flag the ones with no website.",
    status: "implemented",
    keyHint: 'Enter a Google Maps Platform key in Connectors (needs "Places API (New)" and "Geocoding API" enabled).',
  },
  {
    id: "openstreetmap",
    name: "OpenStreetMap",
    category: "maps",
    description: "Free geocoding fallback for Market Sweep when no Google key is set — used automatically, no key needed.",
    status: "implemented",
    requiresKey: false,
  },

  // Company intelligence
  {
    id: "apollo",
    name: "Apollo",
    category: "company_intel",
    description: "Company lookup by domain — decision makers, phone numbers, founded year.",
    status: "implemented",
    keyHint: "Enter your Apollo API key in Connectors.",
    testCaveat: "Apollo bills per API call, so there's no Test button here to avoid spending a credit just to check the key.",
  },
  {
    id: "people_data_labs",
    name: "People Data Labs",
    category: "company_intel",
    description: "Large-scale company enrichment by domain.",
    status: "implemented",
    keyHint: "Enter your People Data Labs API key in Connectors.",
    testCaveat: "PDL bills per enrichment call, so there's no Test button here to avoid spending a credit just to check the key.",
  },
  {
    id: "hunter",
    name: "Hunter.io",
    category: "company_intel",
    description: "Find company emails by domain.",
    status: "implemented",
    keyHint: "Enter your Hunter.io API key in Connectors.",
  },
  {
    id: "snov",
    name: "Snov.io",
    category: "company_intel",
    description: "Email finder by domain.",
    status: "implemented",
    keyHint:
      'Enter as "client_id:client_secret" (from your Snov.io API settings) in Connectors — Snov uses OAuth, not a single key.',
    testCaveat: "Snov's domain search spends a credit and takes several seconds to complete, so there's no Test button.",
  },

  // Website tech / SEO
  {
    id: "google_pagespeed",
    name: "Google PageSpeed",
    category: "website_analysis",
    description: "Speed, accessibility, and SEO scores — feeds Market Sweep's digital-maturity profile.",
    status: "implemented",
    keyHint: 'Enter a Google Cloud API key with "PageSpeed Insights API" enabled in Connectors — can be the same key as Google Places.',
  },

  // Domain
  {
    id: "whois",
    name: "WHOIS / DNS (RDAP)",
    category: "domain",
    description: "Domain registration age, registrar, and expiration — no key needed, used from the Leads Enrich action.",
    status: "implemented",
    requiresKey: false,
  },

  // Social
  {
    id: "reddit",
    name: "Reddit",
    category: "social",
    description: "Search public posts for buyer-intent language — a real, selectable source in Prospect Search.",
    status: "implemented",
    keyHint:
      'Register a "script" app at reddit.com/prefs/apps, then enter as "client_id:client_secret" in Connectors.',
  },

  // Documents
  {
    id: "pdf_generation",
    name: "PDF Generation",
    category: "documents",
    description: "One-page proposal PDFs generated from a lead + your Seller Profile — client-side, no external API, no key needed.",
    status: "implemented",
    requiresKey: false,
  },
];

export function connectorsByCategory(): { category: Connector["category"]; connectors: Connector[] }[] {
  const order: Connector["category"][] = [
    "search",
    "email",
    "maps",
    "company_intel",
    "website_analysis",
    "domain",
    "social",
    "documents",
  ];
  return order.map((category) => ({
    category,
    connectors: CONNECTORS.filter((c) => c.category === category),
  }));
}
