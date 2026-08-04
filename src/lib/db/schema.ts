export interface Migration {
  version: number;
  statements: string[];
}

/** Tables from the pre-versioning schema (before PRAGMA user_version tracking existed). */
export const LEGACY_TABLES = [
  "job_events",
  "outreach_messages",
  "leads",
  "jobs",
  "prospect_searches",
  "model_routing",
  "api_keys",
  "settings",
];

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS model_routing (
        task_kind TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS prospect_searches (
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
      )`,

      `CREATE TABLE IF NOT EXISTS leads (
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
        FOREIGN KEY (search_id) REFERENCES prospect_searches(id),
        UNIQUE (website, search_id)
      )`,

      `CREATE TABLE IF NOT EXISTS outreach_messages (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        subject TEXT,
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (lead_id) REFERENCES leads(id)
      )`,

      `CREATE TABLE IF NOT EXISTS jobs (
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
      )`,

      `CREATE TABLE IF NOT EXISTS job_events (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        message TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'info',
        created_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      )`,

      `CREATE TABLE IF NOT EXISTS usage (
        id TEXT PRIMARY KEY,
        job_id TEXT,
        task_kind TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      )`,

      `CREATE INDEX IF NOT EXISTS idx_leads_search_id ON leads(search_id)`,
      `CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score)`,
      `CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id)`,
      `CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs(state)`,
      `CREATE INDEX IF NOT EXISTS idx_outreach_lead_id ON outreach_messages(lead_id)`,
      `CREATE INDEX IF NOT EXISTS idx_usage_job_id ON usage(job_id)`,
    ],
  },
  {
    version: 2,
    statements: [
      `ALTER TABLE leads ADD COLUMN notes TEXT`,

      `CREATE TABLE IF NOT EXISTS search_presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        config_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
];
