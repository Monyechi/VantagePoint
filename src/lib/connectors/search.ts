import { fetch } from "@tauri-apps/plugin-http";
import { getApiKey } from "@/lib/db/queries";

export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
}

export async function searchSerpApi(
  query: string,
  maxResults: number,
  key: string,
): Promise<WebSearchResult[]> {
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
    .map((r) => ({ title: r.title ?? "", link: r.link!, snippet: r.snippet ?? "" }))
    .slice(0, maxResults);
}

export async function searchTavily(
  query: string,
  maxResults: number,
  key: string,
): Promise<WebSearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query,
      max_results: Math.min(Math.max(maxResults, 1), 20),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Tavily error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };
  return (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({ title: r.title ?? "", link: r.url!, snippet: r.content ?? "" }))
    .slice(0, maxResults);
}

export async function searchBrave(
  query: string,
  maxResults: number,
  key: string,
): Promise<WebSearchResult[]> {
  const params = new URLSearchParams({ q: query, count: String(Math.min(maxResults, 20)) });
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": key,
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Brave Search error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    web?: { results?: { title?: string; url?: string; description?: string }[] };
  };
  return (data.web?.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({ title: r.title ?? "", link: r.url!, snippet: r.description ?? "" }))
    .slice(0, maxResults);
}

/** Checked in this order — whichever the user has configured first wins. */
const SEARCH_PROVIDER_PRIORITY = ["serp", "tavily", "brave"] as const;

/** Dispatches to whichever configured search connector is available. */
export async function searchWeb(query: string, maxResults: number): Promise<WebSearchResult[]> {
  for (const providerId of SEARCH_PROVIDER_PRIORITY) {
    const key = await getApiKey(providerId);
    if (!key) continue;
    if (providerId === "serp") return searchSerpApi(query, maxResults, key);
    if (providerId === "tavily") return searchTavily(query, maxResults, key);
    return searchBrave(query, maxResults, key);
  }
  throw new Error(
    "No search connector configured. Add a SerpAPI, Tavily, or Brave Search key in Settings, or paste website URLs in Extra URLs.",
  );
}
