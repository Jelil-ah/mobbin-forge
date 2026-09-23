import sharp from "sharp";
import { z } from "zod";
import {
  MOBBIN_BASE_URL,
  ALLOWED_IMAGE_HOSTS,
  MAX_IMAGE_SIZE_BYTES,
  IMAGE_FETCH_TIMEOUT_MS,
  BYTESCALE_CDN_BASE,
  SUPABASE_STORAGE_PREFIX,
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_INDEX,
  COLOR_SAMPLE_SIZE,
  COLOR_QUANTIZE_STEP,
  COLOR_QUANTIZE_MAX,
} from "../constants.js";
import {
  searchAppsResponseSchema,
  searchScreensResponseSchema,
  searchFlowsResponseSchema,
  autocompleteResponseSchema,
  searchableAppsResponseSchema,
  popularAppsResponseSchema,
  collectionsResponseSchema,
  collectionContentsResponseSchema,
  filterTagCatalogsResponseSchema,
  appPagePayloadSchema,
  appPageScreenSchema,
  flowResultSchema,
} from "./schemas.js";
import type { MobbinAuth } from "./auth.js";
import type {
  AppResult,
  ScreenResult,
  FlowResult,
  Collection,
  CollectionItem,
  CollectionCursor,
  SearchableApp,
  PopularAppEntry,
  AutocompleteResponse,
  DictionaryCategory,
  ContentSearchResponse,
  ValueResponse,
  AppPageScreen,
} from "../types.js";

/**
 * HTTP client for Mobbin's internal Next.js API routes.
 *
 * Mobbin has no public API — these endpoints were reverse-engineered via Playwright.
 * Auth is handled via {@link MobbinAuth}, which manages the Supabase session cookie
 * and automatically refreshes tokens before they expire.
 *
 * All endpoints live at `https://mobbin.com/api/...` and proxy to Supabase server-side.
 */
export class MobbinApiClient {
  private auth: MobbinAuth;

  constructor(auth: MobbinAuth) {
    this.auth = auth;
  }

  /**
   * Make an authenticated request to a Mobbin API route and validate the response against a zod schema.
   *
   * On validation failure the thrown error names the request path AND each failing field
   * (e.g. `value.data[0].screenPatterns: Required`) so shape drift surfaces at the boundary
   * instead of crashing several layers later in a formatter.
   */
  private async request<S extends z.ZodTypeAny>(
    path: string,
    schema: S,
    options: { method?: string; body?: unknown } = {},
  ): Promise<z.infer<S>> {
    const { method = "GET", body } = options;
    const cookie = await this.auth.getCookieValue();

    const headers: Record<string, string> = {
      Cookie: cookie,
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${MOBBIN_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Mobbin API error: ${res.status} ${res.statusText} - ${path}${text ? `: ${text.substring(0, 200)}` : ""}`,
      );
    }

    const json = await res.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((issue) => {
          const issuePath = issue.path.length ? issue.path.join(".") : "(root)";
          return `  ${issuePath}: ${issue.message}`;
        })
        .join("\n");
      throw new Error(`Mobbin API response failed validation for ${path}:\n${issues}`, {
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  /**
   * Search and browse apps with category filtering and pagination.
   *
   * Endpoint: `POST /api/search/fetch-search-page-apps` — replaces the dead
   * `/api/content/search-apps` (404 as of 2026-08-28; Mobbin renamed the whole
   * `/api/content/search-*` family to `/api/search/fetch-search-page-*` and swapped
   * the `filterOptions`/`paginationOptions` envelope for a single `searchQuery`
   * object). `categories` takes display-name strings (e.g. "AI"), not category IDs —
   * confirmed via probe: an ID filter silently matches zero rows. The route also
   * rejects `sortBy: "trending"` (400) — apps only accept `"publishedAt"`, which
   * matches the `mobbin_search_apps` tool's own sort enum, so this never sends it.
   * Every `searchQuery` field must be present (use `null` for "no filter") — an
   * omitted field triggers an empty-body 400.
   */
  async searchApps(params: {
    platform: string;
    appCategories?: string[];
    pageSize?: number;
    pageIndex?: number;
    sortBy?: string;
  }): Promise<ContentSearchResponse<AppResult>> {
    return this.request("/api/search/fetch-search-page-apps", searchAppsResponseSchema, {
      method: "POST",
      body: {
        searchRequestId: "",
        pageIndex: params.pageIndex ?? DEFAULT_PAGE_INDEX,
        pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE,
        searchQuery: {
          platform: params.platform,
          type: "filters",
          categories: params.appCategories ?? null,
          sortBy: params.sortBy ?? "publishedAt",
        },
      },
    });
  }

  /**
   * Search screens across all apps by patterns, elements, or OCR keywords.
   *
   * Endpoint: `POST /api/search/fetch-search-page-screens` — replaces the dead
   * `/api/content/search-screens` (404 as of 2026-08-28), same route-family rename
   * as {@link searchApps}. `categories` takes display-name strings, not IDs (see
   * {@link searchApps}). `hasAnimation` only accepts `null` or `true` — the API
   * 400s on a literal `false`, so there's no way to request "non-animated only";
   * `false`/`undefined` are both treated as "no filter" (`null`). Every
   * `searchQuery` field must be present, `null` where unset, or the route 400s.
   * `screenKeywords` has no array equivalent on the new route — OCR text search
   * moved to `textInScreenshotQuery` (a single string), so the array is joined with
   * spaces (confirmed via probe: a space-joined multi-word query filters correctly).
   */
  async searchScreens(params: {
    platform: string;
    screenPatterns?: string[];
    screenElements?: string[];
    screenKeywords?: string[];
    appCategories?: string[];
    hasAnimation?: boolean;
    pageSize?: number;
    pageIndex?: number;
    sortBy?: string;
  }): Promise<ContentSearchResponse<ScreenResult>> {
    return this.request("/api/search/fetch-search-page-screens", searchScreensResponseSchema, {
      method: "POST",
      body: {
        searchRequestId: "",
        pageIndex: params.pageIndex ?? DEFAULT_PAGE_INDEX,
        pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE,
        searchQuery: {
          platform: params.platform,
          type: "filters",
          categories: params.appCategories ?? null,
          screenElements: params.screenElements ?? null,
          screenPatterns: params.screenPatterns ?? null,
          textInScreenshotQuery: params.screenKeywords?.length
            ? params.screenKeywords.join(" ")
            : null,
          hasAnimation: params.hasAnimation ? true : null,
          sortBy: params.sortBy ?? "trending",
        },
      },
    });
  }

  /**
   * Search user flows/journeys by action type (e.g., "Creating Account").
   *
   * Endpoint: `POST /api/search/fetch-search-page-flows` — replaces the dead
   * `/api/content/search-flows` (404 as of 2026-08-28), same route-family rename
   * as {@link searchApps}. `flowActions`/`categories` take display-name strings,
   * not IDs (see {@link searchApps}). Every `searchQuery` field must be present,
   * `null` where unset, or the route 400s.
   */
  async searchFlows(params: {
    platform: string;
    flowActions?: string[];
    appCategories?: string[];
    pageSize?: number;
    pageIndex?: number;
    sortBy?: string;
  }): Promise<ContentSearchResponse<FlowResult>> {
    return this.request("/api/search/fetch-search-page-flows", searchFlowsResponseSchema, {
      method: "POST",
      body: {
        searchRequestId: "",
        pageIndex: params.pageIndex ?? DEFAULT_PAGE_INDEX,
        pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE,
        searchQuery: {
          platform: params.platform,
          type: "filters",
          categories: params.appCategories ?? null,
          flowActions: params.flowActions ?? null,
          sortBy: params.sortBy ?? "trending",
        },
      },
    });
  }

  /**
   * Fast autocomplete search — returns matching IDs grouped by relevance.
   * Results contain only IDs; cross-reference with {@link getSearchableApps} for full details.
   * Endpoint: `POST /api/search-bar/search`
   */
  async autocompleteSearch(params: {
    query: string;
    experience?: string;
    platform?: string;
  }): Promise<AutocompleteResponse> {
    return this.request("/api/search-bar/search", autocompleteResponseSchema, {
      method: "POST",
      body: {
        query: params.query,
        experience: params.experience ?? "apps",
        platform: params.platform ?? "ios",
      },
    });
  }

  /**
   * Fetch the full list of apps for a platform (used for autocomplete cross-referencing).
   * This is a large response (~1000+ apps); results are cached by the Mobbin client.
   *
   * Endpoint: `POST /api/search-bar/fetch-searchable-apps` — replaces the dead
   * `GET /api/searchable-apps/{platform}` (404 as of 2026-08-28). Same `{ value: T[] }`
   * envelope as before; only the method/path/body shape changed.
   */
  async getSearchableApps(platform: string): Promise<SearchableApp[]> {
    const response = await this.request(
      "/api/search-bar/fetch-searchable-apps",
      searchableAppsResponseSchema,
      { method: "POST", body: { platform } },
    );
    return response.value;
  }

  /**
   * Get popular apps grouped by category with preview screenshots.
   * Endpoint: `POST /api/popular-apps/fetch-popular-apps-with-preview-screens`
   */
  async getPopularApps(params: {
    platform: string;
    limitPerCategory?: number;
  }): Promise<Record<string, PopularAppEntry[]>> {
    const response = await this.request(
      "/api/popular-apps/fetch-popular-apps-with-preview-screens",
      popularAppsResponseSchema,
      {
        method: "POST",
        body: {
          platform: params.platform,
          limitPerCategory: params.limitPerCategory ?? 10,
        },
      },
    );
    return response.value;
  }

  /**
   * Fetch the authenticated user's saved collections with item counts.
   * Endpoint: `POST /api/collection/fetch-collections`
   */
  async getCollections(): Promise<ValueResponse<Collection[]>> {
    return this.request("/api/collection/fetch-collections", collectionsResponseSchema, {
      method: "POST",
    });
  }

  /**
   * Fetch one page of items inside a saved collection.
   *
   * Mobbin's web client buckets collection contents along two axes — `contentType`
   * ({apps, screens, flows, sites, sections}) and `platformType` ({mobile, web}) —
   * and pages each bucket independently using a keyset cursor. Pass `cursor: null`
   * for the first page; for subsequent pages echo back the `nextCursor` returned
   * by the previous call. Last-page detection: `nextCursor === null` (a short
   * page).
   *
   * Errors come back as HTTP 200 with a server-side `{ error: { message } }`
   * payload (e.g. unknown `collectionId` → "query error"); we promote those to
   * thrown errors here so callers don't silently see an empty list.
   *
   * Endpoint: `POST /collections/api/fetch-collection-contents`
   */
  async getCollectionContents(params: {
    collectionId: string;
    contentType: "apps" | "screens" | "flows";
    platformType: "mobile" | "web";
    pageSize?: number;
    cursor?: CollectionCursor | null;
  }): Promise<{ items: CollectionItem[]; nextCursor: CollectionCursor | null }> {
    const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
    const result = await this.request(
      "/collections/api/fetch-collection-contents",
      collectionContentsResponseSchema,
      {
        method: "POST",
        body: {
          collectionId: params.collectionId,
          contentType: params.contentType,
          platformType: params.platformType,
          paginationOptions: {
            keysetPagination: params.cursor ?? {},
            pageSize,
          },
        },
      },
    );

    if (result.error) {
      throw new Error(
        `Mobbin collection-contents error (${result.error.code ?? "unknown"}): ${result.error.message}`,
      );
    }
    if (!result.value) {
      throw new Error("Mobbin collection-contents returned neither value nor error.");
    }

    const items = result.value.data;
    const last = items[items.length - 1];
    // The web client treats "page is full" as "there might be more". Apply the
    // same rule so we never report exhausted when there's an exact-multiple boundary.
    const nextCursor =
      items.length === pageSize && last
        ? { lastCreatedAt: last.created_at, lastId: last.id }
        : null;
    return { items, nextCursor };
  }

  /**
   * Fetch the full filter taxonomy — all app categories, screen patterns,
   * UI elements, and flow actions with definitions and content counts.
   *
   * Endpoint: `POST /api/filter-tags/fetch-filter-tag-catalogs` — replaces the dead
   * `/api/filter-tags/fetch-dictionary-definitions` (404 as of 2026-08-28). The new
   * route's response shape is unrelated to the old one (grouped by experience then
   * facet key, each facet an array of `{ id, displayName, tags }` groups — see
   * {@link filterTagCatalogsResponseSchema}), so this method reshapes it into the
   * legacy `DictionaryCategory[]` the rest of the app (and `mobbin_get_filters`'s
   * `KIND_MATCHERS` substring matching on `slug`) already expects, rather than
   * changing every downstream consumer.
   */
  async getDictionaryDefinitions(): Promise<ValueResponse<DictionaryCategory[]>> {
    const raw = await this.request(
      "/api/filter-tags/fetch-filter-tag-catalogs",
      filterTagCatalogsResponseSchema,
      { method: "POST", body: {} },
    );

    const facetKeys = ["appCategories", "screenPatterns", "screenElements", "flowActions"] as const;
    const categories: DictionaryCategory[] = [];
    for (const experience of ["mobile", "web"] as const) {
      for (const facetKey of facetKeys) {
        const groups = raw.value[experience][facetKey];
        categories.push({
          slug: facetKey,
          displayName: facetKey,
          experience,
          subCategories: groups.map((group) => ({
            displayName: group.displayName,
            entries: group.tags.map((tag) => ({
              ...tag,
              definition: tag.definition ?? "",
              contentCounts: tag.contentCounts ?? null,
            })),
          })),
        });
      }
    }

    return { value: categories };
  }

  /**
   * Fetch the SSR'd app-detail page for an app and return its embedded
   * flows + screens. Mobbin's `/api/content/search-screens` and
   * `/api/content/search-flows` ignore per-app filters silently — confirmed
   * via probe — so the only authoritative per-app source is the HTML page
   * at `/apps/{slug}-{platform}-{appId}/{versionId}/screens`. The page renders via
   * Next.js Server Components and inlines the structured data inside
   * `self.__next_f.push([1, "..."])` flight chunks; we concatenate the
   * chunks, locate the `[{"value":[...]}, ...]` payload, and parse it.
   *
   * Slug derivation: looked up via `getSearchableApps`, kebab-cased.
   * AppVersionId is REQUIRED — we resolve it via a 307 redirect from the canonical app URL.
   *
   * Endpoint: `GET /apps/{slug}-{platform}-{appId}/{versionId}/screens`
   */
  async getAppPage(params: {
    appId: string;
    platform: string;
  }): Promise<{ flows: FlowResult[]; screens: AppPageScreen[]; appName: string; slug: string }> {
    const allApps = await this.getSearchableApps(params.platform);
    const app = allApps.find((a) => a.id === params.appId);
    if (!app) {
      throw new Error(
        `App not found: appId=${params.appId} platform=${params.platform}. Use mobbin_quick_search to discover valid app IDs.`,
      );
    }
    const slug = `${slugifyAppName(app.appName)}-${params.platform}-${params.appId}`;
    const cookie = await this.auth.getCookieValue();

    // STEP 1: Resolve appVersionId via 307 redirect
    const canonicalPath = `/apps/${slug}`;
    const redirectRes = await fetch(`${MOBBIN_BASE_URL}${canonicalPath}`, {
      headers: { Cookie: cookie },
      redirect: "manual",
    });

    let versionId: string | null = null;
    if (redirectRes.status === 307) {
      const location = redirectRes.headers.get("location");
      if (location) {
        const versionMatch = location.match(/\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\//);
        if (versionMatch) {
          versionId = versionMatch[1];
        }
      }
    }

    if (!versionId) {
      throw new Error(`Could not resolve appVersionId for ${slug}; refusing to return unrelated screens.`);
    }
    const path = `/apps/${slug}/${versionId}/screens`;

    const res = await fetch(`${MOBBIN_BASE_URL}${path}`, {
      headers: {
        Cookie: cookie,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`Mobbin app page fetch failed: ${res.status} ${res.statusText} - ${path}`);
    }
    const html = await res.text();

    const payload = extractAppPagePayload(html, path, {
      appId: params.appId,
      platform: params.platform,
      versionId,
      slug,
    });
    const flows = z.array(flowResultSchema).parse(payload[0].value);
    const screens = z.array(appPageScreenSchema).parse(payload[1].value);
    return { flows, screens, appName: app.appName, slug };
  }

  /**
   * Convert a Supabase storage URL to its Bytescale CDN equivalent.
   * Supabase storage URLs are not directly accessible — images are served via CDN.
   *
   * Input:  https://ujasntkfphywizsdaapi.supabase.co/storage/v1/object/public/content/app_screens/{uuid}.png
   * Output: https://bytescale.mobbin.com/FW25bBB/image/mobbin.com/prod/content/app_screens/{uuid}.png?f=webp&w=1920&q=85&fit=shrink-cover
   */
  private toCdnUrl(imageUrl: string): string {
    const parsed = new URL(imageUrl);

    // Already a CDN URL — use as-is
    if (parsed.hostname === "bytescale.mobbin.com") {
      return imageUrl;
    }

    // Convert Supabase storage URL to CDN URL
    const storageIdx = parsed.pathname.indexOf(SUPABASE_STORAGE_PREFIX);
    if (storageIdx === -1) {
      throw new Error(`Unrecognized Supabase URL format: ${imageUrl}`);
    }

    const storagePath = parsed.pathname.slice(storageIdx + SUPABASE_STORAGE_PREFIX.length);
    return `${BYTESCALE_CDN_BASE}/${storagePath}?f=webp&w=1920&q=85&fit=shrink-cover`;
  }

  /**
   * Fetch a screen image from its URL and return it as base64.
   * Automatically converts Supabase storage URLs to Bytescale CDN URLs.
   * No authentication required — these are public CDN assets.
   */
  async fetchScreenImage(imageUrl: string): Promise<{
    base64: string;
    mimeType: string;
    sizeBytes: number;
    buffer: Buffer;
  }> {
    const parsed = new URL(imageUrl);
    if (!ALLOWED_IMAGE_HOSTS.includes(parsed.hostname)) {
      throw new Error(
        `Untrusted image host: ${parsed.hostname}. Only Supabase storage and Bytescale CDN URLs are supported.`,
      );
    }

    const fetchUrl = this.toCdnUrl(imageUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(fetchUrl, { signal: controller.signal });

      if (!res.ok) {
        throw new Error(`Failed to fetch image: ${res.status} ${res.statusText} — ${fetchUrl}`);
      }

      const contentLength = res.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(
          `Image too large (${contentLength} bytes). Max: ${MAX_IMAGE_SIZE_BYTES} bytes.`,
        );
      }

      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
        throw new Error(
          `Image too large (${buffer.byteLength} bytes). Max: ${MAX_IMAGE_SIZE_BYTES} bytes.`,
        );
      }

      let mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "";
      if (!mimeType || mimeType === "application/octet-stream") {
        if (fetchUrl.includes("f=webp")) mimeType = "image/webp";
        else if (fetchUrl.endsWith(".png")) mimeType = "image/png";
        else if (fetchUrl.endsWith(".jpg") || fetchUrl.endsWith(".jpeg")) mimeType = "image/jpeg";
        else mimeType = "image/png";
      }

      const base64 = Buffer.from(buffer).toString("base64");
      return {
        base64,
        mimeType,
        sizeBytes: buffer.byteLength,
        buffer: Buffer.from(buffer),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Extract dominant colors from a screen image buffer.
   * Returns an array of hex color strings sorted by frequency.
   */
  async extractColors(imageBuffer: Buffer, maxColors: number = 8): Promise<string[]> {
    // Resize to small thumbnail for faster color sampling
    const { data } = await sharp(imageBuffer)
      .resize(COLOR_SAMPLE_SIZE, COLOR_SAMPLE_SIZE, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Count pixel colors, quantized to reduce noise (round to nearest step)
    const colorCounts = new Map<string, number>();
    for (let i = 0; i < data.length; i += 3) {
      const r = Math.min(
        Math.round(data[i] / COLOR_QUANTIZE_STEP) * COLOR_QUANTIZE_STEP,
        COLOR_QUANTIZE_MAX,
      );
      const g = Math.min(
        Math.round(data[i + 1] / COLOR_QUANTIZE_STEP) * COLOR_QUANTIZE_STEP,
        COLOR_QUANTIZE_MAX,
      );
      const b = Math.min(
        Math.round(data[i + 2] / COLOR_QUANTIZE_STEP) * COLOR_QUANTIZE_STEP,
        COLOR_QUANTIZE_MAX,
      );
      const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
    }

    // Sort by frequency and return top colors
    return Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxColors)
      .map(([hex]) => hex);
  }
}

/**
 * Mobbin's app slug is `<lowercase-kebab-app-name>-<platform>-<appId>`.
 * Mobbin's slugifier strips ASCII punctuation and collapses whitespace runs to a single dash.
 * "Linear Mobile" → "linear-mobile", "ChatGPT (AI)" → "chatgpt-ai".
 */
function slugifyAppName(name: string): string {
  // Insert hyphens at camelCase boundaries: ChatGPT → Chat-GPT, OtterAI → Otter-AI
  const withBoundaries = name.replace(/([a-z])([A-Z])/g, "$1-$2");
  return withBoundaries
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Extract the target app's structured screens and flows from its Next.js flight stream.
 * Other screen URLs in the page can belong to recommendations or related content.
 */
export function extractAppPagePayload(
  html: string,
  path: string,
  expected: { appId: string; platform: string; versionId: string; slug: string },
): z.infer<typeof appPagePayloadSchema> {
  const chunkRe = /self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\s*\]\)/g;
  let stream = "";
  let m: RegExpExecArray | null;
  while ((m = chunkRe.exec(html)) !== null) {
    try {
      stream += JSON.parse(`"${m[1]}"`) as string;
    } catch {
      // Skip malformed chunks — partial streams happen near end-of-document.
    }
  }

  // Current pages put the data directly in an RSC component's props. Each
  // newline-delimited flight record has a hex ID followed by a JSON value.
  for (const line of stream.split("\n")) {
    if (!line.includes('"appSlug"') || !line.includes('"partialFlows"')) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    let record: unknown;
    try {
      record = JSON.parse(line.slice(colon + 1));
    } catch {
      // Another component may contain the same field names; inspect the next record.
      continue;
    }
    if (!Array.isArray(record)) continue;
    for (const entry of record) {
      if (!entry || typeof entry !== "object") continue;
      const data = entry as Record<string, unknown>;
      if (data.appSlug !== expected.slug || data.appVersionId !== expected.versionId) continue;
      if (Array.isArray(data.screens) && Array.isArray(data.partialFlows)) {
        return buildAppPagePayload(data.screens, data.partialFlows, expected, path);
      }
    }
  }

  // Older pages put the data in a deferred RSC dataPromise chunk shaped
  // `<ref>:[{"value":{"partialFlows":[...],"screens":[...]}}]`. `value.screens` is a
  // fully-structured array (screenUrl, width, height, screenElements, screenPatterns,
  // appVersionId, ...) scoped to the TARGET app only. The naked
  // `content/app_screens/{uuid}.png` regex used before also caught recommended-app
  // preview URLs rendered at the top of the page, returning the WRONG app's screens.
  const marker = stream.match(/[0-9a-f]+:\[\{"value":\{"partialFlows"/);
  if (marker) {
    const braceStart = stream.indexOf(":[", marker.index) + 1;
    const raw = sliceBalanced(stream, braceStart);
    if (raw) {
      let parsed: Array<{
        value?: {
          screens?: Array<Record<string, unknown>>;
          partialFlows?: Array<Record<string, unknown>>;
        };
      }>;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error(`Could not parse structured app screens in ${path}.`);
      }
      const structured = parsed[0]?.value?.screens;
      const partialFlows = parsed[0]?.value?.partialFlows;
      if (Array.isArray(structured) && Array.isArray(partialFlows)) {
        return buildAppPagePayload(structured, partialFlows, expected, path);
      }
    }
  }

  throw new Error(`Could not locate structured app screens in ${path}; refusing to return unrelated screens.`);
}

function buildAppPagePayload(
  screens: Array<Record<string, unknown>>,
  partialFlows: Array<Record<string, unknown>>,
  expected: { appId: string; platform: string; versionId: string },
  path: string,
): z.infer<typeof appPagePayloadSchema> {
  if (
    screens.some(
      (screen) =>
        screen.appId !== expected.appId ||
        screen.platform !== expected.platform ||
        screen.appVersionId !== expected.versionId,
    )
  ) {
    throw new Error(`App screen identity mismatch in ${path}; refusing to return unrelated screens.`);
  }

  const byId = new Map(screens.map((screen) => [screen.id, screen]));
  const flows = partialFlows.map((flow) => {
    const flowScreens = ((flow.screens as Array<Record<string, unknown>>) ?? []).map((screen) => {
      const full = byId.get(screen.screenId) ?? {};
      return {
        ...screen,
        screenUrl: (full.screenUrl as string) ?? "",
        width: (full.width as number) ?? 0,
        height: (full.height as number) ?? 0,
      };
    });
    const videoSources = flow.videoCdnVideoSources as Array<{ url?: string }> | undefined;
    return { ...flow, videoUrl: videoSources?.[0]?.url ?? null, screens: flowScreens };
  });

  return [{ value: flows }, { value: screens }, { value: {} }];
}

/**
 * Extract a balanced JSON array/object substring starting at `start` (which must
 * point at the opening `[` or `{`). Respects string literals and escapes so braces
 * inside strings don't throw off the depth counter. Returns null if unbalanced.
 */
function sliceBalanced(s: string, start: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = start; j < s.length; j++) {
    const c = s[j];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, j + 1);
    }
  }
  return null;
}
