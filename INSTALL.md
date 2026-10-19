# Installing steno

Steno needs Node.js 18+ for its hooks. The skills themselves are plain text.

## Claude Code: plugin (recommended)

From a clone of this repository:

```
/plugin marketplace add /path/to/steno
/plugin install steno@steno
```

For a private GitHub repository, use the `owner/repo` form instead of a path
once your GitHub account can read it. Start a new session afterwards. The
plugin registers three hooks:

| Hook | Script | Job |
|---|---|---|
| SessionStart | `src/hooks/steno-activate.js` | resolve mode, inject ruleset |
| SubagentStart | `steno-activate.js --subagent` | give subagents the same ruleset |
| UserPromptSubmit | `src/hooks/steno-mode-tracker.js` | mode switches, `/steno status`, per-turn reminder |

## Claude Code: standalone (no marketplace)

```bash
bash install.sh                 # hooks + skills into ~/.claude
bash install.sh --statusline    # also the [STENO] badge, if no statusline is set
bash install.sh --dry-run       # show what would change
bash install.sh --uninstall     # remove everything it added
```

Windows: `powershell -ExecutionPolicy Bypass -File install.ps1` with the same
flags. The installer backs up `settings.json` before writing and is idempotent.

### Chaining the statusline badge

If you already have a statusline command, append the badge to it:

```bash
your-statusline-command; node ~/.claude/steno/hooks/steno-statusline.js
```

## Codex

This repository ships `.codex/hooks.json` and `.codex/config.toml`
(`hooks = true`). Inside the repo, Codex loads the ruleset at session start.
To use steno in another project, copy `.codex/` there and point the hook
command at your steno clone's `.codex/codex-sessionstart.js`.

## Cursor

The `.cursor-plugin/` manifest exposes the skills and a session-start hook
(`hooks/hooks-cursor.json`).

## Gemini CLI

`gemini-extension.json` loads `GEMINI.md`, which imports the skill files.
`commands/steno.toml` and `commands/ultrasteno.toml` add the slash commands.

## Configuration

Default mode, first match wins:

1. `STENO_DEFAULT_MODE` environment variable
2. `.steno.json` or `.steno/config.json` in the project (searched upward)
3. `~/.config/steno/config.json` (`%APPDATA%\steno\config.json` on Windows)
4. `manual`: off until you type `/steno`

Steno is off by default because the evals found no thinking-token saving on
Claude 5.5 models (see [docs/HONEST-NUMBERS.md](docs/HONEST-NUMBERS.md)).
To start every session in steno:

```json
{ "defaultMode": "auto" }
```

| Value | Meaning |
|---|---|
| `auto` | strict `steno` on Haiku, `lite` on other or unknown models |
| `lite` | light mode everywhere |
| `steno` / `strict` | strict mode everywhere (declined by Sonnet 5.5 / Opus 5.5) |
| `ultrasteno` / `ultra` | strictest mode (same caveat) |
| `manual` (default) | start off; `/steno` turns it on |
| `off` | never on |

## Commands

```
/steno            auto: strict on Haiku, lite elsewhere
/steno lite       light mode
/steno strict     strict mode
/steno ultra      ultrasteno (also /ultrasteno)
/steno status     show the mode, change nothing
/steno off        off (also "stop steno", "normal mode")
```
