import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLauncher, findCommandOnPath, renderPathBlock, renderUnixLauncher } from "./launcher.js";

test("renders an argument-forwarding Unix launcher", () => {
  assert.equal(
    renderUnixLauncher("/Users/test/.local/share/cxstatusline/codex-cx"),
    "#!/bin/sh\nexec '/Users/test/.local/share/cxstatusline/codex-cx' \"$@\"\n"
  );
});

test("creates an executable Unix cdx launcher", async () => {
  const root = await mkdtemp(join(tmpdir(), "cxstatusline-launcher-"));
  const launcher = join(root, "bin", "cdx");
  await createLauncher({
    platform: "darwin",
    launcher,
    adapter: join(root, "codex-cx"),
    ownedPaths: []
  });

  assert.match(await readFile(launcher, "utf8"), /exec .* "\$@"/);
  assert.equal((await stat(launcher)).mode & 0o777, 0o755);
});

test("refuses to overwrite an unrelated cdx command", async () => {
  const root = await mkdtemp(join(tmpdir(), "cxstatusline-collision-"));
  const launcher = join(root, "cdx");
  await writeFile(launcher, "unrelated", "utf8");

  await assert.rejects(
    createLauncher({
      platform: "darwin",
      launcher,
      adapter: join(root, "codex-cx"),
      ownedPaths: []
    }),
    /refusing to overwrite existing cdx/
  );
  assert.equal(await readFile(launcher, "utf8"), "unrelated");
});

test("replaces a launcher recorded as owned", async () => {
  const root = await mkdtemp(join(tmpdir(), "cxstatusline-owned-"));
  const launcher = join(root, "cdx");
  await writeFile(launcher, "old", "utf8");

  await createLauncher({
    platform: "darwin",
    launcher,
    adapter: join(root, "codex-cx"),
    ownedPaths: [launcher]
  });
  assert.match(await readFile(launcher, "utf8"), /^#!\/bin\/sh/);
});

test("renders shell-specific managed PATH blocks", () => {
  assert.match(renderPathBlock("zsh", "/Users/test/.local/bin"), /export PATH=/);
  assert.match(renderPathBlock("fish", "/Users/test/.local/bin"), /fish_add_path/);
  assert.match(renderPathBlock("powershell", "C:\\Users\\test\\bin"), /\$env:Path/);
});

test("resolves an empty Unix PATH entry from the working directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "cxstatusline-path-cwd-"));
  const command = join(root, "cdx");
  await writeFile(command, "#!/bin/sh\n", { mode: 0o755 });
  assert.equal(await findCommandOnPath("cdx", ":/usr/bin", "darwin", root), command);
});
