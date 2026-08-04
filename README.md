# ClientPilot

Desktop AI Workforce OS — first employee: **AI Business Development Representative**.

Local-first Tauri app that finds **leads who may need what you sell** (clients), not competitors in your niche. Prospect Search → Leads CRM → Outreach → Tasks, with per-task AI model routing (DeepSeek for workers, Claude for writing by default).

## Core idea

If you offer **relationship coaching**, the app looks for people who want coaching.  
If you build **websites and apps**, it looks for businesses that need software — not other developers.

## Prerequisites

- Node.js 20+
- Rust (rustup) + Windows build tools (MSVC / Visual Studio C++ workload)
- [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)

## Setup

```bash
npm install
npm run tauri:dev
```

Or double-click `Start ClientPilot.bat`.

## Configure

1. **Settings** — paste API keys (DeepSeek, Claude, optional SerpAPI for Google search)
2. **AI Models** — confirm per-task providers
3. **Prospect Search** — what you sell, who the buyer is, location, budget → Find Leads
4. **Leads** / **Outreach** / **Tasks** — review scored potential clients, generate copy, approve

Without SerpAPI, paste Extra URLs of companies/people to still analyze + score as clients.

## Stack

- React + Vite + TypeScript + Tailwind
- Tauri 2 + SQLite (`tauri-plugin-sql`) + HTTP (`tauri-plugin-http`)
- BYOK multi-provider AI layer (DeepSeek, Claude, OpenAI, Gemini, Kimi, Grok)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run tauri:dev` | Desktop app (dev) |
| `npm run tauri:build` | Production installer |
| `npm run build` | Frontend only |
