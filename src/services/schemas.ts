import { z } from "zod";

/**
 * Zod schemas for Mobbin API responses.
 *
 * These are the runtime contract enforced at the API boundary in `MobbinApiClient.request`.
 * Types in `src/types.ts` are derived from these via `z.infer`, so schema and type cannot drift.
 *
 * All object schemas use `.passthrough()` — we assert only on the fields we consume,
 * so Mobbin can add new fields without breaking the client.
 */

/**
 * The `/api/search/fetch-search-page-*` family (introduced when Mobbin retired
 * `/api/content/search-*`) dropped the flat `screenUrl` string from preview
 * screens in favor of `screenCdnImgSources.src`. Accept either shape and
 * normalize to `screenUrl` so downstream formatters don't need to know which
 * route produced the data.
 */
export const previewScreenSchema = z
  .object({
    id: z.string(),
    screenUrl: z.string().optional(),
    screenCdnImgSources: z.object({ src: z.string() }).passthrough().optional(),
    isUserScreen: z.boolean().optional(),
  })
  .passthrough()
  .transform((data) => ({
    ...data,
    screenUrl: data.screenUrl ?? data.screenCdnImgSources?.src ?? "",
  }));

/**
 * `/api/search-bar/fetch-searchable-apps` (replacement for the old
 * `GET /api/searchable-apps/{platform}`) serves the logo as
 * `appLogoCdnImgSources.src` instead of a flat `appLogoUrl`. Normalize the
 * same way as {@link previewScreenSchema}.
 */
export const searchableAppSchema = z
  .object({
    id: z.string(),
    platform: z.string(),
    appName: z.string(),
    appLogoUrl: z.string().optional(),
    appLogoCdnImgSources: z.object({ src: z.string() }).passthrough().optional(),
    appTagline: z.string().optional(),
    keywords: z.array(z.string()).optional().default([]),
    previewScreens: z.array(previewScreenSchema).nullable().optional(),
  })
  .passthrough()
  .transform((data) => ({
    ...data,
    appLogoUrl: data.appLogoUrl ?? data.appLogoCdnImgSources?.src,
  }));

/**
 * Rows returned by `/api/search/fetch-search-page-apps` (replacement for the
 * old `/api/content/search-apps`, confirmed dead 2026-08-28). The new route
 * dropped `appCategory`, `allAppCategories`, `keywords`, `popularityMetric`,
 * and `trendingMetric` entirely, and swapped `previewVideoUrl` for
 * `previewVideoCdnVideoSources` — relax those to optional rather than
 * required so validation doesn't reject live data.
 */
export const appResultSchema = z
  .object({
    id: z.string(),
    appName: z.string(),
    appCategory: z.string().optional(),
    allAppCategories: z.array(z.string()).optional(),
    appLogoUrl: z.string(),
    appTagline: z.string(),
    platform: z.string(),
    keywords: z.array(z.string()).optional(),
    appVersionId: z.string(),
    appVersionPublishedAt: z.string(),
    previewScreens: z.array(previewScreenSchema),
    previewVideoUrl: z.string().nullable().optional(),
    popularityMetric: z.number().optional(),
    trendingMetric: z.number().optional(),
    isRestricted: z.boolean(),
  })
  .passthrough();

/**
 * Rows returned by `/api/search/fetch-search-page-screens` (replacement for the
 * old `/api/content/search-screens`, confirmed dead 2026-08-28).
 *
 * Mobbin returns one of two shapes depending on the filter:
 *   - **Full shape** (no filter, or filtered by `screenPatterns` / `appCategories`)
 *     includes `screenNumber`, `screenKeywords`, `appCategory`, `allAppCategories`,
 *     `appTagline`, `companyHqRegion`, `companyStage`, `popularityMetric`,
 *     `trendingMetric`, and `metadata: { width, height }`.
 *   - **Trimmed shape** (filtered by `screenElements` or `screenKeywords`)
 *     omits all of the above and instead carries top-level `width`/`height`
 *     plus `createdAt`.
 *
 * The optional fields below cover the trimmed shape; everything still required
 * is present in both. `fullpageScreenUrl` is absent entirely on the new route
 * (replaced by `fullpageScreenCdnImgSources`), so it's optional now too.
 */
export const screenResultSchema = z
  .object({
    type: z.string(),
    id: z.string(),
    screenUrl: z.string(),
    fullpageScreenUrl: z.string().nullable().optional(),
    screenPatterns: z.array(z.string()),
    screenElements: z.array(z.string()),
    appVersionId: z.string(),
    appId: z.string(),
    appName: z.string(),
    appLogoUrl: z.string(),
    platform: z.string(),
    screenCdnImgSources: z.object({ src: z.string() }).passthrough().optional(),
    // Full-shape-only fields — absent from element/keyword-filtered responses.
    screenNumber: z.number().optional(),
    screenKeywords: z.string().optional(),
    appCategory: z.string().optional(),
    allAppCategories: z.array(z.string()).optional(),
    appTagline: z.string().optional(),
    companyHqRegion: z.string().nullable().optional(),
    companyStage: z.string().nullable().optional(),
    popularityMetric: z.number().optional(),
    trendingMetric: z.number().optional(),
    metadata: z.object({ width: z.number(), height: z.number() }).passthrough().optional(),
    // Trimmed-shape extras — top-level dimensions and timestamp Mobbin sends
    // in lieu of `metadata`.
    width: z.number().optional(),
    height: z.number().optional(),
    createdAt: z.string().optional(),
  })
  .passthrough();

/**
 * Actual shape returned by `/api/content/search-flows` — confirmed via the probe in
 * commit 439d3d7. The interface previously declared `screenPatterns` and `metadata`,
 * which the API never sends; that mismatch is exactly what this validation prevents.
 *
 * `/api/search/fetch-search-page-flows` (the route's 2026-08-28 replacement) dropped
 * the flat `screenUrl` in favor of `screenCdnImgSources.src` — same normalization
 * as {@link previewScreenSchema}.
 */
export const flowScreenSchema = z
  .object({
    order: z.number().optional().default(0),
    hotspotType: z.string().nullable().optional(),
    hotspotX: z.number().nullable().optional(),
    hotspotY: z.number().nullable().optional(),
    hotspotWidth: z.number().nullable().optional(),
    hotspotHeight: z.number().nullable().optional(),
    videoTimestamp: z.number().nullable().optional(),
    screenUrl: z.string().optional(),
    screenCdnImgSources: z.object({ src: z.string() }).passthrough().optional(),
    screenId: z.string(),
    width: z.number().optional().default(0),
    height: z.number().optional().default(0),
  })
  .passthrough()
  .transform((data) => ({
    ...data,
    screenUrl: data.screenUrl ?? data.screenCdnImgSources?.src ?? "",
  }));

/**
 * Rows returned by `/api/search/fetch-search-page-flows` (replacement for the old
 * `/api/content/search-flows`, confirmed dead 2026-08-28). The new route uses
 * `restricted` instead of an `isRestricted`/`appCategory` pair, and exposes video via
 * `videoCdnVideoSources` rather than a flat `videoUrl` — every live sample's
 * `videoCdnVideoSources` was either `null` or an unplayable placeholder
 * (`data:video/mp4,`), so `videoUrl` is left optional/nullable and simply comes
 * back unset for rows sourced from the new route (formatters already guard on it).
 */
export const flowResultSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    actions: z.array(z.string()).optional().default([]),
    videoUrl: z.string().nullable().optional(),
    screens: z.array(flowScreenSchema).optional().default([]),
    appVersionId: z.string().optional(),
    appId: z.string().optional(),
    appName: z.string().optional(),
    appCategory: z.string().optional(),
    appLogoUrl: z.string().nullable().optional(),
    platform: z.string().optional(),
  })
  .passthrough();

export const collectionSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    name: z.string(),
    description: z.string(),
    isPublic: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
    createdBy: z.string(),
    mobileAppsCount: z.number(),
    mobileScreensCount: z.number(),
    mobileFlowsCount: z.number(),
    webAppsCount: z.number(),
    webScreensCount: z.number(),
    webFlowsCount: z.number(),
    mobilePreviewScreens: z.array(previewScreenSchema).optional(),
  })
  .passthrough();

/**
 * Item shape returned by `/collections/api/fetch-collection-contents`.
 *
 * The envelope is the same for every contentType — what varies is which inner
 * payload key is populated (`screen`, `flow`, `app`, etc.) and which FK column
 * is non-null (`app_screen_id`, `app_flow_id`, ...). The inner payloads are
 * close to the search-API shapes but trimmed differently (for example, the
 * `screen` payload exposes top-level `width`/`height` instead of `metadata`,
 * and lacks `appCategory`/`popularityMetric`/`screenNumber`), so we keep them
 * as `unknown()` and validate just the fields the formatter consumes.
 */
export const collectionItemScreenSchema = z
  .object({
    id: z.string(),
    appId: z.string(),
    appName: z.string(),
    platform: z.string(),
    screenUrl: z.string(),
    width: z.number(),
    height: z.number(),
    screenPatterns: z.array(z.string()),
    screenElements: z.array(z.string()),
    appLogoUrl: z.string().optional(),
    fullpageScreenUrl: z.string().nullable().optional(),
  })
  .passthrough();

export const collectionItemFlowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    appId: z.string(),
    appName: z.string(),
    platform: z.string(),
    actions: z.array(z.string()),
    videoUrl: z.string().nullable(),
    screens: z.array(flowScreenSchema),
  })
  .passthrough();

export const collectionItemAppSchema = z
  .object({
    id: z.string(),
    appName: z.string(),
    platform: z.string(),
    appLogoUrl: z.string().optional(),
    appTagline: z.string().optional(),
  })
  .passthrough();

export const collectionItemSchema = z
  .object({
    id: z.string(),
    collection_id: z.string(),
    contentType: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    app_id: z.string().nullable(),
    app_screen_id: z.string().nullable(),
    app_flow_id: z.string().nullable(),
    site_id: z.string().nullable(),
    site_page_section_id: z.string().nullable(),
    screen: collectionItemScreenSchema.optional(),
    flow: collectionItemFlowSchema.optional(),
    app: collectionItemAppSchema.optional(),
  })
  .passthrough();

/**
 * Successful response from `/collections/api/fetch-collection-contents`.
 *
 * The endpoint also returns HTTP 200 with `{ error: { message, code } }` for
 * server-side failures (e.g., unknown `collectionId` -> "query error"). Those
 * are turned into thrown errors by the API client so they surface at the call
 * site instead of silently parsing as an empty result.
 */
export const collectionContentsResponseSchema = z
  .object({
    value: z
      .object({
        data: z.array(collectionItemSchema),
        pageSize: z.number().optional(),
      })
      .passthrough()
      .optional(),
    error: z
      .object({
        message: z.string(),
        code: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const dictionaryCategorySchema = z
  .object({
    slug: z.string(),
    displayName: z.string(),
    experience: z.string(),
    subCategories: z.array(
      z
        .object({
          entries: z.array(
            z
              .object({
                displayName: z.string(),
                definition: z.string(),
                hidden: z.boolean().optional(),
                contentCounts: z.record(z.union([z.record(z.number()), z.number()])).nullable(),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

/**
 * Raw shape returned by `/api/filter-tags/fetch-filter-tag-catalogs` (replacement
 * for the old `/api/filter-tags/fetch-dictionary-definitions`, confirmed dead
 * 2026-08-28). Structurally different from the legacy dictionary response — grouped
 * by experience (`mobile`/`web`/`sites`) then by facet key, each facet an array of
 * `{ id, displayName, tags: [...] }` groups rather than the old
 * `{ slug, subCategories: [{ entries }] }` shape. `MobbinApiClient.getDictionaryDefinitions`
 * transforms this into `DictionaryCategory[]` so the rest of the app (and the
 * `mobbin_get_filters` tool) never sees the new shape.
 */
const filterTagEntrySchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    definition: z.string().optional(),
    hidden: z.boolean().optional(),
    contentCounts: z.record(z.union([z.record(z.number()), z.number()])).nullable().optional(),
  })
  .passthrough();

const filterTagGroupSchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    tags: z.array(filterTagEntrySchema),
  })
  .passthrough();

const filterTagExperienceSchema = z
  .object({
    appCategories: z.array(filterTagGroupSchema),
    screenPatterns: z.array(filterTagGroupSchema),
    screenElements: z.array(filterTagGroupSchema),
    flowActions: z.array(filterTagGroupSchema),
  })
  .passthrough();

export const filterTagCatalogsResponseSchema = z
  .object({
    value: z
      .object({
        mobile: filterTagExperienceSchema,
        web: filterTagExperienceSchema,
      })
      .passthrough(),
  })
  .passthrough();

export const popularAppEntrySchema = z
  .object({
    app_id: z.string(),
    app_name: z.string(),
    app_logo_url: z.string().optional(),
    preview_screens: z.array(z.object({ id: z.string(), screenUrl: z.string() }).passthrough()).optional().default([]),
    app_category: z.string().optional(),
    secondary_app_categories: z.array(z.string()).optional().default([]),
    popularity_metric: z.number().optional(),
  })
  .passthrough();

const autocompleteItemSchema = z.object({ id: z.string(), type: z.string() }).passthrough();

export const autocompleteResponseSchema = z
  .object({
    value: z
      .object({
        experience: z.string(),
        primary: z.array(autocompleteItemSchema),
        other: z.array(autocompleteItemSchema),
        secondaryPlatform: z.array(autocompleteItemSchema),
        sites: z.array(autocompleteItemSchema),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * Screens as embedded in the SSR'd app-detail page (`/apps/{slug}/screens`).
 * Shape differs from `screenResultSchema` (the search-screens API): SSR carries
 * extras like OCR boxes and `isAppKeyScreen`, but lacks `screenNumber`,
 * `appCategory`, `popularityMetric`, etc. Used by `getAppPage`.
 */
export const ocrBoundingBoxSchema = z
  .object({
    text: z.string(),
    bbox: z
      .object({
        x0: z.number(),
        y0: z.number(),
        x1: z.number(),
        y1: z.number(),
      })
      .passthrough(),
  })
  .passthrough();

export const appPageScreenSchema = z
  .object({
    type: z.string().optional(),
    id: z.string(),
    screenUrl: z.string(),
    createdAt: z.string().optional(),
    width: z.number().optional().default(0),
    height: z.number().optional().default(0),
    fullpageScreenUrl: z.string().nullable().optional(),
    screenElements: z.array(z.string()).optional().default([]),
    screenPatterns: z.array(z.string()).optional().default([]),
    isAppKeyScreen: z.boolean().optional().default(false),
    appId: z.string().optional().default(""),
    appName: z.string().optional().default(""),
    appLogoUrl: z.string().nullable().optional(),
    platform: z.string().optional().default(""),
    appVersionId: z.string().optional().default(""),
    appVersionPublishedAt: z.string().optional().default(""),
    ocrBoundingBoxes: z.array(ocrBoundingBoxSchema).nullable().optional(),
  })
  .passthrough();

/**
 * Top-level shape of the structured payload extracted from the SSR HTML —
 * an array where `[0].value` is flows and `[1].value` is the flat screens list.
 * `[2]` (and beyond) is dictionary metadata we ignore. Validate the inner
 * arrays with their own schemas in code rather than locking the tuple length.
 */
export const appPagePayloadEntrySchema = z.object({ value: z.unknown() }).passthrough();

export const appPagePayloadSchema = z.array(appPagePayloadEntrySchema).min(2);

/** Wraps an item schema in the standard paginated `{ value: { searchRequestId, data: T[] } }` envelope. */
export const contentSearchResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z
    .object({
      value: z
        .object({
          searchRequestId: z.string(),
          data: z.array(item),
        })
        .passthrough(),
    })
    .passthrough();

/** Wraps a data schema in the standard non-paginated `{ value: T }` envelope. */
export const valueResponseSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({ value: data }).passthrough();

// Pre-composed response schemas — these are what `MobbinApiClient` methods pass to `request()`.
export const searchAppsResponseSchema = contentSearchResponseSchema(appResultSchema);
export const searchScreensResponseSchema = contentSearchResponseSchema(screenResultSchema);
export const searchFlowsResponseSchema = contentSearchResponseSchema(flowResultSchema);
export const searchableAppsResponseSchema = valueResponseSchema(z.array(searchableAppSchema));
export const popularAppsResponseSchema = valueResponseSchema(z.record(z.array(popularAppEntrySchema)));
export const collectionsResponseSchema = valueResponseSchema(z.array(collectionSchema));
export const dictionaryDefinitionsResponseSchema = valueResponseSchema(
  z.array(dictionaryCategorySchema),
);
