import { fetch } from "@tauri-apps/plugin-http";

export interface DomainInfo {
  domain: string;
  registrar?: string;
  registeredAt?: string;
  expiresAt?: string;
}

/** jCard (RFC 7095) stores fields as [name, params, type, value] tuples inside a
 * ["vcard", [...entries]] wrapper — this pulls out a single named field's value. */
function extractVcardField(vcardArray: unknown, field: string): string | undefined {
  if (!Array.isArray(vcardArray) || vcardArray.length < 2) return undefined;
  const entries = vcardArray[1];
  if (!Array.isArray(entries)) return undefined;
  for (const entry of entries) {
    if (Array.isArray(entry) && entry[0] === field && typeof entry[3] === "string") {
      return entry[3];
    }
  }
  return undefined;
}

/** No API key needed — RDAP is a free, open IETF standard (RFC 7483) that replaced WHOIS.
 * rdap.org bootstraps the request to whichever registry actually holds the domain. */
export async function lookupDomain(domain: string): Promise<DomainInfo> {
  const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
    method: "GET",
    headers: { Accept: "application/rdap+json" },
  });
  if (!res.ok) {
    throw new Error(`RDAP lookup failed for ${domain} (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as {
    events?: { eventAction?: string; eventDate?: string }[];
    entities?: { roles?: string[]; vcardArray?: unknown }[];
  };

  const registeredAt = data.events?.find((e) => e.eventAction === "registration")?.eventDate;
  const expiresAt = data.events?.find((e) => e.eventAction === "expiration")?.eventDate;

  // Registrar name lives in a nested jCard structure that varies enough across registries
  // that this is best-effort — the registration/expiration dates above are the reliable part.
  let registrar: string | undefined;
  try {
    const registrarEntity = data.entities?.find((e) => e.roles?.includes("registrar"));
    registrar = registrarEntity ? extractVcardField(registrarEntity.vcardArray, "fn") : undefined;
  } catch {
    registrar = undefined;
  }

  return { domain, registrar, registeredAt, expiresAt };
}

export function domainAgeYears(info: DomainInfo): number | null {
  if (!info.registeredAt) return null;
  const registered = new Date(info.registeredAt).getTime();
  if (Number.isNaN(registered)) return null;
  return Math.floor((Date.now() - registered) / (1000 * 60 * 60 * 24 * 365.25));
}
