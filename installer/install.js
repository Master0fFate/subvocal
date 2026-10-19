#!/usr/bin/env node
// steno — standalone installer for Claude Code (no plugin marketplace needed).
//
//   node installer/install.js                 install hooks + skills
//   node installer/install.js --statusline    also add the [STENO] badge (only if no statusline is set)
//   node installer/install.js --uninstall     remove everything this installer added
//   node installer/install.js --dry-run       show what would change, change nothing
//
// What it touches, all under $CLAUDE_CONFIG_DIR (default ~/.claude):
//   steno/hooks/*.js            the hook scripts
//   steno/skills/*/SKILL.md     the ruleset the hooks inject
//   skills/steno, skills/steno-lite, skills/ultrasteno   so the slash commands work
//   settings.json               three hook entries (and statusLine if asked);
//                               a timestamped backup is written first
//
// Idempotent: entries are recognised by their script path, so running it twice
// changes nothing. Zero dependencies, Node >= 18.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const UNINSTALL = args.has('--uninstall');
const STATUSLINE = args.has('--statusline');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const home = path.join(claudeDir, 'steno');
const hooksDir = path.join(home, 'hooks');
const settingsPath = path.join(claudeDir, 'settings.json');
const SKILLS = ['steno', 'steno-lite', 'ultrasteno'];
const HOOK_FILES = ['steno-config.js', 'steno-parse.js', 'steno-activate.js', 'steno-mode-tracker.js', 'steno-statusline.js'];
const MARK = 'steno/hooks/steno-';

const { stripJsonComments } = require(path.join(REPO, 'src', 'hooks', 'steno-config.js'));

function log(msg) { process.stdout.write((DRY ? '[dry-run] ' : '') + msg + '\n'); }

function copy(src, dst) {
  log('copy ' + path.relative(REPO, src) + ' -> ' + dst);
  if (DRY) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function remove(target) {
  if (!fs.existsSync(target)) return;
  log('remove ' + target);
  if (!DRY) fs.rmSync(target, { recursive: true, force: true });
}

function readSettings() {
  if (!fs.existsSync(settingsPath)) return {};
  const raw = fs.readFileSync(settingsPath, 'utf8').replace(/^﻿/, '');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(stripJsonComments(raw));
  } catch (e) {
    console.error('steno: ' + settingsPath + ' is not valid JSON; fix it first. Nothing changed.');
    process.exit(1);
  }
}

function writeSettings(settings) {
  if (DRY) { log('write ' + settingsPath); return; }
  fs.mkdirSync(claudeDir, { recursive: true });
  if (fs.existsSync(settingsPath)) {
    const backup = settingsPath + '.steno-backup-' + new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(settingsPath, backup);
    log('backup ' + backup);
  }
  const tmp = settingsPath + '.steno-tmp';
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n');
  fs.renameSync(tmp, settingsPath);
  log('write ' + settingsPath);
}

// Our commands always use forward slashes (see nodeCmd), on every platform.
function isOurs(entry) {
  return JSON.stringify(entry || {}).includes(MARK);
}

function stripOurs(settings) {
  const hooks = settings.hooks || {};
  for (const event of Object.keys(hooks)) {
    if (!Array.isArray(hooks[event])) continue;
    hooks[event] = hooks[event].filter((group) => !isOurs(group));
    if (!hooks[event].length) delete hooks[event];
  }
  if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  if (settings.statusLine && isOurs(settings.statusLine)) delete settings.statusLine;
  return settings;
}

function nodeCmd(script, extra) {
  const p = path.join(hooksDir, script).split(path.sep).join('/');
  return 'node "' + p + '"' + (extra || '');
}

function install() {
  for (const f of HOOK_FILES) copy(path.join(REPO, 'src', 'hooks', f), path.join(hooksDir, f));
  for (const s of SKILLS) {
    const src = path.join(REPO, 'skills', s, 'SKILL.md');
    copy(src, path.join(home, 'skills', s, 'SKILL.md'));
    copy(src, path.join(claudeDir, 'skills', s, 'SKILL.md'));
  }

  const settings = stripOurs(readSettings());
  settings.hooks = settings.hooks || {};
  const add = (event, script, extra, msg) => {
    settings.hooks[event] = settings.hooks[event] || [];
    settings.hooks[event].push({ hooks: [{ type: 'command', command: nodeCmd(script, extra), timeout: 10, statusMessage: msg }] });
  };
  add('SessionStart', 'steno-activate.js', '', 'Loading steno mode...');
  add('SubagentStart', 'steno-activate.js', ' --subagent', 'Loading steno mode for subagent...');
  add('UserPromptSubmit', 'steno-mode-tracker.js', '', 'Tracking steno mode...');
  if (STATUSLINE) {
    if (settings.statusLine) {
      log('statusLine already set; left as is. To chain the badge, see INSTALL.md.');
    } else {
      settings.statusLine = { type: 'command', command: nodeCmd('steno-statusline.js') };
    }
  }
  writeSettings(settings);
  log('steno installed. Start a new Claude Code session; /steno off turns it off, /steno status shows the mode.');
}

function uninstall() {
  if (fs.existsSync(settingsPath)) writeSettings(stripOurs(readSettings()));
  remove(home);
  for (const s of SKILLS) remove(path.join(claudeDir, 'skills', s));
  log('steno removed. Session state under ' + path.join(claudeDir, '.steno') + ' was removed too.');
  remove(path.join(claudeDir, '.steno'));
}

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  console.error('steno: Node ' + process.versions.node + ' is too old; need 18 or newer.');
  process.exit(1);
}
if (UNINSTALL) uninstall(); else install();
