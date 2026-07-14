#!/usr/bin/env node

// src/install-cli.ts
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// src/installer/commands.ts
import {
  access,
  chmod as chmod2,
  mkdir as mkdir2,
  readFile,
  rename as rename2,
  rm as rm2,
  rmdir,
  writeFile as writeFile2
} from "node:fs/promises";
import { delimiter, dirname as dirname2 } from "node:path";

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
  if (!text.includes(CODEX_BLOCK_START) && /^\s*\[tui\.status_line_command\]\s*$/m.test(text)) {
    throw new Error("unmanaged [tui.status_line_command] already exists");
  }
  return upsertManagedBlock(text, CODEX_BLOCK_START, CODEX_BLOCK_END, body);
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
import { chmod, copyFile, lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
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
  if (exists2) await rm(options.launcher, { force: true });
  await rename(temporary, options.launcher);
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
import { posix, win32 } from "node:path";
function resolveInstallPaths(input) {
  if (input.platform === "win32") {
    const base = input.localAppData ?? win32.join(input.home, "AppData", "Local");
    const root2 = win32.join(base, "cxstatusline");
    return {
      root: root2,
      adapter: win32.join(root2, "codex-cx.exe"),
      renderer: win32.join(root2, "renderer.mjs"),
      manifest: win32.join(root2, "install.json"),
      launcher: win32.join(root2, "bin", "cdx.exe")
    };
  }
  const root = posix.join(input.home, ".local", "share", "cxstatusline");
  return {
    root,
    adapter: posix.join(root, "codex-cx"),
    renderer: posix.join(root, "renderer.mjs"),
    manifest: posix.join(root, "install.json"),
    launcher: posix.join(input.home, ".local", "bin", "cdx")
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
async function requireResponse(response, label) {
  if (!response.ok) throw new Error(label + " failed (" + response.status + ")");
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
  await requireResponse(apiResponse, "GitHub release request");
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
    await requireResponse(binaryResponse, "asset download " + name);
    await requireResponse(checksumResponse, "checksum download " + name);
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
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
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
async function atomicWrite(path, data, mode) {
  await mkdir2(dirname2(path), { recursive: true });
  const temporary = path + ".tmp-" + process.pid;
  await rm2(temporary, { force: true });
  await writeFile2(temporary, data, mode === void 0 ? void 0 : { mode });
  if (mode !== void 0) await chmod2(temporary, mode);
  await rm2(path, { force: true });
  await rename2(temporary, path);
}
async function snapshot(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw error;
  }
}
async function restore(path, data, mode) {
  if (data === void 0) {
    await rm2(path, { force: true });
    return;
  }
  await atomicWrite(path, data, mode);
}
async function install(options) {
  const paths = resolveInstallPaths(options);
  const configPath = codexConfigPath(options.home, options.codexHome);
  const previousManifest = await readManifest(paths.manifest);
  const ownedPaths = previousManifest?.ownedPaths ?? [];
  if (await exists(paths.launcher) && !ownedPaths.includes(paths.launcher)) {
    throw new Error("refusing to overwrite existing cdx: " + paths.launcher);
  }
  const originalConfig = await readText(configPath);
  const nextConfig = updateCodexConfig(
    originalConfig,
    renderCodexBlock(options.nodePath, paths.renderer)
  );
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
  const release = await fetchReleaseAssets(options);
  const tracked = [paths.adapter, paths.renderer, paths.launcher, paths.manifest, configPath];
  if (options.profilePath) tracked.push(options.profilePath);
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
    const manifest = {
      schemaVersion: 1,
      pluginVersion: PLUGIN_VERSION,
      releaseTag: release.tag,
      upstreamCodexCommit: UPSTREAM_CODEX_COMMIT,
      checksums: {
        adapter: release.adapter.checksum,
        renderer: release.renderer.checksum
      },
      ownedPaths: [paths.adapter, paths.renderer, paths.launcher],
      codexConfigPath: configPath,
      ...options.profilePath ? { profilePath: options.profilePath } : {}
    };
    await atomicWrite(paths.manifest, JSON.stringify(manifest, null, 2) + "\n", 384);
  } catch (error) {
    await restore(paths.adapter, before.get(paths.adapter), options.platform === "win32" ? void 0 : 493);
    await restore(paths.renderer, before.get(paths.renderer), 420);
    await restore(paths.launcher, before.get(paths.launcher), options.platform === "win32" ? void 0 : 493);
    await restore(configPath, before.get(configPath), 384);
    if (options.profilePath) await restore(options.profilePath, before.get(options.profilePath));
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
  const config = await readText(configPath);
  checks.push({
    id: "codex-config",
    status: config.includes(CODEX_BLOCK_START) ? "pass" : "fail",
    detail: configPath
  });
  const separator = options.platform === "win32" ? ";" : delimiter;
  const pathEntries = (options.pathValue ?? process.env.PATH ?? "").split(separator);
  checks.push({
    id: "path",
    status: pathEntries.includes(dirname2(paths.launcher)) ? "pass" : "warn",
    detail: dirname2(paths.launcher)
  });
  return checks;
}
async function uninstall(options) {
  const paths = resolveInstallPaths(options);
  const manifest = await readManifest(paths.manifest);
  if (!manifest) throw new Error("cxstatusline ownership manifest not found");
  const expectedOwned = [paths.adapter, paths.renderer, paths.launcher];
  if (expectedOwned.some((path) => !manifest.ownedPaths.includes(path))) {
    throw new Error("cxstatusline ownership manifest does not match this installation");
  }
  if (await exists(paths.adapter)) {
    verifySha256(await readFile(paths.adapter), manifest.checksums.adapter);
  }
  if (await exists(paths.renderer)) {
    verifySha256(await readFile(paths.renderer), manifest.checksums.renderer);
  }
  if (options.platform !== "win32" && await exists(paths.launcher)) {
    const launcher = await readFile(paths.launcher, "utf8");
    if (launcher !== renderUnixLauncher(paths.adapter)) {
      throw new Error("refusing to remove modified cdx launcher");
    }
  }
  const config = await readText(manifest.codexConfigPath);
  await atomicWrite(manifest.codexConfigPath, removeCodexConfig(config), 384);
  if (manifest.profilePath) {
    const profile = await readText(manifest.profilePath);
    await atomicWrite(
      manifest.profilePath,
      removeManagedBlock(profile, PATH_BLOCK_START, PATH_BLOCK_END)
    );
  }
  for (const path of manifest.ownedPaths) await rm2(path, { force: true });
  await rm2(paths.manifest, { force: true });
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
    print({
      action: args.uninstallPlan ? "uninstall" : "install",
      officialCodexPreserved: true,
      dailyCommand: "cdx",
      paths,
      codexConfig: codexConfigPath(home, codexHome),
      network: args.uninstallPlan ? [] : ["api.github.com", "github.com"],
      profile: args.profilePath ?? null
    }, args.json);
    return;
  }
  if (args.command === "doctor") {
    const checks = await doctor({
      ...base,
      arch: process.arch,
      ...process.env.PATH ? { pathValue: process.env.PATH } : {}
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
