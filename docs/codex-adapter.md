# Codex adapter

Released Codex CLI versions currently model the footer status value as one Ratatui `Line` and do
not execute a status renderer command. The adapter therefore has two responsibilities:

1. extend the footer state to hold multiple lines while preserving the last row for Codex's
   built-in right-side indicators;
2. run an explicitly configured renderer asynchronously and parse its structured JSON response.

Proposed configuration:

```toml
[tui.status_line_command]
argv = ["/absolute/path/to/node", "/home/user/.local/share/cxstatusline/renderer.mjs", "render"]
refresh_interval_ms = 1000
timeout_ms = 300
max_lines = 3
```

The command must be invoked directly from `argv`, without a shell. The adapter sends a bounded v1
snapshot to stdin, caps stdout, rejects control characters, limits output to five lines, and keeps
the last successful result when a refresh fails. Execution never blocks terminal input or drawing.

Until this support is accepted by Codex upstream, users need a patched Codex build. Release builds
are exposed as the separate `codex-cx` adapter and launched through the short `cdx` command; they
never overwrite official `codex`. The current patch is pinned to OpenAI Codex revision
`d7ba5ff9553a6aa0898a8e3bd5cb3bc00d0c9ddf`.

GitHub Actions builds native assets for macOS arm64/x64, Linux arm64/x64, and Windows x64. Every
adapter and the bundled renderer has a same-name `.sha256` sidecar. The setup workflow downloads
both sidecars and rejects an installation before writing files when verification fails.

The adapter patch is Apache-2.0 licensed to remain compatible with OpenAI Codex.
