#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadConfig, writeDefaultConfig, configPath } from "./config.js";
import { outputAsAnsi, renderStatus } from "./render.js";
import type { CodexStatusInputV1 } from "./types.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function render(inputText: string): Promise<void> {
  const input = JSON.parse(inputText) as CodexStatusInputV1;
  const config = await loadConfig(option("--config"));
  const output = renderStatus(input, config);
  const format = option("--format") ?? "json";
  if (format === "ansi") {
    process.stdout.write(`${outputAsAnsi(output, input.terminal?.color !== false)}\n`);
    return;
  }
  if (format !== "json") throw new Error(`unsupported format: ${format}`);
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

async function demo(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const examplePath = resolve(here, "../examples/session.json");
  await render(await readFile(examplePath, "utf8"));
}

function help(): void {
  process.stdout.write(`cxstatusline

Usage:
  cxstatusline render [--format json|ansi] [--config path]  Read Codex status JSON from stdin
  cxstatusline demo [--format json|ansi]                    Render bundled example data
  cxstatusline init                                         Write the default config

Default config: ${configPath()}
`);
}

async function main(): Promise<void> {
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
      process.stdout.write(`Wrote ${option("--config") ?? configPath()}\n`);
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

main().catch((error: unknown) => {
  process.stderr.write(`cxstatusline: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
