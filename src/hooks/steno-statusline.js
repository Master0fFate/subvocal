#!/usr/bin/env node
// steno — Claude Code statusline badge.
//
// Prints [STENO], [STENO:LITE] or [STENO:ULTRA] while steno is active for this session,
// nothing otherwise. To chain it after an existing statusline, run that
// command first and this one second; see INSTALL.md.

'use strict';

const cfg = require('./steno-config');
const { readPayload } = require('./steno-parse');

readPayload(1000).then((payload) => {
  const mode = cfg.resolveActiveMode(undefined, cfg.validateSessionId(payload.session_id));
  if (mode === 'steno') process.stdout.write('[STENO]');
  else if (mode === 'ultrasteno') process.stdout.write('[STENO:ULTRA]');
  else if (mode === 'lite') process.stdout.write('[STENO:LITE]');
}).catch(() => { /* print nothing */ });
