# Contributing

Thanks for helping make Codex status information readable in narrow terminals.

## Development

```bash
npm install
npm test
```

Keep the renderer deterministic: it must only use the JSON snapshot, configuration, and terminal
width supplied to it. New protocol fields must be optional within the current schema version.

## Pull requests

- Add tests for renderer behavior and width handling.
- Do not emit raw ANSI in JSON mode; styles must use the protocol allowlist.
- Keep conversation content, prompts, and tool output out of the status snapshot.
- Describe any protocol compatibility impact in the pull request.

The standalone renderer is MIT licensed. Patches copied into the OpenAI Codex repository must use
that repository's Apache-2.0 license.
