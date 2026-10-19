Model `haiku` via `claude-cli`, 18 task prompts x 2 run(s). Thinking totals use the 18 prompts where at least one arm thought.

| Arm | Thinking tokens | vs baseline | vs control | Accuracy | Reply median (tasks / open) | Leaks | Croatian reply | Refused |
|---|---|---|---|---|---|---|---|---|
| baseline | 2818 | +0% | +13% | 36/36 | 144.0 / 674.5 | 0/42 | 1/1 | 0/42 |
| control | 2491 | -12% | +0% | 36/36 | 133.5 / 736.5 | 0/42 | 1/1 | 0/42 |
| lite | 2704 | -4% | +9% | 36/36 | 115.5 / 668.5 | 0/42 | 1/1 | 0/42 |
| subvocal | 3820 | +36% | +53% | 36/36 | 126.5 / 586.5 | 0/42 | 1/1 | 0/42 |
| ultrasubvocal | 3807 | +35% | +53% | 36/36 | 135.0 / 587.5 | 0/42 | 1/1 | 0/42 |

- lite thought less than baseline on 11/18 prompts.
- subvocal thought less than baseline on 1/18 prompts.
- ultrasubvocal thought less than baseline on 0/18 prompts.
