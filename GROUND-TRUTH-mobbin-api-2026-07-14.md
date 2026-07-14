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

---

## ADDENDUM #2 2026-07-14 (nuit) — BUG CRITIQUE getAppScreens : mauvais screens (CORRIGÉ, ground truth)

### Le bug (prouvé aux pixels via vision QA)
La route `/apps/{slug}-{platform}-{appId}/_/screens` répond 200 avec 20 screenUrls MAIS ce sont les screens d'un FEED MÉLANGÉ (discover/featured), PAS de l'app ciblée. Vérifié : télécharger "ChatGPT" via cette route donnait un screen Upwork/Afterpay. Le `/_/` est un placeholder de version qui tombe sur une page discover, pas la page app.

### La vraie route (CONFIRMÉE — screen = vrai splash ChatGPT logo OpenAI)
`GET /apps/{slug}-{platform}-{appId}/{appVersionId}/screens`
→ il faut le VRAI appVersionId, pas `/_/`.

### Comment obtenir l'appVersionId (2 étapes)
1. GET `/apps/{slug}-{platform}-{appId}` en `redirect: manual` → renvoie **307** avec header `location: /apps/{slug}-{platform}-{appId}/{appVersionId}/...`
2. Extraire l'appVersionId de ce location (regex `/([a-f0-9]{36})/` après l'appId).
3. Puis fetch `/apps/{slug}-{platform}-{appId}/{appVersionId}/screens` et parser le flight comme avant (regex app_screens/{uuid}).

Exemple vérifié :
- ChatGPT appId=a96b7f4c-6bfa-4c9d-a6b7-562160feb391
- GET /apps/chat-gpt-ios-{appId} → 307 → location contient versionId a0b14f48-3d1c-4286-828b-e95ad04fef10
- GET /apps/chat-gpt-ios-{appId}/a0b14f48-.../screens → screens RÉELS de ChatGPT ✅

### Fix requis dans api-client.ts getAppPage()
- AVANT le fetch screens : faire le GET canonique `/apps/${slug}-${platform}-${appId}` en redirect:manual, choper le versionId depuis location.
- Construire la route avec le versionId : `/apps/${slug}-${platform}-${appId}/${versionId}/screens`
- Garder le parsing flight existant.
- VÉRIFICATION OBLIGATOIRE : le fix n'est bon que si les screens téléchargés sont VISUELLEMENT de l'app ciblée (Hermes vision-check, pas juste le compte).

### Piège de vérif (leçon)
Compter 20 screenUrls ≠ 20 screens de la bonne app. TOUJOURS vision-check un screen téléchargé contre l'app attendue avant de déclarer "ça marche".
