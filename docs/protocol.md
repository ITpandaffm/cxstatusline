# Renderer protocol v1

`cxstatusline render` reads one UTF-8 JSON object from stdin and writes one UTF-8 JSON object to
stdout. Diagnostics go to stderr. A successful render exits with status 0.

## Input

The root object has `schema_version: 1`. Current optional sections are `session`, `model`,
`workspace`, `runtime`, `context`, `rate_limits`, `usage`, and `terminal`. Unknown input fields are
ignored so Codex can add metadata without breaking older renderers.

Conversation messages, prompts, tool input, and tool output are deliberately excluded.

## Output

```json
{
  "schema_version": 1,
  "lines": [
    {
      "spans": [
        {
          "text": "Model: GPT-5.4",
          "style": { "fg": "cyan", "bold": true }
        }
      ]
    }
  ]
}
```

Allowed colors are `default`, `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, and
`white`. Styles support `fg`, `bg`, `bold`, and `dim`. The adapter, not the renderer, is the final
authority for line, byte, timeout, text, and style limits.

The `--format ansi` option is only a local preview format. Codex integration uses JSON.
