#!/usr/bin/env node
// subvocal — Claude Code UserPromptSubmit hook.
//
// Every prompt:
//   - a mode command (/subvocal, /subvocal ultra, /subvocal off, stop subvocal, ...)
//     switches the session's mode and injects the new mode's text, or a
//     one-line "off" notice;
//   - /subvocal status injects the current mode for the model to relay;
//   - any other prompt produces no output.
//
// Exactly one hookSpecificOutput per run. Fail open on any error.

'use strict';

const cfg = require('./subvocal-config');
const { parseCommand, readPayload } = require('./subvocal-parse');

function emit(context) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context },
  }));
}

async function main() {
  const payload = await readPayload();
  const sid = cfg.validateSessionId(payload.session_id);
  const cmd = parseCommand(payload.prompt);
  if (!cmd) return;

  if (cmd.action === 'status') {
    let current = cfg.readSessionMode(undefined, sid);
    if (!current) {
      // No state yet (hook installed mid-session): fall back to the default.
      const def = cfg.getDefaultMode(typeof payload.cwd === 'string' ? payload.cwd : process.cwd());
      current = cfg.concreteMode(def);
    }
    emit('Report this status verbatim in one line, change nothing: Subvocal mode: ' + current);
    return;
  }

  if (cmd.action === 'set') {
    const mode = cfg.concreteMode(cmd.mode);
    cfg.writeSessionMode(undefined, sid, mode);
    if (mode === 'off') {
      emit('Subvocal mode is now OFF. Think and reply normally from here on. Confirm in one short line.');
    } else {
      emit(cfg.buildRuleset(mode, __dirname));
    }
  }
}

main().catch(() => { /* fail open */ });
