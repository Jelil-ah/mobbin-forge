# GROUND TRUTH — API Mobbin réelle (capturée 2026-07-14 avec token valide)

> Capturé par Hermes en live sur https://mobbin.com avec un compte connecté. NE PAS deviner — c'est la forme RÉELLE actuelle. Le MCP casse parce que Mobbin a changé ses réponses.

## LA CAUSE RACINE DU BUG

Mobbin a **wrappé toutes ses réponses dans `{ "value": ... }`**. Le MCP (pdcolandrea/aos-engineer) attend un array/objet direct → erreur `Expected array, received object` / `searchable.map is not a function` / `allApps.map is not a function`.

**Fix général : déballer `.value` avant de parser, OU wrapper les schémas zod dans `z.object({ value: <ancien schéma> })`.**

## ENDPOINTS CONFIRMÉS QUI RÉPONDENT (200)

### GET /api/searchable-apps/{platform}  (ex: /api/searchable-apps/ios)
- AVANT: array direct `[{app}, ...]`
- MAINTENANT: `{ "value": [ {app}, ... ] }`
- Forme app: `{ id, platform, appName, appTagline, is_finance_plus, keywords: string[], previewScreens: [{ id, screenUrl }] }`
- `screenUrl` = URL supabase: `https://ujasntkfphywizsdaapi.supabase.co/storage/v1/object/public/content/app_screens/{uuid}.png`

### POST /api/popular-apps/fetch-popular-apps-with-preview-screens
- body: `{ platform:"ios", limitPerCategory:2 }`
- MAINTENANT: `{ "value": { "finance":[{app}], "social":[...], ... } }`  (objet groupé par catégorie, wrappé dans value)
- Forme app ici: `{ app_id, app_name, app_logo_url, preview_screens:[{ id, screenUrl }] }`  (snake_case !)

## IMAGES — CHAÎNE CONFIRMÉE (gratuite, CDN public)

Convertir l'URL supabase en URL CDN bytescale (pas d'auth requise pour le CDN):
- Input:  `https://ujasntkfphywizsdaapi.supabase.co/storage/v1/object/public/content/app_screens/{uuid}.png`
- Prendre la partie après `/storage/v1/object/public/` → `content/app_screens/{uuid}.png`
- Output: `https://bytescale.mobbin.com/FW25bBB/image/mobbin.com/prod/content/app_screens/{uuid}.png?f=webp&w=1200&q=85`
- TESTÉ: download 200, 22KB webp réel (screen Disney+). MARCHE.

## ENDPOINTS CASSÉS — ROUTE DÉPLACÉE (404, à ré-investiguer via Playwright)

Ces routes renvoient toutes 404 (Mobbin les a bougées, forme inconnue):
- POST /api/content/search-screens  → 404
- POST /api/content/search-apps     → à vérifier
- POST /api/content/search-flows    → à vérifier
- Candidats sondés (tous 404): /api/search/screens, /api/content/screens/search, /api/screens/search, /api/content/search

**Pour retrouver la vraie route:** ouvrir mobbin.com connecté dans Playwright, faire une recherche, capturer les appels réseau POST (onglet Network / page.on('request')). La vraie route + le vrai body sont là.

## AUTH — CONFIRMÉE FONCTIONNELLE
- Session stockée dans `~/.mobbin-mcp/auth.json` (chmod 600), format `{access_token, refresh_token, expires_at, ...}`
- Cookie envoyé: `sb-ujasntkfphywizsdaapi-auth-token=base64-<base64(JSON session)>`
- anon-key seule (sans cookie) = 404, il FAUT le cookie de session (compte gratuit OK)
- Token expire ~1h, le refresh_token permet le renouvellement (à implémenter/vérifier)

## PRIORITÉ DU FIX
1. Déballer `.value` sur searchable-apps + popular-apps (fix immédiat, testable) — débloque déjà la fouille via app pages
2. Retrouver les routes search-* déplacées via capture réseau Playwright
3. Ajouter des tests qui matchent la forme RÉELLE ci-dessus (pas l'ancienne)

---

## ADDENDUM 2026-07-14 (soir) — ROUTE SCREENS RETROUVÉE (capture réseau Playwright)

La recherche filtrée `/api/content/search-*` est bien morte (RSC). MAIS `getAppScreens` est réparable — la page screens d'une app existe, route changée :

### Vraie route (CONFIRMÉE 200, 20 screenUrls dans le flight)
`GET /apps/{slug}-{platform}-{appId}/_/screens`  ← note le `/_/` avant "screens"
(variante avec version: `/apps/{slug}-{platform}-{appId}/{appVersionId}/screens`)

Le HTML rend via Next.js RSC : `self.__next_f.push([1,"..."])`. Les screenUrl sont dedans sous forme `content/app_screens/{uuid}.png`.

### BUG #1 — le slug est FAUX
`slugifyAppName("ChatGPT")` produit `chatgpt` mais Mobbin attend `chat-gpt` (tiret entre les mots camelCase). L'ancien code kebab-case simple ne coupe pas les frontières de casse.
- Exemples réels capturés : `chat-gpt`, `otter-ai`, `granola`, `obsidian`
- Fix slug : insérer un tiret aux frontières camelCase AVANT de kebab-caser (ex: "ChatGPT" → "chat-gpt", "OtterAI" → "otter-ai"). Attention aux acronymes.
- ROBUSTE : ne PAS calculer le slug côté client. La searchable-apps API ne renvoie pas le slug. Option fiable = requêter `/apps/{platform}/{appId}` ou suivre la redirection depuis une URL canonique. À investiguer, sinon best-effort slugify amélioré.

### BUG #2 — route path
`getAppPage` dans api-client.ts construit `/apps/${slug}/screens`. La vraie route est `/apps/${slug}/_/screens` (segment `/_/`).

### BUG #3 — parsing du flight
`extractAppPagePayload(html)` cherchait probablement l'ancien format. Le nouveau : concaténer tous les `self.__next_f.push([1,"<chunk>"])`, unescaper, puis chercher les objets screens. Les screenUrl matchent `/content\/app_screens\/[a-f0-9-]+\.png/`. Fallback simple si le parsing structuré casse : extraire les screenUrl par regex sur le flight concaténé (ça donne au moins les images, testé: 20 trouvées).

### Routes annexes capturées (bonus, pour plus tard)
- POST /api/app/fetch-recommended-apps  body {platform, appCategory}
- POST /api/content/fetch-total-screens-count
- POST /api/saved/fetch-saved-contents  body {contentType, contentIds:[...]}
- GET /apps/{slug}/{versionId}/flows  et  /ui-elements
- GET /screens/{screenId}  (page d'un screen individuel)
