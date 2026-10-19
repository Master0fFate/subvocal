// subvocal — shared config, mode state and ruleset loading for every hook.
//
// Zero dependencies. Every function fails open: a broken config or an
// unreadable state file degrades to the default mode, never to an error that
// blocks a session.
//
// Default mode resolution (first hit wins):
//   1. SUBVOCAL_DEFAULT_MODE environment variable
//   2. Repo config: <dir>/.subvocal/config.json or <dir>/.subvocal.json, walking up
//   3. User config: $XDG_CONFIG_HOME/subvocal/config.json, else
//      ~/.config/subvocal/config.json (Windows: %APPDATA%\subvocal\config.json first)
//   4. 'auto': subvocal on every model.
// A config file looks like
//   {"defaultMode": "auto" | "subvocal" | "ultrasubvocal" | "off" | "manual"}.
// 'lite' is accepted as an alias of subvocal and 'ultra' of ultrasubvocal, so
// old configs keep working. 'manual': start off.
//
// Mode state is per session: <claude dir>/.subvocal/sessions/<session_id>.
// A session id that is missing or malformed falls back to one machine-wide
// file, so a host that sends no id still works.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const VALID_MODES = ['off', 'subvocal', 'ultrasubvocal'];
const DEFAULT_MODES = [...VALID_MODES, 'manual', 'auto'];
const ALIASES = {
  on: 'auto', lite: 'subvocal', light: 'subvocal', ultra: 'ultrasubvocal', max: 'ultrasubvocal', none: 'off',
};
const RULESET_MODES = ['subvocal', 'ultrasubvocal'];

// Turns a configured or requested mode into a concrete one.
function concreteMode(mode) {
  if (mode === 'auto') return 'subvocal';
  if (mode === 'manual') return 'off';
  return mode;
}

const SESSION_TTL_MS = 14 * 24 * 3600 * 1000;

function canonicalMode(raw, allowed = DEFAULT_MODES) {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().toLowerCase();
  if (allowed.includes(m)) return m;
  const a = ALIASES[m];
  return a && allowed.includes(a) ? a : null;
}

// Reads a JSON config file. Refuses symlinks (a planted link must not steer
// what we read) and tolerates a BOM or UTF-16LE (PowerShell 5.1 writes it).
function readConfigMode(file) {
  try {
    if (!fs.lstatSync(file).isFile()) return null;
    const buf = fs.readFileSync(file);
    const text = buf[0] === 0xff && buf[1] === 0xfe
      ? buf.toString('utf16le', 2)
      : buf.toString('utf8').replace(/^﻿/, '');
    return canonicalMode(JSON.parse(stripJsonComments(text)).defaultMode);
  } catch (e) {
    return null;
  }
}

// settings.json and config files may be JSONC: comments and trailing commas.
function stripJsonComments(text) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') { out += n === undefined ? '' : n; i++; } else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function parseConfigFile(file) {
  return JSON.parse(stripJsonComments(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')));
}

function userConfigPaths() {
  const home = os.homedir();
  if (process.env.XDG_CONFIG_HOME) return [path.join(process.env.XDG_CONFIG_HOME, 'subvocal', 'config.json')];
  const unix = path.join(home, '.config', 'subvocal', 'config.json');
  if (process.platform === 'win32') {
    return [path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'subvocal', 'config.json'), unix];
  }
  return [unix];
}

function getDefaultMode(startDir) {
  const env = canonicalMode(process.env.SUBVOCAL_DEFAULT_MODE);
  if (env) return env;
  try {
    let dir = path.resolve(startDir || process.cwd());
    for (let i = 0; i < 64; i++) {
      for (const rel of [path.join('.subvocal', 'config.json'), '.subvocal.json']) {
        const m = readConfigMode(path.join(dir, rel));
        if (m) return m;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch (e) { /* fall through */ }
  for (const file of userConfigPaths()) {
    const m = readConfigMode(file);
    if (m) return m;
  }
  return 'auto';
}

// ---------------------------------------------------------------------------
// Per-session state
// ---------------------------------------------------------------------------

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function stateDir(dir) {
  return path.join(dir || claudeDir(), '.subvocal', 'sessions');
}

function validateSessionId(sid) {
  return typeof sid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(sid) ? sid : null;
}

function statePath(dir, sid) {
  return path.join(stateDir(dir), validateSessionId(sid) || '_machine');
}

// Returns the stored mode ('off' included) or null when nothing is stored.
function readSessionMode(dir, sid) {
  try {
    const file = statePath(dir, sid);
    if (!fs.lstatSync(file).isFile()) return null;
    return canonicalMode(fs.readFileSync(file, 'utf8').slice(0, 64), VALID_MODES);
  } catch (e) {
    return null;
  }
}

// Atomic write, never through a symlink, owner-only permissions.
function writeSessionMode(dir, sid, mode) {
  const m = canonicalMode(mode, VALID_MODES);
  if (!m) return false;
  try {
    const d = stateDir(dir);
    fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    const file = statePath(dir, sid);
    try { if (fs.lstatSync(file).isSymbolicLink()) fs.unlinkSync(file); } catch (e) { /* absent */ }
    const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp';
    fs.writeFileSync(tmp, m, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    return false;
  }
}

// Active mode for a session: stored mode wins, otherwise null (caller decides).
function resolveActiveMode(dir, sid) {
  const m = readSessionMode(dir, sid);
  return m && m !== 'off' ? m : null;
}

// Drop session files nobody has touched for two weeks. Cheap, best effort.
function gcSessionStore(dir, now = Date.now()) {
  let removed = 0;
  try {
    const d = stateDir(dir);
    for (const name of fs.readdirSync(d)) {
      const file = path.join(d, name);
      try {
        const st = fs.lstatSync(file);
        if (st.isFile() && now - st.mtimeMs > SESSION_TTL_MS) { fs.unlinkSync(file); removed++; }
      } catch (e) { /* raced */ }
    }
  } catch (e) { /* no store yet */ }
  return removed;
}

// ---------------------------------------------------------------------------
// Ruleset
// ---------------------------------------------------------------------------

// The skill files are the single source of truth. Plugin layout, repo layout
// and standalone install layout are all tried, in that order.
function skillPathCandidates(mode, hooksDir) {
  const list = [];
  if (process.env.CLAUDE_PLUGIN_ROOT) list.push(path.join(process.env.CLAUDE_PLUGIN_ROOT, 'skills', mode, 'SKILL.md'));
  list.push(path.join(hooksDir, '..', '..', 'skills', mode, 'SKILL.md')); // repo: src/hooks -> skills
  list.push(path.join(hooksDir, '..', 'skills', mode, 'SKILL.md'));       // install: subvocal/hooks -> subvocal/skills
  list.push(path.join(hooksDir, 'skills', mode, 'SKILL.md'));
  return list;
}

function stripFrontmatter(text) {
  return text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

function loadRuleset(mode, hooksDir) {
  if (!RULESET_MODES.includes(mode)) return null;
  for (const file of skillPathCandidates(mode, hooksDir || __dirname)) {
    try {
      const body = stripFrontmatter(fs.readFileSync(file, 'utf8'));
      if (body) return body;
    } catch (e) { /* try next layout */ }
  }
  return null;
}

// Used only when no SKILL.md can be found (a partial install). The same text
// the skills carry.
function fallbackRuleset(mode) {
  const tail = ' Your reply is unaffected: write it as you normally would.';
  if (mode === 'ultrasubvocal') return 'Keep your internal reasoning very concise: a minimum draft per step, a few words each.' + tail;
  return 'Keep your internal reasoning concise: a minimum draft per step, a few words each.' + tail;
}

// Each mode ships as its bare skill text, nothing added: that exact text is
// what was tested against the Sonnet 5.5 / Opus 5.5 safeguards and accepted.
// See docs/HONEST-NUMBERS.md.
function buildRuleset(mode, hooksDir) {
  return loadRuleset(mode, hooksDir) || fallbackRuleset(mode);
}

module.exports = {
  VALID_MODES,
  DEFAULT_MODES,
  RULESET_MODES,
  concreteMode,
  canonicalMode,
  stripJsonComments,
  parseConfigFile,
  getDefaultMode,
  userConfigPaths,
  claudeDir,
  stateDir,
  validateSessionId,
  statePath,
  readSessionMode,
  writeSessionMode,
  resolveActiveMode,
  gcSessionStore,
  skillPathCandidates,
  stripFrontmatter,
  loadRuleset,
  fallbackRuleset,
  buildRuleset,
};
