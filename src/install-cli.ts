#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { doctor, inspectUninstall, install, uninstall } from "./installer/commands.js";
import { codexConfigPath } from "./installer/codex-config.js";
import { resolveInstallPaths } from "./installer/paths.js";
import type { ShellKind } from "./installer/launcher.js";

export type InstallCommand = "plan" | "install" | "doctor" | "uninstall";

export interface ParsedInstallArgs {
  command: InstallCommand;
  json: boolean;
  yes: boolean;
  uninstallPlan: boolean;
  profilePath?: string;
  shell?: ShellKind;
}

function valueAfter(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error("missing value for " + name);
  return value;
}

export function parseInstallArgs(args: string[]): ParsedInstallArgs {
  const command = args[0];
  if (!["plan", "install", "doctor", "uninstall"].includes(command ?? "")) {
    throw new Error("unknown command: " + (command ?? ""));
  }

  let json = false;
  let yes = false;
  let uninstallPlan = false;
  let profilePath: string | undefined;
  let shell: ShellKind | undefined;
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
      shell = value as ShellKind;
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
    command: command as InstallCommand,
    json,
    yes,
    uninstallPlan,
    ...(profilePath ? { profilePath } : {}),
    ...(shell ? { shell } : {})
  };
}

function requireHome(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home) throw new Error("HOME is not set");
  return home;
}

function print(value: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify(value, null, 2) + "\n");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value as Array<{ status?: string; id?: string; detail?: string }>) {
      process.stdout.write(
        "[" + (item.status ?? "info").toUpperCase() + "] " +
        (item.id ? item.id + ": " : "") +
        (item.detail ?? "") + "\n"
      );
    }
    return;
  }
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

async function main(): Promise<void> {
  const args = parseInstallArgs(process.argv.slice(2));
  const home = requireHome();
  const codexHome = process.env.CODEX_HOME;
  const localAppData = process.env.LOCALAPPDATA;
  const base = {
    home,
    platform: process.platform,
    ...(codexHome ? { codexHome } : {}),
    ...(localAppData ? { localAppData } : {})
  };

  if (args.command === "plan") {
    const paths = resolveInstallPaths(base);
    const ownership = args.uninstallPlan ? await inspectUninstall(base) : undefined;
    print({
      action: args.uninstallPlan ? "uninstall" : "install",
      officialCodexPreserved: true,
      dailyCommand: "cdx",
      paths,
      codexConfig: codexConfigPath(home, codexHome),
      network: args.uninstallPlan ? [] : ["api.github.com", "github.com"],
      profile: args.profilePath ?? null,
      ...(ownership ? { ownership } : {})
    }, args.json);
    return;
  }

  if (args.command === "doctor") {
    const checks = await doctor({
      ...base,
      arch: process.arch,
      ...(process.env.PATH ? { pathValue: process.env.PATH } : {}),
      ...(process.env.PATHEXT ? { pathExtValue: process.env.PATHEXT } : {}),
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
      ...(process.env.PATH ? { pathValue: process.env.PATH } : {}),
      ...(process.env.PATHEXT ? { pathExtValue: process.env.PATHEXT } : {}),
      cwd: process.cwd(),
      ...(args.profilePath ? { profilePath: resolve(args.profilePath) } : {}),
      ...(args.shell ? { shell: args.shell } : {})
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

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(
      "cxstatusline: " + (error instanceof Error ? error.message : String(error)) + "\n"
    );
    process.exitCode = 1;
  });
}
