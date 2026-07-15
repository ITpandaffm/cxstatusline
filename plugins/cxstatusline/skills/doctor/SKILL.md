---
name: doctor
description: Diagnose an existing cxstatusline and cdx installation without changing user files.
---

# Diagnose cxstatusline

Resolve the plugin root from this skill's location, then run:

```bash
node <plugin-root>/scripts/manage.mjs doctor
```

The doctor command is read-only. Summarize pass, warning, and failure results, and give exact
recovery steps for failures. Do not modify Codex config, shell profiles, installed binaries, or
credentials.
