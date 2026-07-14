import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { doctor, install, uninstall } from "./commands.js";
import type { FetchLike } from "./release.js";

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fakeReleaseFetch(counter?: { calls: number }): FetchLike {
  const adapter = Buffer.from("adapter");
  const renderer = Buffer.from("#!/usr/bin/env node\n");
  const assets: Record<string, Uint8Array | string> = {
    "codex-cx-darwin-arm64": adapter,
    "codex-cx-darwin-arm64.sha256": checksum(adapter),
    "cxstatusline-renderer.mjs": renderer,
    "cxstatusline-renderer.mjs.sha256": checksum(renderer)
  };
  return async (url: string) => {
    if (counter) counter.calls += 1;
    if (url.endsWith("/releases/latest")) {
      return new Response(JSON.stringify({
        tag_name: "v0.2.0",
        assets: Object.keys(assets).map((name) => ({
          name,
          browser_download_url: "https://assets.example/" + name
        }))
      }));
    }
    const name = url.slice(url.lastIndexOf("/") + 1);
    const value = assets[name];
    if (value === undefined) return new Response("missing", { status: 404 });
    const body = typeof value === "string"
      ? value
      : Uint8Array.from(value).buffer as ArrayBuffer;
    return new Response(body);
  };
}

async function temporaryEnvironment(): Promise<{
  home: string;
  codexHome: string;
}> {
  const home = await mkdtemp(join(tmpdir(), "cxstatusline-home-"));
  const codexHome = join(home, ".codex");
  await mkdir(codexHome, { recursive: true });
  await writeFile(join(codexHome, "config.toml"), "model = \"gpt\"\n", "utf8");
  return { home, codexHome };
}

test("installs into a temporary HOME without replacing official Codex", async () => {
  const env = await temporaryEnvironment();
  const result = await install({
    ...env,
    platform: "darwin",
    arch: "arm64",
    nodePath: "/usr/bin/node",
    fetch: fakeReleaseFetch()
  });

  assert.equal(result.paths.launcher, join(env.home, ".local", "bin", "cdx"));
  assert.equal(await readFile(result.paths.adapter, "utf8"), "adapter");
  assert.match(await readFile(result.paths.launcher, "utf8"), /codex-cx.*"\$@"/s);
  assert.match(
    await readFile(join(env.codexHome, "config.toml"), "utf8"),
    /# BEGIN cxstatusline/
  );
  const manifest = JSON.parse(await readFile(result.paths.manifest, "utf8")) as {
    releaseTag: string;
    ownedPaths: string[];
  };
  assert.equal(manifest.releaseTag, "v0.2.0");
  assert.ok(manifest.ownedPaths.includes(result.paths.launcher));
});

test("preflights launcher collisions before downloading", async () => {
  const env = await temporaryEnvironment();
  const launcher = join(env.home, ".local", "bin", "cdx");
  await mkdir(dirname(launcher), { recursive: true });
  await writeFile(launcher, "unrelated", "utf8");
  const counter = { calls: 0 };

  await assert.rejects(
    install({
      ...env,
      platform: "darwin",
      arch: "arm64",
      nodePath: "/usr/bin/node",
      fetch: fakeReleaseFetch(counter)
    }),
    /refusing to overwrite existing cdx/
  );
  assert.equal(counter.calls, 0);
  assert.equal(await readFile(launcher, "utf8"), "unrelated");
});

test("doctor is read-only and reports a healthy temporary installation", async () => {
  const env = await temporaryEnvironment();
  const installed = await install({
    ...env,
    platform: "darwin",
    arch: "arm64",
    nodePath: "/usr/bin/node",
    fetch: fakeReleaseFetch(),
    pathValue: join(env.home, ".local", "bin")
  });
  const before = await readFile(join(env.codexHome, "config.toml"), "utf8");
  const checks = await doctor({
    ...env,
    platform: "darwin",
    arch: "arm64",
    pathValue: dirname(installed.paths.launcher)
  });

  assert.equal(checks.some((check: { status: string }) => check.status === "fail"), false);
  assert.equal(await readFile(join(env.codexHome, "config.toml"), "utf8"), before);
});

test("uninstall removes only owned files and managed config", async () => {
  const env = await temporaryEnvironment();
  const installed = await install({
    ...env,
    platform: "darwin",
    arch: "arm64",
    nodePath: "/usr/bin/node",
    fetch: fakeReleaseFetch()
  });

  await uninstall({ ...env, platform: "darwin" });

  await assert.rejects(access(installed.paths.launcher));
  await assert.rejects(access(installed.paths.adapter));
  assert.equal(await readFile(join(env.codexHome, "config.toml"), "utf8"), "model = \"gpt\"\n");
});
