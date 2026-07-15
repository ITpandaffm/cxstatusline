# README problem-and-solution design

## Goal

Make the value of cxstatusline immediately clear to a new GitHub visitor: Codex's built-in footer is
limited to one line, so useful status information is truncated in narrow or side-by-side terminal
windows; cxstatusline replaces that constrained presentation with a readable, configurable
multi-line footer.

## Scope

Update only the public README presentation and add the two supplied screenshots as repository
assets. Preserve the current plugin installation, `cdx` command, adapter explanation, security
model, contributor workflow, and licensing content.

## README structure

Keep the README in English. Directly below the title:

1. State the one-line truncation problem in plain language.
2. Show the supplied built-in Codex screenshot under a clear "Before" caption.
3. Explain that cxstatusline keeps model, reasoning, context, project, Git, and usage information
   visible across multiple lines.
4. Show the supplied cxstatusline screenshot under a clear "After" caption.
5. Note that the experience is comparable to
   [ccstatusline](https://github.com/sirmalloc/ccstatusline) for Claude Code, while cxstatusline is
   built for OpenAI Codex CLI.
6. Continue into the existing command-separation and installation documentation.

The screenshots should be stacked vertically rather than placed in a two-column table. This keeps
terminal text legible on GitHub at both desktop and mobile widths.

## Assets

Store the screenshots in `docs/images/` with descriptive, stable names:

- `codex-built-in-footer.png`
- `cxstatusline-multiline-footer.png`

Use relative Markdown image links so the images render on GitHub and in repository clones.

## Accuracy constraints

- Describe the limitation as a one-line built-in footer that truncates content when horizontal
  space is constrained; do not claim that opening multiple terminals itself changes Codex.
- Describe cxstatusline as a plugin-managed adapter and multi-line renderer, consistent with the
  existing installation documentation.
- Link the comparison project by its verified repository URL:
  `https://github.com/sirmalloc/ccstatusline`.
- Do not imply affiliation with or endorsement by ccstatusline.

## Verification

- Confirm both image paths exist and are tracked by Git.
- Check all local Markdown links and image references.
- Inspect the README diff for accidental changes to the existing installation and security text.
- Run the repository's normal documentation-safe validation (`npm test`) before completion.
