#!/usr/bin/env node
// steno — session-start hook for hosts other than Claude Code.
//
//   node steno-host-session-start.js <host>
//
//   codex   → plain text on stdout (Codex adds SessionStart stdout as context)
//   cursor  → {"additional_context": "..."}
//   copilot → {"additionalContext": "..."}
//
// Mode is the configured default (STENO_DEFAULT_MODE → repo .steno.json →
// user config), resolved from the session's workspace. These hosts have no
// prompt hook wired here, so mid-session switches are handled by the model
// from the skill text alone. off, manual, unknown host, or any failure
// prints nothing (codex) or {} (JSON hosts).

'use strict';

const cfg = require('./steno-config');
const { readPayload } = require('./steno-parse');

const JSON_KEYS = { cursor: 'additional_context', copilot: 'additionalContext' };

async function main() {
  const host = process.argv[2];
  const payload = await readPayload();
  const roots = Array.isArray(payload.workspace_roots) ? payload.workspace_roots : [];
  const cwd = [payload.cwd, roots[0], process.env.CURSOR_PROJECT_DIR]
    .find((v) => typeof v === 'string' && v) || process.cwd();
  const mode = cfg.concreteMode(cfg.getDefaultMode(cwd), cfg.modelFrom(payload));
  const text = cfg.RULESET_MODES.includes(mode) ? cfg.buildRuleset(mode, __dirname) : null;

  if (host === 'codex') {
    if (text) process.stdout.write(text);
    return;
  }
  const key = JSON_KEYS[host];
  process.stdout.write(JSON.stringify(key && text ? { [key]: text } : {}));
}

main().catch(() => {
  if (process.argv[2] !== 'codex') process.stdout.write('{}');
});
