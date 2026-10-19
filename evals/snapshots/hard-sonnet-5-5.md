Model `sonnet` via `claude-cli`, 24 task prompts x 2 run(s). Thinking totals use the 24 prompts where at least one arm thought.

| Arm | Thinking tokens | vs baseline | vs control | Accuracy | Reply median (tasks / open) | Leaks | Croatian reply | Refused |
|---|---|---|---|---|---|---|---|---|
| baseline | 13632 | +0% |  | 48/48 | 163.5 / 453.5 | 0/54 | 1/1 | 0/54 |
| lite | 11244 | -18% |  | 48/48 | 167.5 / 491.5 | 0/54 | 1/1 | 0/54 |

- lite thought less than baseline on 17/24 prompts.
