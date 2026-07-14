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
import { delimiter, dirname } from "node:path";
import {
  CODEX_BLOCK_START,
  codexConfigPath,
  removeCodexConfig,
  renderCodexBlock,
  updateCodexConfig
} from "./codex-config.js";
import { verifySha256 } from "./checksum.js";
import { createLauncher, renderPathBlock, renderUnixLauncher, type ShellKind } from "./launcher.js";
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
  await rm(path, { force: true });
  await rename(temporary, path);
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
  const ownedPaths = previousManifest?.ownedPaths ?? [];

  if (await exists(paths.launcher) && !ownedPaths.includes(paths.launcher)) {
    throw new Error("refusing to overwrite existing cdx: " + paths.launcher);
  }

  const originalConfig = await readText(configPath);
  const nextConfig = updateCodexConfig(
    originalConfig,
    renderCodexBlock(options.nodePath, paths.renderer)
  );
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

  const release = await fetchReleaseAssets(options);
  const tracked = [paths.adapter, paths.renderer, paths.launcher, paths.manifest, configPath];
  if (options.profilePath) tracked.push(options.profilePath);
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

    const manifest: InstallManifest = {
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
      ...(options.profilePath ? { profilePath: options.profilePath } : {})
    };
    await atomicWrite(paths.manifest, JSON.stringify(manifest, null, 2) + "\n", 0o600);
  } catch (error) {
    await restore(paths.adapter, before.get(paths.adapter), options.platform === "win32" ? undefined : 0o755);
    await restore(paths.renderer, before.get(paths.renderer), 0o644);
    await restore(paths.launcher, before.get(paths.launcher), options.platform === "win32" ? undefined : 0o755);
    await restore(configPath, before.get(configPath), 0o600);
    if (options.profilePath) await restore(options.profilePath, before.get(options.profilePath));
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
    status: pathEntries.includes(dirname(paths.launcher)) ? "pass" : "warn",
    detail: dirname(paths.launcher)
  });
  return checks;
}

export async function uninstall(options: UninstallOptions): Promise<void> {
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
  await atomicWrite(manifest.codexConfigPath, removeCodexConfig(config), 0o600);
  if (manifest.profilePath) {
    const profile = await readText(manifest.profilePath);
    await atomicWrite(
      manifest.profilePath,
      removeManagedBlock(profile, PATH_BLOCK_START, PATH_BLOCK_END)
    );
  }
  for (const path of manifest.ownedPaths) await rm(path, { force: true });
  await rm(paths.manifest, { force: true });
  try {
    await rmdir(paths.root);
  } catch (error) {
    if (!["ENOENT", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
  }
}
