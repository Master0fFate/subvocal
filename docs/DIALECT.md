# The subvocal dialect

This is the reference for what subvocal asks of a model's reasoning, and why each
rule exists. The skill files are the operative text; this page explains them.

## Principle

Subvocal compresses the **encoding** of reasoning, never its **content**. A trace
in subvocal has the same steps, cases and checks as the trace without it. Only the
number of tokens per step changes.

That gives four levers, and only four:

1. **Code-style lines.** `key: value`, `if x: y`, `f(a) → b`. Models have read
   vast amounts of code, so this is dense and in-distribution.
2. **Math notation, where it is actually cheap.** `=`, `!=`, `<`, `>`, `*`, `/`,
   and `→` are one token each. Most math symbols are not (see below).
3. **Newlines as separators.** One fact per line. The line break replaces
   "and then", "so", "which means".
4. **Aliases.** Name a long thing once (`Q := src/pay/retryQueue.ts`), then use
   the name.

Everything else follows from one rule: **measure tokens, not characters.**

## What measuring showed

Measured with Claude's tokenizer through `claude-haiku-5-5` (a spot check of
five strings on `claude-opus-5-5` gave identical counts), each string placed
mid-line between two ordinary words:

| Looks compact | Tokens | Cheaper choice | Tokens |
|---|---|---|---|
| `∴` | 4 | `→` | 1 |
| `≠` | 4 | `!=` | 1 |
| `≥`, `≤` | 4 | `>=`, `<=` | 2 |
| `✓`, `✗` | 4 | `true`, `false` | 1 |
| `∀`, `∃`, `∈`, `∅` | 4 | `for`, `any`, `in`, `none` | 1 |
| `->` | 2 | `→` | 1 |
| `~` (approx.) | 3 | `about` | 1 |
| `b/c`, `bc` | 3, 2 | `because` | 1 |
| alias `C1` | 3 | alias `C` | 1 |

The same three sentences cost 55% more tokens in Croatian, 97% more in German
and 47% more in Spanish than in English, which is why subvocal thinks in English
and replies in the user's language.

The complete table, regenerated from data, lives between the `LEXICON` markers
in `skills/subvocal/SKILL.md`. The numbers behind it are in `lexicon/lexicon.json`.

## Line forms (strict subvocal)

| Form | Shape | Replaces |
|---|---|---|
| goal | `find: <target>` | "we need to find", "the user wants to know" |
| fact | `key: value` | "we know that", "the problem says" |
| alias | `A := <thing>` | "let's call this", "we'll refer to this as" |
| step | `a → b` | "so", "therefore", "which means" |
| calc | `expr = value` | "is equal to", "we get" |
| code | `if x > 0: y` | prose descriptions of logic |
| case | `case <cond>: ...`, `X: no, <why>` | "consider the case where", "option X is ruled out because" |
| open | `? <question>` | "I'm not sure whether", "I need to check if" |
| fix | `!: <wrong> → <fix>` | "wait, actually", "hold on, that's wrong" |
| check | `check: <expr> true\|false` | "let me verify", "that checks out" |
| plan | `do: a; b; c` | "my plan is to", "first I'll" |
| note | `# <max 8 words>` | "note that", "keep in mind" |
| done | `=> <result>` | "so the final answer is" |

## Three modes

| Mode | What it asks | Where it runs |
|---|---|---|
| `lite` | Short draft steps, cheap notation, one-letter names for repeated terms. | Every model tested. Default on Sonnet 5.5 and Opus 5.5. |
| `subvocal` | Every line one of the forms above; full measured lexicon; strict bans. | Haiku 5.5. Declined by Sonnet 5.5 / Opus 5.5 safeguards. |
| `ultrasubvocal` | Subvocal minus notes and plans; alias at first mention; no glue words. | Same as `subvocal`. |

`auto`, the default, picks `lite` on every model; the strict dialect described here is opt-in (`/subvocal strict`), because it measured no saving and is declined by Sonnet 5.5 and Opus 5.5 (see HONEST-NUMBERS.md).

## What subvocal never does

- **Skip reasoning.** No rule removes a step, a case or a verification.
  Self-correction stays, written as one `!:` line.
- **Obscure reasoning.** Subvocal is shorthand, not a cipher. Every line must be
  legible to someone who reads code and math, and every consideration that
  shapes the answer stays in the trace.
- **Touch the reply.** Replies are written for the reader, in the user's
  language, with aliases expanded.
- **Touch persisted text.** Code, commits, files, tool arguments and subagent
  prompts are written normally.

## Why not other ideas

- **Thinking in Chinese.** Dense per character, but per-token cost is what
  matters, and tokenizers built mostly around English rarely favour it. Not
  measured here; every non-English language that was measured (Croatian,
  German, Spanish) cost more than English. Reasoning quality also tends to
  follow the dominant training language.
- **Gating how much the model thinks** (budgets, early exit, skipping checks).
  That changes *what* is reasoned, which risks accuracy. Subvocal only changes how
  it is written down. Budgets and effort settings are complementary and live in
  the host, not in subvocal.
- **Dropping articles (caveman style) in thinking.** Saves about one token per
  article. The connective phrases and narration that subvocal removes cost 2 to 9
  tokens each.
