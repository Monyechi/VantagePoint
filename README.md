# VantagePoint

**Find clients who need what you sell — with an AI Business Development Representative that works on your desktop.**

VantagePoint is a local-first **AI Workforce OS**. The first employee is an **AI BDR**: it searches for potential buyers, researches their websites, scores them as leads, and helps you draft outreach. It is **not** a chat app. Chat (later) is an assistant; the product is dedicated pages for prospecting, CRM, outreach, tasks, and AI configuration.

## What this app is for

You sell something. VantagePoint helps you find **people and businesses who may want to buy it**.

| You sell… | VantagePoint looks for… |
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
| **Reddit** as a real, selectable Prospect Search source (buyer-intent post search) | Done |
| Manual URL list (analyze without search) | Done |
| Website fetch + AI analysis + lead scoring (merged into a single pass) | Done (homepage HTML; not full About/Services crawl yet) |
| Outreach draft / regenerate / approve | Done |
| Outreach sending — **Resend** if configured, else mailto/clipboard | Done |
| Leads CRM — status, notes, delete, draft-from-row, search/filter | Done |
| Lead enrichment (**Hunter.io, Apollo, People Data Labs, or Snov.io** + free WHOIS/RDAP domain lookup) | Done |
| One-page proposal **PDF generation** per lead (client-side, no external API) | Done |
| Connectors page — live status for every connector on the roadmap | Done |
| **Local Business Hunter** — Google Places by city/type/radius, missing-website detection, PageSpeed + AI opportunity scoring | Done |
| Geocoding fallback chain — Google → free OpenStreetMap (no key needed) | Done |
| LinkedIn / Facebook as search sources | UI only (“coming soon”) |
| LinkedIn / Facebook message **drafting** | Done (no auto-send / no scraping) |
| In-app auto-updater (Settings → Updates) | Done — needs a tagged GitHub Release to have anything to find |

## Releasing an update

Users get updates via a signed **GitHub Release**, not by pulling `main` and rebuilding.

```
dev branch → merge to main → bump version → git tag vX.Y.Z → push tag
                                                    ↓
                                    GitHub Action builds + signs installer
                                                    ↓
                                    Draft GitHub Release (you review, then publish)
                                                    ↓
                                    App checks for update → downloads → installs → relaunches
```

1. Merge finished work into `main`.
2. Bump the version in **all three** of `package.json`, `src-tauri/tauri.conf.json`, and
   `src-tauri/Cargo.toml` (they must match).
3. Tag and push: `git tag v0.1.1 && git push origin v0.1.1`.
4. `.github/workflows/release.yml` builds a signed Windows installer and opens a **draft**
   release with the updater's `latest.json` manifest attached — nothing goes live until you
   publish that draft from the GitHub UI.
5. Once published, anyone on an older version sees it in **Settings → Updates**.

Requires two repo secrets (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`)
from the minisign keypair generated for this — set up once, not per release. The build is
currently unsigned at the OS level (no Windows code-signing cert yet), so installs will show
a SmartScreen "unknown publisher" warning until one's added.

## Local Business Hunter

A second lead-sourcing mode alongside Prospect Search, built around Google Maps Platform. Enter a city, a business type, and a radius; for each business found:

- **No website?** It's flagged as a high-priority lead immediately — demand exists (reviews, rating) with nowhere online to send it.
- **Has a website?** VantagePoint fetches the homepage plus best-effort About/Contact pages, runs Google PageSpeed (performance/accessibility/SEO), detects common DIY site builders (WordPress, Wix, Squarespace, Shopify, Weebly, Webflow, GoDaddy Website Builder) with a free built-in signature detector, and has the AI combine all of it into one opportunity score with concrete reasons and a best-effort decision-maker name/email.

Results land in the same Leads/Outreach/Tasks pipeline as Prospect Search, with a results dashboard (counts by opportunity flag, an optional estimated-revenue figure from your own average project value).

**Google Maps Platform data handling:** Google's terms restrict how Places data can be stored/cached long-term. VantagePoint only persists the Place ID plus its own analysis (score, notes, outreach) — not the full Places payload (no coordinates, opening hours, or place-type taxonomy). The business-card fields it does keep (name, phone, website, rating, review count) refresh on demand via a **Refresh from Google** button on the lead, rather than being treated as a permanent copy.

## Connectors

The architecture is a **connector / tools** layer: AI is the brain; connectors are how work gets done. Every connector below — implemented or planned — has a live status in the app's **Connectors** page, which is the source of truth; this table is a snapshot.

The list is deliberately curated to what actually serves the find-buyers → research/score → outreach → manage-leads loop — not every API that could plausibly be bolted on. See "Cut from scope" below for what was considered and rejected, and why.

### Implemented

| Category | Connector |
|----------|-----------|
| Search | SerpAPI, Tavily, Brave Search |
| Email | Resend |
| Maps / Places | Google Places (Local Business Hunter); geocoding also falls back to free OpenStreetMap |
| Company intelligence | Hunter.io, Apollo, People Data Labs, Snov.io (priority chain via the Leads "Enrich" action) |
| Website tech / SEO | Google PageSpeed; built-in free tech-signature detector (WordPress/Wix/Squarespace/Shopify/Weebly/Webflow/GoDaddy) |
| Domain | WHOIS / DNS via free RDAP (no key needed) |
| Social | Reddit (real Prospect Search source, buyer-intent posts) |
| Documents | PDF proposal generation (client-side, no external API) |
| Website analysis | HTTP fetch + LLM (basic) |
| Local CRM | Built-in Leads (not HubSpot/Salesforce sync) |
| Jobs | Lightweight in-app queue (not BullMQ) |

### Planned

Still core to the vision, just not built yet — mostly gated on OAuth infrastructure this app doesn't have.

| Category | Examples |
|----------|----------|
| Calendar | Google Calendar, Outlook — needs OAuth |
| External CRM | HubSpot, Salesforce, Pipedrive, Zoho — needs OAuth |
| Notifications | Slack, Discord |

### Cut from scope

Evaluated and deliberately excluded as not fitting the core BDR loop — removed from the registry rather than left as roadmap wallpaper:

| Connector | Why cut |
|-----------|---------|
| Stripe, Paddle, Lemon Squeezy | Billing infrastructure for monetizing VantagePoint itself, not a BYOK tool for the BDR workflow |
| Clearbit | Standalone API sunset after the 2023 HubSpot acquisition — no longer viable as BYOK |
| MCP, n8n | Dev/workflow infrastructure, not something a user configures on a Connectors page |
| Google / Microsoft Contacts | Personal address-book sync — redundant with the built-in Leads CRM |
| YouTube, X/Twitter, Instagram, TikTok, Facebook | Weak buyer-intent signal for this product, and several have restricted/paid APIs or require business verification |
| Playwright, Browser-use, Stagehand | Browser engines, not user-facing connectors — would be built-in infra if ever needed, not "paste a key" |
| Pushbullet, Telegram | Redundant once Slack/Discord notifications exist |
| Wappalyzer, BuiltWith | Same job as the free built-in tech-signature detector already shipped |
| Serper | Same job as SerpAPI — one Google-search API is enough |
| Postmark, SendGrid, Mailgun | Same job as Resend — one email provider is enough for this app's needs |
| Mapbox | Redundant with the free OpenStreetMap geocoding fallback |

**Architecture goal (future):** each AI “employee” (Lead Finder, SEO Specialist, …) gets a toolkit of connectors. Adding an employee = workflow + allowed tools, not a rewrite of the whole app.

## How to run

**Prerequisites:** Node.js 20+, Rust (rustup), [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) (on Windows: VS C++ Build Tools).

```bash
npm install
npm run tauri:dev
```

Or double-click **`Start VantagePoint.bat`**.

### First-time setup in the app

1. **Settings** — fill in your Seller Profile, and add DeepSeek (+ Claude for outreach).
2. **Connectors** — add a search key (SerpAPI, Tavily, or Brave); optionally Resend for sending
   outreach directly, and a Google Maps Platform key for the Local Business Hunter (geocoding
   falls back to free OpenStreetMap without one, but business search still needs Google).
3. **AI Models** — confirm per-task providers (optional).
4. **Prospect Search** — pick industry, service, buyer type, location, budget → **Find Leads**.
   Or **Local Business Hunter** — city, business type, radius → **Find Businesses**.
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
