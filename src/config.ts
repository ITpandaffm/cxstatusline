import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { CxStatusConfigV1 } from "./types.js";

export const defaultConfig: CxStatusConfigV1 = {
  schema_version: 1,
  max_lines: 3,
  lines: [
    {
      separator: "  ",
      widgets: [
        { type: "model", label: "Model", style: { fg: "cyan", bold: true } },
        { type: "reasoning", label: "Reasoning", style: { fg: "magenta" } },
        { type: "run_state", style: { fg: "yellow", bold: true } },
        { type: "context_remaining", label: "Context", style: { fg: "green" } }
      ]
    },
    {
      separator: "  ",
      widgets: [
        { type: "project", label: "Project", style: { fg: "blue", bold: true } },
        { type: "git_branch", label: "Git", style: { fg: "magenta" } },
        { type: "git_state", style: { fg: "yellow" }, hide_when_empty: true },
        { type: "five_hour_limit", label: "5h", style: { fg: "cyan" } },
        { type: "weekly_limit", label: "Week", style: { fg: "cyan" } }
      ]
    }
  ]
};

export function configPath(): string {
  const override = process.env.CXSTATUSLINE_CONFIG;
  if (override) return override;
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(base, "cxstatusline", "config.json");
}

export async function loadConfig(path = configPath()): Promise<CxStatusConfigV1> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as CxStatusConfigV1;
    if (parsed.schema_version !== 1 || !Array.isArray(parsed.lines)) {
      throw new Error("unsupported config schema");
    }
    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return defaultConfig;
    throw error;
  }
}

export async function writeDefaultConfig(path = configPath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(defaultConfig, null, 2)}\n`, "utf8");
}
