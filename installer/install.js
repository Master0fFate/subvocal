#!/usr/bin/env node
// subvocal — standalone installer for Claude Code (no plugin marketplace needed).
//
//   node installer/install.js                 install hooks + skills
//   node installer/install.js --statusline    also add the [SUBVOCAL] badge (only if no statusline is set)
//   node installer/install.js --uninstall     remove everything this installer added
//   node installer/install.js --dry-run       show what would change, change nothing
//   node installer/install.js --init          only write the lite rule as a fenced block into the
//                                             current repo's AGENTS.md (and CLAUDE.md,
//                                             .github/copilot-instructions.md where they exist),
//                                             for hosts without hooks; --init --uninstall removes it
//
// What it touches, all under $CLAUDE_CONFIG_DIR (default ~/.claude):
//   subvocal/hooks/*.js            the hook scripts
//   subvocal/skills/*/SKILL.md     the ruleset the hooks inject
//   skills/subvocal, skills/subvocal-lite, skills/ultrasubvocal   so the slash commands work
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
const INIT = args.has('--init');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const home = path.join(claudeDir, 'subvocal');
const hooksDir = path.join(home, 'hooks');
const settingsPath = path.join(claudeDir, 'settings.json');
const SKILLS = ['subvocal', 'subvocal-lite', 'ultrasubvocal'];
const HOOK_FILES = ['subvocal-config.js', 'subvocal-parse.js', 'subvocal-activate.js', 'subvocal-mode-tracker.js', 'subvocal-statusline.js'];
const MARK = 'subvocal/hooks/subvocal-';

const { stripJsonComments, stripFrontmatter } = require(path.join(REPO, 'src', 'hooks', 'subvocal-config.js'));
const BLOCK_BEGIN = '<!-- subvocal:begin -->';
const BLOCK_END = '<!-- subvocal:end -->';

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
    console.error('subvocal: ' + settingsPath + ' is not valid JSON; fix it first. Nothing changed.');
    process.exit(1);
  }
}

function writeSettings(settings) {
  if (DRY) { log('write ' + settingsPath); return; }
  fs.mkdirSync(claudeDir, { recursive: true });
  if (fs.existsSync(settingsPath)) {
    const backup = settingsPath + '.subvocal-backup-' + new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(settingsPath, backup);
    log('backup ' + backup);
  }
  const tmp = settingsPath + '.subvocal-tmp';
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
  add('SessionStart', 'subvocal-activate.js', '', 'Loading subvocal mode...');
  add('SubagentStart', 'subvocal-activate.js', ' --subagent', 'Loading subvocal mode for subagent...');
  add('UserPromptSubmit', 'subvocal-mode-tracker.js', '', 'Tracking subvocal mode...');
  if (STATUSLINE) {
    if (settings.statusLine) {
      log('statusLine already set; left as is. To chain the badge, see INSTALL.md.');
    } else {
      settings.statusLine = { type: 'command', command: nodeCmd('subvocal-statusline.js') };
    }
  }
  writeSettings(settings);
  log('subvocal installed. Start a new Claude Code session; /subvocal off turns it off, /subvocal status shows the mode.');
}

function uninstall() {
  if (fs.existsSync(settingsPath)) writeSettings(stripOurs(readSettings()));
  remove(home);
  for (const s of SKILLS) remove(path.join(claudeDir, 'skills', s));
  log('subvocal removed. Session state under ' + path.join(claudeDir, '.subvocal') + ' was removed too.');
  remove(path.join(claudeDir, '.subvocal'));
}

function ruleBlock() {
  const body = stripFrontmatter(fs.readFileSync(path.join(REPO, 'skills', 'subvocal-lite', 'SKILL.md'), 'utf8')).trim();
  return BLOCK_BEGIN + '\n' + body + '\n' + BLOCK_END + '\n';
}

function withoutBlock(text) {
  const start = text.indexOf(BLOCK_BEGIN);
  const end = text.indexOf(BLOCK_END);
  if (start < 0 || end < start) return text;
  return (text.slice(0, start) + text.slice(end + BLOCK_END.length)).replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '\n');
}

function ruleFiles(cwd) {
  const files = [path.join(cwd, 'AGENTS.md')];
  if (fs.existsSync(path.join(cwd, 'CLAUDE.md'))) files.push(path.join(cwd, 'CLAUDE.md'));
  if (fs.existsSync(path.join(cwd, '.github'))) files.push(path.join(cwd, '.github', 'copilot-instructions.md'));
  return files;
}

function joinBlock(rest, block) {
  if (!rest) return block;
  return rest.replace(/\n*$/, '\n\n') + block;
}

function initRules() {
  const block = ruleBlock();
  for (const file of ruleFiles(process.cwd())) {
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const rest = withoutBlock(existing);
    const next = UNINSTALL ? rest : joinBlock(rest, block);
    if (next === existing) continue;
    if (UNINSTALL && !next.trim()) {
      log('remove ' + file);
      if (!DRY) fs.rmSync(file);
      continue;
    }
    log((existing ? 'update ' : 'create ') + file);
    if (!DRY) fs.writeFileSync(file, next);
  }
  log(UNINSTALL ? 'subvocal rule block removed.' : 'subvocal rule block written. Hosts that read AGENTS.md now start in lite mode.');
}

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  console.error('subvocal: Node ' + process.versions.node + ' is too old; need 18 or newer.');
  process.exit(1);
}
if (INIT) initRules(); else if (UNINSTALL) uninstall(); else install();
