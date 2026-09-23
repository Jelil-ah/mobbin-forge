import assert from "node:assert/strict";
import { test } from "node:test";
import { extractAppPagePayload } from "../src/services/api-client.js";

const expected = {
  appId: "spotify-id",
  platform: "web",
  versionId: "spotify-version",
  slug: "spotify-web-spotify-id",
};
const path = `/apps/${expected.slug}/${expected.versionId}/screens`;

function htmlWithFlight(stream: string): string {
  return `<script>self.__next_f.push([1,${JSON.stringify(stream)}])</script>`;
}

function screen(appId = expected.appId) {
  return {
    id: "spotify-screen",
    appId,
    appName: "Spotify",
    platform: expected.platform,
    appVersionId: expected.versionId,
    screenUrl: "https://example.com/spotify.png",
    width: 3024,
    height: 1890,
  };
}

test("reads target app screens and enriches flows from current RSC props", () => {
  const props = {
    appSlug: expected.slug,
    appVersionId: expected.versionId,
    screens: [screen()],
    partialFlows: [{ id: "flow", screens: [{ screenId: "spotify-screen", order: 0 }] }],
  };
  const stream = `1:${JSON.stringify({ screenUrl: "https://example.com/recommendation.png" })}\n2e:${JSON.stringify(["$", "$L1", null, props])}\n`;
  const payload = extractAppPagePayload(htmlWithFlight(stream), path, expected);
  const screens = payload[1].value as ReturnType<typeof screen>[];
  const flows = payload[0].value as Array<{ screens: Array<{ screenUrl: string; width: number }> }>;

  assert.equal(screens.length, 1);
  assert.equal(screens[0].appId, expected.appId);
  assert.equal(flows[0].screens[0].screenUrl, screens[0].screenUrl);
  assert.equal(flows[0].screens[0].width, 3024);
});

test("rejects screens from another app", () => {
  const props = {
    appSlug: expected.slug,
    appVersionId: expected.versionId,
    screens: [screen("another-app")],
    partialFlows: [],
  };
  const stream = `2e:${JSON.stringify(["$", "$L1", null, props])}\n`;
  assert.throws(
    () => extractAppPagePayload(htmlWithFlight(stream), path, expected),
    /identity mismatch/,
  );
});

test("does not turn unrelated page image URLs into app screens", () => {
  const stream = `1:${JSON.stringify({ screenUrl: "https://example.com/content/app_screens/unrelated.png" })}\n`;
  assert.throws(
    () => extractAppPagePayload(htmlWithFlight(stream), path, expected),
    /Could not locate structured app screens/,
  );
});

test("continues to read the older deferred RSC payload", () => {
  const stream = `3:${JSON.stringify([{ value: { partialFlows: [], screens: [screen()] } }])}\n`;
  const payload = extractAppPagePayload(htmlWithFlight(stream), path, expected);
  assert.equal((payload[1].value as unknown[]).length, 1);
});
