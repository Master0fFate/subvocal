#!/usr/bin/env node
// subvocal — Claude Code statusline badge.
//
// Prints [SUBVOCAL], [SUBVOCAL:LITE] or [SUBVOCAL:ULTRA] while subvocal is active for this session,
// nothing otherwise. To chain it after an existing statusline, run that
// command first and this one second; see INSTALL.md.

'use strict';

const cfg = require('./subvocal-config');
const { readPayload } = require('./subvocal-parse');

readPayload(1000).then((payload) => {
  const mode = cfg.resolveActiveMode(undefined, cfg.validateSessionId(payload.session_id));
  if (mode === 'subvocal') process.stdout.write('[SUBVOCAL]');
  else if (mode === 'ultrasubvocal') process.stdout.write('[SUBVOCAL:ULTRA]');
  else if (mode === 'lite') process.stdout.write('[SUBVOCAL:LITE]');
}).catch(() => { /* print nothing */ });
