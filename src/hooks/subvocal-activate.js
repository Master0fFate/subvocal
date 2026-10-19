#!/usr/bin/env node
// subvocal — Claude Code SessionStart hook (and SubagentStart with --subagent).
//
// SessionStart:
//   1. Resolve this session's mode. A resumed or compacted session keeps the
//      mode it had; a new session starts from the configured default, where
//      'auto' means lite.
//   2. Persist it (the prompt hook and the statusline read it).
//   3. Print the full ruleset (the active skill's SKILL.md) as session context.
//
// SubagentStart (--subagent): hand every new subagent the parent session's
// active ruleset, so delegated work thinks in subvocal too. Read-only.
//
// Fail open: any error prints nothing and exits 0. A broken install must
// never block a session. Never call process.exit() after writing stdout:
// pipe writes are async and exit() can drop them.

'use strict';

const cfg = require('./subvocal-config');
const { readPayload } = require('./subvocal-parse');

async function main() {
  const subagent = process.argv.includes('--subagent');
  const payload = await readPayload();
  const sid = cfg.validateSessionId(payload.session_id);

  if (subagent) {
    const mode = cfg.resolveActiveMode(undefined, sid);
    if (!mode) return;
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: cfg.buildRuleset(mode, __dirname) },
    }));
    return;
  }

  cfg.gcSessionStore();
  const source = typeof payload.source === 'string' ? payload.source : 'startup';
  let mode = null;
  if (source === 'resume' || source === 'compact' || source === 'clear') mode = cfg.readSessionMode(undefined, sid);
  const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd();
  if (!mode) {
    mode = cfg.concreteMode(cfg.getDefaultMode(cwd));
  }
  cfg.writeSessionMode(undefined, sid, mode);
  if (mode === 'off') return;
  process.stdout.write(cfg.buildRuleset(mode, __dirname));
}

main().catch(() => { /* fail open */ });
