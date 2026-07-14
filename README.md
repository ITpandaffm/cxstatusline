# cxstatusline

`cxstatusline` adds a safe, configurable multi-line statusline to OpenAI Codex CLI.

```text
Model: GPT-5.4  Reasoning: high  working  Context: 79%
Project: cxstatusline  Git: main  dirty  5h: 88%  Week: 64%
```

The project keeps the two commands intentionally separate:

```text
codex    official OpenAI Codex
cdx      Codex with the cxstatusline adapter
```

Official `codex` is never overwritten or aliased.

Requirements: Node.js 20 or newer and an existing official Codex CLI installation. Release
adapters support macOS (Apple Silicon and Intel), Windows x64, and Linux x64/ARM64 with an Ubuntu
22.04 / glibc 2.35 compatibility baseline.

## Install from the Codex marketplace

Add this repository as a marketplace and install the plugin:

```bash
codex plugin marketplace add ITpandaffm/cxstatusline
codex plugin add cxstatusline@cxstatusline
codex
```

Start a new Codex thread and ask:

```text
Use cxstatusline:setup to install and configure the multi-line statusline.
```

The setup skill first shows a read-only plan. After approval, it:

- detects the operating system and CPU;
- downloads the matching `codex-cx` adapter and renderer from GitHub Releases;
- verifies both SHA-256 checksums before writing them;
- adds only a marker-delimited block to Codex config;
- creates the short `cdx` launcher without replacing `codex`;
- offers an owned PATH block when the launcher directory is not already available;
- runs read-only diagnostics.

Open a new shell when setup asks, then use:

```bash
cdx
cdx .
cdx resume
```

All Codex arguments are forwarded unchanged. `cdx` uses the existing Codex home and authentication
at runtime; setup does not copy credentials or sessions.

## Doctor, update, and uninstall

In a new official Codex thread, ask:

```text
Use cxstatusline:doctor to diagnose my installation.
```

To update the plugin and installed adapter:

```bash
codex plugin marketplace upgrade cxstatusline
codex plugin add cxstatusline@cxstatusline
codex
```

Then ask:

```text
Use cxstatusline:setup to update cxstatusline.
```

To uninstall safely, ask:

```text
Use cxstatusline:uninstall to remove cxstatusline.
```

Uninstall removes only files and config/profile blocks recorded as owned by cxstatusline. It leaves
official Codex, authentication, sessions, and unrelated configuration intact.

## Why an adapter is currently required

Released Codex versions expose built-in single-line footer items but do not yet expose a plugin API
for external multi-line TUI rendering. The Codex plugin is therefore the trusted setup and update
surface, while `cdx` launches a separately built Codex adapter containing the repository patch.

The adapter:

- invokes the renderer directly without a shell;
- sends a bounded, versioned status snapshot instead of conversation text;
- applies strict timeout, byte, line, and style limits;
- keeps the last successful result if a refresh fails;
- preserves the official Codex installation as `codex`.

See [`docs/codex-adapter.md`](docs/codex-adapter.md) and
[`docs/protocol.md`](docs/protocol.md).

## Renderer configuration

The default layout uses two lines. Its JSON config lives at:

```text
~/.config/cxstatusline/config.json
```

Set `CXSTATUSLINE_CONFIG` to use another file. Advanced users can generate the default config with
the npm CLI:

```bash
npm install --global cxstatusline
cxstatusline init
```

## Contributor quickstart

```bash
npm install
npm test
npm run validate:plugin
node dist/cli.js demo --format ansi
```

The committed Plugin and renderer bundles must be reproducible:

```bash
npm run build:plugin
npm run check:generated
```

## Build the patched adapter manually

The patch currently targets OpenAI Codex revision
`d7ba5ff9553a6aa0898a8e3bd5cb3bc00d0c9ddf`.

```bash
git clone https://github.com/openai/codex.git
cd codex
git checkout d7ba5ff9553a6aa0898a8e3bd5cb3bc00d0c9ddf
git apply /path/to/cxstatusline/patches/codex-status-line-command.patch
cd codex-rs
cargo build --release -p codex-cli --bin codex
```

The upstream-facing patch is Apache-2.0 compatible with OpenAI Codex. The cxstatusline renderer,
installer, and plugin are MIT licensed.

## Security model

- Plugin installation alone does not execute lifecycle scripts or hooks.
- Setup requires approval before network or filesystem mutations.
- Downloads fail closed when assets or checksums are missing.
- `SessionStart` is not used for installation.
- Existing `cdx` commands and unmanaged status-command config are never overwritten.
- The renderer accepts structured status data and emits allowlisted styled spans.

## License

MIT
