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
  {
    version: 3,
    statements: [
      // Local Business Hunter fields. Deliberately minimal: only what's needed for
      // outreach/CRM plus the Place ID for refreshing later — not a cache of the full
      // Places payload (no lat/lng, opening hours, or place "types" persisted), per
      // Google Maps Platform's terms on storing/caching Places data.
      `ALTER TABLE leads ADD COLUMN phone TEXT`,
      `ALTER TABLE leads ADD COLUMN rating REAL`,
      `ALTER TABLE leads ADD COLUMN review_count INTEGER`,
      `ALTER TABLE leads ADD COLUMN place_id TEXT`,
      `ALTER TABLE leads ADD COLUMN place_synced_at TEXT`,
      `ALTER TABLE leads ADD COLUMN opportunity_flags TEXT`,
    ],
  },
  {
    version: 4,
    statements: [
      // Search ledger fields. lat/lng are the geocoded CENTER POINT of the free-text
      // location string a search was run for — not a cache of any individual Google
      // Places business record, so this doesn't reopen the v3 comment above about not
      // persisting Places payloads. radius_miles/lat/lng stay NULL for prospect_search
      // rows (no fixed-radius search-circle concept there).
      `ALTER TABLE prospect_searches ADD COLUMN lat REAL`,
      `ALTER TABLE prospect_searches ADD COLUMN lng REAL`,
      `ALTER TABLE prospect_searches ADD COLUMN radius_miles REAL`,
      // Discriminates which pipeline wrote a row — both local_business_search and
      // prospect_search share this one table with no prior way to tell them apart.
      `ALTER TABLE prospect_searches ADD COLUMN job_type TEXT NOT NULL DEFAULT 'prospect_search'`,

      `CREATE INDEX IF NOT EXISTS idx_prospect_searches_job_type_created
        ON prospect_searches(job_type, created_at)`,

      // Chat: a single implicit persistent thread — insert-only, rows are never
      // updated, so reload is just "load them all in created_at order."
      `CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        response_json TEXT,
        job_id TEXT,
        search_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES jobs(id),
        FOREIGN KEY (search_id) REFERENCES prospect_searches(id)
      )`,

      `CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at)`,
    ],
  },
  {
    version: 5,
    statements: [
      // Multi-thread chat history — each thread is its own conversation (new chat /
      // switch back / delete), sorted by last activity like a normal chat app.
      `CREATE TABLE IF NOT EXISTS chat_threads (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_chat_threads_updated_at ON chat_threads(updated_at)`,

      `ALTER TABLE chat_messages ADD COLUMN thread_id TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON chat_messages(thread_id)`,

      // Backfill: v4 shipped chat as a single implicit thread. Give any messages sent
      // before this migration a home thread instead of leaving them orphaned with
      // thread_id = NULL. INSERT OR IGNORE makes this a no-op on a fresh/empty
      // chat_messages table — SQLite's conflict resolution suppresses the NOT NULL
      // violation on created_at/updated_at that MIN()/MAX() over zero rows produces.
      `INSERT OR IGNORE INTO chat_threads (id, title, created_at, updated_at)
        SELECT 'legacy', 'Earlier messages', MIN(created_at), MAX(created_at) FROM chat_messages`,
      `UPDATE chat_messages SET thread_id = 'legacy' WHERE thread_id IS NULL`,
    ],
  },
  {
    version: 6,
    statements: [
      // Territory sweep support. address/lat/lng are the business's own location —
      // fetched from Places (which we already pay for) and previously discarded before
      // reaching storage. Treated as a refreshable cache alongside the existing
      // place_synced_at column, same posture as the other Places-sourced fields already
      // on this table (see the v3 migration comment on Google Maps Platform's caching terms).
      `ALTER TABLE leads ADD COLUMN address TEXT`,
      `ALTER TABLE leads ADD COLUMN lat REAL`,
      `ALTER TABLE leads ADD COLUMN lng REAL`,
      // Multi-location businesses used to be silently dropped after the first location
      // found sharing a domain. Now collapsed into one row with a count instead of lost.
      `ALTER TABLE leads ADD COLUMN location_count INTEGER DEFAULT 1`,

      // Coverage accounting for a tiled Places sweep, so "every dental practice in this
      // radius" is a claim the search row can back up rather than an unverified guess.
      `ALTER TABLE prospect_searches ADD COLUMN places_call_count INTEGER`,
      `ALTER TABLE prospect_searches ADD COLUMN coverage_complete INTEGER`,
    ],
  },
  {
    version: 7,
    statements: [
      // Market Sweep data model. Deliberately separate from `leads` rather than
      // overloading it: leads is CRM-shaped (status, campaign, an opportunity score for
      // a seller) and market data is descriptive (a business profile, not a sales
      // lead) — see the v6 comment above for the fields this supersedes for new sweeps.
      //
      // markets: a saved territory + category definition, reused across repeated
      // sweeps of the same area so runs over time form a history under one market
      // rather than each becoming a disconnected one-off.
      `CREATE TABLE IF NOT EXISTS markets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        location TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        radius_miles REAL NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,

      // market_snapshots: one sweep run against a market, with the coverage/cost
      // accounting the enumeration engine produces.
      `CREATE TABLE IF NOT EXISTS market_snapshots (
        id TEXT PRIMARY KEY,
        market_id TEXT NOT NULL,
        search_id TEXT,
        places_call_count INTEGER,
        coverage_complete INTEGER,
        entity_count INTEGER,
        status TEXT NOT NULL DEFAULT 'running',
        created_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (market_id) REFERENCES markets(id),
        FOREIGN KEY (search_id) REFERENCES prospect_searches(id)
      )`,

      // market_entities: one row per business per snapshot — the full profile.
      // attributes_json holds the LLM-derived answers for whatever the active audit
      // lens asked (see src/lib/settings/auditLens.ts), so the schema doesn't need to
      // change when the questions do.
      `CREATE TABLE IF NOT EXISTS market_entities (
        id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL,
        place_id TEXT,
        name TEXT NOT NULL,
        address TEXT,
        lat REAL,
        lng REAL,
        phone TEXT,
        website TEXT,
        rating REAL,
        review_count INTEGER,
        location_count INTEGER NOT NULL DEFAULT 1,
        domain_registered_at TEXT,
        domain_age_years REAL,
        tech_stack TEXT,
        pagespeed_performance INTEGER,
        pagespeed_accessibility INTEGER,
        pagespeed_seo INTEGER,
        deterministic_flags TEXT,
        attributes_json TEXT,
        digital_maturity_score INTEGER,
        summary TEXT,
        contact_name TEXT,
        email TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (snapshot_id) REFERENCES market_snapshots(id)
      )`,

      `CREATE INDEX IF NOT EXISTS idx_market_snapshots_market_id ON market_snapshots(market_id)`,
      `CREATE INDEX IF NOT EXISTS idx_market_snapshots_search_id ON market_snapshots(search_id)`,
      `CREATE INDEX IF NOT EXISTS idx_market_entities_snapshot_id ON market_entities(snapshot_id)`,
    ],
  },
];
