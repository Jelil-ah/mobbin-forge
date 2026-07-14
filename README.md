# mobbin-forge

[![npm version](https://img.shields.io/npm/v/mobbin-mcp.svg?color=F5A623)](https://www.npmjs.com/package/mobbin-mcp)
[![License: ISC](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-working-F5A623.svg)](https://github.com/Jelil-ah/mobbin-forge)

> The original mobbin-mcp is **archived and broken**. This fork fixes it.

An MCP server that actually works with [Mobbin](https://mobbin.com) — 600k+ real app screens, user flows, and design patterns from 1,100+ apps. Search screens, browse flows, grab color palettes, and build better UI without leaving Claude.

Mobbin has no public API. This server reverse-engineers their internal endpoints to give Claude direct access.

## What's different from the original

The [original mobbin-mcp](https://github.com/pdcolandrea/mobbin-mcp) stopped working when Mobbin wrapped all API responses in `{value: ...}`. That broke parsing (`Expected array, received object`, `.map is not a function`). This fork:

- **Unwraps `.value`** on searchable-apps and popular-apps endpoints
- **Fixes type drift** (popularApps now returns a category-grouped object, not a flat array)
- **Confirms what works** (893 real apps, 42 categories, CDN image downloads — tested live 2026-07-14)
- **Documents what's broken** (global filtered search is now client-side SPA filtering — see Known issues)

Ground truth API responses captured 2026-07-14 are in the repo. No guessing.

## What works right now

✅ **`getSearchableApps(platform)`** — 893 real apps (Disney+, Google Fit, Hers, ChatGPT, Arc Search...)  
✅ **`getPopularApps(platform)`** — 42 categories grouped (ai, finance, crypto, productivity, news...)  
✅ **`getAppScreens(appId, platform)`** — pulls ~20 real screens for any app. Live-verified on ChatGPT, Revolut, Notion, Spotify, Airbnb, Claude (20 screens each) + image download works. This is the big one: point at any app, get its full screen set to dissect section by section.  
✅ **Image downloads** — CDN URLs via Bytescale (public, no auth, tested with real webp files)  
✅ **Auth** — Session cookie stored chmod 600 in `~/.mobbin-mcp/auth.json`, free account works  

11 MCP tools total:
- `mobbin_search_apps` — browse apps by platform/category
- `mobbin_search_screens` — find screens by UI pattern/element/text
- `mobbin_search_flows` — find user journeys by action type
- `mobbin_quick_search` — fast autocomplete lookup by app name
- `mobbin_get_app_screens` — every screen for one app
- `mobbin_get_app_flows` — every flow for one app
- `mobbin_popular_apps` — category-grouped popularity snapshot
- `mobbin_list_collections` — your saved collections
- `mobbin_get_screen_detail` — full screenshot image + optional color extraction
- `mobbin_get_filters` — valid filter values (categories/patterns/elements/actions)
- `mobbin_get_collection` — fetch items from a saved collection

## Known issues

❌ **Global filtered search unavailable** — `/api/content/search-screens`, `search-apps`, `search-flows` now use **client-side SPA filtering** instead of clean POST endpoints. The search state lives in Next.js hydration (`__next_f.push`) and isn't directly callable. But: getAppScreens + the 42 categories let you dig app-by-app, so the missing global search doesn't block real usage. To restore it: open mobbin.com in Chrome DevTools, run a filtered search, capture how the client-side router handles it, reverse-engineer the SPA state. Investigation playbook in `investigate-search-routes.md`.

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

**Option A: CLI (recommended)**

```bash
npx mobbin-mcp auth
```

Follow the prompts:
1. Open [mobbin.com](https://mobbin.com) and log in
2. Open browser console (`Cmd+Option+J`)
3. Run `copy(document.cookie)` to copy your session
4. Paste into the CLI

Your session is saved to `~/.mobbin-mcp/auth.json` (chmod 600) and auto-refreshed.

**Option B: Environment variable**

1. Open [mobbin.com](https://mobbin.com) in Chrome and log in
2. DevTools → **Application** → **Cookies** → `https://mobbin.com`
3. Find `sb-ujasntkfphywizsdaapi-auth-token.0` and `sb-ujasntkfphywizsdaapi-auth-token.1`
4. Copy both values and combine:

```
sb-ujasntkfphywizsdaapi-auth-token.0=<value0>; sb-ujasntkfphywizsdaapi-auth-token.1=<value1>
```

5. Set `MOBBIN_AUTH_COOKIE` to that string (see step 3 below)

### 3. Add to Claude Code

```bash
claude mcp add mobbin -- npx -y mobbin-mcp
```

If using the environment variable (Option B):

```bash
claude mcp add mobbin -e MOBBIN_AUTH_COOKIE="sb-..." -- npx -y mobbin-mcp
```

### Alternative: Claude Desktop / Codex

Add to your MCP config (`~/Library/Application Support/Claude/claude_desktop_config.json` or equivalent):

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

- "I'm designing a checkout flow for food delivery — show me how DoorDash and Uber Eats handle it"
- "Pull up Duolingo's onboarding and walk me through the design decisions"
- "Find login screens that use bottom sheets and extract the color palette"
- "Compare settings screens in fintech apps — Robinhood, Cash App, Venmo"
- "What UI patterns are trending on iOS right now?"

## How it works

Mobbin runs on Next.js + Supabase. This server calls internal API routes (`/api/searchable-apps`, `/api/popular-apps/fetch-popular-apps-with-preview-screens`) using your session cookie. Tokens auto-refresh via Supabase's `/auth/v1/token` endpoint and persist back to `~/.mobbin-mcp/auth.json`.

**getAppScreens** parses the Next.js RSC flight stream (`__next_f.push`) from app detail pages (`/apps/{platform}/{slug}/_/screens`) to extract screen URLs, then fetches them via Mobbin's Bytescale CDN.

Screen images are served through Mobbin's Bytescale CDN. `mobbin_get_screen_detail` converts Supabase storage URLs to CDN URLs, fetches the image, and returns base64 content Claude can see. Optional color extraction uses [sharp](https://sharp.pixelplumbing.com/).

## Project structure

```
src/
  index.ts              # MCP server entry + CLI routing + tool registration
  constants.ts          # API URLs, keys, config
  types.ts              # TypeScript interfaces for all Mobbin data models
  cli/
    auth.ts             # Interactive CLI auth flow
  services/
    auth.ts             # Token parsing, expiry checks, auto-refresh
    api-client.ts       # HTTP client for all Mobbin API endpoints
    schemas.ts          # Zod schemas with .value unwrapping
  utils/
    auth-store.ts       # Persistent session storage (~/.mobbin-mcp/auth.json)
    formatting.ts       # Markdown formatters for tool responses
```

## Credits

Forked from [pdcolandrea/mobbin-mcp](https://github.com/pdcolandrea/mobbin-mcp). Respect to the original — it pioneered reverse-engineering Mobbin's API and made this possible. This fork exists because the upstream is archived and the API changed.

## License

ISC
