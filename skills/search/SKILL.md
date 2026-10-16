---
name: search
description: Gets better results from every Mobbin search, so the references match what you're working on. Use before every call to mobbin_search_screens, mobbin_search_flows, or mobbin_get_app_screens. Covers tools, parameters, writing effective queries, and inspecting visual screen details.
---

# Searching Mobbin

Searches real, market-proven mobile and web screens across Mobbin's catalog to back design decisions with evidence.

## Available mobbin-forge MCP Tools

| Target | Tool | Key Parameters |
|---|---|---|
| Lookup an app by name | `mobbin_quick_search` | `query` (app name), `platform` (`"ios"`, `"android"`, `"web"`) |
| All screens for a specific app | `mobbin_get_app_screens` | `app_id` (from quick_search), `platform`, `page_index`, `page_size` |
| Navigation flows for a specific app | `mobbin_get_app_flows` | `app_id`, `platform`, `page_index`, `page_size` |
| Global screen search | `mobbin_search_screens` | `screen_patterns`, `screen_elements`, `screen_keywords`, `categories`, `platform`, `sort_by`, `page_index`, `page_size` |
| Global flow search | `mobbin_search_flows` | `flow_actions`, `categories`, `platform`, `sort_by`, `page_index`, `page_size` |
| Browse apps by category | `mobbin_search_apps` | `categories`, `platform`, `sort_by`, `page_index`, `page_size` |
| Screen inspection & hex colors | `mobbin_get_screen_detail` | `screen_url`, `dimensions`, `extract_colors: true`, `app_name`, `screen_id` |
| Valid filter facet taxonomy | `mobbin_get_filters` | `kind` (`"categories"`, `"patterns"`, `"elements"`, `"actions"`) |
| Popular apps grouping | `mobbin_popular_apps` | `platform`, `limit_per_category` |
| User saved collections | `mobbin_list_collections` / `mobbin_get_collection` | `collection_id`, `content_type`, `platform` |

*Platform Support*: Both `android` and `ios` platforms are fully supported. When designing for Android apps, search `platform: "android"` or `platform: "ios"`.

---

## Recommended Search Workflows

### 1. App Deep-Dive (Recommended Pattern)
When you know the reference app (e.g., Duolingo, Calm, Spotify, Cash App):
1. `mobbin_quick_search(query: "Duolingo", platform: "ios")` $\rightarrow$ obtain `app_id`.
2. `mobbin_get_app_screens(app_id: "<app_id>", platform: "ios", page_index: 0, page_size: 10)`.
3. Select relevant screens and call `mobbin_get_screen_detail(screen_url: "<url>", dimensions: {...}, extract_colors: true)`.

### 2. Cross-App Pattern Discovery
When comparing how top apps solve a specific UX problem (e.g., Paywalls, Rewards, Onboarding):
1. Check valid tags: `mobbin_get_filters(kind: "patterns")` (e.g., `"Achievements & Awards"`, `"Promotions & Rewards"`, `"Confetti"`, `"Empty State"`).
2. Call `mobbin_search_screens(screen_patterns: ["Achievements & Awards"], categories: ["Education"], platform: "ios", page_size: 10)`.
3. For user journeys: `mobbin_search_flows(flow_actions: ["Redeeming"], platform: "ios", page_size: 5)`.

---

## Paging & Refinement

- Paging uses `page_index` (0-indexed) and `page_size` (default: 10). Increment `page_index` (`1`, `2`, ...) to fetch subsequent batches.
- Always pass `extract_colors: true` to `mobbin_get_screen_detail` to get authentic dominant palette values.
