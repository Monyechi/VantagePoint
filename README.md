# ClientPilot

Desktop AI Workforce OS — first employee: **AI Business Development Representative**.

Local-first Tauri app: Prospect Search → Leads CRM → Outreach → Tasks, with per-task AI model routing (DeepSeek for workers, Claude for writing by default).

## Prerequisites

- Node.js 20+
- Rust (rustup) + Windows build tools (MSVC / Visual Studio C++ workload)
- [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/)

## Setup

```bash
npm install
npm run tauri:dev
```

## Configure

1. **Settings** — paste API keys (DeepSeek, Claude, optional SerpAPI for Google search)
2. **AI Models** — confirm per-task providers (cost estimates shown per 1,000 tasks)
3. **Prospect Search** — describe ICP, optionally paste Extra URLs, Start Search
4. **Leads** / **Outreach** / **Tasks** — review scored leads, generate copy, approve

Without SerpAPI, Extra URLs still run fetch → analyze → score.

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
