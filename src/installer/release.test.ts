import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fetchReleaseAssets, type FetchLike } from "./release.js";

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function releaseFetch(options?: {
  omit?: string;
  corrupt?: string;
  apiStatus?: number;
}): FetchLike {
  const adapter = Buffer.from("adapter");
  const renderer = Buffer.from("renderer");
  const names: Record<string, Uint8Array | string> = {
    "codex-cx-darwin-arm64": adapter,
    "codex-cx-darwin-arm64.sha256": checksum(adapter),
    "cxstatusline-renderer.mjs": renderer,
    "cxstatusline-renderer.mjs.sha256": options?.corrupt === "renderer"
      ? "0".repeat(64)
      : checksum(renderer)
  };
  if (options?.omit) delete names[options.omit];

  return async (url: string) => {
    if (url.endsWith("/releases/latest")) {
      const status = options?.apiStatus ?? 200;
      return new Response(JSON.stringify({
        tag_name: "v0.2.0",
        assets: Object.keys(names).map((name) => ({
          name,
          browser_download_url: "https://assets.example/" + name
        }))
      }), { status });
    }
    const name = url.slice(url.lastIndexOf("/") + 1);
    const value = names[name];
    if (value === undefined) return new Response("missing", { status: 404 });
    const body = typeof value === "string"
      ? value
      : Uint8Array.from(value).buffer as ArrayBuffer;
    return new Response(body);
  };
}

test("downloads and verifies the current adapter and renderer", async () => {
  const result = await fetchReleaseAssets({
    fetch: releaseFetch(),
    platform: "darwin",
    arch: "arm64"
  });

  assert.equal(result.tag, "v0.2.0");
  assert.equal(result.adapter.name, "codex-cx-darwin-arm64");
  assert.equal(Buffer.from(result.adapter.bytes).toString(), "adapter");
  assert.equal(Buffer.from(result.renderer.bytes).toString(), "renderer");
});

test("fails when a required release asset is absent", async () => {
  await assert.rejects(
    fetchReleaseAssets({
      fetch: releaseFetch({ omit: "cxstatusline-renderer.mjs.sha256" }),
      platform: "darwin",
      arch: "arm64"
    }),
    /missing release asset: cxstatusline-renderer\.mjs\.sha256/
  );
});

test("fails on GitHub API errors without hiding the status", async () => {
  await assert.rejects(
    fetchReleaseAssets({
      fetch: releaseFetch({ apiStatus: 503 }),
      platform: "darwin",
      arch: "arm64"
    }),
    /GitHub release request failed \(503\)/
  );
});

test("fails when a downloaded checksum does not match", async () => {
  await assert.rejects(
    fetchReleaseAssets({
      fetch: releaseFetch({ corrupt: "renderer" }),
      platform: "darwin",
      arch: "arm64"
    }),
    /checksum mismatch/
  );
});
