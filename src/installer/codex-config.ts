import { join } from "node:path";
import { removeManagedBlock, upsertManagedBlock } from "./managed-block.js";

export const CODEX_BLOCK_START = "# BEGIN cxstatusline";
export const CODEX_BLOCK_END = "# END cxstatusline";

export function codexConfigPath(home: string, codexHome?: string): string {
  return join(codexHome ?? join(home, ".codex"), "config.toml");
}

export function renderCodexBlock(nodePath: string, rendererPath: string): string {
  const argv = [nodePath, rendererPath, "render"].map((value) => JSON.stringify(value)).join(", ");
  return [
    "[tui.status_line_command]",
    "argv = [" + argv + "]",
    "refresh_interval_ms = 1000",
    "timeout_ms = 300",
    "max_lines = 3"
  ].join("\n");
}

export function updateCodexConfig(text: string, body: string): string {
  const unmanagedText = removeManagedBlock(text, CODEX_BLOCK_START, CODEX_BLOCK_END);
  if (/^\s*\[tui\.status_line_command\]\s*$/m.test(unmanagedText)) {
    throw new Error("unmanaged [tui.status_line_command] already exists");
  }
  return upsertManagedBlock(text, CODEX_BLOCK_START, CODEX_BLOCK_END, body);
}

export function hasExactCodexBlock(text: string, body: string): boolean {
  const expected = CODEX_BLOCK_START + "\n" + body + "\n" + CODEX_BLOCK_END;
  return text.includes(expected);
}

export function removeCodexConfig(text: string): string {
  return removeManagedBlock(text, CODEX_BLOCK_START, CODEX_BLOCK_END);
}
