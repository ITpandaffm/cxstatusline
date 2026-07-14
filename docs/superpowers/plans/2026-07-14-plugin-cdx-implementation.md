# Plugin-first `cdx` Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users install cxstatusline from a Codex marketplace, approve a deterministic setup workflow once, and use the short `cdx` command without replacing official `codex`.

**Architecture:** A repository marketplace exposes a `cxstatusline` plugin containing setup, doctor, and uninstall skills. The plugin ships a bundled Node 20 installer compiled from focused TypeScript modules; it downloads checksum-verified renderer and patched-Codex release assets into a stable user directory, manages only marker-delimited config/profile blocks, and creates an owned `cdx` launcher.

**Tech Stack:** Node.js 20+, TypeScript, esbuild, Node test runner, Codex plugin manifests, GitHub Actions, Rust/Cargo for the patched Codex adapter.

## Global Constraints

- Keep official `codex` installed and callable; never replace or alias it.
- Use `cdx` as the documented daily command; keep `codex-cx` only for compatibility and diagnostics.
- Plugin installation alone must not execute setup scripts or lifecycle hooks.
- Never use `SessionStart` as an installer.
- Require SHA-256 verification for every downloaded executable or renderer bundle.
- Do not read, copy, log, or package Codex credentials or session data.
- Write only marker-delimited config and shell blocks owned by cxstatusline.
- Stop without overwriting when an unrelated `cdx` command or unmanaged status command already exists.
- Use temporary HOME, CODEX_HOME, and profile paths in all mutation tests.
- Support macOS arm64/x64, Linux arm64/x64, and Windows x64 release naming.

---

## File map

- `.agents/plugins/marketplace.json`: repository marketplace catalog.
- `plugins/cxstatusline/.codex-plugin/plugin.json`: install-surface metadata.
- `plugins/cxstatusline/skills/{setup,doctor,uninstall}/SKILL.md`: approval-aware user workflows.
- `plugins/cxstatusline/scripts/manage.mjs`: committed esbuild output executed by installed plugins.
- `src/installer/paths.ts`: stable user paths and asset names.
- `src/installer/checksum.ts`: SHA-256 parsing and verification.
- `src/installer/managed-block.ts`: safe marker-delimited text edits.
- `src/installer/codex-config.ts`: Codex TOML integration ownership.
- `src/installer/launcher.ts`: `cdx` creation, collision detection, and PATH blocks.
- `src/installer/release.ts`: GitHub Release metadata and verified downloads.
- `src/installer/commands.ts`: install, doctor, and uninstall orchestration.
- `src/install-cli.ts`: plugin installer command entry point.
- `src/renderer-entry.ts`: single-file release renderer entry point.
- `scripts/build-plugin.mjs`: reproducibly bundle installer and renderer assets.
- `.github/workflows/release.yml`: build and attach renderer/adapter assets and checksums.

---

### Task 1: Scaffold and validate the repository marketplace

**Files:**
- Create: `.agents/plugins/marketplace.json`
- Create: `plugins/cxstatusline/.codex-plugin/plugin.json`
- Create: `plugins/cxstatusline/skills/setup/SKILL.md`
- Create: `plugins/cxstatusline/skills/doctor/SKILL.md`
- Create: `plugins/cxstatusline/skills/uninstall/SKILL.md`

**Interfaces:**
- Consumes: Codex plugin schema and repository URL `https://github.com/ITpandaffm/cxstatusline`.
- Produces: marketplace name `cxstatusline`, plugin name `cxstatusline`, and skill names `setup`, `doctor`, and `uninstall`.

- [ ] **Step 1: Run the plugin creator scaffold**

```bash
python3 /Users/ffm/.codex/skills/.system/plugin-creator/scripts/create_basic_plugin.py \
  cxstatusline \
  --path ./plugins \
  --marketplace-path ./.agents/plugins/marketplace.json \
  --with-skills --with-scripts --with-marketplace
```

Expected: the plugin and repo marketplace are created with complete metadata.

- [ ] **Step 2: Replace generated metadata with the public contract**

Set the manifest identity to:

```json
{
  "name": "cxstatusline",
  "version": "0.2.0",
  "description": "Install and manage a safe multi-line statusline for Codex CLI.",
  "author": { "name": "ITpandaffm", "url": "https://github.com/ITpandaffm" },
  "homepage": "https://github.com/ITpandaffm/cxstatusline",
  "repository": "https://github.com/ITpandaffm/cxstatusline",
  "license": "MIT",
  "keywords": ["codex", "statusline", "terminal"],
  "skills": "./skills/",
  "interface": {
    "displayName": "cxstatusline",
    "shortDescription": "Multi-line Codex CLI statusline",
    "longDescription": "Install, diagnose, update, and remove the cxstatusline Codex adapter.",
    "developerName": "ITpandaffm",
    "category": "Developer Tools",
    "capabilities": ["Install", "Configure", "Diagnose"],
    "websiteURL": "https://github.com/ITpandaffm/cxstatusline",
    "defaultPrompt": ["Set up cxstatusline and the cdx command."]
  }
}
```

Set marketplace `name` and `interface.displayName` to `cxstatusline` and keep one AVAILABLE plugin entry with `source.path` equal to `./plugins/cxstatusline`.

- [ ] **Step 3: Write temporary non-mutating workflows before the installer exists**

Each skill must say what it owns, require approval before mutations, resolve `../../scripts/manage.mjs` from its own plugin root, and use these future commands:

```text
node <plugin-root>/scripts/manage.mjs plan
node <plugin-root>/scripts/manage.mjs install --yes
node <plugin-root>/scripts/manage.mjs doctor
node <plugin-root>/scripts/manage.mjs uninstall --yes
```

- [ ] **Step 4: Validate the plugin**

```bash
python3 /Users/ffm/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/cxstatusline
```

Expected: validation succeeds with no unsupported manifest fields or incomplete tokens.

- [ ] **Step 5: Commit**

```bash
git add .agents/plugins/marketplace.json plugins/cxstatusline
git commit -m "feat: add cxstatusline Codex plugin marketplace"
```

---

### Task 2: Implement stable paths, platform assets, and checksum verification

**Files:**
- Create: `src/installer/paths.ts`
- Create: `src/installer/paths.test.ts`
- Create: `src/installer/checksum.ts`
- Create: `src/installer/checksum.test.ts`

**Interfaces:**
- Produces: `resolveInstallPaths(input): InstallPaths`, `adapterAssetName(platform, arch): string`, `parseChecksum(text): string`, and `verifySha256(bytes, expected): void`.

- [ ] **Step 1: Write failing path and asset tests**

```ts
test("uses stable Unix paths and the cdx launcher", () => {
  assert.deepEqual(resolveInstallPaths({ platform: "darwin", home: "/Users/test" }), {
    root: "/Users/test/.local/share/cxstatusline",
    adapter: "/Users/test/.local/share/cxstatusline/codex-cx",
    renderer: "/Users/test/.local/share/cxstatusline/renderer.mjs",
    manifest: "/Users/test/.local/share/cxstatusline/install.json",
    launcher: "/Users/test/.local/bin/cdx"
  });
});

test("maps supported release assets", () => {
  assert.equal(adapterAssetName("darwin", "arm64"), "codex-cx-darwin-arm64");
  assert.equal(adapterAssetName("linux", "x64"), "codex-cx-linux-x64");
  assert.equal(adapterAssetName("win32", "x64"), "codex-cx-windows-x64.exe");
  assert.throws(() => adapterAssetName("win32", "arm64"), /unsupported platform/);
});
```

- [ ] **Step 2: Run the tests and observe missing-module failures**

```bash
npm test
```

Expected: TypeScript compilation fails because the installer modules do not exist.

- [ ] **Step 3: Implement exact path and asset contracts**

Define `InstallPaths` with `root`, `adapter`, `renderer`, `manifest`, and `launcher`. Use `~/.local/share/cxstatusline` and `~/.local/bin/cdx` on Unix; use `%LOCALAPPDATA%/cxstatusline` and `%LOCALAPPDATA%/cxstatusline/bin/cdx.exe` on Windows. Throw for every platform/architecture pair outside the global constraints.

- [ ] **Step 4: Write failing checksum tests**

```ts
test("accepts a matching SHA-256 sidecar", () => {
  const bytes = Buffer.from("verified");
  const sum = createHash("sha256").update(bytes).digest("hex");
  assert.equal(parseChecksum(`${sum}  asset\n`), sum);
  assert.doesNotThrow(() => verifySha256(bytes, sum));
});

test("rejects malformed and mismatched checksums", () => {
  assert.throws(() => parseChecksum("not-a-checksum"), /invalid SHA-256/);
  assert.throws(() => verifySha256(Buffer.from("bad"), "0".repeat(64)), /checksum mismatch/);
});
```

- [ ] **Step 5: Implement checksum parsing with constant-time comparison**

Use `createHash("sha256")`, require exactly 64 hexadecimal characters, normalize to lowercase, and compare equal-length buffers with `timingSafeEqual`.

- [ ] **Step 6: Run tests and commit**

```bash
npm test
git add src/installer
git commit -m "feat: add installer platform and checksum core"
```

Expected: all renderer and installer tests pass.

---

### Task 3: Implement owned config and shell blocks

**Files:**
- Create: `src/installer/managed-block.ts`
- Create: `src/installer/managed-block.test.ts`
- Create: `src/installer/codex-config.ts`
- Create: `src/installer/codex-config.test.ts`
- Create: `src/installer/launcher.ts`
- Create: `src/installer/launcher.test.ts`

**Interfaces:**
- Produces: `upsertManagedBlock`, `removeManagedBlock`, `renderCodexBlock`, `createLauncher`, and `renderPathBlock`.

- [ ] **Step 1: Write failing managed-block tests**

Test insertion, replacement, removal, preservation of surrounding bytes, and rejection when the end marker is missing. Use markers `# BEGIN cxstatusline` and `# END cxstatusline`.

- [ ] **Step 2: Run the focused failing tests**

```bash
npm run build
node --test dist/installer/managed-block.test.js
```

Expected: FAIL because `managed-block.ts` is missing.

- [ ] **Step 3: Implement managed blocks**

`upsertManagedBlock(text, start, end, body)` must replace one complete owned block, append a new block with normalized surrounding newlines when absent, and throw for partial or duplicate markers. `removeManagedBlock` must return the original text unchanged when no markers exist.

- [ ] **Step 4: Write Codex config tests**

```ts
test("writes stable absolute renderer argv", () => {
  const block = renderCodexBlock("/usr/bin/node", "/Users/test/.local/share/cxstatusline/renderer.mjs");
  assert.match(block, /argv = \["\/usr\/bin\/node", "\/Users\/test\/\.local\/share\/cxstatusline\/renderer\.mjs", "render"\]/);
  assert.match(block, /max_lines = 3/);
});

test("rejects an unmanaged status command", () => {
  assert.throws(() => updateCodexConfig("[tui.status_line_command]\nargv=[]\n", "owned"), /unmanaged/);
});
```

- [ ] **Step 5: Implement TOML-safe strings and conflict detection**

Use JSON-compatible double-quoted strings for argv values. Detect a pre-existing section outside the owned block before insertion. Write refresh `1000`, timeout `300`, and maximum lines `3`.

- [ ] **Step 6: Write launcher collision and forwarding tests**

Create temporary directories. Verify a new Unix launcher contains `exec "<adapter>" "$@"`; verify mode `0755`; verify an unrelated existing `cdx` throws; verify an owned launcher recorded in `install.json` can be replaced.

- [ ] **Step 7: Implement launcher and PATH blocks**

Create Unix shell launchers atomically. On Windows copy the verified adapter to `cdx.exe`. Render shell-specific PATH blocks for Zsh/Bash, Fish, and PowerShell with distinct begin/end markers. Never edit a profile until the caller passes an explicit profile path and approval flag.

- [ ] **Step 8: Run tests and commit**

```bash
npm test
git add src/installer
git commit -m "feat: manage owned Codex config and cdx launcher"
```

---

### Task 4: Implement verified release installation, doctor, and uninstall

**Files:**
- Create: `src/installer/release.ts`
- Create: `src/installer/release.test.ts`
- Create: `src/installer/commands.ts`
- Create: `src/installer/commands.test.ts`
- Create: `src/install-cli.ts`

**Interfaces:**
- Consumes: Task 2 and 3 functions.
- Produces: `install(options)`, `doctor(options)`, `uninstall(options)`, and CLI commands `plan|install|doctor|uninstall`.

- [ ] **Step 1: Write failing release-client tests with an injected fetch function**

Use a local fake `FetchLike` returning release JSON, adapter bytes, renderer bytes, and checksum sidecars. Assert that missing assets, non-2xx responses, and mismatched checksums fail before filesystem writes.

- [ ] **Step 2: Implement the minimal release client**

Fetch `https://api.github.com/repos/ITpandaffm/cxstatusline/releases/latest`, select the current adapter asset plus `cxstatusline-renderer.mjs`, require both `.sha256` assets, and return verified buffers. Send only `Accept` and `User-Agent` headers; never accept or log authentication values.

- [ ] **Step 3: Write failing install transaction tests**

With temporary HOME and CODEX_HOME, assert that install creates verified files, ownership manifest, managed TOML, and `cdx`; a simulated second-write failure must preserve an existing verified adapter; an unmanaged config section or launcher collision must leave all files unchanged.

- [ ] **Step 4: Implement install as plan/preflight/commit phases**

Preflight every collision and download before mutation. Stage files under the install root, rename verified files into place, update owned text blocks atomically, then write `install.json` last. Include plugin version, upstream Codex commit, release tag, checksums, and owned paths.

- [ ] **Step 5: Write doctor and uninstall tests**

Doctor must return typed checks `{ id, status: "pass"|"warn"|"fail", detail }` without writes. Uninstall must remove only manifest-owned files and blocks, refuse ownership mismatches, and leave official Codex config content intact.

- [ ] **Step 6: Implement the command entry point**

Parse only these forms:

```text
manage.mjs plan [--json]
manage.mjs install --yes [--profile PATH]
manage.mjs doctor [--json]
manage.mjs uninstall --yes [--profile PATH]
```

Mutation commands without `--yes` exit 2 with an approval message. Doctor exits 1 only when at least one check has `fail` status.

- [ ] **Step 7: Run tests and commit**

```bash
npm test
git add src/install-cli.ts src/installer
git commit -m "feat: add verified setup doctor and uninstall commands"
```

---

### Task 5: Bundle plugin scripts and renderer deterministically

**Files:**
- Create: `src/renderer-entry.ts`
- Create: `scripts/build-plugin.mjs`
- Create: `scripts/check-generated.mjs`
- Create: `plugins/cxstatusline/scripts/manage.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `src/install-cli.ts` and current renderer modules.
- Produces: self-contained `plugins/cxstatusline/scripts/manage.mjs` and `release/cxstatusline-renderer.mjs`.

- [ ] **Step 1: Add esbuild and failing generated-artifact check**

```bash
npm install --save-dev esbuild
```

Add scripts:

```json
{
  "build:plugin": "node scripts/build-plugin.mjs",
  "check:generated": "node scripts/check-generated.mjs",
  "test": "npm run build && node --test dist/**/*.test.js && npm run build:plugin && npm run check:generated"
}
```

Run `npm run check:generated`; expected: FAIL because bundled artifacts do not exist.

- [ ] **Step 2: Implement renderer release entry**

The entry reads one JSON snapshot from stdin, loads config from `CXSTATUSLINE_CONFIG` or the normal path, calls `renderStatus`, and prints one structured JSON response plus newline. It accepts only the `render` argument.

- [ ] **Step 3: Implement reproducible esbuild output**

Bundle `src/install-cli.ts` for Node 20 ESM to `plugins/cxstatusline/scripts/manage.mjs`. Bundle `src/renderer-entry.ts` to `release/cxstatusline-renderer.mjs`. Disable source maps and timestamps. `check-generated.mjs` builds into a temporary directory and byte-compares the committed plugin bundle.

- [ ] **Step 4: Update CI and plugin skills**

CI runs `npm ci`, `npm test`, and the plugin validator. Replace Task 1 temporary skill text with exact plan/install/doctor/uninstall commands and approval boundaries.

- [ ] **Step 5: Verify a temporary plugin command**

```bash
HOME="$(mktemp -d)" CODEX_HOME="$(mktemp -d)" node plugins/cxstatusline/scripts/manage.mjs plan --json
```

Expected: valid JSON describing stable paths and no mutations.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts src/renderer-entry.ts plugins/cxstatusline .github/workflows/ci.yml
git commit -m "build: bundle plugin installer and renderer"
```

---

### Task 6: Build release assets from the pinned Codex revision

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `scripts/write-checksum.mjs`
- Modify: `docs/codex-adapter.md`

**Interfaces:**
- Produces: adapter assets named by Task 2 plus `.sha256`, and `cxstatusline-renderer.mjs` plus `.sha256`.

- [ ] **Step 1: Write the workflow with manual and tag triggers**

Use `workflow_dispatch` and tags `v*`. Pin upstream revision `d7ba5ff9553a6aa0898a8e3bd5cb3bc00d0c9ddf`. Each matrix job checks out that revision, applies `patches/codex-status-line-command.patch`, builds `codex-cli --release`, renames the binary to the deterministic asset name, and runs the checksum script.

- [ ] **Step 2: Add renderer and validation jobs**

The renderer job runs `npm ci`, `npm test`, bundles the renderer, writes its checksum, validates the plugin, and uploads artifacts. No npm publication occurs.

- [ ] **Step 3: Add release attachment with least privilege**

Grant `contents: write` only to the tag publication job. Download build artifacts and use `gh release create "$GITHUB_REF_NAME" ... --generate-notes`; workflow-dispatch builds upload Actions artifacts but do not publish a release.

- [ ] **Step 4: Validate workflow references and patch compatibility locally**

```bash
npm test
git apply --check patches/codex-status-line-command.patch
```

Run the patch check inside a clean checkout of the pinned Codex revision. Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml scripts/write-checksum.mjs docs/codex-adapter.md
git commit -m "ci: build verified cxstatusline release assets"
```

---

### Task 7: Document and verify the public workflow

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Test: all existing and new tests

**Interfaces:**
- Consumes: all previous commands and asset names.
- Produces: plugin-first public quickstart and contributor fallback.

- [ ] **Step 1: Rewrite the README quickstart**

Start with:

```bash
codex plugin marketplace add ITpandaffm/cxstatusline
codex plugin add cxstatusline@cxstatusline
codex
```

Tell users to run `cxstatusline:setup` in a new thread, then use `cdx`. Explain that `codex` remains official, list update/doctor/uninstall prompts, and retain source-build instructions as an advanced fallback.

- [ ] **Step 2: Finalize npm metadata**

Set version `0.2.0`, repository, homepage, bugs URL, `prepack`, and include `plugins`, `.agents`, `docs`, `patches`, and generated release renderer where appropriate.

- [ ] **Step 3: Run the complete verification suite**

```bash
npm ci
npm run check
npm test
npm pack --dry-run
python3 /Users/ffm/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/cxstatusline
git diff --check
```

Expected: zero test failures, zero type errors, plugin validation success, no whitespace errors, and package contents matching README claims.

- [ ] **Step 4: Inspect repository state and commit**

```bash
git status --short
git diff --stat
git add README.md package.json package-lock.json
git commit -m "docs: publish plugin-first cdx quickstart"
```

- [ ] **Step 5: Push and inspect CI**

```bash
git push origin main
gh run list --limit 5
```

Expected: the main CI workflow completes successfully. Do not create a version tag until a manual release build has produced and verified every promised platform asset.
