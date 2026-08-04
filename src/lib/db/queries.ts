import { v4 as uuid } from "uuid";
import type { ModelRouting, ProviderId, TaskKind } from "@/lib/ai/types";
import { getDb, nowIso } from "./client";

export type JobState =
  | "queued"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type JobType = "prospect_search" | "draft_outreach";

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

// ——— API keys & settings ———

export async function getApiKey(provider: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ secret: string }[]>(
    "SELECT secret FROM api_keys WHERE provider = $1",
    [provider],
  );
  return rows[0]?.secret ?? null;
}

export async function setApiKey(provider: string, secret: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO api_keys (provider, secret, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT(provider) DO UPDATE SET secret = excluded.secret, updated_at = excluded.updated_at`,
    [provider, secret, nowIso()],
  );
}

export async function listApiKeys(): Promise<{ provider: string; hasKey: boolean }[]> {
  const db = await getDb();
  const rows = await db.select<{ provider: string }[]>(
    "SELECT provider FROM api_keys WHERE secret != ''",
  );
  const set = new Set(rows.map((r) => r.provider));
  const providers = ["deepseek", "claude", "openai", "gemini", "kimi", "grok", "serp"];
  return providers.map((p) => ({ provider: p, hasKey: set.has(p) }));
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
  await db.execute(
    `UPDATE jobs SET state = 'running', started_at = $1, updated_at = $1 WHERE id = $2 AND state = 'queued'`,
    [ts, job.id],
  );
  return (await getJob(job.id))!;
}

export async function updateJob(
  id: string,
  patch: Partial<Pick<JobRow, "state" | "progress" | "error" | "completed_at">>,
): Promise<void> {
  const db = await getDb();
  const current = await getJob(id);
  if (!current) return;
  await db.execute(
    `UPDATE jobs SET state = $1, progress = $2, error = $3, completed_at = $4, updated_at = $5 WHERE id = $6`,
    [
      patch.state ?? current.state,
      patch.progress ?? current.progress,
      patch.error !== undefined ? patch.error : current.error,
      patch.completed_at !== undefined ? patch.completed_at : current.completed_at,
      nowIso(),
      id,
    ],
  );
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
}

export async function listJobEvents(jobId: string): Promise<JobEvent[]> {
  const db = await getDb();
  return db.select<JobEvent[]>(
    "SELECT * FROM job_events WHERE job_id = $1 ORDER BY created_at ASC",
    [jobId],
  );
}

export async function listRecentJobEvents(limit = 50): Promise<JobEvent[]> {
  const db = await getDb();
  return db.select<JobEvent[]>(
    "SELECT * FROM job_events ORDER BY created_at DESC LIMIT $1",
    [limit],
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
  website: string;
  score: number;
  summary?: string;
  painPoints?: string;
  scoreReasons?: string;
  campaign?: string;
}): Promise<Lead> {
  const db = await getDb();
  const existing = await db.select<Lead[]>(
    "SELECT * FROM leads WHERE website = $1 LIMIT 1",
    [input.website],
  );
  const ts = nowIso();
  if (existing[0]) {
    await db.execute(
      `UPDATE leads SET name = COALESCE($1, name), business = COALESCE($2, business),
       email = COALESCE($3, email), score = $4, summary = COALESCE($5, summary),
       pain_points = COALESCE($6, pain_points), score_reasons = COALESCE($7, score_reasons),
       search_id = COALESCE($8, search_id), campaign = COALESCE($9, campaign), updated_at = $10
       WHERE id = $11`,
      [
        input.name ?? null,
        input.business ?? null,
        input.email ?? null,
        input.score,
        input.summary ?? null,
        input.painPoints ?? null,
        input.scoreReasons ?? null,
        input.searchId ?? null,
        input.campaign ?? null,
        ts,
        existing[0].id,
      ],
    );
    return (await getLead(existing[0].id))!;
  }

  const id = uuid();
  await db.execute(
    `INSERT INTO leads
     (id, search_id, name, business, email, website, score, status, summary, pain_points, score_reasons, campaign, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8, $9, $10, $11, $12, $12)`,
    [
      id,
      input.searchId ?? null,
      input.name ?? null,
      input.business ?? null,
      input.email ?? null,
      input.website,
      input.score,
      input.summary ?? null,
      input.painPoints ?? null,
      input.scoreReasons ?? null,
      input.campaign ?? null,
      ts,
    ],
  );
  return (await getLead(id))!;
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

export async function updateLeadStatus(id: string, status: string): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE leads SET status = $1, updated_at = $2 WHERE id = $3`, [
    status,
    nowIso(),
    id,
  ]);
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
