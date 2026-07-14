import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig } from "./config.js";
import { outputAsAnsi, renderStatus } from "./render.js";
import type { CodexStatusInputV1 } from "./types.js";

const input: CodexStatusInputV1 = {
  schema_version: 1,
  session: { id: "thread-1", name: "Statusline MVP" },
  model: { id: "gpt-5.4", display_name: "GPT-5.4", reasoning_effort: "high" },
  workspace: {
    cwd: "/Users/demo/Projects/cxstatusline",
    root: "/Users/demo/Projects/cxstatusline",
    git_branch: "main",
    git_dirty: true
  },
  runtime: { state: "working" },
  context: { used_tokens: 42_000, window_tokens: 200_000, remaining_percent: 79 },
  rate_limits: { five_hour_remaining_percent: 88, weekly_remaining_percent: 64 },
  usage: { input_tokens: 40_000, output_tokens: 2_000, total_tokens: 42_000 },
  terminal: { columns: 120, color: true }
};

test("renders the default two-line layout", () => {
  const output = renderStatus(input, defaultConfig);
  assert.equal(output.schema_version, 1);
  assert.equal(output.lines.length, 2);
  assert.match(output.lines[0]?.spans.map((span) => span.text).join("" ) ?? "", /GPT-5\.4/);
  assert.match(output.lines[1]?.spans.map((span) => span.text).join("" ) ?? "", /cxstatusline/);
});

test("truncates each line to the terminal width", () => {
  const output = renderStatus({ ...input, terminal: { columns: 20, color: false } }, defaultConfig);
  for (const line of output.lines) {
    const text = line.spans.map((span) => span.text).join("");
    assert.ok([...text].length <= 20);
    assert.ok(text.endsWith("…"));
  }
});

test("ANSI output preserves multiple lines", () => {
  const output = renderStatus(input, defaultConfig);
  const rendered = outputAsAnsi(output, true);
  assert.equal(rendered.split("\n").length, 2);
  assert.match(rendered, /\u001b\[/);
});

test("treats null snapshot values as unavailable", () => {
  const output = renderStatus({
    schema_version: 1,
    model: { id: null, display_name: null, reasoning_effort: null },
    workspace: { cwd: null, root: null, git_branch: null, git_dirty: null },
    context: { remaining_percent: null },
    rate_limits: { five_hour_remaining_percent: null }
  }, defaultConfig);

  assert.deepEqual(output.lines, []);
});
