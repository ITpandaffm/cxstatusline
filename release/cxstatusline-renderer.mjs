#!/usr/bin/env node

// src/cli.ts
import { readFile as readFile2 } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname as dirname2, resolve } from "node:path";

// src/config.ts
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
var defaultConfig = {
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
function configPath() {
  const override = process.env.CXSTATUSLINE_CONFIG;
  if (override) return override;
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(base, "cxstatusline", "config.json");
}
async function loadConfig(path = configPath()) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (parsed.schema_version !== 1 || !Array.isArray(parsed.lines)) {
      throw new Error("unsupported config schema");
    }
    return parsed;
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT") return defaultConfig;
    throw error;
  }
}
async function writeDefaultConfig(path = configPath()) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(defaultConfig, null, 2)}
`, "utf8");
}

// src/render.ts
import { basename } from "node:path";
var ANSI_FG = {
  default: 39,
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37
};
var ANSI_BG = {
  default: 49,
  black: 40,
  red: 41,
  green: 42,
  yellow: 43,
  blue: 44,
  magenta: 45,
  cyan: 46,
  white: 47
};
function compactNumber(value) {
  if (Math.abs(value) < 1e3) return String(value);
  if (Math.abs(value) < 1e6) return `${(value / 1e3).toFixed(1)}k`;
  return `${(value / 1e6).toFixed(1)}m`;
}
function withLabel(label, value) {
  return label ? `${label}: ${value}` : value;
}
function percent(value) {
  if (value == null || !Number.isFinite(value)) return void 0;
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}
function widgetValue(widget, input) {
  switch (widget.type) {
    case "model":
      return input.model?.display_name ?? input.model?.id ?? void 0;
    case "reasoning":
      return input.model?.reasoning_effort ?? void 0;
    case "cwd":
      return input.workspace?.cwd ?? void 0;
    case "project":
      return input.workspace?.root ? basename(input.workspace.root) : input.workspace?.cwd ? basename(input.workspace.cwd) : void 0;
    case "git_branch":
      return input.workspace?.git_branch ?? void 0;
    case "git_state":
      return input.workspace?.git_dirty == null ? void 0 : input.workspace.git_dirty ? "dirty" : "clean";
    case "run_state":
      return input.runtime?.state ?? void 0;
    case "context_remaining":
      return percent(input.context?.remaining_percent);
    case "context_tokens": {
      const used = input.context?.used_tokens;
      const total = input.context?.window_tokens;
      if (used == null) return void 0;
      return total == null ? compactNumber(used) : `${compactNumber(used)}/${compactNumber(total)}`;
    }
    case "five_hour_limit":
      return percent(input.rate_limits?.five_hour_remaining_percent);
    case "weekly_limit":
      return percent(input.rate_limits?.weekly_remaining_percent);
    case "total_tokens":
      return input.usage?.total_tokens == null ? void 0 : compactNumber(input.usage.total_tokens);
    case "session":
      return input.session?.name ?? input.session?.id ?? void 0;
    case "custom":
      return widget.text;
  }
}
function visibleWidth(text) {
  return [...text].length;
}
function truncateLine(line, columns) {
  if (columns <= 0) return { spans: [] };
  const total = line.spans.reduce((sum, span) => sum + visibleWidth(span.text), 0);
  if (total <= columns) return line;
  let remaining = Math.max(0, columns - 1);
  const spans = [];
  for (const span of line.spans) {
    if (remaining === 0) break;
    const chars = [...span.text];
    const taken = chars.slice(0, remaining).join("");
    if (taken) spans.push({ ...span, text: taken });
    remaining -= visibleWidth(taken);
  }
  spans.push({ text: "…", style: { dim: true } });
  return { spans };
}
function renderStatus(input, config) {
  if (input.schema_version !== 1) throw new Error("unsupported input schema");
  const maxLines = Math.max(1, Math.min(5, config.max_lines ?? 3));
  const columns = Math.max(10, input.terminal?.columns ?? 120);
  const lines = config.lines.slice(0, maxLines).map((lineConfig) => {
    const separator = lineConfig.separator ?? "  ";
    const spans = [];
    for (const widget of lineConfig.widgets) {
      const value = widgetValue(widget, input);
      if ((!value || value.length === 0) && widget.hide_when_empty !== false) continue;
      if (spans.length > 0) spans.push({ text: separator, style: { dim: true } });
      spans.push({ text: withLabel(widget.label, value ?? ""), ...widget.style ? { style: widget.style } : {} });
    }
    return truncateLine({ spans }, columns);
  }).filter((line) => line.spans.length > 0);
  return { schema_version: 1, lines };
}
function ansiStart(style) {
  if (!style) return "";
  const codes = [];
  if (style.bold) codes.push(1);
  if (style.dim) codes.push(2);
  if (style.fg) codes.push(ANSI_FG[style.fg]);
  if (style.bg) codes.push(ANSI_BG[style.bg]);
  return codes.length === 0 ? "" : `\x1B[${codes.join(";")}m`;
}
function outputAsAnsi(output, color = true) {
  return output.lines.map((line) => line.spans.map((span) => {
    if (!color || !span.style) return span.text;
    return `${ansiStart(span.style)}${span.text}\x1B[0m`;
  }).join("")).join("\n");
}

// src/cli.ts
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : void 0;
}
async function render(inputText) {
  const input = JSON.parse(inputText);
  const config = await loadConfig(option("--config"));
  const output = renderStatus(input, config);
  const format = option("--format") ?? "json";
  if (format === "ansi") {
    process.stdout.write(`${outputAsAnsi(output, input.terminal?.color !== false)}
`);
    return;
  }
  if (format !== "json") throw new Error(`unsupported format: ${format}`);
  process.stdout.write(`${JSON.stringify(output)}
`);
}
async function demo() {
  const here = dirname2(fileURLToPath(import.meta.url));
  const examplePath = resolve(here, "../examples/session.json");
  await render(await readFile2(examplePath, "utf8"));
}
function help() {
  process.stdout.write(`cxstatusline

Usage:
  cxstatusline render [--format json|ansi] [--config path]  Read Codex status JSON from stdin
  cxstatusline demo [--format json|ansi]                    Render bundled example data
  cxstatusline init                                         Write the default config

Default config: ${configPath()}
`);
}
async function main() {
  const command = process.argv[2] ?? "help";
  switch (command) {
    case "render":
      await render(await readStdin());
      break;
    case "demo":
      await demo();
      break;
    case "init":
      await writeDefaultConfig(option("--config"));
      process.stdout.write(`Wrote ${option("--config") ?? configPath()}
`);
      break;
    case "help":
    case "--help":
    case "-h":
      help();
      break;
    default:
      throw new Error(`unknown command: ${command}`);
  }
}
main().catch((error) => {
  process.stderr.write(`cxstatusline: ${error instanceof Error ? error.message : String(error)}
`);
  process.exitCode = 1;
});
