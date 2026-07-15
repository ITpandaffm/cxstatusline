# cxstatusline v0.2 distribution design

## Objective

Make cxstatusline install like a Codex plugin while still delivering the patched TUI capability
needed for a multi-line footer. Installation must preserve the official `codex` executable, must
not read or copy Codex credentials, and must give users a shorter daily command than `codex-cx`.

## Product boundary

Codex plugins can package skills, scripts, hooks, MCP configuration, apps, and assets, but they do
not currently provide a TUI status-line extension point. The plugin is therefore the trusted setup
and update surface; the multi-line footer still runs in a separately installed patched adapter.

The public command model is:

```text
codex    official OpenAI Codex
cdx      Codex with the cxstatusline adapter
```

`codex-cx` remains an implementation and troubleshooting name. It is not the primary command in
user documentation.

## User experience

### First installation

The project repository is also a Codex marketplace. A user runs:

```text
codex plugin marketplace add ITpandaffm/cxstatusline
codex plugin add cxstatusline@cxstatusline
codex
```

In a new Codex session, the user asks:

```text
Use cxstatusline:setup to install and configure the multi-line statusline.
```

The setup skill explains the changes, requests approval for filesystem and network actions, detects
the operating system and CPU, downloads and verifies the adapter, installs the renderer, writes the
managed Codex configuration, creates the `cdx` launcher, and runs diagnostics.

The normal daily command is then:

```text
cdx
```

All arguments pass through unchanged, including `cdx .`, `cdx resume`, and model or config flags.

### Updates and uninstall

Users refresh the marketplace and reinstall the plugin with Codex's plugin commands, start a new
thread, and run `cxstatusline:setup` again. Setup is idempotent: it upgrades owned files and replaces
only managed configuration blocks.

The plugin also provides an uninstall workflow. It removes the adapter, renderer, `cdx` launcher,
and cxstatusline-managed config and shell blocks. It does not remove official Codex, credentials,
sessions, or unrelated user configuration.

## Components

### Marketplace and plugin

The repository contains `.agents/plugins/marketplace.json` and `plugins/cxstatusline/`. The plugin
manifest advertises the setup, doctor, update, and uninstall workflows. Deterministic scripts live
inside the plugin; skills explain the changes and invoke those scripts only after user approval.

Plugin installation itself performs no hidden lifecycle mutation. In particular, cxstatusline does
not use a `SessionStart` hook as an installer. That avoids hook trust surprises and prevents a
missing command from producing repeated exit-code-127 startup errors.

### Stable installation directory

Versioned release files are installed behind a stable, user-owned directory:

```text
Unix:   ~/.local/share/cxstatusline/
Windows: %LOCALAPPDATA%\cxstatusline\
```

This directory contains the patched adapter, renderer, release metadata, and last verified
checksums. Plugin cache paths are never written into Codex configuration because those paths change
when a plugin is upgraded.

The TypeScript renderer can still be published to npm for contributors, CI, and advanced manual
installation, but a normal plugin user does not need a global npm install.

### Short launcher

Setup creates a real executable launcher named `cdx`; it does not rely only on a shell alias. A real
launcher works across interactive shells and scripts and forwards exit codes, signals, environment,
and arguments to the adapter.

On Unix the launcher lives in `~/.local/bin/cdx`. On Windows it lives in a user-local bin directory
as `cdx.exe` or `cdx.cmd`. Before writing, setup resolves the existing `cdx` command. If another
program owns that name, setup stops and offers to keep `codex-cx` or use another explicit name; it
never overwrites the collision.

If the launcher directory is not on `PATH`, setup offers to add a marker-delimited block to the
correct startup configuration for Zsh, Bash, Fish, or PowerShell. It does not assume
`.bash_profile`, and it does not edit a shell file without approval. The doctor command reports when
a new shell session is required.

### Codex configuration manager

The manager edits only a marker-delimited block in `$CODEX_HOME/config.toml` or
`~/.codex/config.toml`:

```toml
# BEGIN cxstatusline
[tui.status_line_command]
...
# END cxstatusline
```

The renderer command uses stable absolute paths rather than shell expansion. An existing managed
block is replaced atomically. If an unmanaged `[tui.status_line_command]` section already exists,
setup stops with an actionable error instead of creating invalid duplicate TOML. All other user
configuration remains unchanged.

### Adapter installer

The installer downloads raw GitHub Release assets from `ITpandaffm/cxstatusline`:

```text
codex-cx-darwin-arm64
codex-cx-darwin-x64
codex-cx-linux-arm64
codex-cx-linux-x64
codex-cx-windows-x64.exe
```

Every binary has a same-name `.sha256` sidecar. The installer fails closed when the platform is
unsupported, an asset or checksum is absent, or verification fails. It writes through a temporary
file, sets executable permissions on Unix, and never replaces the official `codex` command.

### Doctor

The doctor workflow is read-only. It checks plugin version, platform support, release metadata,
checksums, renderer config, managed Codex config, adapter execution, `cdx` resolution, PATH, and the
official Codex version. It uses pass, warning, and failure states and exits non-zero only when a
condition prevents `cdx` from working.

### Release automation

A tag-triggered GitHub Actions workflow checks out the pinned compatible OpenAI Codex revision,
applies the repository patch, builds supported targets, generates checksums, validates the plugin
and marketplace, builds the renderer, and attaches all artifacts to a GitHub Release. npm publishing
remains a separate opt-in step until the repository owner configures trusted publishing or a token.

## Error handling and rollback

Network and GitHub API failures include the URL and HTTP status but never print authorization
headers. A failed download or checksum verification leaves the previous verified installation
active. Configuration writes use temporary files and atomic replacement where supported.

Setup records only files and managed blocks it owns. If a later step fails, it removes newly created
temporary artifacts and preserves the last working adapter. Uninstall uses that ownership record so
it cannot delete unrelated launchers, PATH entries, or config sections.

## Security and compatibility

- Plugin installation alone does not execute setup scripts or hooks.
- Setup makes network and filesystem mutations only after approval.
- The adapter is installed beside, not over, official Codex.
- `cdx` uses the user's existing Codex home at runtime; no credentials are copied.
- The renderer receives bounded protocol-v1 status data, not conversation text.
- Release downloads require SHA-256 verification.
- Release metadata records the exact upstream Codex commit used by the patch.
- Node 20 or newer is required for the renderer and setup scripts.

## Testing and acceptance

Unit tests cover managed configuration, plugin-cache-independent paths, platform asset mapping,
checksum rejection, launcher argument forwarding, command-name collision, PATH-block ownership,
idempotent updates, and uninstall ownership. CLI tests use temporary HOME, CODEX_HOME, and shell
profile files and never modify the developer's real environment.

The release is ready when:

1. Renderer and installer tests and type checks pass locally.
2. Plugin and marketplace manifests pass the Codex plugin validator.
3. Package dry runs contain the plugin, CLI, README, license, protocol docs, and adapter patch.
4. Workflow-dispatch builds produce correctly named adapter assets and checksums.
5. A temporary-home installation makes `cdx --version` work and doctor reports a healthy setup.
6. Collision and failed-checksum tests prove that existing commands and working installations are
   preserved.
7. README quickstart starts with plugin installation, uses `cdx` for daily work, and documents
   update, doctor, manual fallback, and uninstall flows.

## Out of scope for v0.2

The release does not add an interactive layout editor, automatic hook-based installation,
self-update daemon, Homebrew formula, Windows ARM build, arbitrary TOML migration, automatic npm
publication, or replacement of the official `codex` command.
