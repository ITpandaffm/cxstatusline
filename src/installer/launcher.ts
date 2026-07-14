import { constants } from "node:fs";
import { access, chmod, copyFile, lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname, posix, win32 } from "node:path";

export interface CreateLauncherOptions {
  platform: string;
  launcher: string;
  adapter: string;
  ownedPaths: string[];
}

function shellSingleQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

export function renderUnixLauncher(adapter: string): string {
  return "#!/bin/sh\nexec " + shellSingleQuote(adapter) + " \"$@\"\n";
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function findCommandOnPath(
  command: string,
  pathValue: string,
  platform: string
): Promise<string | undefined> {
  const pathApi = platform === "win32" ? win32 : posix;
  const separator = platform === "win32" ? ";" : delimiter;
  const extensions = platform === "win32"
    ? [".exe", ".cmd", ".bat", ".com", ""]
    : [""];
  for (const directory of pathValue.split(separator).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = pathApi.join(directory, command + extension);
      try {
        await access(candidate, platform === "win32" ? constants.F_OK : constants.X_OK);
        return candidate;
      } catch (error) {
        if (["ENOENT", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) continue;
        throw error;
      }
    }
  }
  return undefined;
}

export async function createLauncher(options: CreateLauncherOptions): Promise<void> {
  const exists = await pathExists(options.launcher);
  if (exists && !options.ownedPaths.includes(options.launcher)) {
    throw new Error("refusing to overwrite existing cdx: " + options.launcher);
  }

  await mkdir(dirname(options.launcher), { recursive: true });
  const temporary = options.launcher + ".tmp-" + process.pid;
  await rm(temporary, { force: true });
  if (options.platform === "win32") {
    await copyFile(options.adapter, temporary);
  } else {
    await writeFile(temporary, renderUnixLauncher(options.adapter), { mode: 0o755 });
    await chmod(temporary, 0o755);
  }

  if (options.platform !== "win32") {
    await rename(temporary, options.launcher);
    return;
  }
  const backup = options.launcher + ".bak-" + process.pid;
  await rm(backup, { force: true });
  if (exists) await rename(options.launcher, backup);
  try {
    await rename(temporary, options.launcher);
    await rm(backup, { force: true });
  } catch (error) {
    if (exists && await pathExists(backup)) await rename(backup, options.launcher);
    throw error;
  }
}

export type ShellKind = "zsh" | "bash" | "fish" | "powershell";

export function renderPathBlock(shell: ShellKind, binDirectory: string): string {
  const start = "# BEGIN cxstatusline PATH";
  const end = "# END cxstatusline PATH";
  if (shell === "fish") {
    return start + "\nfish_add_path --path " + shellSingleQuote(binDirectory) + "\n" + end;
  }
  if (shell === "powershell") {
    const escaped = binDirectory.replaceAll("'", "''");
    return start + "\n$env:Path = '" + escaped + ";' + $env:Path\n" + end;
  }
  return start + "\nexport PATH=" + shellSingleQuote(binDirectory) + ":\"$PATH\"\n" + end;
}
