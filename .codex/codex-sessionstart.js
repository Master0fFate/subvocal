#!/usr/bin/env node
// Codex SessionStart hook: resolves the configured default mode and prints the
// steno ruleset as plain text, which Codex adds to the session context.
// Delegates to the shared host hook so Codex, Cursor and Copilot stay in sync.
// Fail open: a broken install prints nothing and never blocks a session.
'use strict';
const path = require('path');
process.argv[2] = 'codex';
try {
  require(path.join(__dirname, '..', 'src', 'hooks', 'steno-host-session-start.js'));
} catch (e) { /* fail open */ }
