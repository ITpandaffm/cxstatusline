import test from "node:test";
import assert from "node:assert/strict";
import {
  codexConfigPath,
  renderCodexBlock,
  removeCodexConfig,
  updateCodexConfig
} from "./codex-config.js";

test("uses CODEX_HOME when resolving the config path", () => {
  assert.equal(codexConfigPath("/Users/test", "/tmp/codex-home"), "/tmp/codex-home/config.toml");
  assert.equal(codexConfigPath("/Users/test"), "/Users/test/.codex/config.toml");
});

test("renders stable absolute renderer argv", () => {
  const block = renderCodexBlock(
    "/usr/bin/node",
    "/Users/test/.local/share/cxstatusline/renderer.mjs"
  );
  assert.match(
    block,
    /argv = \["\/usr\/bin\/node", "\/Users\/test\/\.local\/share\/cxstatusline\/renderer\.mjs", "render"\]/
  );
  assert.match(block, /refresh_interval_ms = 1000/);
  assert.match(block, /timeout_ms = 300/);
  assert.match(block, /max_lines = 3/);
});

test("rejects an unmanaged status command", () => {
  assert.throws(
    () => updateCodexConfig("[tui.status_line_command]\nargv = []\n", "owned"),
    /unmanaged \[tui\.status_line_command\]/
  );
});

test("updates and removes only the managed Codex config", () => {
  const updated = updateCodexConfig("model = \"gpt\"\n", "owned = true");
  assert.match(updated, /model = "gpt"/);
  assert.match(updated, /# BEGIN cxstatusline\nowned = true\n# END cxstatusline/);
  assert.equal(removeCodexConfig(updated), "model = \"gpt\"\n");
});
