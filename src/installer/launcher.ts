import { chmod, copyFile, lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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

  if (exists) await rm(options.launcher, { force: true });
  await rename(temporary, options.launcher);
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
