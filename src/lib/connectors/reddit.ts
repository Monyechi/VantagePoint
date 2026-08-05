import { fetch } from "@tauri-apps/plugin-http";
import { getApiKey } from "@/lib/db/queries";
import type { WebSearchResult } from "./search";

const REDDIT_USER_AGENT = "desktop:com.clientpilot.app:v0.1 (by /u/clientpilot_user)";

function splitRedditCredentials(combined: string): { clientId: string; clientSecret: string } {
  const idx = combined.indexOf(":");
  if (idx === -1) {
    throw new Error('Reddit key must be saved as "client_id:client_secret".');
  }
  return { clientId: combined.slice(0, idx), clientSecret: combined.slice(idx + 1) };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getRedditToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": REDDIT_USER_AGENT,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Reddit auth error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Reddit did not return an access token.");
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
  };
  return cachedToken.token;
}

/** App-only OAuth (no user login) — read-only public search, good fit for finding
 * buyer-intent posts ("looking for a coach", "need a plumber", etc). */
export async function searchReddit(
  query: string,
  maxResults: number,
): Promise<WebSearchResult[]> {
  const combinedKey = await getApiKey("reddit");
  if (!combinedKey) throw new Error("No Reddit key. Add one in Connectors.");
  const { clientId, clientSecret } = splitRedditCredentials(combinedKey);
  const token = await getRedditToken(clientId, clientSecret);

  const params = new URLSearchParams({
    q: query,
    limit: String(Math.min(Math.max(maxResults, 1), 25)),
    sort: "relevance",
  });
  const res = await fetch(`https://oauth.reddit.com/search?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": REDDIT_USER_AGENT,
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Reddit error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    data?: { children?: { data?: { title?: string; permalink?: string; selftext?: string } }[] };
  };
  return (data.data?.children ?? [])
    .map((c) => c.data)
    .filter((d): d is { title?: string; permalink?: string; selftext?: string } =>
      Boolean(d?.permalink),
    )
    .map((d) => ({
      title: d.title ?? "",
      link: `https://www.reddit.com${d.permalink}`,
      snippet: (d.selftext ?? "").slice(0, 300),
    }))
    .slice(0, maxResults);
}
