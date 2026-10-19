Model `sonnet` via `claude-cli`, 24 task prompts x 2 run(s). Thinking totals use the 24 prompts where at least one arm thought.

| Arm | Thinking tokens | vs baseline (sum) | per prompt (geomean) | vs control | Accuracy | Reply median (tasks / open) | Leaks | Croatian reply | Refused |
|---|---|---|---|---|---|---|---|---|---|
| baseline | 12947 | +0% | +0% |  | 48/48 | 168.5 / 439.5 | 0/54 | 1/1 | 0/54 |
| plain | 13354 | +3% | +4% |  | 48/48 | 170.5 / 470.0 | 0/54 | 1/1 | 0/54 |
| subvocal | 11594 | -10% | -3% |  | 47/48 | 167.5 / 514.0 | 0/54 | 1/1 | 0/54 |
| ultrasubvocal | 12092 | -7% | -3% |  | 48/48 | 157.0 / 440.5 | 0/54 | 1/1 | 0/54 |
| u3-very | 12338 | -5% | -2% |  | 45/48 | 169.0 / 457.5 | 0/54 | 1/1 | 3/54 |

- plain thought less than baseline on 12/24 prompts.
- subvocal thought less than baseline on 13/24 prompts.
- ultrasubvocal thought less than baseline on 17/24 prompts.
- u3-very thought less than baseline on 14/24 prompts.
