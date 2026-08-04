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
| Local SQLite database | Done |
| Background job queue (while app is open) | Done |
| Prospect Search → Leads → Outreach → Tasks | Done |
| Per-task AI model routing + cost estimates | Done |
| BYOK API keys in Settings | Done |
| AI providers: DeepSeek, Claude, OpenAI, Gemini, Kimi, Grok | Done |
| Web search via **SerpAPI** (Google) | Done |
| Manual URL list (analyze without search) | Done |
| Website fetch + AI analysis + lead scoring | Done (homepage HTML; not full About/Services crawl yet) |
| Outreach draft / regenerate / approve | Done (mailto or clipboard — not SMTP send) |
| LinkedIn / Facebook / Reddit as search sources | UI only (“coming soon”) |
| LinkedIn / Facebook message **drafting** | Done (no auto-send / no scraping) |

## Connectors roadmap (not built yet)

The long-term design is a **connector / tools** layer: AI is the brain; connectors are how work gets done. Most of the list below is **planned**, not shipped.

### Already in MVP

- **AI** — DeepSeek (default worker) + Claude (default writing) + other LLMs via routing
- **Search** — SerpAPI
- **Website analysis** — HTTP fetch + LLM (basic)
- **Local CRM** — built-in Leads (not HubSpot/Salesforce sync)
- **Jobs** — lightweight in-app queue (not BullMQ)

### Not incorporated yet

| Category | Examples from the platform vision |
|----------|-----------------------------------|
| Search alternatives | Tavily, Brave Search, Serper |
| Email sending | Resend, Postmark, SendGrid, Mailgun |
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

1. **Settings** — add DeepSeek (and Claude for outreach). Add SerpAPI if you want Google search.
2. **AI Models** — confirm per-task providers (optional).
3. **Prospect Search** — what you sell, who the buyer is, location, budget → **Find Leads**.
4. Review **Leads**, draft in **Outreach**, watch progress in **Tasks**.

No SerpAPI? Paste prospect URLs under Extra URLs; analyze + score still run.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run tauri:dev` | Desktop app (development) |
| `npm run tauri:build` | Production installer |
| `npm run build` | Frontend only |

## Stack (current)

- **Desktop:** React + Vite + TypeScript + Tailwind + Tauri 2
- **Data:** SQLite (`@tauri-apps/plugin-sql`)
- **HTTP:** `@tauri-apps/plugin-http` (LLM APIs, SerpAPI, page fetch)
- **Keys:** Bring your own (stored locally)
