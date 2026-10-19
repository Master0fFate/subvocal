# steno

> Think in steno. Reply in prose.

Steno compresses how a model **writes down its reasoning**, not how much it
reasons and not what it tells you. Reasoning lines become a measured code/math
shorthand: one fact per line, aliases for repeated terms, and only operators
that a real tokenizer says are cheap. The reply stays normal prose in your
language.

Caveman shortens the *answer*. Steno targets the *thinking*.

**Status: experimental.** The measured lexicon, the plugin and the eval
harness work. The central claim, fewer thinking tokens at equal accuracy, did
**not** hold on Claude 5.5 models: strict steno made Haiku 5.5 think 36%
*more*. Read [Honest numbers](#honest-numbers) before installing it for
savings.

## Tokens, not characters

Every symbol in the dialect was measured with Claude's tokenizer. Most "short"
math symbols are traps:

| Looks short | Tokens | Steno writes | Tokens |
|---|---|---|---|
| `∴` therefore | 4 | `→` | 1 |
| `≠` | 4 | `!=` | 1 |
| `≥` | 4 | `>=` | 2 |
| `✓` / `✗` | 4 | `true` / `false` | 1 |
| `->` | 2 | `→` | 1 |
| alias `C1` | 3 | alias `C` | 1 |
| "which means that" | 3 | `→` | 1 |
| "hold on, that's wrong" | 8 | `!: <fix>` | 1 |

The same sentences cost 47 to 97% more tokens in Croatian, German and Spanish
than in English, so steno reasons in English and answers in your language.

The whole lexicon (45 forms, 36 banned symbols) is generated from
`lexicon/measured.json` by `scripts/build_lexicon.py`; nothing in it is a guess.

## What a steno trace looks like

Prompt: *"Jobs in our retry queue sometimes get dropped after one failure.
Code is in src/pay/retryQueue.ts."*

```
find: why job dropped after 1 fail
Q := src/pay/retryQueue.ts
MAX_RETRIES = 3
Q.onFail(): attempt + 1; if attempt > MAX_RETRIES: drop
Q.onSuccess(): attempt not reset
case fail x3, success, fail: attempt = 4 > 3 → drop after 1 new fail
check: matches report true
? other writers of attempt
Q.retry() reads attempt only
=> reset attempt in Q.onSuccess()
```

The same steps as the prose version ("Okay, so the user says... let me look...
wait, I should check..."), including the verification and the open question.
The reply is an ordinary explanation.

## Modes

| Mode | What it asks of reasoning | Runs on |
|---|---|---|
| `lite` | short draft steps, cheapest notation, one-letter names | all models tested |
| `steno` | every line one of 13 forms, full lexicon, strict bans | Haiku 5.5 |
| `ultrasteno` | steno, plus alias at first mention, no glue words, no notes | Haiku 5.5 |
| `auto` | `steno` on Haiku, `lite` elsewhere | |

Steno starts **off** (`manual`) and turns on with `/steno`; see the numbers below for why.

**Model support.** With the strict ruleset in context, Sonnet 5.5 and Opus 5.5
decline to answer at all (`stop_reason: refusal`, even for "What is 17×23?").
Their safeguards appear to flag a long, forceful specification of how to think. Haiku
5.5 accepts it. Steno does not reword its rules to get past a safety
classifier, so strict modes are Haiku-only for now and `auto` falls back to
`lite`, which was tested and accepted on all three. Details in
[docs/HONEST-NUMBERS.md](docs/HONEST-NUMBERS.md).

## Install

Claude Code plugin, from a clone:

```
/plugin marketplace add /path/to/steno
/plugin install steno@steno
```

Or standalone: `bash install.sh` (`--statusline`, `--dry-run`, `--uninstall`).
Codex, Cursor and Gemini CLI configs are included. See [INSTALL.md](INSTALL.md).

## Commands

```
/steno            auto: strict on Haiku, lite elsewhere
/steno lite       light mode
/steno strict     strict mode
/steno ultra      ultrasteno (also /ultrasteno)
/steno status     show the current mode
/steno off        off (also "stop steno", "normal mode")
```

Default mode: `STENO_DEFAULT_MODE`, `.steno.json` in the project, or
`~/.config/steno/config.json`, e.g. `{"defaultMode": "auto"}` (also `lite`,
`steno`, `ultrasteno`, `off`). Without one, steno starts off (`manual`).

## How it is enforced

Like caveman, steno does not rely on the model remembering a skill:

- **SessionStart** injects the full ruleset for the session's mode.
- **UserPromptSubmit** handles mode switches and, in strict modes, re-injects a
  short reminder every turn, so the rules hold deep into long sessions.
- **SubagentStart** gives subagents the same ruleset.
- Mode state is per session and survives resume and compaction.

## Honest numbers

Measured on 2026-10-19, Claude Code CLI, effort `high`, 18 checkable tasks ×
2 runs plus 6 open requests. Full tables and method:
[docs/HONEST-NUMBERS.md](docs/HONEST-NUMBERS.md).

**Haiku 5.5** (thinks on nearly every task):

| Arm | Thinking tokens vs baseline | Accuracy | Notation leaked into replies |
|---|---|---|---|
| "keep your reasoning concise" (control) | **−12%** | 36/36 | 0 |
| steno lite | −4% (noise) | 36/36 | 0 |
| steno (strict) | **+36%** | 36/36 | 0 |
| ultrasteno | +35% | 36/36 | 0 |

**Sonnet 5.5** rarely thought on these tasks (3 of 36 baseline calls); lite
made it think more often, which cost more. **Opus 5.5** was checked only for
refusals.

What holds up: the per-token lexicon, accuracy, and replies that stay in the
user's language with no notation leaking. What does not: the saving. Asking a
model to format its hidden reasoning made it reason *more* in strict mode, and
a one-line "be concise" beat every steno mode. That is why steno ships off by
default (`manual`), and why the measurement pipeline is the part worth reusing.

## Tune it for your model

The lexicon is data, so it can be rebuilt for any tokenizer:

```bash
python3 scripts/mine_phrases.py                    # what your traces repeat
python3 scripts/measure_tokens.py --backend anthropic --model <id>   # or claude-cli / tiktoken
python3 scripts/build_lexicon.py                   # regenerate lexicon + skill block
python3 evals/run.py --model <model> --runs 2 --out evals/snapshots/<name>.jsonl
python3 evals/report.py evals/snapshots/<name>.jsonl
```

Or run the `/steno-lexicon` skill, which walks through the same steps.

## Repository

```
skills/             steno, ultrasteno, steno-lite, steno-lexicon (SKILL.md + README.md)
lexicon/            candidates, measured token counts, generated lexicon
scripts/            mine_phrases.py, measure_tokens.py, build_lexicon.py
src/hooks/          SessionStart / UserPromptSubmit / SubagentStart / statusline hooks
installer/          standalone Claude Code installer
evals/              eval harness, prompt sets, committed snapshots
docs/               DIALECT.md, HONEST-NUMBERS.md
.claude-plugin/ .codex/ .cursor-plugin/ hooks/ commands/ GEMINI.md   host integrations
tests/              node:test + unittest
```

`npm test` runs everything. MIT licensed.
