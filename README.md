# mobbin-forge

[![npm version](https://img.shields.io/npm/v/mobbin-mcp.svg?color=F5A623)](https://www.npmjs.com/package/mobbin-mcp)
[![License: ISC](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-working-F5A623.svg)](https://github.com/Jelil-ah/mobbin-forge)

> The original mobbin-mcp is **archived and broken**. This fork fixes it.

An MCP server that works with [Mobbin](https://mobbin.com) — 600k+ real app screens and flows from 1,100+ apps. Search screens, browse flows, grab palettes, build better UI without leaving Claude. Mobbin has no public API. This server reverse-engineers their internal endpoints.

**This works.** Fork tested live 2026-07-14. Unwraps Mobbin's new `.value` wrapper, handles type drift (popularApps now category-grouped), confirmed 893 apps + 42 categories running. Ground truth API responses in repo.

## What works right now

✅ **`getSearchableApps(platform)`** — 893 real apps (Disney+, ChatGPT, Arc Search...)  
✅ **`getPopularApps(platform)`** — 42 categories grouped (ai, finance, crypto, productivity...)  
✅ **`getAppScreens(appId, platform)`** — the target app's full structured screen set, including patterns and UI elements. Pixel-verified on ChatGPT (384 screens), Claude (107), and Perplexity (131). Point at an app, get the right app — not recommendation noise.  
✅ **Image downloads** — CDN URLs via Bytescale (public, no auth, tested with real webp files)  
✅ **Auth** — Session cookie stored chmod 600 in `~/.mobbin-mcp/auth.json`, free account works  

11 MCP tools: search apps/screens/flows, quick search, get app screens/flows, popular apps, collections, screen detail + color extraction, filters.

## One limitation

Global cross-app search moved to client-side rendering (Next.js SPA state), so it's not directly callable yet. Everything else — per-app screens, categories, downloads — works great. You browse app-by-app, which is how you'd design anyway. Restoration playbook in `investigate-search-routes.md` if you want to hack on it.

## Setup

### Prerequisites

- Node.js 18+
- A [Mobbin](https://mobbin.com) account (free works)

### 1. Install & build

```bash
git clone https://github.com/Jelil-ah/mobbin-forge.git
cd mobbin-forge
npm install
npm run build
```

### 2. Authenticate

```bash
npx mobbin-mcp auth
```

Follow prompts: open [mobbin.com](https://mobbin.com), log in, run `copy(document.cookie)` in browser console, paste into CLI. Session saved to `~/.mobbin-mcp/auth.json` (chmod 600), auto-refreshed. For env-var auth, see `CONTRIBUTING.md`.

### 3. Add to Claude Code

```bash
claude mcp add mobbin -- npx -y mobbin-mcp
```

**Claude Desktop / Codex**: add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mobbin": {
      "command": "npx",
      "args": ["-y", "mobbin-mcp"]
    }
  }
}
```

## Example prompts

- "Show me how DoorDash and Uber Eats handle checkout flows"
- "Pull up Duolingo's onboarding and walk me through the design decisions"
- "Find login screens using bottom sheets and extract color palettes"

## How it works

Calls Mobbin's internal API routes using your session cookie. Tokens auto-refresh via Supabase and persist to `~/.mobbin-mcp/auth.json`. **getAppScreens** resolves the target app's real version, then parses its structured Next.js RSC data chunk — screens, patterns, elements, and dimensions — before downloading images through Bytescale. Optional color extraction uses [sharp](https://sharp.pixelplumbing.com/).

## Credits

Forked from [pdcolandrea/mobbin-mcp](https://github.com/pdcolandrea/mobbin-mcp). Respect to the original — pioneered reverse-engineering Mobbin's API. This fork exists because upstream is archived and the API changed.

## License

ISC
