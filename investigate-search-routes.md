# Investigation : Routes search-* déplacées (404)

## Contexte

D'après la ground truth (2026-07-14), ces routes renvoient 404 :
- `POST /api/content/search-screens`
- `POST /api/content/search-apps`
- `POST /api/content/search-flows`

Mobbin a **déplacé** ces endpoints. Pour retrouver les vraies routes, il faut capturer les appels réseau en live pendant qu'un utilisateur authentifié fait une recherche sur mobbin.com.

## Méthode : Capture réseau avec Playwright

### Script Playwright à exécuter

Créer `capture-search-routes.ts` :

```typescript
#!/usr/bin/env -S npx tsx
/**
 * Ouvre mobbin.com avec la session auth, capture les appels réseau pendant une recherche
 */

import { chromium } from 'playwright';
import { readStoredSession } from './src/utils/auth-store.js';
import { MobbinAuth } from './src/services/auth.js';

async function main() {
  const session = readStoredSession();
  if (!session) {
    console.error('❌ Pas de session auth dans ~/.mobbin-mcp/auth.json');
    process.exit(1);
  }

  const auth = MobbinAuth.fromSession(session, () => {});
  const cookieString = await auth.getCookieValue();

  // Parse cookie chunks (format: sb-...-auth-token.0=...; sb-...-auth-token.1=...)
  const cookies = cookieString.split('; ').map((c) => {
    const [name, value] = c.split('=');
    return {
      name,
      value,
      domain: '.mobbin.com',
      path: '/',
    };
  });

  console.log('🌐 Lancement de Chromium...');
  const browser = await chromium.launch({ headless: false }); // headless:false pour voir
  const context = await browser.newContext();
  await context.addCookies(cookies);

  const page = await context.newPage();

  // Capture ALL requests POST qui contiennent "search"
  const captured: { url: string; method: string; postData: string | null }[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('search')) {
      captured.push({
        url: req.url(),
        method: req.method(),
        postData: req.postData(),
      });
      console.log(`📡 POST ${req.url()}`);
    }
  });

  console.log('🔍 Navigation vers mobbin.com...');
  await page.goto('https://mobbin.com', { waitUntil: 'networkidle' });

  console.log('⏸️  MANUEL : Fais une recherche (screens, apps, flows) dans la UI');
  console.log('   Quand tu as fini, reviens ici et appuie sur Entrée.');
  await new Promise((resolve) => {
    process.stdin.once('data', resolve);
  });

  await browser.close();

  console.log('\n📋 Appels POST "search" capturés :');
  if (captured.length === 0) {
    console.log('   (aucun)');
  } else {
    captured.forEach((c, i) => {
      console.log(`\n${i + 1}. ${c.url}`);
      if (c.postData) {
        console.log(`   Body: ${c.postData.substring(0, 200)}`);
      }
    });
  }

  console.log('\n✅ Investigation terminée.');
  console.log('Vérifie les URLs capturées et mets à jour src/services/api-client.ts');
}

main().catch((err) => {
  console.error('💥 Erreur:', err);
  process.exit(1);
});
```

### Exécution

1. Installer Playwright si pas déjà fait :
   ```bash
   npm install --save-dev playwright
   npx playwright install chromium
   ```

2. Lancer le script :
   ```bash
   npx tsx capture-search-routes.ts
   ```

3. Dans la fenêtre Chrome ouverte :
   - Va sur mobbin.com (déjà connecté avec le cookie injecté)
   - Fais une recherche de **screens** (par pattern, element, ou keyword)
   - Fais une recherche d'**apps** (par catégorie)
   - Fais une recherche de **flows** (par action)
   - Reviens au terminal, appuie sur Entrée

4. Le script affichera toutes les requêtes POST contenant "search" :
   - La **vraie URL** de l'endpoint (celle qui ne renvoie PAS 404)
   - Le **body** envoyé (pour vérifier le format)

### Mise à jour du code

Une fois les vraies routes trouvées :

1. Ouvre `src/services/api-client.ts`
2. Remplace les anciennes routes (lignes 126, 158, 191) par les nouvelles
3. Vérifie que le body envoyé match ce qui est capturé
4. Rebuild et teste

## Fallback si Playwright bloque

Si Playwright ne fonctionne pas :

1. Ouvre mobbin.com dans Chrome
2. Connecte-toi (ou utilise la session existante)
3. Ouvre DevTools > Network > Filter: "search"
4. Fais une recherche dans la UI
5. Regarde les appels POST qui passent (200)
6. Note l'URL + le body

## Résultat attendu

La ground truth dit que les routes 404 testées étaient :
- `/api/content/search-screens`
- `/api/content/search-apps`
- `/api/content/search-flows`

Mobbin les a probablement renommées en :
- `/api/v2/search/screens` (hypothèse)
- `/api/v2/search/apps`
- `/api/v2/search/flows`

OU regroupées en un seul endpoint `/api/search` avec un param `type`.

La capture réseau donnera la VRAIE forme actuelle.
