#!/usr/bin/env node
// steno — Claude Code UserPromptSubmit hook.
//
// Every prompt:
//   - a mode command (/steno, /steno lite, /steno strict, /steno ultra,
//     /steno off, stop steno, ...)
//     switches the session's mode and injects the new mode's full ruleset,
//     or a one-line "off" notice;
//   - /steno status injects the current mode for the model to relay;
//   - otherwise, while steno is active, a short reminder is injected. This is
//     what keeps the dialect strict deep into a long session, the same way
//     caveman's per-turn reinforcement does.
//
// Exactly one hookSpecificOutput per run: hosts read only one, so a switch and
// a reminder are combined rather than emitted twice. Fail open on any error.

'use strict';

const cfg = require('./steno-config');
const { parseCommand, readPayload } = require('./steno-parse');

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
  let model = cfg.modelFrom(payload) || cfg.readSessionModel(undefined, sid);
  if (!model) {
    model = cfg.modelFromTranscript(payload.transcript_path);
    if (model) cfg.writeSessionModel(undefined, sid, model);
  }
  if (!current) {
    // No state yet (hook installed mid-session): fall back to the default.
    const def = cfg.getDefaultMode(typeof payload.cwd === 'string' ? payload.cwd : process.cwd());
    current = cfg.concreteMode(def, model);
  }

  if (cmd && cmd.action === 'status') {
    emit('Report this status verbatim in one line, change nothing: Steno mode: ' + current);
    return;
  }

  if (cmd && cmd.action === 'set') {
    const mode = cfg.concreteMode(cmd.mode, model);
    cfg.writeSessionMode(undefined, sid, mode);
    cfg.setAutoPending(undefined, sid, cmd.mode === 'auto' && !model);
    if (mode === 'off') {
      emit('Steno mode is now OFF. Think and reply normally from here on. Confirm in one short line.');
    } else {
      emit(mode === 'lite' ? cfg.buildRuleset(mode, __dirname) : cfg.buildRuleset(mode, __dirname)
        + '\n\nSteno mode switched to ' + mode + '. Confirm in one short line, then apply it.');
    }
    return;
  }

  // A session that started on 'auto' before its model was known settles here,
  // on the first prompt after a reply names the model.
  if (model && cfg.isAutoPending(undefined, sid)) {
    cfg.setAutoPending(undefined, sid, false);
    const target = cfg.resolveAuto(model);
    if (current !== 'off' && target !== current) {
      cfg.writeSessionMode(undefined, sid, target);
      const r2 = cfg.reminder(target);
      emit(cfg.buildRuleset(target, __dirname) + (r2 ? '\n\n' + r2 : ''));
      return;
    }
  }

  const r = current !== 'off' ? cfg.reminder(current) : null;
  if (r) emit(r);
}

main().catch(() => { /* fail open */ });
