import { v4 as uuid } from "uuid";
import { invoke } from "@tauri-apps/api/core";
import type { ModelRouting, ProviderId, TaskKind } from "@/lib/ai/types";
import { notifyJobs } from "@/lib/jobs/events";
import { getDb, nowIso } from "./client";

const KEY_PROVIDERS = [
  "deepseek",
  "claude",
  "openai",
  "gemini",
  "kimi",
  "grok",
  "mistral",
  "groq",
  "together",
  "openrouter",
  "perplexity",
  "cohere",
  "serp",
];

export type JobState =
  | "queued"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type JobType = "prospect_search" | "draft_outreach" | "local_business_search";

export interface JobRow {
  id: string;
  type: JobType;
  payload_json: string;
  state: JobState;
  progress: number;
  error: string | null;
  parent_id: string | null;
  search_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface JobEvent {
  id: string;
  job_id: string;
  message: string;
  level: string;
  created_at: string;
}

export interface Lead {
  id: string;
  search_id: string | null;
  name: string | null;
  business: string | null;
  email: string | null;
  website: string | null;
  score: number;
  status: string;
  summary: string | null;
  pain_points: string | null;
  score_reasons: string | null;
  last_contact: string | null;
  campaign: string | null;
  notes: string | null;
  phone: string | null;
  rating: number | null;
  review_count: number | null;
  place_id: string | null;
  place_synced_at: string | null;
  opportunity_flags: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  location_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface OutreachMessage {
  id: string;
  lead_id: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export type SearchJobType = "prospect_search" | "local_business_search";

export interface ProspectSearch {
  id: string;
  query_text: string;
  niche: string | null;
  location: string | null;
  audience: string | null;
  ticket_size: string | null;
  sources_json: string;
  extra_urls: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  job_type: SearchJobType;
  lat: number | null;
  lng: number | null;
  radius_miles: number | null;
}

export interface ChatThread {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  response_json: string | null;
  job_id: string | null;
  search_id: string | null;
  created_at: string;
}

export interface Market {
  id: string;
  name: string;
  category: string;
  location: string;
  lat: number;
  lng: number;
  radius_miles: number;
  created_at: string;
  updated_at: string;
}

export interface MarketSnapshot {
  id: string;
  market_id: string;
  search_id: string | null;
  places_call_count: number | null;
  coverage_complete: number | null;
  entity_count: number | null;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export interface MarketEntity {
  id: string;
  snapshot_id: string;
  place_id: string | null;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  review_count: number | null;
  location_count: number;
  domain_registered_at: string | null;
  domain_age_years: number | null;
  tech_stack: string | null;
  pagespeed_performance: number | null;
  pagespeed_accessibility: number | null;
  pagespeed_seo: number | null;
  deterministic_flags: string | null;
  attributes_json: string | null;
  digital_maturity_score: number | null;
  summary: string | null;
  contact_name: string | null;
  email: string | null;
  created_at: string;
}

// ——— API keys (OS keychain) & settings ———

export async function getApiKey(provider: string): Promise<string | null> {
  return invoke<string | null>("get_api_key", { provider });
}

export async function setApiKey(provider: string, secret: string): Promise<void> {
  await invoke("set_api_key", { provider, secret });
}

export async function listApiKeys(): Promise<{ provider: string; hasKey: boolean }[]> {
  const results = await Promise.all(
    KEY_PROVIDERS.map(async (provider) => ({
      provider,
      hasKey: (await getApiKey(provider)) !== null,
    })),
  );
  return results;
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

// ——— Model routing ———

export async function getAllRouting(): Promise<ModelRouting[]> {
  const db = await getDb();
  const rows = await db.select<
    { task_kind: TaskKind; provider_id: ProviderId; model_id: string }[]
  >("SELECT task_kind, provider_id, model_id FROM model_routing");
  return rows.map((r) => ({
    taskKind: r.task_kind,
    providerId: r.provider_id,
    modelId: r.model_id,
  }));
}

export async function upsertRouting(routing: ModelRouting): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO model_routing (task_kind, provider_id, model_id) VALUES ($1, $2, $3)
     ON CONFLICT(task_kind) DO UPDATE SET provider_id = excluded.provider_id, model_id = excluded.model_id`,
    [routing.taskKind, routing.providerId, routing.modelId],
  );
}

// ——— Jobs ———

export async function createJob(input: {
  type: JobType;
  payload: unknown;
  parentId?: string;
  searchId?: string;
}): Promise<JobRow> {
  const db = await getDb();
  const id = uuid();
  const ts = nowIso();
  await db.execute(
    `INSERT INTO jobs (id, type, payload_json, state, progress, error, parent_id, search_id, created_at, updated_at)
     VALUES ($1, $2, $3, 'queued', 0, NULL, $4, $5, $6, $6)`,
    [
      id,
      input.type,
      JSON.stringify(input.payload),
      input.parentId ?? null,
      input.searchId ?? null,
      ts,
    ],
  );
  return (await getJob(id))!;
}

export async function getJob(id: string): Promise<JobRow | null> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>("SELECT * FROM jobs WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function listJobs(): Promise<JobRow[]> {
  const db = await getDb();
  return db.select<JobRow[]>("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 200");
}

/** A job stuck 'running' from a session that was killed mid-search never resumes on
 * its own — claimNextJob() only ever picks up 'queued' jobs. Call once at boot so an
 * interrupted search shows back up as queued instead of hanging forever. */
export async function resetOrphanedJobs(): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE jobs SET state = 'queued', updated_at = $1 WHERE state = 'running'`, [
    nowIso(),
  ]);
}

export async function claimNextJob(): Promise<JobRow | null> {
  const db = await getDb();
  const rows = await db.select<JobRow[]>(
    "SELECT * FROM jobs WHERE state = 'queued' ORDER BY created_at ASC LIMIT 1",
  );
  const job = rows[0];
  if (!job) return null;
  const ts = nowIso();
  const result = await db.execute(
    `UPDATE jobs SET state = 'running', started_at = $1, updated_at = $1 WHERE id = $2 AND state = 'queued'`,
    [ts, job.id],
  );
  // Another window may have claimed this job between the SELECT and the UPDATE.
  if (result.rowsAffected === 0) return null;
  return (await getJob(job.id))!;
}

export async function updateJob(
  id: string,
  patch: Partial<Pick<JobRow, "state" | "progress" | "error" | "completed_at">>,
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  params.push(nowIso());
  sets.push(`updated_at = $${params.length}`);
  params.push(id);
  await db.execute(
    `UPDATE jobs SET ${sets.join(", ")} WHERE id = $${params.length}`,
    params,
  );
  notifyJobs();
}

export async function appendJobEvent(
  jobId: string,
  message: string,
  level: "info" | "warn" | "error" = "info",
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO job_events (id, job_id, message, level, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [uuid(), jobId, message, level, nowIso()],
  );
  notifyJobs();
}

export async function listJobEvents(jobId: string): Promise<JobEvent[]> {
  const db = await getDb();
  return db.select<JobEvent[]>(
    "SELECT * FROM job_events WHERE job_id = $1 ORDER BY created_at ASC",
    [jobId],
  );
}

// ——— Prospect searches ———

export async function createProspectSearch(input: {
  queryText: string;
  jobType: SearchJobType;
  niche?: string;
  location?: string;
  audience?: string;
  ticketSize?: string;
  sources: string[];
  extraUrls?: string;
  lat?: number;
  lng?: number;
  radiusMiles?: number;
}): Promise<ProspectSearch> {
  const db = await getDb();
  const id = uuid();
  const ts = nowIso();
  await db.execute(
    `INSERT INTO prospect_searches
     (id, query_text, niche, location, audience, ticket_size, sources_json, extra_urls, status,
      job_type, lat, lng, radius_miles, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'running', $9, $10, $11, $12, $13)`,
    [
      id,
      input.queryText,
      input.niche ?? null,
      input.location ?? null,
      input.audience ?? null,
      input.ticketSize ?? null,
      JSON.stringify(input.sources),
      input.extraUrls ?? null,
      input.jobType,
      input.lat ?? null,
      input.lng ?? null,
      input.radiusMiles ?? null,
      ts,
    ],
  );
  const rows = await db.select<ProspectSearch[]>(
    "SELECT * FROM prospect_searches WHERE id = $1",
    [id],
  );
  return rows[0]!;
}

export async function updateProspectSearchStatus(
  id: string,
  status: string,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE prospect_searches SET status = $1, completed_at = $2 WHERE id = $3`,
    [status, status === "completed" || status === "failed" ? nowIso() : null, id],
  );
}

/** Records how thorough a tiled Places sweep actually was, so "every X in this
 * radius" is a claim the search row can back up rather than an unverified guess. */
export async function recordSearchCoverage(
  id: string,
  coverage: { placesCallCount: number; coverageComplete: boolean },
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE prospect_searches SET places_call_count = $1, coverage_complete = $2 WHERE id = $3`,
    [coverage.placesCallCount, coverage.coverageComplete ? 1 : 0, id],
  );
}

/** Ledger candidates: searches of one pipeline type, recent enough to matter, not
 * already failed/cancelled (an in-flight 'running'/'queued' search is the highest-value
 * match — it catches "this exact search is already going" and avoids duplicate spend). */
export async function listRecentSearchesByType(
  jobType: SearchJobType,
  sinceIso: string,
): Promise<ProspectSearch[]> {
  const db = await getDb();
  return db.select<ProspectSearch[]>(
    `SELECT * FROM prospect_searches
     WHERE job_type = $1 AND created_at >= $2 AND status NOT IN ('failed', 'cancelled')
     ORDER BY created_at DESC`,
    [jobType, sinceIso],
  );
}

// ——— Leads ———

export async function upsertLead(input: {
  searchId?: string;
  name?: string;
  business?: string;
  email?: string;
  website?: string;
  score: number;
  summary?: string;
  painPoints?: string;
  scoreReasons?: string;
  campaign?: string;
  placeId?: string;
  phone?: string;
  rating?: number;
  reviewCount?: number;
  opportunityFlags?: string[];
  address?: string;
  lat?: number;
  lng?: number;
  locationCount?: number;
}): Promise<Lead> {
  const db = await getDb();

  // Dedup by Place ID when present (Local Business Hunter leads may have no
  // website at all), otherwise fall back to the (website, search_id) pair.
  let existing: Lead[] = [];
  if (input.placeId) {
    existing = await db.select<Lead[]>("SELECT * FROM leads WHERE place_id = $1 LIMIT 1", [
      input.placeId,
    ]);
  } else if (input.website) {
    existing = input.searchId
      ? await db.select<Lead[]>(
          "SELECT * FROM leads WHERE website = $1 AND search_id = $2 LIMIT 1",
          [input.website, input.searchId],
        )
      : await db.select<Lead[]>(
          "SELECT * FROM leads WHERE website = $1 AND search_id IS NULL LIMIT 1",
          [input.website],
        );
  }

  const ts = nowIso();
  const opportunityFlagsJson = input.opportunityFlags
    ? JSON.stringify(input.opportunityFlags)
    : null;

  if (existing[0]) {
    await db.execute(
      `UPDATE leads SET name = COALESCE($1, name), business = COALESCE($2, business),
       email = COALESCE($3, email), website = COALESCE($4, website), score = $5,
       summary = COALESCE($6, summary), pain_points = COALESCE($7, pain_points),
       score_reasons = COALESCE($8, score_reasons), search_id = COALESCE($9, search_id),
       campaign = COALESCE($10, campaign), phone = COALESCE($11, phone),
       rating = COALESCE($12, rating), review_count = COALESCE($13, review_count),
       place_id = COALESCE($14, place_id),
       place_synced_at = COALESCE($15, place_synced_at),
       opportunity_flags = COALESCE($16, opportunity_flags),
       address = COALESCE($17, address), lat = COALESCE($18, lat), lng = COALESCE($19, lng),
       location_count = COALESCE($20, location_count), updated_at = $21
       WHERE id = $22`,
      [
        input.name ?? null,
        input.business ?? null,
        input.email ?? null,
        input.website ?? null,
        input.score,
        input.summary ?? null,
        input.painPoints ?? null,
        input.scoreReasons ?? null,
        input.searchId ?? null,
        input.campaign ?? null,
        input.phone ?? null,
        input.rating ?? null,
        input.reviewCount ?? null,
        input.placeId ?? null,
        input.placeId ? ts : null,
        opportunityFlagsJson,
        input.address ?? null,
        input.lat ?? null,
        input.lng ?? null,
        input.locationCount ?? null,
        ts,
        existing[0].id,
      ],
    );
    return (await getLead(existing[0].id))!;
  }

  const id = uuid();
  await db.execute(
    `INSERT INTO leads
     (id, search_id, name, business, email, website, score, status, summary, pain_points,
      score_reasons, campaign, phone, rating, review_count, place_id, place_synced_at,
      opportunity_flags, address, lat, lng, location_count, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $22)`,
    [
      id,
      input.searchId ?? null,
      input.name ?? null,
      input.business ?? null,
      input.email ?? null,
      input.website ?? null,
      input.score,
      input.summary ?? null,
      input.painPoints ?? null,
      input.scoreReasons ?? null,
      input.campaign ?? null,
      input.phone ?? null,
      input.rating ?? null,
      input.reviewCount ?? null,
      input.placeId ?? null,
      input.placeId ? ts : null,
      opportunityFlagsJson,
      input.address ?? null,
      input.lat ?? null,
      input.lng ?? null,
      input.locationCount ?? 1,
      ts,
    ],
  );
  return (await getLead(id))!;
}

export async function updateLeadPlaceFields(
  id: string,
  fields: {
    business?: string;
    website?: string | null;
    phone?: string | null;
    rating?: number | null;
    reviewCount?: number | null;
  },
): Promise<void> {
  const db = await getDb();
  const ts = nowIso();
  await db.execute(
    `UPDATE leads SET business = COALESCE($1, business), website = $2, phone = $3,
     rating = $4, review_count = $5, place_synced_at = $6, updated_at = $6 WHERE id = $7`,
    [
      fields.business ?? null,
      fields.website ?? null,
      fields.phone ?? null,
      fields.rating ?? null,
      fields.reviewCount ?? null,
      ts,
      id,
    ],
  );
}

export async function getLead(id: string): Promise<Lead | null> {
  const db = await getDb();
  const rows = await db.select<Lead[]>("SELECT * FROM leads WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function listLeads(): Promise<Lead[]> {
  const db = await getDb();
  return db.select<Lead[]>("SELECT * FROM leads ORDER BY score DESC, updated_at DESC");
}

export async function listLeadsBySearchId(searchId: string): Promise<Lead[]> {
  const db = await getDb();
  return db.select<Lead[]>(
    "SELECT * FROM leads WHERE search_id = $1 ORDER BY score DESC, updated_at DESC",
    [searchId],
  );
}

export async function updateLeadStatus(id: string, status: string): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE leads SET status = $1, updated_at = $2 WHERE id = $3`, [
    status,
    nowIso(),
    id,
  ]);
}

export async function updateLeadsStatus(ids: string[], status: string): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const idPlaceholders = ids.map((_, i) => `$${i + 3}`).join(", ");
  await db.execute(
    `UPDATE leads SET status = $1, updated_at = $2 WHERE id IN (${idPlaceholders})`,
    [status, nowIso(), ...ids],
  );
}

export async function updateLeadNotes(id: string, notes: string): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE leads SET notes = $1, updated_at = $2 WHERE id = $3`, [
    notes,
    nowIso(),
    id,
  ]);
}

export async function updateLeadEmail(id: string, email: string): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE leads SET email = $1, updated_at = $2 WHERE id = $3`, [
    email,
    nowIso(),
    id,
  ]);
}

export async function deleteLead(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM outreach_messages WHERE lead_id = $1`, [id]);
  await db.execute(`DELETE FROM leads WHERE id = $1`, [id]);
}

export async function deleteLeads(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  await db.execute(`DELETE FROM outreach_messages WHERE lead_id IN (${placeholders})`, ids);
  await db.execute(`DELETE FROM leads WHERE id IN (${placeholders})`, ids);
}

// ——— Outreach ———

export async function createOutreachMessage(input: {
  leadId: string;
  channel: string;
  subject?: string;
  body: string;
}): Promise<OutreachMessage> {
  const db = await getDb();
  const id = uuid();
  const ts = nowIso();
  await db.execute(
    `INSERT INTO outreach_messages (id, lead_id, channel, subject, body, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'draft', $6, $6)`,
    [id, input.leadId, input.channel, input.subject ?? null, input.body, ts],
  );
  const rows = await db.select<OutreachMessage[]>(
    "SELECT * FROM outreach_messages WHERE id = $1",
    [id],
  );
  return rows[0]!;
}

export async function listOutreachForLead(leadId: string): Promise<OutreachMessage[]> {
  const db = await getDb();
  return db.select<OutreachMessage[]>(
    "SELECT * FROM outreach_messages WHERE lead_id = $1 ORDER BY created_at DESC",
    [leadId],
  );
}

export async function listAllOutreach(): Promise<OutreachMessage[]> {
  const db = await getDb();
  return db.select<OutreachMessage[]>(
    "SELECT * FROM outreach_messages ORDER BY created_at DESC LIMIT 100",
  );
}

export async function updateOutreachStatus(
  id: string,
  status: string,
  body?: string,
): Promise<void> {
  const db = await getDb();
  if (body !== undefined) {
    await db.execute(
      `UPDATE outreach_messages SET status = $1, body = $2, updated_at = $3 WHERE id = $4`,
      [status, body, nowIso(), id],
    );
  } else {
    await db.execute(
      `UPDATE outreach_messages SET status = $1, updated_at = $2 WHERE id = $3`,
      [status, nowIso(), id],
    );
  }
}

// ——— Usage / cost tracking ———

export interface UsageSummary {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export async function insertUsage(input: {
  jobId?: string;
  taskKind: string;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO usage
     (id, job_id, task_kind, provider_id, model_id, input_tokens, output_tokens, cost_usd, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      uuid(),
      input.jobId ?? null,
      input.taskKind,
      input.providerId,
      input.modelId,
      input.inputTokens,
      input.outputTokens,
      input.costUsd,
      nowIso(),
    ],
  );
}

// ——— Search presets ———

export interface SearchPreset {
  id: string;
  name: string;
  config_json: string;
  created_at: string;
  updated_at: string;
}

export async function listSearchPresets(): Promise<SearchPreset[]> {
  const db = await getDb();
  return db.select<SearchPreset[]>(
    "SELECT * FROM search_presets ORDER BY name ASC",
  );
}

export async function saveSearchPreset(input: {
  id?: string;
  name: string;
  config: unknown;
}): Promise<SearchPreset> {
  const db = await getDb();
  const ts = nowIso();
  const id = input.id ?? uuid();
  await db.execute(
    `INSERT INTO search_presets (id, name, config_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, config_json = excluded.config_json, updated_at = excluded.updated_at`,
    [id, input.name, JSON.stringify(input.config), ts],
  );
  const rows = await db.select<SearchPreset[]>(
    "SELECT * FROM search_presets WHERE id = $1",
    [id],
  );
  return rows[0]!;
}

export async function deleteSearchPreset(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM search_presets WHERE id = $1`, [id]);
}

export async function sumUsageForJob(jobId: string): Promise<UsageSummary> {
  const db = await getDb();
  const rows = await db.select<
    { total_cost: number | null; total_in: number | null; total_out: number | null }[]
  >(
    `SELECT SUM(cost_usd) as total_cost, SUM(input_tokens) as total_in, SUM(output_tokens) as total_out
     FROM usage WHERE job_id = $1`,
    [jobId],
  );
  const row = rows[0];
  return {
    totalCostUsd: row?.total_cost ?? 0,
    totalInputTokens: row?.total_in ?? 0,
    totalOutputTokens: row?.total_out ?? 0,
  };
}

// ——— Chat (multi-thread) ———

export async function createChatThread(title: string): Promise<ChatThread> {
  const db = await getDb();
  const id = uuid();
  const ts = nowIso();
  await db.execute(
    `INSERT INTO chat_threads (id, title, created_at, updated_at) VALUES ($1, $2, $3, $3)`,
    [id, title, ts],
  );
  const rows = await db.select<ChatThread[]>("SELECT * FROM chat_threads WHERE id = $1", [id]);
  return rows[0]!;
}

export async function listChatThreads(): Promise<ChatThread[]> {
  const db = await getDb();
  return db.select<ChatThread[]>("SELECT * FROM chat_threads ORDER BY updated_at DESC");
}

async function touchChatThread(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE chat_threads SET updated_at = $1 WHERE id = $2`, [nowIso(), id]);
}

export async function deleteChatThread(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM chat_messages WHERE thread_id = $1`, [id]);
  await db.execute(`DELETE FROM chat_threads WHERE id = $1`, [id]);
}

export async function clearAllChatThreads(): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM chat_messages`);
  await db.execute(`DELETE FROM chat_threads`);
}

export async function insertChatMessage(input: {
  threadId: string;
  role: "user" | "assistant";
  content: string;
  responseJson?: unknown;
  jobId?: string;
  searchId?: string;
}): Promise<ChatMessage> {
  const db = await getDb();
  const id = uuid();
  const ts = nowIso();
  await db.execute(
    `INSERT INTO chat_messages (id, thread_id, role, content, response_json, job_id, search_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      input.threadId,
      input.role,
      input.content,
      input.responseJson !== undefined ? JSON.stringify(input.responseJson) : null,
      input.jobId ?? null,
      input.searchId ?? null,
      ts,
    ],
  );
  // Bumps the thread to the top of the list, same as any chat app sorting by
  // last-activity rather than creation time.
  await touchChatThread(input.threadId);
  const rows = await db.select<ChatMessage[]>("SELECT * FROM chat_messages WHERE id = $1", [id]);
  return rows[0]!;
}

export async function listChatMessages(threadId: string): Promise<ChatMessage[]> {
  const db = await getDb();
  return db.select<ChatMessage[]>(
    "SELECT * FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC",
    [threadId],
  );
}

// ——— Markets (territory sweeps) ———

const MARKET_MATCH_EPSILON_DEGREES = 0.01; // ~0.7 mile — close enough to call it the same center

/** Finds an existing market whose category/location/radius/center match this sweep's
 * request, or creates one — so repeated sweeps of the same territory accumulate
 * snapshots under one market (a history) instead of each becoming a disconnected
 * one-off, which is what a coverage/trend view over time needs. */
export async function getOrCreateMarket(input: {
  name: string;
  category: string;
  location: string;
  lat: number;
  lng: number;
  radiusMiles: number;
}): Promise<Market> {
  const db = await getDb();
  const normalizedCategory = input.category.trim().toLowerCase();
  const candidates = await db.select<Market[]>(
    `SELECT * FROM markets WHERE LOWER(category) = $1 AND radius_miles = $2`,
    [normalizedCategory, input.radiusMiles],
  );
  const match = candidates.find(
    (m) =>
      Math.abs(m.lat - input.lat) < MARKET_MATCH_EPSILON_DEGREES &&
      Math.abs(m.lng - input.lng) < MARKET_MATCH_EPSILON_DEGREES,
  );
  if (match) return match;

  const id = uuid();
  const ts = nowIso();
  await db.execute(
    `INSERT INTO markets (id, name, category, location, lat, lng, radius_miles, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
    [id, input.name, input.category, input.location, input.lat, input.lng, input.radiusMiles, ts],
  );
  const rows = await db.select<Market[]>("SELECT * FROM markets WHERE id = $1", [id]);
  return rows[0]!;
}

export async function listMarkets(): Promise<Market[]> {
  const db = await getDb();
  return db.select<Market[]>("SELECT * FROM markets ORDER BY updated_at DESC");
}

export async function getMarket(id: string): Promise<Market | null> {
  const db = await getDb();
  const rows = await db.select<Market[]>("SELECT * FROM markets WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createMarketSnapshot(input: {
  marketId: string;
  searchId?: string;
}): Promise<MarketSnapshot> {
  const db = await getDb();
  const id = uuid();
  const ts = nowIso();
  await db.execute(
    `INSERT INTO market_snapshots (id, market_id, search_id, status, created_at)
     VALUES ($1, $2, $3, 'running', $4)`,
    [id, input.marketId, input.searchId ?? null, ts],
  );
  const rows = await db.select<MarketSnapshot[]>("SELECT * FROM market_snapshots WHERE id = $1", [
    id,
  ]);
  return rows[0]!;
}

export async function completeMarketSnapshot(
  id: string,
  fields: {
    placesCallCount: number;
    coverageComplete: boolean;
    entityCount: number;
    status?: string;
  },
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE market_snapshots SET places_call_count = $1, coverage_complete = $2,
     entity_count = $3, status = $4, completed_at = $5 WHERE id = $6`,
    [
      fields.placesCallCount,
      fields.coverageComplete ? 1 : 0,
      fields.entityCount,
      fields.status ?? "completed",
      nowIso(),
      id,
    ],
  );
}

export async function getMarketSnapshot(id: string): Promise<MarketSnapshot | null> {
  const db = await getDb();
  const rows = await db.select<MarketSnapshot[]>("SELECT * FROM market_snapshots WHERE id = $1", [
    id,
  ]);
  return rows[0] ?? null;
}

export async function getMarketSnapshotBySearchId(searchId: string): Promise<MarketSnapshot | null> {
  const db = await getDb();
  const rows = await db.select<MarketSnapshot[]>(
    "SELECT * FROM market_snapshots WHERE search_id = $1 LIMIT 1",
    [searchId],
  );
  return rows[0] ?? null;
}

export async function listSnapshotsByMarket(marketId: string): Promise<MarketSnapshot[]> {
  const db = await getDb();
  return db.select<MarketSnapshot[]>(
    "SELECT * FROM market_snapshots WHERE market_id = $1 ORDER BY created_at DESC",
    [marketId],
  );
}

export async function insertMarketEntity(input: {
  snapshotId: string;
  placeId?: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  locationCount?: number;
  domainRegisteredAt?: string;
  domainAgeYears?: number;
  techStack?: string[];
  pagespeedPerformance?: number;
  pagespeedAccessibility?: number;
  pagespeedSeo?: number;
  deterministicFlags?: string[];
  attributes?: Record<string, boolean>;
  digitalMaturityScore?: number;
  summary?: string;
  contactName?: string;
  email?: string;
}): Promise<MarketEntity> {
  const db = await getDb();
  const id = uuid();
  const ts = nowIso();
  await db.execute(
    `INSERT INTO market_entities
     (id, snapshot_id, place_id, name, address, lat, lng, phone, website, rating, review_count,
      location_count, domain_registered_at, domain_age_years, tech_stack, pagespeed_performance,
      pagespeed_accessibility, pagespeed_seo, deterministic_flags, attributes_json,
      digital_maturity_score, summary, contact_name, email, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
    [
      id,
      input.snapshotId,
      input.placeId ?? null,
      input.name,
      input.address ?? null,
      input.lat ?? null,
      input.lng ?? null,
      input.phone ?? null,
      input.website ?? null,
      input.rating ?? null,
      input.reviewCount ?? null,
      input.locationCount ?? 1,
      input.domainRegisteredAt ?? null,
      input.domainAgeYears ?? null,
      input.techStack ? JSON.stringify(input.techStack) : null,
      input.pagespeedPerformance ?? null,
      input.pagespeedAccessibility ?? null,
      input.pagespeedSeo ?? null,
      input.deterministicFlags ? JSON.stringify(input.deterministicFlags) : null,
      input.attributes ? JSON.stringify(input.attributes) : null,
      input.digitalMaturityScore ?? null,
      input.summary ?? null,
      input.contactName ?? null,
      input.email ?? null,
      ts,
    ],
  );
  const rows = await db.select<MarketEntity[]>("SELECT * FROM market_entities WHERE id = $1", [id]);
  return rows[0]!;
}

export async function listMarketEntitiesBySnapshot(snapshotId: string): Promise<MarketEntity[]> {
  const db = await getDb();
  return db.select<MarketEntity[]>(
    "SELECT * FROM market_entities WHERE snapshot_id = $1 ORDER BY digital_maturity_score DESC",
    [snapshotId],
  );
}

export async function countMarketEntitiesBySearchId(searchId: string): Promise<number> {
  const snapshot = await getMarketSnapshotBySearchId(searchId);
  if (!snapshot) return 0;
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM market_entities WHERE snapshot_id = $1",
    [snapshot.id],
  );
  return rows[0]?.count ?? 0;
}
