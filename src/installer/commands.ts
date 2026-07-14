import {
  access,
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  rmdir,
  writeFile
} from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { delimiter, dirname, posix, win32 } from "node:path";
import {
  CODEX_BLOCK_START,
  codexConfigPath,
  hasExactCodexBlock,
  removeCodexConfig,
  renderCodexBlock,
  updateCodexConfig
} from "./codex-config.js";
import { verifySha256 } from "./checksum.js";
import {
  createLauncher,
  findCommandOnPath,
  renderPathBlock,
  renderUnixLauncher,
  type ShellKind
} from "./launcher.js";
import { adapterAssetName, resolveInstallPaths, type InstallPaths } from "./paths.js";
import { fetchReleaseAssets, type FetchLike } from "./release.js";
import { removeManagedBlock, upsertManagedBlock } from "./managed-block.js";

const PLUGIN_VERSION = "0.2.0";
const UPSTREAM_CODEX_COMMIT = "d7ba5ff9553a6aa0898a8e3bd5cb3bc00d0c9ddf";
const PATH_BLOCK_START = "# BEGIN cxstatusline PATH";
const PATH_BLOCK_END = "# END cxstatusline PATH";

export interface InstallOptions {
  home: string;
  codexHome?: string;
  localAppData?: string;
  platform: string;
  arch: string;
  nodePath: string;
  fetch: FetchLike;
  pathValue?: string;
  profilePath?: string;
  shell?: ShellKind;
}

export interface DoctorOptions {
  home: string;
  codexHome?: string;
  localAppData?: string;
  platform: string;
  arch: string;
  pathValue?: string;
}

export interface UninstallOptions {
  home: string;
  codexHome?: string;
  localAppData?: string;
  platform: string;
}

export interface InstallManifest {
  schemaVersion: 1;
  pluginVersion: string;
  releaseTag: string;
  upstreamCodexCommit: string;
  checksums: {
    adapter: string;
    renderer: string;
  };
  ownedPaths: string[];
  codexConfigPath: string;
  nodePath: string;
  profilePath?: string;
}

export interface InstallResult {
  paths: InstallPaths;
  releaseTag: string;
}

export interface DoctorCheck {
  id: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface UninstallInspection {
  manifestPath: string;
  status: "ready" | "missing" | "invalid";
  detail: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

async function readManifest(path: string): Promise<InstallManifest | undefined> {
  const text = await readText(path);
  return text ? JSON.parse(text) as InstallManifest : undefined;
}

function expectedOwnedPaths(paths: InstallPaths): string[] {
  return [paths.adapter, paths.renderer, paths.launcher];
}

function validateManifest(
  manifest: InstallManifest,
  paths: InstallPaths,
  expectedConfigPath: string,
  home: string,
  platform: string
): void {
  const expected = expectedOwnedPaths(paths);
  const actual = manifest.ownedPaths;
  const exactOwnedPaths = Array.isArray(actual) &&
    actual.length === expected.length &&
    expected.every((path) => actual.includes(path));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.pluginVersion !== PLUGIN_VERSION ||
    manifest.upstreamCodexCommit !== UPSTREAM_CODEX_COMMIT ||
    typeof manifest.releaseTag !== "string" ||
    manifest.releaseTag.length === 0 ||
    !exactOwnedPaths ||
    manifest.codexConfigPath !== expectedConfigPath ||
    typeof manifest.nodePath !== "string" ||
    manifest.nodePath.length === 0 ||
    !/^[a-f0-9]{64}$/i.test(manifest.checksums?.adapter ?? "") ||
    !/^[a-f0-9]{64}$/i.test(manifest.checksums?.renderer ?? "")
  ) {
    throw new Error("cxstatusline ownership manifest does not match this installation");
  }
  if (manifest.profilePath) assertProfileInsideHome(manifest.profilePath, home, platform);
}

function assertProfileInsideHome(profilePath: string, home: string, platform: string): void {
  const pathApi = platform === "win32" ? win32 : posix;
  const relative = pathApi.relative(pathApi.resolve(home), pathApi.resolve(profilePath));
  if (!relative || relative === ".." || relative.startsWith(".." + pathApi.sep) || pathApi.isAbsolute(relative)) {
    throw new Error("profile path is outside HOME: " + profilePath);
  }
}

async function atomicWrite(
  path: string,
  data: string | Uint8Array,
  mode?: number
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + ".tmp-" + process.pid;
  await rm(temporary, { force: true });
  await writeFile(temporary, data, mode === undefined ? undefined : { mode });
  if (mode !== undefined) await chmod(temporary, mode);
  if (process.platform !== "win32") {
    await rename(temporary, path);
    return;
  }
  const backup = path + ".bak-" + process.pid;
  await rm(backup, { force: true });
  const hadTarget = await exists(path);
  if (hadTarget) await rename(path, backup);
  try {
    await rename(temporary, path);
    await rm(backup, { force: true });
  } catch (error) {
    if (hadTarget && await exists(backup)) await rename(backup, path);
    throw error;
  }
}

async function snapshot(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function restore(path: string, data: Buffer | undefined, mode?: number): Promise<void> {
  if (data === undefined) {
    await rm(path, { force: true });
    return;
  }
  await atomicWrite(path, data, mode);
}

export async function install(options: InstallOptions): Promise<InstallResult> {
  const paths = resolveInstallPaths(options);
  const configPath = codexConfigPath(options.home, options.codexHome);
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
    options.platform
  );
  const pathApi = options.platform === "win32" ? win32 : posix;
  if (resolvedCdx && pathApi.resolve(resolvedCdx) !== pathApi.resolve(paths.launcher)) {
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
  if (previousManifest?.profilePath) {
    if (!await exists(previousManifest.profilePath)) {
      throw new Error("managed shell profile is missing: " + previousManifest.profilePath);
    }
    const previousProfile = await readText(previousManifest.profilePath);
    if (removeManagedBlock(previousProfile, PATH_BLOCK_START, PATH_BLOCK_END) === previousProfile) {
      throw new Error("managed PATH block is missing from shell profile");
    }
  }
  let originalProfile: string | undefined;
  let nextProfile: string | undefined;
  if (options.profilePath) {
    if (!options.shell) throw new Error("--profile requires a shell kind");
    originalProfile = await readText(options.profilePath);
    nextProfile = upsertManagedBlock(
      originalProfile,
      PATH_BLOCK_START,
      PATH_BLOCK_END,
      renderPathBlock(options.shell, dirname(paths.launcher))
        .replace(PATH_BLOCK_START + "\n", "")
        .replace("\n" + PATH_BLOCK_END, "")
    );
  }
  const oldProfilePath = previousManifest?.profilePath !== profilePath
    ? previousManifest?.profilePath
    : undefined;
  const oldProfile = oldProfilePath ? await readText(oldProfilePath) : undefined;
  const cleanedOldProfile = oldProfile === undefined
    ? undefined
    : removeManagedBlock(oldProfile, PATH_BLOCK_START, PATH_BLOCK_END);

  const release = await fetchReleaseAssets(options);
  const tracked = [paths.adapter, paths.renderer, paths.launcher, paths.manifest, configPath];
  if (profilePath) tracked.push(profilePath);
  if (oldProfilePath) tracked.push(oldProfilePath);
  const before = new Map<string, Buffer | undefined>();
  for (const path of tracked) before.set(path, await snapshot(path));

  try {
    await atomicWrite(paths.adapter, release.adapter.bytes, options.platform === "win32" ? undefined : 0o755);
    await atomicWrite(paths.renderer, release.renderer.bytes, 0o644);
    await createLauncher({
      platform: options.platform,
      launcher: paths.launcher,
      adapter: paths.adapter,
      ownedPaths
    });
    await atomicWrite(configPath, nextConfig, 0o600);
    if (options.profilePath && nextProfile !== undefined) {
      await atomicWrite(options.profilePath, nextProfile);
    }
    if (oldProfilePath && cleanedOldProfile !== undefined) {
      await atomicWrite(oldProfilePath, cleanedOldProfile);
    }

    const manifest: InstallManifest = {
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
      ...(profilePath ? { profilePath } : {})
    };
    await atomicWrite(paths.manifest, JSON.stringify(manifest, null, 2) + "\n", 0o600);
  } catch (error) {
    await restore(paths.adapter, before.get(paths.adapter), options.platform === "win32" ? undefined : 0o755);
    await restore(paths.renderer, before.get(paths.renderer), 0o644);
    await restore(paths.launcher, before.get(paths.launcher), options.platform === "win32" ? undefined : 0o755);
    await restore(configPath, before.get(configPath), 0o600);
    if (profilePath) await restore(profilePath, before.get(profilePath));
    if (oldProfilePath) await restore(oldProfilePath, before.get(oldProfilePath));
    await restore(paths.manifest, before.get(paths.manifest), 0o600);
    throw error;
  }

  return { paths, releaseTag: release.tag };
}

export async function doctor(options: DoctorOptions): Promise<DoctorCheck[]> {
  const paths = resolveInstallPaths(options);
  const configPath = codexConfigPath(options.home, options.codexHome);
  const checks: DoctorCheck[] = [];

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
    checks.push({ id: "platform", status: "fail", detail: (error as Error).message });
  }

  for (const [id, path] of [
    ["adapter", paths.adapter],
    ["renderer", paths.renderer],
    ["launcher", paths.launcher],
    ["manifest", paths.manifest]
  ] as const) {
    checks.push({
      id,
      status: await exists(path) ? "pass" : "fail",
      detail: path
    });
  }

  let manifest: InstallManifest | undefined;
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
    for (const [id, path, checksum] of [
      ["adapter-checksum", paths.adapter, manifest.checksums.adapter],
      ["renderer-checksum", paths.renderer, manifest.checksums.renderer]
    ] as const) {
      try {
        verifySha256(await readFile(path), checksum);
        checks.push({ id, status: "pass", detail: path });
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
    } catch (error) {
      checks.push({
        id: "launcher-integrity",
        status: "fail",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
    const execution = spawnSync(paths.adapter, ["--version"], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true
    });
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
  const separator = options.platform === "win32" ? ";" : delimiter;
  const pathEntries = (options.pathValue ?? process.env.PATH ?? "").split(separator);
  checks.push({
    id: "path",
    status: pathEntries.includes(dirname(paths.launcher)) ? "pass" : "warn",
    detail: dirname(paths.launcher)
  });
  const resolvedCdx = await findCommandOnPath(
    "cdx",
    options.pathValue ?? process.env.PATH ?? "",
    options.platform
  );
  const pathApi = options.platform === "win32" ? win32 : posix;
  checks.push({
    id: "cdx-resolution",
    status: resolvedCdx && pathApi.resolve(resolvedCdx) === pathApi.resolve(paths.launcher)
      ? "pass"
      : "warn",
    detail: resolvedCdx ?? "cdx is not currently resolved from PATH"
  });
  const resolvedCodex = await findCommandOnPath(
    "codex",
    options.pathValue ?? process.env.PATH ?? "",
    options.platform
  );
  if (!resolvedCodex) {
    checks.push({
      id: "official-codex",
      status: "warn",
      detail: "official codex is not currently resolved from PATH"
    });
  } else {
    const codexVersion = spawnSync(resolvedCodex, ["--version"], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true
    });
    checks.push({
      id: "official-codex",
      status: codexVersion.status === 0 ? "pass" : "warn",
      detail: codexVersion.status === 0
        ? (codexVersion.stdout || codexVersion.stderr).trim()
        : codexVersion.error?.message || "official codex did not return a version"
    });
  }
  return checks;
}

export async function inspectUninstall(options: UninstallOptions): Promise<UninstallInspection> {
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

export async function uninstall(options: UninstallOptions): Promise<void> {
  const paths = resolveInstallPaths(options);
  const manifest = await readManifest(paths.manifest);
  if (!manifest) throw new Error("cxstatusline ownership manifest not found");
  validateManifest(
    manifest,
    paths,
    codexConfigPath(options.home, options.codexHome),
    options.home,
    options.platform
  );

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
  let profile: string | undefined;
  let nextProfile: string | undefined;
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
    ...(manifest.profilePath ? [manifest.profilePath] : [])
  ];
  const before = new Map<string, Buffer | undefined>();
  for (const path of tracked) before.set(path, await snapshot(path));
  try {
    await atomicWrite(manifest.codexConfigPath, nextConfig, 0o600);
    if (manifest.profilePath && nextProfile !== undefined) {
      await atomicWrite(manifest.profilePath, nextProfile);
    }
    for (const path of expectedOwnedPaths(paths)) await rm(path, { force: true });
    await rm(paths.manifest, { force: true });
  } catch (error) {
    await Promise.allSettled(tracked.map((path) => restore(
      path,
      before.get(path),
      path === paths.adapter || path === paths.launcher
        ? options.platform === "win32" ? undefined : 0o755
        : path === manifest.codexConfigPath || path === paths.manifest
          ? 0o600
          : undefined
    )));
    throw error;
  }
  try {
    await rmdir(paths.root);
  } catch (error) {
    if (!["ENOENT", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
  }
}
