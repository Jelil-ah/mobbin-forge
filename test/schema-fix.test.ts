#!/usr/bin/env -S npx tsx
/**
 * Test unitaire : vérifie que les schémas parsent correctement les réponses wrappées dans { value: ... }
 * Usage: npx tsx test/schema-fix.test.ts
 */

import { z } from "zod";
import {
  searchableAppsResponseSchema,
  popularAppsResponseSchema,
} from "../src/services/schemas.js";

console.log("🧪 Test des schémas après fix .value\n");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   ${(err as Error).message}`);
    failed++;
  }
}

// Test 1: searchableApps doit accepter { value: [...] }
test("searchableApps parse { value: [...] }", () => {
  const mockResponse = {
    value: [
      {
        id: "app123",
        platform: "ios",
        appName: "Disney+",
        appLogoUrl: "https://example.com/logo.png",
        appTagline: "Stream movies",
        keywords: ["streaming", "video"],
        previewScreens: [
          { id: "screen1", screenUrl: "https://example.com/s1.png" },
        ],
      },
      {
        id: "app456",
        platform: "ios",
        appName: "Netflix",
        appLogoUrl: "https://example.com/netflix.png",
        appTagline: "Watch shows",
        keywords: ["entertainment"],
        previewScreens: null,
      },
    ],
  };

  const parsed = searchableAppsResponseSchema.parse(mockResponse);
  if (parsed.value.length !== 2) throw new Error("Expected 2 apps");
  if (parsed.value[0].appName !== "Disney+") throw new Error("Wrong app name");
});

// Test 2: popularApps doit accepter { value: { finance: [...], social: [...] } }
test("popularApps parse { value: { categoryName: [...] } }", () => {
  const mockResponse = {
    value: {
      finance: [
        {
          app_id: "fin1",
          app_name: "Revolut",
          app_logo_url: "https://example.com/revolut.png",
          preview_screens: [{ id: "s1", screenUrl: "https://example.com/s1.png" }],
          app_category: "finance",
          secondary_app_categories: ["banking"],
          popularity_metric: 100,
        },
      ],
      social: [
        {
          app_id: "soc1",
          app_name: "Instagram",
          app_logo_url: "https://example.com/ig.png",
          preview_screens: [],
          app_category: "social",
          secondary_app_categories: [],
          popularity_metric: 200,
        },
        {
          app_id: "soc2",
          app_name: "TikTok",
          app_logo_url: "https://example.com/tiktok.png",
          preview_screens: [{ id: "s2", screenUrl: "https://example.com/s2.png" }],
          app_category: "social",
          secondary_app_categories: ["video"],
          popularity_metric: 250,
        },
      ],
    },
  };

  const parsed = popularAppsResponseSchema.parse(mockResponse);
  const categories = Object.keys(parsed.value);
  if (categories.length !== 2) throw new Error("Expected 2 categories");
  if (!categories.includes("finance")) throw new Error("Missing finance category");
  if (!categories.includes("social")) throw new Error("Missing social category");
  if (parsed.value.finance.length !== 1) throw new Error("Expected 1 finance app");
  if (parsed.value.social.length !== 2) throw new Error("Expected 2 social apps");
  if (parsed.value.finance[0].app_name !== "Revolut") throw new Error("Wrong app name");
});

// Test 3: rejet si pas de .value
test("searchableApps rejette réponse sans .value", () => {
  const badResponse = [
    { id: "app1", appName: "Test", platform: "ios", keywords: [] },
  ];

  let threw = false;
  try {
    searchableAppsResponseSchema.parse(badResponse);
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Should have rejected response without .value");
});

test("popularApps rejette réponse sans .value", () => {
  const badResponse = {
    finance: [{ app_id: "fin1", app_name: "Test" }],
  };

  let threw = false;
  try {
    popularAppsResponseSchema.parse(badResponse);
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("Should have rejected response without .value");
});

console.log(`\n📊 Résultat: ${passed} passés, ${failed} échoués`);
if (failed > 0) {
  process.exit(1);
}
console.log("✨ Tous les tests passent");
