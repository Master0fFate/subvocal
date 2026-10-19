Model `opus` via `claude-cli`, 24 task prompts x 1 run(s). Thinking totals use the 24 prompts where at least one arm thought.

| Arm | Thinking tokens | vs baseline (sum) | per prompt (geomean) | vs control | Accuracy | Reply median (tasks / open) | Leaks | Croatian reply | Refused |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 8125 | +0% | +0% |  | 24/24 | 188.0 / None | 0/24 | - | 0/24 |
| u1-cod5 | 6093 | -25% | -25% |  | 23/24 | 212.0 / None | 0/24 | - | 1/24 |
| u2-ten | 8434 | +4% | -12% |  | 24/24 | 198.0 / None | 0/24 | - | 0/24 |
| u4-very-plain | 6433 | -21% | -19% |  | 24/24 | 204.0 / None | 0/24 | - | 0/24 |

- u1-cod5 thought less than baseline on 20/24 prompts.
- u2-ten thought less than baseline on 17/24 prompts.
- u4-very-plain thought less than baseline on 19/24 prompts.
