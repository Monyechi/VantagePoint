import { fetch } from "@tauri-apps/plugin-http";
import { getJob } from "@/lib/db/queries";

export async function assertNotCancelled(jobId: string): Promise<void> {
  const current = await getJob(jobId);
  if (!current || current.state === "cancelled") {
    throw new Error("Job cancelled");
  }
}

export function stripHtml(html: string): string {
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

export function extractEmails(text: string): string[] {
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  const filtered = matches.filter((email) => {
    if (EMAIL_ASSET_EXTENSIONS.test(email)) return false;
    const domain = email.split("@")[1]?.toLowerCase() ?? "";
    return !EMAIL_NOISE_DOMAINS.has(domain);
  });
  return [...new Set(filtered)].slice(0, 5);
}

export function normalizeUrl(url: string): string {
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

export function getRegistrableDomain(url: string): string {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return url.toLowerCase();
  }
}

export function isBlockedDomain(domain: string): boolean {
  if (BLOCKED_DOMAINS.has(domain)) return true;
  for (const blocked of BLOCKED_DOMAINS) {
    if (domain.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_CHARS = 2_000_000;

async function fetchRaw(url: string): Promise<string> {
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
    return html.slice(0, MAX_HTML_CHARS);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

/** Fetches a page and returns text stripped of markup — for feeding to an LLM. */
export async function fetchPage(url: string): Promise<string> {
  return stripHtml(await fetchRaw(url));
}

/** Fetches a page and returns the raw HTML — for tech-signature detection, where
 * stripping tags/attributes would destroy the signatures being searched for. */
export async function fetchRawHtml(url: string): Promise<string> {
  return fetchRaw(url);
}

export function parseJsonLoose<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error("Model did not return valid JSON");
  }
}

export async function mapWithConcurrency<T, R>(
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
