import { completeWithRouting } from "./complete";
import { getSellerProfile, sellerProfileBrief, type SellerProfile } from "@/lib/settings/sellerProfile";
import { getChatDefaults, type ChatDefaults } from "@/lib/settings/chatDefaults";
import { geocodeLocation } from "@/lib/connectors/places";
import { checkLocalBusinessLedger, checkProspectLedger, type LedgerMatch } from "@/lib/jobs/searchLedger";
import { BROAD_BUSINESS_TYPE, businessTypeLabel } from "@/lib/jobs/localBusinessPipeline";
import { parseJsonLoose } from "@/lib/jobs/shared";
import {
  createJob,
  createProspectSearch,
  insertChatMessage,
  listChatMessages,
  type ChatMessage,
} from "@/lib/db/queries";
import {
  BUYER_TYPES,
  INDUSTRIES,
  INTENT_SIGNALS,
  budgetBandLabel,
  buildDeterministicQueries,
  buyerTypeLabel,
  companySizeLabel,
  findService,
} from "@/lib/taxonomy";

export interface ChatQuickReplyOption {
  label: string;
  value: string;
}

export interface LocalBusinessSearchParams {
  location: string;
  businessType: string;
  radiusMiles: 5 | 10 | 15 | 25;
  maxResults: 10 | 20 | 30;
}

export interface ProspectSearchParams {
  industryId: string;
  serviceId: string;
  buyerTypeId: string;
  intentSignalIds: string[];
  location: string;
  /** The kind of business being looked FOR (e.g. "pizza restaurant"). Distinct from
   * the seller's own service — searching the seller's service name returns
   * competitors who rank for those words, not buyers. */
  targetVertical?: string;
  budgetBandId?: string;
  companySizeId?: string;
  maxResults?: 10 | 25 | 50;
  notes?: string;
}

export interface ChatLaunchLocalBusinessSearchAction {
  kind: "launch_local_business_search";
  message: string;
  params: LocalBusinessSearchParams;
}
export interface ChatLaunchProspectSearchAction {
  kind: "launch_prospect_search";
  message: string;
  params: ProspectSearchParams;
}
export type ChatAgentAction =
  | { kind: "reply"; message: string }
  | { kind: "clarify"; message?: string; question: string; options: ChatQuickReplyOption[] }
  | ChatLaunchLocalBusinessSearchAction
  | ChatLaunchProspectSearchAction;

export interface ChatTurnResult {
  action: ChatAgentAction;
  jobId?: string;
  searchId?: string;
  /** Set when a launch_* action was proposed but blocked pending user confirmation. */
  ledgerMatch?: LedgerMatch;
}

// ——— Prompt construction ———

function buildSystemPrompt(profile: SellerProfile, defaults: ChatDefaults): string {
  const industryLines = INDUSTRIES.map(
    (i) => `${i.id} (${i.label}): ${i.services.map((s) => `${s.id}=${s.label}`).join(", ")}`,
  ).join("\n");
  const buyerLines = BUYER_TYPES.map((b) => `${b.id}=${b.label}`).join(", ");
  const signalLines = Object.values(INTENT_SIGNALS)
    .map((s) => `${s.id}=${s.label}`)
    .join(", ");
  const defaultLines = [
    defaults.industryId && defaults.serviceId
      ? `Default offer category: ${defaults.industryId}/${defaults.serviceId}`
      : null,
    defaults.location ? `Default search location: ${defaults.location}` : null,
    defaults.businessType ? `Default local-business type: ${defaults.businessType}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are ClientPilot's lead-search assistant. Every turn, output ONE JSON object matching the contract below — no prose outside the JSON, no markdown code fences.

## Who you're working for
${sellerProfileBrief(profile)}
${defaultLines || "No chat defaults set."}

## The two search tools — they find VERY different things. Choose carefully.

1. local_business_search (Google Places + live website audit) — **the default for
   finding businesses that NEED what the seller sells.**
   It looks up real businesses by category near a city, then visits each one's actual
   website and audits it (no website at all, no SSL, slow, dated DIY builder, no
   booking form). This is the ONLY tool that can find "businesses with no website" or
   "businesses whose site is outdated", because it inspects the businesses themselves
   rather than searching text.
   "businessType" = the category of business to FIND (pizza restaurant, brewery,
   plumber, dentist, salon) — NOT what the seller sells. Use
   businessType="${BROAD_BUSINESS_TYPE}" to sweep every category at once.

2. prospect_search (web + Reddit TEXT search) — only for buying signals that exist as
   PUBLISHED TEXT someone wrote: publicly asking for a recommendation, a posted RFP,
   funding/expansion news, hiring posts.
   Hard limits you must respect: it searches page text, so it CANNOT find businesses
   with no website (no website means no page to find), and searching the NAME of the
   seller's own service mostly returns competitors who sell that service and rank for
   those words. Only choose it when the user explicitly wants forum/RFP/funding-style
   signals, or the targets are not local businesses (startups, SaaS companies).

## Routing rule (this is the most important instruction here)
If the request is "find businesses that need <what the seller sells>", and those
businesses are physical/local (restaurants, shops, contractors, clinics, gyms,
breweries, salons), use **local_business_search**. Do NOT use prospect_search for
this — it returns other agencies selling the same service instead of buyers.

Contrastive examples:
- "find dentists in Orlando" -> local_business_search, businessType="Dentist".
- "find small businesses that need a website in Tampa" -> local_business_search with
  businessType="${BROAD_BUSINESS_TYPE}" (or a specific category if the user named
  one). The no-website and outdated-site audit is exactly what this tool does.
- "find clients for my web design studio in Tampa" -> local_business_search too —
  the buyers are local businesses whose sites you can audit.
- "find startups that just raised funding and need an app" -> prospect_search
  (funding news is published text; startups aren't Places-listed local businesses).
- "who posted an RFP for accounting work" -> prospect_search (RFPs are published text).

## Location must be specific enough to search
local_business_search searches a radius (max ~30 miles) around ONE geocoded point, so
a whole state or country will not work. If the user gives a state ("Florida"), a
country, or nothing, ask which city or metro area first — offer 3-5 of that region's
largest metros as options. A city, "City, ST", or a neighborhood is specific enough.

## Taxonomy for prospect_search (use these exact ids, never invent new ones)
${industryLines}
Buyer types: ${buyerLines}
Intent signals: ${signalLines}

## When to ask vs proceed
Proceed WITHOUT asking whenever the message, the seller profile, or the defaults
above reasonably imply an answer. Ask when launching would otherwise be a guess on
something that meaningfully changes the results — most often: a location that isn't
a specific city (see above), or which kind of business to target when the user's
offer could serve many. Prefer 2-5 short options. Each option's "value" must be a
complete, self-contained reply — it is sent back to you verbatim as the user's next
message, with no other context attached, so it must stand alone.

## If you choose prospect_search, set targetVertical
"targetVertical" is the kind of business being looked FOR (e.g. "pizza restaurant",
"independent brewery", "dental practice"). It is what gets searched. Never leave it
as the seller's own service name, or the results will be competitors.

## Output contract — respond with exactly one of these JSON shapes:
${JSON_CONTRACT}`;
}

function buildTurnPrompt(history: ChatMessage[], userText: string): string {
  const transcript = history
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  return transcript ? `Conversation so far:\n${transcript}\n\nUser: ${userText}` : `User: ${userText}`;
}

// ——— Response validation (no schema library in this codebase — hand-rolled, same
// convention as the rest of the app; falls back to a safe reply on anything malformed
// rather than throwing into the UI) ———

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

const RADIUS_OPTIONS = [5, 10, 15, 25] as const;
const LOCAL_RESULT_OPTIONS = [10, 20, 30] as const;
const PROSPECT_RESULT_OPTIONS = [10, 25, 50] as const;

function pickEnum<T extends number>(value: unknown, options: readonly T[], fallback: T): T {
  const n = Number(value);
  return (options as readonly number[]).includes(n) ? (n as T) : fallback;
}

function validateChatAction(raw: unknown): ChatAgentAction {
  if (!isRecord(raw) || typeof raw.kind !== "string") {
    throw new Error("Missing kind");
  }

  if (raw.kind === "reply") {
    if (typeof raw.message !== "string") throw new Error("Missing message");
    return { kind: "reply", message: raw.message };
  }

  if (raw.kind === "clarify") {
    if (typeof raw.question !== "string" || !Array.isArray(raw.options)) {
      throw new Error("Malformed clarify");
    }
    const options = raw.options
      .filter(isRecord)
      .map((o) => ({ label: String(o.label ?? ""), value: String(o.value ?? "") }))
      .filter((o) => o.label && o.value);
    if (options.length === 0) throw new Error("No usable options");
    return {
      kind: "clarify",
      message: typeof raw.message === "string" ? raw.message : undefined,
      question: raw.question,
      options,
    };
  }

  if (raw.kind === "launch_local_business_search") {
    const params = raw.params;
    if (!isRecord(params) || typeof params.location !== "string" || typeof params.businessType !== "string") {
      throw new Error("Malformed launch_local_business_search params");
    }
    return {
      kind: "launch_local_business_search",
      message: typeof raw.message === "string" ? raw.message : "Searching...",
      params: {
        location: params.location,
        businessType: params.businessType,
        radiusMiles: pickEnum(params.radiusMiles, RADIUS_OPTIONS, 10),
        maxResults: pickEnum(params.maxResults, LOCAL_RESULT_OPTIONS, 20),
      },
    };
  }

  if (raw.kind === "launch_prospect_search") {
    const params = raw.params;
    if (
      !isRecord(params) ||
      typeof params.industryId !== "string" ||
      typeof params.serviceId !== "string" ||
      typeof params.buyerTypeId !== "string" ||
      typeof params.location !== "string"
    ) {
      throw new Error("Malformed launch_prospect_search params");
    }
    return {
      kind: "launch_prospect_search",
      message: typeof raw.message === "string" ? raw.message : "Searching...",
      params: {
        industryId: params.industryId,
        serviceId: params.serviceId,
        buyerTypeId: params.buyerTypeId,
        intentSignalIds: Array.isArray(params.intentSignalIds)
          ? params.intentSignalIds.filter((x): x is string => typeof x === "string")
          : [],
        location: params.location,
        targetVertical: typeof params.targetVertical === "string" ? params.targetVertical : undefined,
        budgetBandId: typeof params.budgetBandId === "string" ? params.budgetBandId : undefined,
        companySizeId: typeof params.companySizeId === "string" ? params.companySizeId : undefined,
        maxResults:
          params.maxResults === undefined
            ? undefined
            : pickEnum(params.maxResults, PROSPECT_RESULT_OPTIONS, 25),
        notes: typeof params.notes === "string" ? params.notes : undefined,
      },
    };
  }

  throw new Error(`Unknown action kind: ${String(raw.kind)}`);
}

// ——— Launch helpers — mirror what ProspectPage.tsx / LocalBusinessHunterPage.tsx
// already do in their startSearch() handlers, so a chat-launched search and a
// manually-launched one produce identically-shaped jobs/ledger rows. ———

export async function finalizeLocalBusinessLaunch(
  action: ChatLaunchLocalBusinessSearchAction,
  center: { lat: number; lng: number },
): Promise<ChatTurnResult> {
  const { params } = action;
  const typeLabel = businessTypeLabel(params.businessType);
  const queryText = `${typeLabel} near ${params.location}`;

  const search = await createProspectSearch({
    queryText,
    jobType: "local_business_search",
    niche: typeLabel,
    location: params.location,
    audience: `${params.radiusMiles} mile radius`,
    sources: ["google_places"],
    lat: center.lat,
    lng: center.lng,
    radiusMiles: params.radiusMiles,
  });
  // The chat contract's maxResults (10/20/30) is a coarse "how thorough" dial from
  // before tiled sweeps existed — translate it into a Places call budget rather than
  // reworking the chat action schema/prompt, which is out of scope here.
  const maxPlacesCalls = params.maxResults <= 10 ? 20 : params.maxResults <= 20 ? 40 : 80;
  const job = await createJob({
    type: "local_business_search",
    searchId: search.id,
    payload: {
      searchId: search.id,
      queryText,
      location: params.location,
      businessType: params.businessType,
      radiusMiles: params.radiusMiles,
      maxPlacesCalls,
      center,
    },
  });
  return { action, jobId: job.id, searchId: search.id };
}

async function tryLaunchLocalBusinessSearch(
  action: ChatLaunchLocalBusinessSearchAction,
): Promise<ChatTurnResult> {
  const { params } = action;
  let center: { lat: number; lng: number };
  try {
    center = await geocodeLocation(params.location);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      action: {
        kind: "reply",
        message: `I couldn't find "${params.location}" on the map (${msg}). Could you try a more specific city/state?`,
      },
    };
  }

  const typeLabel = businessTypeLabel(params.businessType);
  const match = await checkLocalBusinessLedger({
    businessTypeLabel: typeLabel,
    center,
    radiusMiles: params.radiusMiles,
  });
  if (match) return { action, ledgerMatch: match };

  return finalizeLocalBusinessLaunch(action, center);
}

function resolveService(params: ProspectSearchParams) {
  const resolved = findService(params.industryId, params.serviceId);
  const industry = resolved?.industry ?? INDUSTRIES[0]!;
  const service = resolved?.service ?? industry.services[0]!;
  return { industry, service };
}

export async function finalizeProspectLaunch(
  action: ChatLaunchProspectSearchAction,
): Promise<ChatTurnResult> {
  const { params } = action;
  const { industry, service } = resolveService(params);
  const buyerLabel = buyerTypeLabel(params.buyerTypeId);
  const niche = `${industry.label} — ${service.label}`;
  const sizeSuffix =
    params.companySizeId && params.companySizeId !== "any"
      ? ` (company size: ${companySizeLabel(params.companySizeId)})`
      : "";
  const audience = `${buyerLabel}${sizeSuffix} needing ${service.label}`;
  const ticketSize = params.budgetBandId ? budgetBandLabel(params.budgetBandId) : undefined;
  const sources = ["google", "reddit"];

  // No location decomposition into city/state/country here (unlike ProspectPage's
  // form) — chat collects one free-text location string, fed into the query
  // templates' `city` slot, which is functionally equivalent for query-building.
  const queries = buildDeterministicQueries(
    params.intentSignalIds,
    {
      vertical: service.label,
      targetVertical: params.targetVertical,
      buyerType: buyerLabel,
      city: params.location,
      state: "",
      country: "",
    },
    [],
  );
  const queryText = [niche, params.location, audience, ticketSize].filter(Boolean).join(" · ");

  const search = await createProspectSearch({
    queryText,
    jobType: "prospect_search",
    niche,
    location: params.location,
    audience,
    ticketSize,
    sources,
  });
  const job = await createJob({
    type: "prospect_search",
    searchId: search.id,
    payload: {
      searchId: search.id,
      queryText,
      niche,
      location: params.location,
      audience,
      ticketSize,
      sources,
      maxResults: params.maxResults ?? 15,
      queries,
      notes: params.notes,
    },
  });
  return { action, jobId: job.id, searchId: search.id };
}

async function tryLaunchProspectSearch(action: ChatLaunchProspectSearchAction): Promise<ChatTurnResult> {
  const { params } = action;
  const { industry, service } = resolveService(params);
  const niche = `${industry.label} — ${service.label}`;

  const match = await checkProspectLedger({ niche, location: params.location });
  if (match) return { action, ledgerMatch: match };

  return finalizeProspectLaunch(action);
}

/** Called from the "Search again anyway" button — skips the ledger check entirely. */
export async function forceLaunch(
  action: ChatLaunchLocalBusinessSearchAction | ChatLaunchProspectSearchAction,
): Promise<ChatTurnResult> {
  if (action.kind === "launch_local_business_search") {
    const center = await geocodeLocation(action.params.location);
    return finalizeLocalBusinessLaunch(action, center);
  }
  return finalizeProspectLaunch(action);
}

function displayContent(action: ChatAgentAction): string {
  // Every variant except `clarify` requires `message`; `clarify` falls back to its
  // `question` when no standalone lead-in message was given.
  return action.kind === "clarify" ? (action.message ?? action.question) : action.message;
}

const JSON_CONTRACT = `{"kind":"reply","message":string}
{"kind":"clarify","message"?:string,"question":string,"options":[{"label":string,"value":string}]}
{"kind":"launch_local_business_search","message":string,"params":{"location":string,"businessType":string,"radiusMiles":5|10|15|25,"maxResults":10|20|30}}
{"kind":"launch_prospect_search","message":string,"params":{"industryId":string,"serviceId":string,"buyerTypeId":string,"intentSignalIds":string[],"location":string,"targetVertical"?:string,"budgetBandId"?:string,"companySizeId"?:string,"maxResults"?:10|25|50,"notes"?:string}}`;

/** Last-resort recovery when the main call's output didn't parse as JSON — a short,
 * narrowly-scoped completion asking the model to reformat its own (or reconstruct a
 * reasonable) response, rather than immediately giving up. This call has none of the
 * taxonomy/history bulk of the main prompt, so it's cheap and far less likely to hit
 * the same failure mode again — useful regardless of *why* the first call failed
 * (truncation, a stray code fence, reasoning text mixed into the output, etc). */
async function repairToJson(rawText: string): Promise<ChatAgentAction | null> {
  try {
    const result = await completeWithRouting("chat_orchestration", {
      system: `Output ONLY one valid JSON object — no prose, no markdown, no code fences. It must match exactly one of these shapes:\n${JSON_CONTRACT}`,
      prompt: `Reformat the following into that exact JSON contract. If it's already valid JSON, return it unchanged. If it's prose describing an answer, wrap it as {"kind":"reply","message": ...}.\n\n${rawText.slice(0, 4000)}`,
      json: true,
      temperature: 0,
      maxTokens: 1024,
    });
    return validateChatAction(parseJsonLoose<unknown>(result.text));
  } catch {
    return null;
  }
}

// ——— Turn orchestration ———

export async function handleChatTurn(history: ChatMessage[], userText: string): Promise<ChatTurnResult> {
  const [profile, defaults] = await Promise.all([getSellerProfile(), getChatDefaults()]);

  // Both the completion call (missing API key, network error, provider outage) and
  // the response parsing can fail — either way, surface it as a normal assistant
  // reply rather than throwing out of the whole send flow. A thrown error here would
  // otherwise leave the user's just-sent message stranded in the DB without any
  // visible reply until the page reloads.
  let action: ChatAgentAction;
  try {
    const result = await completeWithRouting("chat_orchestration", {
      system: buildSystemPrompt(profile, defaults),
      prompt: buildTurnPrompt(history.slice(-12), userText),
      json: true,
      temperature: 0.3,
      // The system prompt inlines the full taxonomy, and reasoning-heavy models
      // (e.g. DeepSeek's Pro/reasoner tier) can spend a lot of the completion on
      // chain-of-thought before ever emitting the JSON — 1024 was truncating those
      // responses mid-object. Give it real headroom.
      maxTokens: 4096,
    });
    try {
      action = validateChatAction(parseJsonLoose<unknown>(result.text));
    } catch {
      const repaired = await repairToJson(result.text);
      if (!repaired) throw new Error("Model did not return valid JSON.");
      action = repaired;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { action: { kind: "reply", message: `Sorry, I couldn't process that: ${msg}` } };
  }

  if (action.kind === "launch_local_business_search") return tryLaunchLocalBusinessSearch(action);
  if (action.kind === "launch_prospect_search") return tryLaunchProspectSearch(action);
  return { action };
}

/** First user message of a new thread becomes its title — no extra AI call needed,
 * same spirit as how a Claude Code session gets named from what you first asked. */
export function deriveThreadTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 48 ? `${trimmed.slice(0, 48)}…` : trimmed || "New chat";
}

/** Persists the user's message, runs a turn, persists the assistant's reply
 * (including job/search linkage when a search launched), and returns both rows plus
 * the raw result so the UI can render a ledger-match confirmation when present. */
export async function sendChatMessage(
  threadId: string,
  userText: string,
): Promise<{
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  result: ChatTurnResult;
}> {
  const history = await listChatMessages(threadId);
  const userMessage = await insertChatMessage({ threadId, role: "user", content: userText });
  const result = await handleChatTurn(history, userText);
  const assistantMessage = await insertChatMessage({
    threadId,
    role: "assistant",
    content: displayContent(result.action),
    responseJson: result.action,
    jobId: result.jobId,
    searchId: result.searchId,
  });
  return { userMessage, assistantMessage, result };
}

/** Called when the user confirms "search again anyway" on a duplicate-search notice. */
export async function confirmLaunchAnyway(
  threadId: string,
  action: ChatLaunchLocalBusinessSearchAction | ChatLaunchProspectSearchAction,
): Promise<{ assistantMessage: ChatMessage; result: ChatTurnResult }> {
  const result = await forceLaunch(action);
  const assistantMessage = await insertChatMessage({
    threadId,
    role: "assistant",
    content: displayContent(result.action),
    responseJson: result.action,
    jobId: result.jobId,
    searchId: result.searchId,
  });
  return { assistantMessage, result };
}
