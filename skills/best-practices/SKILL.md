---
name: best-practices
description: Core best practices for using mobbin-forge MCP tools. Covers scoping, connection checks, and tool capabilities.
---

# Mobbin Best Practices

Guidelines for agents using `mobbin-forge` MCP server tools.

## Available Capabilities

- **App Discovery**: Fast autocomplete via `mobbin_quick_search` and category browsing via `mobbin_search_apps` / `mobbin_popular_apps`.
- **Screen & Flow Inspection**: Full per-app screen catalogs (`mobbin_get_app_screens`) and journey navigation flows (`mobbin_get_app_flows`).
- **Visual Inspection**: High-resolution screenshot rendering and dominant hex color extraction (`mobbin_get_screen_detail`).
- **Cross-App Pattern Matching**: Filter by taxonomy facets (`mobbin_search_screens`, `mobbin_search_flows`, `mobbin_get_filters`).
- **Collections**: Inspect personal saved collections (`mobbin_list_collections`, `mobbin_get_collection`).

## Ground Rules

1. **Precedent Over Guesswork**: Aim for $\ge 2$ real products sharing a structural decision before locking a redesign pattern.
2. **Borrow Structure, Not Branding**: Extract layout rhythm, visual hierarchy, and tactile interaction physics — never clone proprietary logos, illustration art, or trademark colors.
3. **Inspect with Vision**: When referencing a screen, always fetch `mobbin_get_screen_detail` with `extract_colors: true` to inspect the actual visual UI and dominant palette.
4. **Platform Awareness**: Support `ios`, `android`, and `web`. Cite the platform of referenced screens accurately.
