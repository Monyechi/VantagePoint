import { fetch } from "@tauri-apps/plugin-http";
import { getApiKey } from "@/lib/db/queries";

export interface EnrichmentResult {
  provider: string;
  emails: string[];
  companyName?: string;
  companySummary?: string;
}

export async function enrichHunter(domain: string, key: string): Promise<EnrichmentResult> {
  const params = new URLSearchParams({ domain, api_key: key });
  const res = await fetch(`https://api.hunter.io/v2/domain-search?${params.toString()}`, {
    method: "GET",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Hunter.io error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    data?: {
      organization?: string;
      emails?: { value?: string }[];
    };
  };
  const emails = (data.data?.emails ?? [])
    .map((e) => e.value)
    .filter((v): v is string => Boolean(v));
  return {
    provider: "hunter",
    emails,
    companyName: data.data?.organization,
  };
}

export async function enrichApollo(domain: string, key: string): Promise<EnrichmentResult> {
  const res = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify({ q_organization_domains_list: [domain], per_page: 1 }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Apollo error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    organizations?: { name?: string; phone?: string; founded_year?: number }[];
  };
  const org = data.organizations?.[0];
  return {
    provider: "apollo",
    emails: [],
    companyName: org?.name,
    companySummary: org
      ? [org.founded_year && `Founded ${org.founded_year}`, org.phone].filter(Boolean).join(", ")
      : undefined,
  };
}

export async function enrichPeopleDataLabs(
  domain: string,
  key: string,
): Promise<EnrichmentResult> {
  const params = new URLSearchParams({ website: domain });
  const res = await fetch(`https://api.peopledatalabs.com/v5/company/enrich?${params.toString()}`, {
    method: "GET",
    headers: { "X-Api-Key": key },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`People Data Labs error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    name?: string;
    summary?: string;
    employee_count?: number;
    industry?: string;
  };
  return {
    provider: "people_data_labs",
    emails: [],
    companyName: data.name,
    companySummary:
      [data.industry, data.employee_count && `${data.employee_count} employees`]
        .filter(Boolean)
        .join(", ") || data.summary,
  };
}

function splitSnovCredentials(combined: string): { clientId: string; clientSecret: string } {
  const idx = combined.indexOf(":");
  if (idx === -1) {
    throw new Error('Snov.io key must be saved as "client_id:client_secret".');
  }
  return { clientId: combined.slice(0, idx), clientSecret: combined.slice(idx + 1) };
}

async function getSnovToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch("https://api.snov.io/v1/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Snov.io auth error ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Snov.io did not return an access token.");
  return data.access_token;
}

const SNOV_POLL_ATTEMPTS = 8;
const SNOV_POLL_DELAY_MS = 2000;

/** Snov's domain search is asynchronous: start a task, then poll for its result. */
export async function enrichSnov(domain: string, combinedKey: string): Promise<EnrichmentResult> {
  const { clientId, clientSecret } = splitSnovCredentials(combinedKey);
  const token = await getSnovToken(clientId, clientSecret);

  const startRes = await fetch("https://api.snov.io/v2/domain-search/start", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ domain }),
  });
  if (!startRes.ok) {
    const t = await startRes.text();
    throw new Error(`Snov.io error ${startRes.status}: ${t.slice(0, 300)}`);
  }
  const startData = (await startRes.json()) as { data?: { task_hash?: string } };
  const taskHash = startData.data?.task_hash;
  if (!taskHash) throw new Error("Snov.io did not return a task handle.");

  for (let attempt = 0; attempt < SNOV_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, SNOV_POLL_DELAY_MS));
    const resultRes = await fetch(
      `https://api.snov.io/v2/domain-search/result?task_hash=${encodeURIComponent(taskHash)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!resultRes.ok) continue;
    const resultData = (await resultRes.json()) as {
      data?: {
        status?: string;
        result?: { emails?: { email?: string }[] };
      };
    };
    const status = resultData.data?.status;
    if (status === "completed" || status === "finished" || status === "success") {
      const emails = (resultData.data?.result?.emails ?? [])
        .map((e) => e.email)
        .filter((v): v is string => Boolean(v));
      return { provider: "snov", emails };
    }
    if (status === "failed") throw new Error("Snov.io domain search failed.");
  }
  throw new Error("Snov.io domain search timed out — try again in a moment.");
}

/** Checked in this order — whichever the user has configured first wins. */
const ENRICHMENT_PROVIDER_PRIORITY = ["hunter", "apollo", "people_data_labs", "snov"] as const;

export async function enrichDomain(domain: string): Promise<EnrichmentResult> {
  for (const provider of ENRICHMENT_PROVIDER_PRIORITY) {
    const key = await getApiKey(provider);
    if (!key) continue;
    switch (provider) {
      case "hunter":
        return enrichHunter(domain, key);
      case "apollo":
        return enrichApollo(domain, key);
      case "people_data_labs":
        return enrichPeopleDataLabs(domain, key);
      case "snov":
        return enrichSnov(domain, key);
    }
  }
  throw new Error(
    "No company-enrichment connector configured. Add Hunter.io, Apollo, People Data Labs, or Snov.io in Connectors.",
  );
}
