# Security policy

Please report vulnerabilities privately through GitHub's security advisory feature once the
repository is public. Do not open a public issue for command execution or terminal escape bugs.

The trust boundary is intentionally small:

- the configured renderer command is opt-in;
- input is bounded metadata and never includes conversation text;
- output is parsed as JSON and limited to known text styles;
- the Codex adapter enforces time, byte, and line limits;
- raw ANSI and OSC control sequences are not accepted by the adapter.
