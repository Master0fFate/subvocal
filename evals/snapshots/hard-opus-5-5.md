Model `opus` via `claude-cli`, 24 task prompts x 1 run(s). Thinking totals use the 24 prompts where at least one arm thought.

| Arm | Thinking tokens | vs baseline | vs control | Accuracy | Reply median (tasks / open) | Leaks | Croatian reply | Refused |
|---|---|---|---|---|---|---|---|---|
| baseline | 8385 | +0% |  | 24/24 | 191.5 / None | 0/24 | - | 0/24 |
| lite | 7478 | -11% |  | 24/24 | 214.5 / None | 0/24 | - | 0/24 |

- lite thought less than baseline on 17/24 prompts.
