#!/usr/bin/env node
// subvocal — Claude Code UserPromptSubmit hook.
//
// Every prompt:
//   - a mode command (/subvocal, /subvocal lite, /subvocal strict, /subvocal ultra,
//     /subvocal off, stop subvocal, ...)
//     switches the session's mode and injects the new mode's full ruleset,
//     or a one-line "off" notice;
//   - /subvocal status injects the current mode for the model to relay;
//   - otherwise, while subvocal is active, a short reminder is injected. This is
//     what keeps the dialect strict deep into a long session, the same way
//     caveman's per-turn reinforcement does.
//
// Exactly one hookSpecificOutput per run: hosts read only one, so a switch and
// a reminder are combined rather than emitted twice. Fail open on any error.

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
  let current = cfg.readSessionMode(undefined, sid);
  if (!current) {
    // No state yet (hook installed mid-session): fall back to the default.
    const def = cfg.getDefaultMode(typeof payload.cwd === 'string' ? payload.cwd : process.cwd());
    current = cfg.concreteMode(def);
  }

  if (cmd && cmd.action === 'status') {
    emit('Report this status verbatim in one line, change nothing: Subvocal mode: ' + current);
    return;
  }

  if (cmd && cmd.action === 'set') {
    const mode = cfg.concreteMode(cmd.mode);
    cfg.writeSessionMode(undefined, sid, mode);
    if (mode === 'off') {
      emit('Subvocal mode is now OFF. Think and reply normally from here on. Confirm in one short line.');
    } else {
      emit(mode === 'lite' ? cfg.buildRuleset(mode, __dirname) : cfg.buildRuleset(mode, __dirname)
        + '\n\nSubvocal mode switched to ' + mode + '. Confirm in one short line, then apply it.');
    }
    return;
  }

  const r = current !== 'off' ? cfg.reminder(current) : null;
  if (r) emit(r);
}

main().catch(() => { /* fail open */ });
