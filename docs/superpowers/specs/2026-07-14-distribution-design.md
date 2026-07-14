# cxstatusline v0.2 distribution design

## Objective

Make the project usable by someone who discovers it on GitHub without asking them to patch or
compile OpenAI Codex manually. Installation must preserve the official `codex` executable and must
not read, copy, or modify Codex credentials.

## User experience

The renderer is distributed as the `cxstatusline` npm package. The patched Codex adapter is
distributed as a separate executable named `codex-cx` through GitHub Releases.

The normal setup is:

```text
npm install --global cxstatusline
cxstatusline install
cxstatusline doctor
codex-cx
```

`cxstatusline install` downloads the adapter for the current operating system and CPU, verifies its
SHA-256 checksum, installs it under the user's local binary directory, creates the renderer config
only when missing, and adds a managed integration block to Codex's `config.toml`.

`cxstatusline init --codex` performs only the configuration part for users who installed the
adapter another way. `cxstatusline doctor` reports Node, renderer config, adapter, Codex integration,
and PATH status without changing anything.

## Components

### Renderer package

The existing TypeScript renderer remains independent from the adapter. Its command path is written
to Codex configuration as an absolute Node executable plus an absolute JavaScript entry point, so
the integration does not depend on shell expansion or npm's global bin directory at runtime.

`init` becomes non-destructive: it refuses to overwrite an existing renderer config unless
`--force` is supplied.

### Codex configuration manager

The manager edits only a marker-delimited block:

```toml
# BEGIN cxstatusline
[tui.status_line_command]
...
# END cxstatusline
```

An existing managed block is replaced atomically. If an unmanaged
`[tui.status_line_command]` section already exists, the command stops with an actionable error
instead of creating invalid duplicate TOML. All other user configuration remains byte-for-byte
unchanged.

The config path is `$CODEX_HOME/config.toml` when `CODEX_HOME` is set and
`~/.codex/config.toml` otherwise.

### Adapter installer

The installer uses the GitHub Releases API for `ITpandaffm/cxstatusline`. Release asset names are
deterministic:

```text
codex-cx-darwin-arm64
codex-cx-darwin-x64
codex-cx-linux-arm64
codex-cx-linux-x64
codex-cx-windows-x64.exe
```

Every binary has a same-name `.sha256` sidecar. The installer fails closed when the platform is
unsupported, a checksum is absent, or verification fails. It writes through a temporary file,
sets executable permissions on Unix, and never overwrites the official `codex` command.

### Release automation

A tag-triggered GitHub Actions workflow checks out the pinned compatible OpenAI Codex revision,
applies the repository patch, builds supported targets, creates checksums, and attaches artifacts to
the GitHub Release. The workflow also builds and packs the npm package. Publishing to npm remains a
separate opt-in step until the repository owner configures npm trusted publishing or an npm token.

## Error handling

Network and GitHub API failures include the URL and HTTP status but never print authorization
headers. Configuration errors explain the exact file that was left unchanged. A failed adapter
download or checksum verification leaves no executable at the destination. `doctor` uses distinct
pass, warning, and failure states and exits non-zero only for conditions that prevent `codex-cx`
from rendering the statusline.

## Security and compatibility

- The adapter is installed beside, not over, official Codex.
- The renderer receives the bounded status snapshot defined by protocol v1, not conversation text.
- No authentication files or environment secrets are copied into release artifacts.
- Downloads require SHA-256 verification.
- The adapter records the exact upstream Codex commit used by the patch.
- Node 20 or newer is required for the renderer and installer.

## Testing and acceptance

Unit tests cover non-destructive config creation, managed-block replacement, unmanaged-section
conflicts, platform-to-asset mapping, and checksum rejection. CLI tests use temporary HOME and
CODEX_HOME directories and never modify the developer's real configuration.

The release is ready when:

1. `npm test` and `npm run check` pass locally.
2. `npm pack --dry-run` contains the CLI, README, license, protocol docs, and adapter patch.
3. A workflow-dispatch build produces correctly named adapter artifacts and checksums.
4. Installing into a temporary directory followed by `doctor` identifies the adapter and managed
   configuration.
5. The README clearly distinguishes official `codex` from patched `codex-cx` and documents manual
   uninstall steps.

## Out of scope for v0.2

The release does not add an interactive layout editor, self-update daemon, Homebrew formula,
Windows ARM build, automatic migration of arbitrary TOML sections, or automatic npm publication.
Those can be added after the first reproducible release is proven.
