export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  provider TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_routing (
  task_kind TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prospect_searches (
  id TEXT PRIMARY KEY,
  query_text TEXT NOT NULL,
  niche TEXT,
  location TEXT,
  audience TEXT,
  ticket_size TEXT,
  sources_json TEXT NOT NULL,
  extra_urls TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  search_id TEXT,
  name TEXT,
  business TEXT,
  email TEXT,
  website TEXT,
  score INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  summary TEXT,
  pain_points TEXT,
  score_reasons TEXT,
  last_contact TEXT,
  campaign TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (search_id) REFERENCES prospect_searches(id)
);

CREATE TABLE IF NOT EXISTS outreach_messages (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  parent_id TEXT,
  search_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS job_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  message TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);
`;
