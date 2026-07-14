#!/usr/bin/env node

// src/install-cli.ts
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// src/installer/commands.ts
import {
  chmod as chmod2,
  lstat as lstat2,
  mkdir as mkdir2,
  mkdtemp,
  readFile,
  rename as rename2,
  rm as rm2,
  rmdir,
  stat,
  writeFile as writeFile2
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { delimiter as delimiter2, dirname as dirname2, join as join2, posix as posix3, win32 as win323 } from "node:path";

// src/installer/codex-config.ts
import { join } from "node:path";

// src/installer/managed-block.ts
function markerCount(text, marker) {
  return text.split(marker).length - 1;
}
function renderBlock(start, end, body) {
  return start + "\n" + body.replace(/^\n+|\n+$/g, "") + "\n" + end;
}
function upsertManagedBlock(text, start, end, body) {
  const starts = markerCount(text, start);
  const ends = markerCount(text, end);
  if (starts !== ends) throw new Error("incomplete managed block");
  if (starts > 1) throw new Error("multiple managed blocks");
  const block = renderBlock(start, end, body);
  if (starts === 0) {
    if (text.length === 0) return block + "\n";
    const prefix = text.endsWith("\n\n") ? text : text.endsWith("\n") ? text + "\n" : text + "\n\n";
    return prefix + block + "\n";
  }
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  return text.slice(0, startIndex) + block + text.slice(endIndex + end.length);
}
function removeManagedBlock(text, start, end) {
  const starts = markerCount(text, start);
  const ends = markerCount(text, end);
  if (starts !== ends) throw new Error("incomplete managed block");
  if (starts > 1) throw new Error("multiple managed blocks");
  if (starts === 0) return text;
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  const before = text.slice(0, startIndex);
  const after = text.slice(endIndex + end.length);
  if (after.trimStart().length === 0) {
    return before.replace(/\n+$/g, "\n");
  }
  if (before.length === 0) {
    return after.replace(/^\n+/g, "");
  }
  return before.replace(/\n+$/g, "\n\n") + after.replace(/^\n+/g, "");
}

// src/installer/codex-config.ts
var CODEX_BLOCK_START = "# BEGIN cxstatusline";
var CODEX_BLOCK_END = "# END cxstatusline";
function codexConfigPath(home, codexHome) {
  return join(codexHome ?? join(home, ".codex"), "config.toml");
}
function renderCodexBlock(nodePath, rendererPath) {
  const argv = [nodePath, rendererPath, "render"].map((value) => JSON.stringify(value)).join(", ");
  return [
    "[tui.status_line_command]",
    "argv = [" + argv + "]",
    "refresh_interval_ms = 1000",
    "timeout_ms = 300",
    "max_lines = 3"
  ].join("\n");
}
function updateCodexConfig(text, body) {
  const unmanagedText = removeManagedBlock(text, CODEX_BLOCK_START, CODEX_BLOCK_END);
  if (/^\s*\[tui\.status_line_command\]\s*$/m.test(unmanagedText)) {
    throw new Error("unmanaged [tui.status_line_command] already exists");
  }
  return upsertManagedBlock(text, CODEX_BLOCK_START, CODEX_BLOCK_END, body);
}
function hasExactCodexBlock(text, body) {
  const expected = CODEX_BLOCK_START + "\n" + body + "\n" + CODEX_BLOCK_END;
  return text.includes(expected);
}
function removeCodexConfig(text) {
  return removeManagedBlock(text, CODEX_BLOCK_START, CODEX_BLOCK_END);
}

// src/installer/checksum.ts
import { createHash, timingSafeEqual } from "node:crypto";
function parseChecksum(text) {
  const checksum = text.trim().split(/\s+/, 1)[0] ?? "";
  if (!/^[a-fA-F0-9]{64}$/.test(checksum)) {
    throw new Error("invalid SHA-256 checksum");
  }
  return checksum.toLowerCase();
}
function verifySha256(bytes, expected) {
  const normalized = parseChecksum(expected);
  const actual = createHash("sha256").update(bytes).digest();
  const wanted = Buffer.from(normalized, "hex");
  if (!timingSafeEqual(actual, wanted)) {
    throw new Error("checksum mismatch");
  }
}

// src/installer/launcher.ts
import { constants } from "node:fs";
import { access, chmod, copyFile, lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname, posix, win32 } from "node:path";
function shellSingleQuote(value) {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}
function renderUnixLauncher(adapter) {
  return "#!/bin/sh\nexec " + shellSingleQuote(adapter) + ' "$@"\n';
}
async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
async function findCommandOnPath(command, pathValue, platform, cwd = process.cwd(), pathExtValue = process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD") {
  const pathApi = platform === "win32" ? win32 : posix;
  const separator = platform === "win32" ? ";" : delimiter;
  const hasWindowsExtension = platform === "win32" && win32.extname(command).length > 0;
  const extensions = platform === "win32" && !hasWindowsExtension ? pathExtValue.split(";").filter(Boolean).map((extension) => extension.startsWith(".") ? extension : "." + extension) : [""];
  const pathDirectories = pathValue.split(separator).map((directory) => directory || cwd);
  const directories = platform === "win32" ? [cwd, ...pathDirectories] : pathDirectories;
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = pathApi.join(directory, command + extension);
      try {
        await access(candidate, platform === "win32" ? constants.F_OK : constants.X_OK);
        return candidate;
      } catch (error) {
        if (["ENOENT", "EACCES"].includes(error.code ?? "")) continue;
        throw error;
      }
    }
  }
  return void 0;
}
function sameCommandPath(left, right, platform) {
  const pathApi = platform === "win32" ? win32 : posix;
  const normalizedLeft = pathApi.resolve(left);
  const normalizedRight = pathApi.resolve(right);
  return platform === "win32" ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase() : normalizedLeft === normalizedRight;
}
async function createLauncher(options) {
  const exists2 = await pathExists(options.launcher);
  if (exists2 && !options.ownedPaths.includes(options.launcher)) {
    throw new Error("refusing to overwrite existing cdx: " + options.launcher);
  }
  await mkdir(dirname(options.launcher), { recursive: true });
  const temporary = options.launcher + ".tmp-" + process.pid;
  await rm(temporary, { force: true });
  if (options.platform === "win32") {
    await copyFile(options.adapter, temporary);
  } else {
    await writeFile(temporary, renderUnixLauncher(options.adapter), { mode: 493 });
    await chmod(temporary, 493);
  }
  if (options.platform !== "win32") {
    await rename(temporary, options.launcher);
    return;
  }
  const backup = options.launcher + ".bak-" + process.pid;
  await rm(backup, { force: true });
  if (exists2) await rename(options.launcher, backup);
  try {
    await rename(temporary, options.launcher);
    await rm(backup, { force: true });
  } catch (error) {
    if (exists2 && await pathExists(backup)) await rename(backup, options.launcher);
    throw error;
  }
}
function renderPathBlock(shell, binDirectory) {
  const start = "# BEGIN cxstatusline PATH";
  const end = "# END cxstatusline PATH";
  if (shell === "fish") {
    return start + "\nfish_add_path --path " + shellSingleQuote(binDirectory) + "\n" + end;
  }
  if (shell === "powershell") {
    const escaped = binDirectory.replaceAll("'", "''");
    return start + "\n$env:Path = '" + escaped + ";' + $env:Path\n" + end;
  }
  return start + "\nexport PATH=" + shellSingleQuote(binDirectory) + ':"$PATH"\n' + end;
}

// src/installer/paths.ts
import { posix as posix2, win32 as win322 } from "node:path";
function resolveInstallPaths(input) {
  if (input.platform === "win32") {
    const base = input.localAppData ?? win322.join(input.home, "AppData", "Local");
    const root2 = win322.join(base, "cxstatusline");
    return {
      root: root2,
      adapter: win322.join(root2, "codex-cx.exe"),
      renderer: win322.join(root2, "renderer.mjs"),
      manifest: win322.join(root2, "install.json"),
      launcher: win322.join(root2, "bin", "cdx.exe")
    };
  }
  const root = posix2.join(input.home, ".local", "share", "cxstatusline");
  return {
    root,
    adapter: posix2.join(root, "codex-cx"),
    renderer: posix2.join(root, "renderer.mjs"),
    manifest: posix2.join(root, "install.json"),
    launcher: posix2.join(input.home, ".local", "bin", "cdx")
  };
}
function adapterAssetName(platform, arch) {
  const key = platform + "/" + arch;
  const assets = {
    "darwin/arm64": "codex-cx-darwin-arm64",
    "darwin/x64": "codex-cx-darwin-x64",
    "linux/arm64": "codex-cx-linux-arm64",
    "linux/x64": "codex-cx-linux-x64",
    "win32/x64": "codex-cx-windows-x64.exe"
  };
  const asset = assets[key];
  if (!asset) throw new Error("unsupported platform: " + key);
  return asset;
}

// src/installer/release.ts
async function requireResponse(response, label, url) {
  if (!response.ok) {
    throw new Error(label + " failed (" + response.status + ") at " + url);
  }
  return response;
}
async function fetchReleaseAssets(options) {
  const repository = options.repository ?? "ITpandaffm/cxstatusline";
  const apiUrl = "https://api.github.com/repos/" + repository + "/releases/latest";
  const apiResponse = await options.fetch(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "cxstatusline-installer"
    }
  });
  await requireResponse(apiResponse, "GitHub release request", apiUrl);
  const release = await apiResponse.json();
  if (typeof release.tag_name !== "string" || !Array.isArray(release.assets)) {
    throw new Error("invalid GitHub release response");
  }
  const byName = new Map(release.assets.map((asset) => [asset.name, asset]));
  const download = async (name) => {
    const binaryAsset = byName.get(name);
    const checksumAsset = byName.get(name + ".sha256");
    if (!binaryAsset) throw new Error("missing release asset: " + name);
    if (!checksumAsset) throw new Error("missing release asset: " + name + ".sha256");
    const [binaryResponse, checksumResponse] = await Promise.all([
      options.fetch(binaryAsset.browser_download_url, {
        headers: { "User-Agent": "cxstatusline-installer" }
      }),
      options.fetch(checksumAsset.browser_download_url, {
        headers: { "User-Agent": "cxstatusline-installer" }
      })
    ]);
    await requireResponse(binaryResponse, "asset download " + name, binaryAsset.browser_download_url);
    await requireResponse(
      checksumResponse,
      "checksum download " + name,
      checksumAsset.browser_download_url
    );
    const bytes = new Uint8Array(await binaryResponse.arrayBuffer());
    const checksum = parseChecksum(await checksumResponse.text());
    verifySha256(bytes, checksum);
    return { name, bytes, checksum };
  };
  const adapterName = adapterAssetName(options.platform, options.arch);
  const [adapter, renderer] = await Promise.all([
    download(adapterName),
    download("cxstatusline-renderer.mjs")
  ]);
  return { tag: release.tag_name, adapter, renderer };
}

// src/installer/commands.ts
var PLUGIN_VERSION = "0.2.0";
var UPSTREAM_CODEX_COMMIT = "d7ba5ff9553a6aa0898a8e3bd5cb3bc00d0c9ddf";
var PATH_BLOCK_START = "# BEGIN cxstatusline PATH";
var PATH_BLOCK_END = "# END cxstatusline PATH";
async function exists(path) {
  try {
    await lstat2(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
async function assertNotSymlink(path, label) {
  try {
    if ((await lstat2(path)).isSymbolicLink()) {
      throw new Error(
        "refusing to modify symlinked " + label + ": " + path + "; edit the link target directly or use a regular file"
      );
    }
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
}
async function readText(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}
async function readManifest(path) {
  const text = await readText(path);
  return text ? JSON.parse(text) : void 0;
}
function expectedOwnedPaths(paths) {
  return [paths.adapter, paths.renderer, paths.launcher];
}
function validateManifest(manifest, paths, expectedConfigPath, home, platform) {
  const expected = expectedOwnedPaths(paths);
  const actual = manifest.ownedPaths;
  const exactOwnedPaths = Array.isArray(actual) && actual.length === expected.length && expected.every((path) => actual.includes(path));
  if (manifest.schemaVersion !== 1 || typeof manifest.pluginVersion !== "string" || !/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(manifest.pluginVersion) || typeof manifest.upstreamCodexCommit !== "string" || !/^[a-f0-9]{40}$/i.test(manifest.upstreamCodexCommit) || typeof manifest.releaseTag !== "string" || manifest.releaseTag.length === 0 || !exactOwnedPaths || manifest.codexConfigPath !== expectedConfigPath || typeof manifest.nodePath !== "string" || manifest.nodePath.length === 0 || !/^[a-f0-9]{64}$/i.test(manifest.checksums?.adapter ?? "") || !/^[a-f0-9]{64}$/i.test(manifest.checksums?.renderer ?? "")) {
    throw new Error("cxstatusline ownership manifest does not match this installation");
  }
  if (manifest.profilePath) assertProfileInsideHome(manifest.profilePath, home, platform);
}
function assertProfileInsideHome(profilePath, home, platform) {
  const pathApi = platform === "win32" ? win323 : posix3;
  const relative = pathApi.relative(pathApi.resolve(home), pathApi.resolve(profilePath));
  if (!relative || relative === ".." || relative.startsWith(".." + pathApi.sep) || pathApi.isAbsolute(relative)) {
    throw new Error("profile path is outside HOME: " + profilePath);
  }
}
async function atomicWrite(path, data, mode) {
  await assertNotSymlink(path, "file");
  await mkdir2(dirname2(path), { recursive: true });
  let effectiveMode = mode;
  if (effectiveMode === void 0 && await exists(path)) {
    effectiveMode = (await stat(path)).mode & 511;
  }
  const temporary = path + ".tmp-" + process.pid;
  await rm2(temporary, { force: true });
  await writeFile2(temporary, data, effectiveMode === void 0 ? void 0 : { mode: effectiveMode });
  if (effectiveMode !== void 0) await chmod2(temporary, effectiveMode);
  if (process.platform !== "win32") {
    await rename2(temporary, path);
    return;
  }
  const backup = path + ".bak-" + process.pid;
  await rm2(backup, { force: true });
  const hadTarget = await exists(path);
  if (hadTarget) await rename2(path, backup);
  try {
    await rename2(temporary, path);
    await rm2(backup, { force: true });
  } catch (error) {
    if (hadTarget && await exists(backup)) await rename2(backup, path);
    throw error;
  }
}
async function snapshot(path) {
  try {
    const metadata = await lstat2(path);
    if (metadata.isSymbolicLink()) {
      throw new Error("refusing to snapshot symlinked file: " + path);
    }
    const data = await readFile(path);
    return { data, mode: metadata.mode & 511 };
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}
async function restore(path, snapshotValue, fallbackMode) {
  snapshotValue ??= {};
  if (snapshotValue.data === void 0) {
    await rm2(path, { force: true });
    return;
  }
  await atomicWrite(path, snapshotValue.data, snapshotValue.mode ?? fallbackMode);
}
async function probeVersion(executable) {
  const isolatedHome = await mkdtemp(join2(tmpdir(), "cxstatusline-doctor-"));
  const isolatedCodexHome = join2(isolatedHome, ".codex");
  await mkdir2(isolatedCodexHome, { recursive: true });
  try {
    const result = spawnSync(executable, ["--version"], {
      cwd: isolatedHome,
      encoding: "utf8",
      timeout: 5e3,
      windowsHide: true,
      env: {
        ...process.env,
        HOME: isolatedHome,
        USERPROFILE: isolatedHome,
        CODEX_HOME: isolatedCodexHome,
        LOCALAPPDATA: join2(isolatedHome, "AppData", "Local")
      }
    });
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      ...result.error ? { error: result.error } : {}
    };
  } finally {
    await rm2(isolatedHome, { recursive: true, force: true });
  }
}
async function install(options) {
  const paths = resolveInstallPaths(options);
  const configPath = codexConfigPath(options.home, options.codexHome);
  await assertNotSymlink(configPath, "Codex config");
  await assertNotSymlink(paths.manifest, "ownership manifest");
  const previousManifest = await readManifest(paths.manifest);
  if (previousManifest) {
    validateManifest(previousManifest, paths, configPath, options.home, options.platform);
  } else {
    for (const path of expectedOwnedPaths(paths)) {
      if (await exists(path)) {
        if (path === paths.launcher) {
          throw new Error("refusing to overwrite existing cdx: " + path);
        }
        throw new Error("refusing to overwrite unowned installation file: " + path);
      }
    }
  }
  const ownedPaths = previousManifest?.ownedPaths ?? [];
  const resolvedCdx = await findCommandOnPath(
    "cdx",
    options.pathValue ?? process.env.PATH ?? "",
    options.platform,
    options.cwd,
    options.pathExtValue
  );
  if (resolvedCdx && !sameCommandPath(resolvedCdx, paths.launcher, options.platform)) {
    throw new Error("another cdx command is already on PATH: " + resolvedCdx);
  }
  if (await exists(paths.launcher) && !ownedPaths.includes(paths.launcher)) {
    throw new Error("refusing to overwrite existing cdx: " + paths.launcher);
  }
  const originalConfig = await readText(configPath);
  const nextConfig = updateCodexConfig(
    originalConfig,
    renderCodexBlock(options.nodePath, paths.renderer)
  );
  const profilePath = options.profilePath ?? previousManifest?.profilePath;
  if (profilePath) assertProfileInsideHome(profilePath, options.home, options.platform);
  if (profilePath) await assertNotSymlink(profilePath, "shell profile");
  if (previousManifest?.profilePath) {
    if (!await exists(previousManifest.profilePath)) {
      throw new Error("managed shell profile is missing: " + previousManifest.profilePath);
    }
    const previousProfile = await readText(previousManifest.profilePath);
    if (removeManagedBlock(previousProfile, PATH_BLOCK_START, PATH_BLOCK_END) === previousProfile) {
      throw new Error("managed PATH block is missing from shell profile");
    }
  }
  let originalProfile;
  let nextProfile;
  if (options.profilePath) {
    if (!options.shell) throw new Error("--profile requires a shell kind");
    originalProfile = await readText(options.profilePath);
    nextProfile = upsertManagedBlock(
      originalProfile,
      PATH_BLOCK_START,
      PATH_BLOCK_END,
      renderPathBlock(options.shell, dirname2(paths.launcher)).replace(PATH_BLOCK_START + "\n", "").replace("\n" + PATH_BLOCK_END, "")
    );
  }
  const oldProfilePath = previousManifest?.profilePath !== profilePath ? previousManifest?.profilePath : void 0;
  const oldProfile = oldProfilePath ? await readText(oldProfilePath) : void 0;
  const cleanedOldProfile = oldProfile === void 0 ? void 0 : removeManagedBlock(oldProfile, PATH_BLOCK_START, PATH_BLOCK_END);
  const release = await fetchReleaseAssets(options);
  const tracked = [paths.adapter, paths.renderer, paths.launcher, paths.manifest, configPath];
  if (profilePath) tracked.push(profilePath);
  if (oldProfilePath) tracked.push(oldProfilePath);
  const before = /* @__PURE__ */ new Map();
  for (const path of tracked) before.set(path, await snapshot(path));
  try {
    await atomicWrite(paths.adapter, release.adapter.bytes, options.platform === "win32" ? void 0 : 493);
    await atomicWrite(paths.renderer, release.renderer.bytes, 420);
    await createLauncher({
      platform: options.platform,
      launcher: paths.launcher,
      adapter: paths.adapter,
      ownedPaths
    });
    await atomicWrite(configPath, nextConfig, 384);
    if (options.profilePath && nextProfile !== void 0) {
      await atomicWrite(options.profilePath, nextProfile);
    }
    if (oldProfilePath && cleanedOldProfile !== void 0) {
      await atomicWrite(oldProfilePath, cleanedOldProfile);
    }
    const manifest = {
      schemaVersion: 1,
      pluginVersion: PLUGIN_VERSION,
      releaseTag: release.tag,
      upstreamCodexCommit: UPSTREAM_CODEX_COMMIT,
      checksums: {
        adapter: release.adapter.checksum,
        renderer: release.renderer.checksum
      },
      ownedPaths: expectedOwnedPaths(paths),
      codexConfigPath: configPath,
      nodePath: options.nodePath,
      ...profilePath ? { profilePath } : {}
    };
    await atomicWrite(paths.manifest, JSON.stringify(manifest, null, 2) + "\n", 384);
  } catch (error) {
    await restore(paths.adapter, before.get(paths.adapter), options.platform === "win32" ? void 0 : 493);
    await restore(paths.renderer, before.get(paths.renderer), 420);
    await restore(paths.launcher, before.get(paths.launcher), options.platform === "win32" ? void 0 : 493);
    await restore(configPath, before.get(configPath), 384);
    if (profilePath) await restore(profilePath, before.get(profilePath));
    if (oldProfilePath) await restore(oldProfilePath, before.get(oldProfilePath));
    await restore(paths.manifest, before.get(paths.manifest), 384);
    throw error;
  }
  return { paths, releaseTag: release.tag };
}
async function doctor(options) {
  const paths = resolveInstallPaths(options);
  const configPath = codexConfigPath(options.home, options.codexHome);
  const checks = [];
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  checks.push({
    id: "node",
    status: nodeMajor >= 20 ? "pass" : "fail",
    detail: "Node " + process.versions.node
  });
  try {
    checks.push({
      id: "platform",
      status: "pass",
      detail: adapterAssetName(options.platform, options.arch)
    });
  } catch (error) {
    checks.push({ id: "platform", status: "fail", detail: error.message });
  }
  for (const [id, path] of [
    ["adapter", paths.adapter],
    ["renderer", paths.renderer],
    ["launcher", paths.launcher],
    ["manifest", paths.manifest]
  ]) {
    checks.push({
      id,
      status: await exists(path) ? "pass" : "fail",
      detail: path
    });
  }
  let manifest;
  try {
    const candidate = await readManifest(paths.manifest);
    if (candidate) {
      validateManifest(candidate, paths, configPath, options.home, options.platform);
      manifest = candidate;
      checks.push({
        id: "manifest-integrity",
        status: "pass",
        detail: candidate.releaseTag + " / plugin " + candidate.pluginVersion
      });
    }
  } catch (error) {
    checks.push({
      id: "manifest-integrity",
      status: "fail",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
  if (manifest) {
    let adapterVerified = false;
    let launcherVerified = false;
    for (const [id, path, checksum] of [
      ["adapter-checksum", paths.adapter, manifest.checksums.adapter],
      ["renderer-checksum", paths.renderer, manifest.checksums.renderer]
    ]) {
      try {
        verifySha256(await readFile(path), checksum);
        checks.push({ id, status: "pass", detail: path });
        if (id === "adapter-checksum") adapterVerified = true;
      } catch (error) {
        checks.push({
          id,
          status: "fail",
          detail: error instanceof Error ? error.message : String(error)
        });
      }
    }
    if (manifest.profilePath) {
      try {
        const profile = await readFile(manifest.profilePath, "utf8");
        if (removeManagedBlock(profile, PATH_BLOCK_START, PATH_BLOCK_END) === profile) {
          throw new Error("managed PATH block is missing");
        }
        checks.push({
          id: "profile-block",
          status: "pass",
          detail: manifest.profilePath
        });
      } catch (error) {
        checks.push({
          id: "profile-block",
          status: "fail",
          detail: error instanceof Error ? error.message : String(error)
        });
      }
    }
    try {
      const launcher = await readFile(paths.launcher);
      if (options.platform === "win32") {
        verifySha256(launcher, manifest.checksums.adapter);
      } else if (launcher.toString("utf8") !== renderUnixLauncher(paths.adapter)) {
        throw new Error("launcher content mismatch");
      }
      checks.push({ id: "launcher-integrity", status: "pass", detail: paths.launcher });
      launcherVerified = true;
    } catch (error) {
      checks.push({
        id: "launcher-integrity",
        status: "fail",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    if (adapterVerified && launcherVerified) {
      const execution = await probeVersion(paths.adapter);
      if (execution.status === 0) {
        checks.push({
          id: "adapter-execution",
          status: "pass",
          detail: (execution.stdout || execution.stderr).trim() || paths.adapter
        });
      } else {
        checks.push({
          id: "adapter-execution",
          status: "fail",
          detail: execution.error?.message || execution.stderr.trim() || "adapter exited unsuccessfully"
        });
      }
    } else {
      checks.push({
        id: "adapter-execution",
        status: "fail",
        detail: "execution skipped because adapter or launcher integrity could not be verified"
      });
    }
  }
  const config = await readText(configPath);
  checks.push({
    id: "codex-config",
    status: config.includes(CODEX_BLOCK_START) ? "pass" : "fail",
    detail: configPath
  });
  if (manifest) {
    const exactBody = renderCodexBlock(manifest.nodePath, paths.renderer);
    checks.push({
      id: "codex-config-content",
      status: hasExactCodexBlock(config, exactBody) ? "pass" : "fail",
      detail: configPath
    });
  }
  const separator = options.platform === "win32" ? ";" : delimiter2;
  const pathEntries = (options.pathValue ?? process.env.PATH ?? "").split(separator);
  checks.push({
    id: "path",
    status: pathEntries.includes(dirname2(paths.launcher)) ? "pass" : "warn",
    detail: dirname2(paths.launcher)
  });
  const resolvedCdx = await findCommandOnPath(
    "cdx",
    options.pathValue ?? process.env.PATH ?? "",
    options.platform,
    options.cwd,
    options.pathExtValue
  );
  const cdxIsOwned = resolvedCdx ? sameCommandPath(resolvedCdx, paths.launcher, options.platform) : false;
  checks.push({
    id: "cdx-resolution",
    status: cdxIsOwned ? "pass" : resolvedCdx ? "fail" : "warn",
    detail: resolvedCdx ?? "cdx is not currently resolved from PATH"
  });
  const resolvedCodex = await findCommandOnPath(
    "codex",
    options.pathValue ?? process.env.PATH ?? "",
    options.platform,
    options.cwd,
    options.pathExtValue
  );
  if (!resolvedCodex) {
    checks.push({
      id: "official-codex",
      status: "warn",
      detail: "official codex is not currently resolved from PATH"
    });
  } else {
    const codexVersion = await probeVersion(resolvedCodex);
    checks.push({
      id: "official-codex",
      status: codexVersion.status === 0 ? "pass" : "warn",
      detail: codexVersion.status === 0 ? (codexVersion.stdout || codexVersion.stderr).trim() : codexVersion.error?.message || "official codex did not return a version"
    });
  }
  return checks;
}
async function inspectUninstall(options) {
  const paths = resolveInstallPaths(options);
  const manifest = await readManifest(paths.manifest);
  if (!manifest) {
    return {
      manifestPath: paths.manifest,
      status: "missing",
      detail: "cxstatusline ownership manifest not found"
    };
  }
  try {
    validateManifest(
      manifest,
      paths,
      codexConfigPath(options.home, options.codexHome),
      options.home,
      options.platform
    );
    return {
      manifestPath: paths.manifest,
      status: "ready",
      detail: manifest.releaseTag + " owns " + manifest.ownedPaths.length + " installation files"
    };
  } catch (error) {
    return {
      manifestPath: paths.manifest,
      status: "invalid",
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}
async function uninstall(options) {
  const paths = resolveInstallPaths(options);
  await assertNotSymlink(paths.manifest, "ownership manifest");
  const manifest = await readManifest(paths.manifest);
  if (!manifest) throw new Error("cxstatusline ownership manifest not found");
  validateManifest(
    manifest,
    paths,
    codexConfigPath(options.home, options.codexHome),
    options.home,
    options.platform
  );
  await assertNotSymlink(manifest.codexConfigPath, "Codex config");
  if (manifest.profilePath) await assertNotSymlink(manifest.profilePath, "shell profile");
  if (await exists(paths.adapter)) {
    verifySha256(await readFile(paths.adapter), manifest.checksums.adapter);
  }
  if (await exists(paths.renderer)) {
    verifySha256(await readFile(paths.renderer), manifest.checksums.renderer);
  }
  if (await exists(paths.launcher)) {
    const launcher = await readFile(paths.launcher);
    if (options.platform === "win32") {
      verifySha256(launcher, manifest.checksums.adapter);
    } else if (launcher.toString("utf8") !== renderUnixLauncher(paths.adapter)) {
      throw new Error("refusing to remove modified cdx launcher");
    }
  }
  if (!await exists(manifest.codexConfigPath)) {
    throw new Error("managed Codex config file is missing");
  }
  const config = await readText(manifest.codexConfigPath);
  const expectedBlock = renderCodexBlock(manifest.nodePath, paths.renderer);
  if (!hasExactCodexBlock(config, expectedBlock)) {
    throw new Error("managed Codex config does not match the ownership manifest");
  }
  const nextConfig = removeCodexConfig(config);
  let profile;
  let nextProfile;
  if (manifest.profilePath) {
    if (!await exists(manifest.profilePath)) throw new Error("managed shell profile is missing");
    profile = await readText(manifest.profilePath);
    nextProfile = removeManagedBlock(profile, PATH_BLOCK_START, PATH_BLOCK_END);
    if (nextProfile === profile) throw new Error("managed PATH block is missing from shell profile");
  }
  const tracked = [
    manifest.codexConfigPath,
    ...expectedOwnedPaths(paths),
    paths.manifest,
    ...manifest.profilePath ? [manifest.profilePath] : []
  ];
  const before = /* @__PURE__ */ new Map();
  for (const path of tracked) before.set(path, await snapshot(path));
  try {
    await atomicWrite(manifest.codexConfigPath, nextConfig, 384);
    if (manifest.profilePath && nextProfile !== void 0) {
      await atomicWrite(manifest.profilePath, nextProfile);
    }
    for (const path of expectedOwnedPaths(paths)) await rm2(path, { force: true });
    await rm2(paths.manifest, { force: true });
  } catch (error) {
    await Promise.allSettled(tracked.map((path) => restore(
      path,
      before.get(path),
      path === paths.adapter || path === paths.launcher ? options.platform === "win32" ? void 0 : 493 : path === manifest.codexConfigPath || path === paths.manifest ? 384 : void 0
    )));
    throw error;
  }
  try {
    await rmdir(paths.root);
  } catch (error) {
    if (!["ENOENT", "ENOTEMPTY"].includes(error.code ?? "")) throw error;
  }
}

// src/install-cli.ts
function valueAfter(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error("missing value for " + name);
  return value;
}
function parseInstallArgs(args) {
  const command = args[0];
  if (!["plan", "install", "doctor", "uninstall"].includes(command ?? "")) {
    throw new Error("unknown command: " + (command ?? ""));
  }
  let json = false;
  let yes = false;
  let uninstallPlan = false;
  let profilePath;
  let shell;
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") json = true;
    else if (argument === "--yes") yes = true;
    else if (argument === "--uninstall") uninstallPlan = true;
    else if (argument === "--profile") {
      profilePath = valueAfter(args, index, argument);
      index += 1;
    } else if (argument === "--shell") {
      const value = valueAfter(args, index, argument);
      if (!["zsh", "bash", "fish", "powershell"].includes(value)) {
        throw new Error("unsupported shell: " + value);
      }
      shell = value;
      index += 1;
    } else {
      throw new Error("unknown option: " + argument);
    }
  }
  if (yes && !["install", "uninstall"].includes(command ?? "")) {
    throw new Error("--yes is only valid with install or uninstall");
  }
  if ((profilePath || shell) && command !== "install") {
    throw new Error("--profile is only valid with install");
  }
  if (profilePath && !shell) throw new Error("--profile requires --shell");
  if (shell && !profilePath) throw new Error("--shell requires --profile");
  if (uninstallPlan && command !== "plan") {
    throw new Error("--uninstall is only valid with plan");
  }
  return {
    command,
    json,
    yes,
    uninstallPlan,
    ...profilePath ? { profilePath } : {},
    ...shell ? { shell } : {}
  };
}
function requireHome() {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) throw new Error("HOME is not set");
  return home;
}
function print(value, json) {
  if (json) {
    process.stdout.write(JSON.stringify(value, null, 2) + "\n");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      process.stdout.write(
        "[" + (item.status ?? "info").toUpperCase() + "] " + (item.id ? item.id + ": " : "") + (item.detail ?? "") + "\n"
      );
    }
    return;
  }
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}
async function main() {
  const args = parseInstallArgs(process.argv.slice(2));
  const home = requireHome();
  const codexHome = process.env.CODEX_HOME;
  const localAppData = process.env.LOCALAPPDATA;
  const base = {
    home,
    platform: process.platform,
    ...codexHome ? { codexHome } : {},
    ...localAppData ? { localAppData } : {}
  };
  if (args.command === "plan") {
    const paths = resolveInstallPaths(base);
    const ownership = args.uninstallPlan ? await inspectUninstall(base) : void 0;
    print({
      action: args.uninstallPlan ? "uninstall" : "install",
      officialCodexPreserved: true,
      dailyCommand: "cdx",
      paths,
      codexConfig: codexConfigPath(home, codexHome),
      network: args.uninstallPlan ? [] : ["api.github.com", "github.com"],
      profile: args.profilePath ?? null,
      ...ownership ? { ownership } : {}
    }, args.json);
    return;
  }
  if (args.command === "doctor") {
    const checks = await doctor({
      ...base,
      arch: process.arch,
      ...process.env.PATH ? { pathValue: process.env.PATH } : {},
      ...process.env.PATHEXT ? { pathExtValue: process.env.PATHEXT } : {},
      cwd: process.cwd()
    });
    print(checks, args.json);
    if (checks.some((check) => check.status === "fail")) process.exitCode = 1;
    return;
  }
  if (!args.yes) {
    process.stderr.write("cxstatusline: rerun after approval with --yes\n");
    process.exitCode = 2;
    return;
  }
  if (args.command === "install") {
    const result = await install({
      ...base,
      arch: process.arch,
      nodePath: process.execPath,
      fetch: globalThis.fetch,
      ...process.env.PATH ? { pathValue: process.env.PATH } : {},
      ...process.env.PATHEXT ? { pathExtValue: process.env.PATHEXT } : {},
      cwd: process.cwd(),
      ...args.profilePath ? { profilePath: resolve(args.profilePath) } : {},
      ...args.shell ? { shell: args.shell } : {}
    });
    print({
      status: "installed",
      releaseTag: result.releaseTag,
      command: result.paths.launcher
    }, args.json);
    return;
  }
  await uninstall(base);
  print({ status: "uninstalled", officialCodexPreserved: true }, args.json);
}
var entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      "cxstatusline: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  });
}
export {
  parseInstallArgs
};
