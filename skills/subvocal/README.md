# subvocal

Think in subvocal. Reply in prose.

The strict mode. Every thinking line is one of thirteen forms (`find:`,
`key: value`, `A := ...`, `a → b`, `=> result`, ...), written with a lexicon
whose every symbol was measured with Claude's tokenizer. Connective prose,
narration and expensive symbols are banned. Every reasoning step and check is
kept, and the reply is normal prose in the user's language.

```
/subvocal strict     this mode
/subvocal            auto: subvocal-lite on every model
/subvocal status     show the mode
/subvocal off        back to normal
```

Model support and measured results: [`docs/HONEST-NUMBERS.md`](../../docs/HONEST-NUMBERS.md).
The full LLM-facing text: [`SKILL.md`](./SKILL.md). The dialect explained:
[`docs/DIALECT.md`](../../docs/DIALECT.md).
