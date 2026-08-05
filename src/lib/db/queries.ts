import { v4 as uuid } from "uuid";
import { invoke } from "@tauri-apps/api/core";
import type { ModelRouting, ProviderId, TaskKind } from "@/lib/ai/types";
import { notifyJobs } from "@/lib/jobs/events";
import { getDb, nowIso } from "./client";

const KEY_PROVIDERS = ["deepseek", "claude", "openai", "gemini", "kimi", "grok", "serp"];

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
  niche?: string;
  location?: string;
  audience?: string;
  ticketSize?: string;
  sources: string[];
  extraUrls?: string;
}): Promise<ProspectSearch> {
  const db = await getDb();
  const id = uuid();
  const ts = nowIso();
  await db.execute(
    `INSERT INTO prospect_searches
     (id, query_text, niche, location, audience, ticket_size, sources_json, extra_urls, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'running', $9)`,
    [
      id,
      input.queryText,
      input.niche ?? null,
      input.location ?? null,
      input.audience ?? null,
      input.ticketSize ?? null,
      JSON.stringify(input.sources),
      input.extraUrls ?? null,
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
       opportunity_flags = COALESCE($16, opportunity_flags), updated_at = $17
       WHERE id = $18`,
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
      opportunity_flags, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $18)`,
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
