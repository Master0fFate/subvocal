# Installing subvocal

The per-host walkthroughs live in [README.md](README.md#install). This file
keeps the details that do not fit there.

Subvocal needs Node.js 18+ for its hooks. The instruction itself is plain text.

## Claude Code

Plugin (recommended), one step on Claude Code 2.1.275 or newer:

```
/plugin install subvocal --marketplace Master0fFate/subvocal
```

Older versions, or from a local clone (relative paths must start with `./`):

```
/plugin marketplace add Master0fFate/subvocal      # or ./subvocal
/plugin install subvocal@subvocal
```

Standalone, without the marketplace:

```bash
npx subvocal                                    # no clone needed
bash install.sh                                 # from a clone
powershell -ExecutionPolicy Bypass -File install.ps1
```

`--dry-run` shows what would change, `--statusline` adds the `[SUBVOCAL]`
badge when no statusline is set, `--uninstall` removes everything. The
installer backs up `settings.json` before writing and is idempotent. It
touches, under `$CLAUDE_CONFIG_DIR` (default `~/.claude`):

| Path | Content |
|---|---|
| `subvocal/hooks/*.js` | the hook scripts |
| `subvocal/skills/*/SKILL.md`, `skills/<name>/SKILL.md` | the two mode texts, so the slash commands work |
| `settings.json` | three hook entries, plus `statusLine` if asked |

The plugin and the installer register the same hooks:

| Hook | Script | Job |
|---|---|---|
| SessionStart | `src/hooks/subvocal-activate.js` | resolve mode, inject the instruction |
| SubagentStart | `subvocal-activate.js --subagent` | give subagents the same instruction |
| UserPromptSubmit | `src/hooks/subvocal-mode-tracker.js` | `/subvocal` mode switches and `/subvocal status`; silent otherwise |

Chaining the statusline badge after an existing statusline command:

```bash
your-statusline-command; node ~/.claude/subvocal/hooks/subvocal-statusline.js
```

## Rule-file block (no hooks)

```bash
npx subvocal --init               # in the repository you work in
npx subvocal --init --uninstall   # remove it again
```

Writes the instruction between `<!-- subvocal:begin -->` and
`<!-- subvocal:end -->` markers into `AGENTS.md` (created if missing) and into
`CLAUDE.md` and `.github/copilot-instructions.md` when those files already
exist. Everything else in those files is left alone. This is the path for
OpenCode, Copilot in VS Code, Windsurf, Cline, or any host that reads
`AGENTS.md` and has no session hook. The block carries the default
mode's sentence.

## Other hosts with hooks

All of these run one `SessionStart` hook, `src/hooks/subvocal-host-session-start.js`,
which prints the instruction for the configured default mode. There is no
prompt hook, so switch mid-session by asking the model ("subvocal off").

| Host | Shipped config | Hook output |
|---|---|---|
| Codex CLI | `.codex/hooks.json`, `.codex/config.toml` | plain text |
| Cursor | `.cursor-plugin/plugin.json`, `hooks/hooks-cursor.json` | `{"additional_context": ...}` |
| Copilot CLI | `.github/hooks/subvocal.json` | `{"additionalContext": ...}` |
| Gemini CLI | `gemini-extension.json`, `GEMINI.md`, `commands/*.toml` | context file, no hook |

Codex only runs project hooks from a trusted `.codex/` layer; approve them with
`/hooks` inside Codex. Cursor local plugins go in `~/.cursor/plugins/local/`.
Copilot user-wide hooks go in `~/.copilot/hooks/`.

## Configuration

Default mode, first match wins:

1. `SUBVOCAL_DEFAULT_MODE` environment variable
2. `.subvocal.json` or `.subvocal/config.json` in the project (searched upward)
3. `~/.config/subvocal/config.json` (`%APPDATA%\subvocal\config.json` on Windows)
4. `auto`: `subvocal` on every model

To start sessions off instead:

```json
{ "defaultMode": "manual" }
```

| Value | Meaning |
|---|---|
| `auto` (default) | `subvocal` on every model |
| `subvocal` | same, explicitly (`lite` works as an alias) |
| `ultrasubvocal` / `ultra` | the aggressive mode on every model |
| `manual` | start off; `/subvocal` turns it on |
| `off` | never on |

## Commands

```
/subvocal            default mode (also /subvocal lite, kept as an alias)
/subvocal ultra      aggressive mode (also /ultrasubvocal)
/subvocal status     show the mode, change nothing
/subvocal off        off (also "stop subvocal", "normal mode")
```
