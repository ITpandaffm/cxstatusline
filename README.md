# cxstatusline

`cxstatusline` is a safe, multi-line statusline renderer for OpenAI Codex CLI.

> Project status: early MVP. The renderer and versioned protocol work today. Official Codex does
> not yet execute external statusline commands, so the companion Codex TUI patch is still required.

## Goals

- Two or more independently configurable status lines.
- Model, reasoning, context, rate limits, workspace, Git, session, and token widgets.
- Structured style output instead of arbitrary terminal control sequences.
- Width-aware truncation.
- Cross-platform behavior on macOS, Linux, and Windows.
- An interactive configuration UI in a later milestone.

## Try the renderer

```bash
npm install
npm run build
node dist/cli.js demo --format ansi
```

Or pipe a status snapshot:

```bash
node dist/cli.js render --format ansi < examples/session.json
```

The default integration format is structured JSON:

```bash
node dist/cli.js render < examples/session.json
```

## Protocol

Codex sends a versioned status snapshot on stdin. The renderer returns safe styled spans:

```json
{
  "schema_version": 1,
  "lines": [
    {
      "spans": [
        { "text": "Model: GPT-5.4", "style": { "fg": "cyan", "bold": true } }
      ]
    }
  ]
}
```

The Codex adapter should cap output at five lines, apply a strict timeout, cache the last successful
render, and reject unsupported styles or oversized payloads.

The complete v1 contract is documented in [`docs/protocol.md`](docs/protocol.md).

## Configuration

Run `cxstatusline init` to write the default configuration to:

```text
~/.config/cxstatusline/config.json
```

Set `CXSTATUSLINE_CONFIG` or pass `--config` to use another file.

## Codex integration proposal

```toml
[tui.status_line_command]
argv = ["cxstatusline", "render"]
refresh_interval_ms = 1000
timeout_ms = 300
max_lines = 3
```

## Try it with a patched Codex build

The repository includes [`patches/codex-status-line-command.patch`](patches/codex-status-line-command.patch),
currently based on OpenAI Codex commit `d7ba5ff9553a6aa0898a8e3bd5cb3bc00d0c9ddf`.

```bash
# Build and expose the renderer.
npm install
npm run build
npm link

# In a clean openai/codex checkout at the compatible commit:
git apply /path/to/cxstatusline/patches/codex-status-line-command.patch
cd codex-rs
cargo build --release -p codex-cli
```

Add the TOML block above to `~/.codex/config.toml`, then run the patched `codex` binary. The patch
is an experimental adapter for development and upstream discussion; it does not modify a released
Codex installation automatically.

The upstream-facing Codex change will be kept separate and licensed under Apache-2.0, matching the
OpenAI Codex repository. This renderer is MIT licensed.

Adapter design and current compatibility are tracked in
[`docs/codex-adapter.md`](docs/codex-adapter.md).

## Security model

- External rendering is disabled unless explicitly configured.
- The renderer receives a bounded status snapshot, never conversation text.
- Structured spans prevent arbitrary ANSI/OSC injection.
- The adapter must enforce timeout, line, byte, and style allowlists.

## License

MIT
