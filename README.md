# ClientPilot

**Find clients who need what you sell — with an AI Business Development Representative that works on your desktop.**

ClientPilot is a local-first **AI Workforce OS**. The first employee is an **AI BDR**: it searches for potential buyers, researches their websites, scores them as leads, and helps you draft outreach. It is **not** a chat app. Chat (later) is an assistant; the product is dedicated pages for prospecting, CRM, outreach, tasks, and AI configuration.

## What this app is for

You sell something. ClientPilot helps you find **people and businesses who may want to buy it**.

| You sell… | ClientPilot looks for… |
|-----------|------------------------|
| Relationship coaching | People seeking coaching / relationship help |
| Websites, mobile apps, desktop apps | Businesses that need software built |
| Dental services | People/businesses looking for a dentist |

It does **not** hunt peers or competitors in your niche (e.g. other coaches when you *are* a coach).

## What works today (MVP)

| Area | Status |
|------|--------|
| Desktop app (React + Tauri) | Done |
| Local SQLite database with versioned migrations | Done |
| Background job queue (while app is open) | Done |
| Prospect Search → Leads → Outreach → Tasks | Done |
| Prospect Search as dropdowns (industry/service/buyer/signals/location/budget), not free text | Done |
| Saved search presets (one starter per industry, plus your own) | Done |
| Seller Profile (used in every outreach draft and in lead scoring) | Done |
| Per-task AI model routing + real per-model cost tracking | Done |
| API keys stored in the OS keychain (not the database) | Done |
| AI providers: DeepSeek (V4 Flash/Pro), Claude (Opus 5/Sonnet 5/Haiku 4.5), OpenAI, Gemini, Kimi, Grok | Done |
| Light / Dark / System theme | Done |
| Web search — **SerpAPI**, **Tavily**, or **Brave Search** (auto-picks whichever is configured) | Done |
| Manual URL list (analyze without search) | Done |
| Website fetch + AI analysis + lead scoring (merged into a single pass) | Done (homepage HTML; not full About/Services crawl yet) |
| Outreach draft / regenerate / approve | Done |
| Outreach sending — **Resend** if configured, else mailto/clipboard | Done |
| Leads CRM — status, notes, delete, draft-from-row, search/filter | Done |
| Connectors page — live status for every connector on the roadmap | Done |
| LinkedIn / Facebook / Reddit as search sources | UI only (“coming soon”) |
| LinkedIn / Facebook message **drafting** | Done (no auto-send / no scraping) |

## Connectors

The architecture is a **connector / tools** layer: AI is the brain; connectors are how work gets done. Every connector below — implemented or planned — has a live status in the app's **Connectors** page, which is the source of truth; this table is a snapshot.

### Implemented

| Category | Connector |
|----------|-----------|
| Search | SerpAPI, Tavily, Brave Search |
| Email | Resend |
| Website analysis | HTTP fetch + LLM (basic) |
| Local CRM | Built-in Leads (not HubSpot/Salesforce sync) |
| Jobs | Lightweight in-app queue (not BullMQ) |

### Planned

| Category | Examples from the platform vision |
|----------|-----------------------------------|
| Search alternatives | Serper |
| Email alternatives | Postmark, SendGrid, Mailgun |
| Calendar | Google Calendar, Outlook |
| External CRM | HubSpot, Salesforce, Pipedrive, Zoho |
| Contacts sync | Google / Microsoft Contacts |
| Maps / Places | Google Places, Mapbox, geocoding |
| Company intelligence | Apollo, Clearbit, People Data Labs, Hunter, Snov |
| Website tech / SEO | Wappalyzer, BuiltWith, PageSpeed |
| Domain | WHOIS / DNS |
| Social (live) | Reddit, YouTube, X, etc. as real sources |
| LinkedIn | Import/enrichment only (avoid scraping as core) |
| Browser automation | Playwright / Browser-use / Stagehand |
| Automation hubs | n8n, MCP tool servers |
| Notifications | Slack, Discord, Telegram, desktop push |
| PDFs / payments | Proposals, Stripe, etc. |

**Architecture goal (future):** each AI “employee” (Lead Finder, SEO Specialist, …) gets a toolkit of connectors. Adding an employee = workflow + allowed tools, not a rewrite of the whole app.

## How to run

**Prerequisites:** Node.js 20+, Rust (rustup), [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) (on Windows: VS C++ Build Tools).

```bash
npm install
npm run tauri:dev
```

Or double-click **`Start ClientPilot.bat`**.

### First-time setup in the app

1. **Settings** — fill in your Seller Profile, and add DeepSeek (+ Claude for outreach).
2. **Connectors** — add a search key (SerpAPI, Tavily, or Brave) and, optionally, Resend for sending outreach directly.
3. **AI Models** — confirm per-task providers (optional).
4. **Prospect Search** — pick industry, service, buyer type, location, budget → **Find Leads**.
5. Review **Leads**, draft in **Outreach**, watch progress and cost in **Tasks**.

No search connector configured? Paste prospect URLs under Extra URLs; analyze + score still run.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run tauri:dev` | Desktop app (development) |
| `npm run tauri:build` | Production installer |
| `npm run build` | Frontend only |

## Stack (current)

- **Desktop:** React + Vite + TypeScript + Tailwind + Tauri 2
- **Data:** SQLite (`@tauri-apps/plugin-sql`), versioned migrations
- **HTTP:** `@tauri-apps/plugin-http` (LLM APIs, search/email connectors, page fetch)
- **Keys:** Bring your own — stored in the OS keychain (Windows Credential Manager / macOS
  Keychain / Linux Secret Service) via the Rust `keyring` crate, never in the database
