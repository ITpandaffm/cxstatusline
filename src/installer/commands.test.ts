import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { doctor, inspectUninstall, install, uninstall } from "./commands.js";
import type { FetchLike } from "./release.js";

function checksum(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fakeReleaseFetch(counter?: { calls: number }): FetchLike {
  const adapter = Buffer.from("#!/bin/sh\nprintf 'codex-cx 0.2.0\\n'\n");
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
  assert.match(await readFile(result.paths.adapter, "utf8"), /^#!\/bin\/sh/);
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

test("refuses unowned adapter files before downloading", async () => {
  const env = await temporaryEnvironment();
  const adapter = join(env.home, ".local", "share", "cxstatusline", "codex-cx");
  await mkdir(dirname(adapter), { recursive: true });
  await writeFile(adapter, "unrelated", "utf8");
  const counter = { calls: 0 };

  await assert.rejects(
    install({
      ...env,
      platform: "darwin",
      arch: "arm64",
      nodePath: "/usr/bin/node",
      fetch: fakeReleaseFetch(counter)
    }),
    /refusing to overwrite unowned installation file/
  );
  assert.equal(counter.calls, 0);
  assert.equal(await readFile(adapter, "utf8"), "unrelated");
});

test("refuses a different cdx command resolved from PATH", async () => {
  const env = await temporaryEnvironment();
  const otherBin = join(env.home, "other-bin");
  const otherCdx = join(otherBin, "cdx");
  await mkdir(otherBin, { recursive: true });
  await writeFile(otherCdx, "unrelated", { mode: 0o755 });
  const counter = { calls: 0 };

  await assert.rejects(
    install({
      ...env,
      platform: "darwin",
      arch: "arm64",
      nodePath: "/usr/bin/node",
      fetch: fakeReleaseFetch(counter),
      pathValue: otherBin
    }),
    /another cdx command is already on PATH/
  );
  assert.equal(counter.calls, 0);
});

test("a failed checksum preserves an existing verified installation", async () => {
  const env = await temporaryEnvironment();
  const installed = await install({
    ...env,
    platform: "darwin",
    arch: "arm64",
    nodePath: "/usr/bin/node",
    fetch: fakeReleaseFetch()
  });
  const before = await readFile(installed.paths.adapter);
  const badFetch = fakeReleaseFetch();
  const corruptFetch: FetchLike = async (url, init) => {
    const response = await badFetch(url, init);
    if (url.endsWith("cxstatusline-renderer.mjs.sha256")) {
      return new Response("0".repeat(64));
    }
    return response;
  };

  await assert.rejects(
    install({
      ...env,
      platform: "darwin",
      arch: "arm64",
      nodePath: "/usr/bin/node",
      fetch: corruptFetch
    }),
    /checksum mismatch/
  );
  assert.deepEqual(await readFile(installed.paths.adapter), before);
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
  assert.equal(
    checks.find((check) => check.id === "adapter-execution")?.status,
    "pass"
  );
  assert.equal(await readFile(join(env.codexHome, "config.toml"), "utf8"), before);
});

test("doctor fails when an installed renderer no longer matches its checksum", async () => {
  const env = await temporaryEnvironment();
  const installed = await install({
    ...env,
    platform: "darwin",
    arch: "arm64",
    nodePath: "/usr/bin/node",
    fetch: fakeReleaseFetch()
  });
  await writeFile(installed.paths.renderer, "tampered", "utf8");

  const checks = await doctor({
    ...env,
    platform: "darwin",
    arch: "arm64"
  });
  assert.deepEqual(
    checks.find((check) => check.id === "renderer-checksum")?.status,
    "fail"
  );
});

test("doctor fails when the managed Codex command is modified", async () => {
  const env = await temporaryEnvironment();
  await install({
    ...env,
    platform: "darwin",
    arch: "arm64",
    nodePath: "/usr/bin/node",
    fetch: fakeReleaseFetch()
  });
  const configPath = join(env.codexHome, "config.toml");
  const config = await readFile(configPath, "utf8");
  await writeFile(configPath, config.replace("timeout_ms = 300", "timeout_ms = 999"), "utf8");

  const checks = await doctor({
    ...env,
    platform: "darwin",
    arch: "arm64"
  });
  assert.equal(
    checks.find((check) => check.id === "codex-config-content")?.status,
    "fail"
  );
});

test("an update preserves the owned shell profile when no new profile is supplied", async () => {
  const env = await temporaryEnvironment();
  const profilePath = join(env.home, ".zshrc");
  await writeFile(profilePath, "# user config\n", "utf8");
  await install({
    ...env,
    platform: "darwin",
    arch: "arm64",
    nodePath: "/usr/bin/node",
    fetch: fakeReleaseFetch(),
    profilePath,
    shell: "zsh"
  });

  const updated = await install({
    ...env,
    platform: "darwin",
    arch: "arm64",
    nodePath: "/usr/bin/node",
    fetch: fakeReleaseFetch()
  });
  const manifest = JSON.parse(await readFile(updated.paths.manifest, "utf8")) as {
    profilePath?: string;
  };
  assert.equal(manifest.profilePath, profilePath);

  await uninstall({ ...env, platform: "darwin" });
  assert.equal(await readFile(profilePath, "utf8"), "# user config\n");
});

test("an update migrates the owned PATH block to a newly approved profile", async () => {
  const env = await temporaryEnvironment();
  const oldProfile = join(env.home, ".zshrc");
  const newProfile = join(env.home, ".bashrc");
  await writeFile(oldProfile, "# old user config\n", "utf8");
  await writeFile(newProfile, "# new user config\n", "utf8");
  await install({
    ...env,
    platform: "darwin",
    arch: "arm64",
    nodePath: "/usr/bin/node",
    fetch: fakeReleaseFetch(),
    profilePath: oldProfile,
    shell: "zsh"
  });

  const updated = await install({
    ...env,
    platform: "darwin",
    arch: "arm64",
    nodePath: "/usr/bin/node",
    fetch: fakeReleaseFetch(),
    profilePath: newProfile,
    shell: "bash"
  });

  assert.equal(await readFile(oldProfile, "utf8"), "# old user config\n");
  assert.match(await readFile(newProfile, "utf8"), /# BEGIN cxstatusline PATH/);
  const manifest = JSON.parse(await readFile(updated.paths.manifest, "utf8")) as {
    profilePath?: string;
  };
  assert.equal(manifest.profilePath, newProfile);
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

  assert.equal((await inspectUninstall({ ...env, platform: "darwin" })).status, "ready");

  await uninstall({ ...env, platform: "darwin" });

  await assert.rejects(access(installed.paths.launcher));
  await assert.rejects(access(installed.paths.adapter));
  assert.equal(await readFile(join(env.codexHome, "config.toml"), "utf8"), "model = \"gpt\"\n");
});

test("uninstall rejects ownership manifests containing extra paths", async () => {
  const env = await temporaryEnvironment();
  const installed = await install({
    ...env,
    platform: "darwin",
    arch: "arm64",
    nodePath: "/usr/bin/node",
    fetch: fakeReleaseFetch()
  });
  const unrelated = join(env.home, "keep-me");
  await writeFile(unrelated, "important", "utf8");
  const manifest = JSON.parse(await readFile(installed.paths.manifest, "utf8")) as {
    ownedPaths: string[];
  };
  manifest.ownedPaths.push(unrelated);
  await writeFile(installed.paths.manifest, JSON.stringify(manifest), "utf8");

  await assert.rejects(
    uninstall({ ...env, platform: "darwin" }),
    /ownership manifest does not match/
  );
  assert.equal(await readFile(unrelated, "utf8"), "important");
});

test("uninstall refuses a modified managed Codex block without deleting files", async () => {
  const env = await temporaryEnvironment();
  const installed = await install({
    ...env,
    platform: "darwin",
    arch: "arm64",
    nodePath: "/usr/bin/node",
    fetch: fakeReleaseFetch()
  });
  const configPath = join(env.codexHome, "config.toml");
  const config = await readFile(configPath, "utf8");
  await writeFile(configPath, config.replace("max_lines = 3", "max_lines = 9"), "utf8");

  await assert.rejects(
    uninstall({ ...env, platform: "darwin" }),
    /managed Codex config does not match/
  );
  assert.match(await readFile(installed.paths.launcher, "utf8"), /^#!\/bin\/sh/);
});

test("uninstall refuses a manifest profile outside HOME", async () => {
  const env = await temporaryEnvironment();
  const profilePath = join(env.home, ".zshrc");
  await writeFile(profilePath, "# user config\n", "utf8");
  const installed = await install({
    ...env,
    platform: "darwin",
    arch: "arm64",
    nodePath: "/usr/bin/node",
    fetch: fakeReleaseFetch(),
    profilePath,
    shell: "zsh"
  });
  const unrelated = join(tmpdir(), "cxstatusline-unrelated-profile");
  await writeFile(unrelated, "important\n", "utf8");
  const manifest = JSON.parse(await readFile(installed.paths.manifest, "utf8"));
  manifest.profilePath = unrelated;
  await writeFile(installed.paths.manifest, JSON.stringify(manifest), "utf8");

  await assert.rejects(
    uninstall({ ...env, platform: "darwin" }),
    /profile path is outside HOME/
  );
  assert.equal(await readFile(unrelated, "utf8"), "important\n");
});
