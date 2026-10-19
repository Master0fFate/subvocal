// steno — shared config, mode state and ruleset loading for every hook.
//
// Zero dependencies. Every function fails open: a broken config or an
// unreadable state file degrades to the default mode, never to an error that
// blocks a session.
//
// Default mode resolution (first hit wins):
//   1. STENO_DEFAULT_MODE environment variable
//   2. Repo config: <dir>/.steno/config.json or <dir>/.steno.json, walking up
//   3. User config: $XDG_CONFIG_HOME/steno/config.json, else
//      ~/.config/steno/config.json (Windows: %APPDATA%\steno\config.json first)
//   4. 'manual': off until /steno. The evals in docs/HONEST-NUMBERS.md found
//      no thinking-token saving on Claude 5.5 models (strict modes cost more),
//      so steno does not switch itself on by default.
// A config file looks like
//   {"defaultMode": "auto" | "lite" | "steno" | "ultrasteno" | "off" | "manual"}.
// 'auto' picks per model: strict steno on Haiku, lite elsewhere, because the
// Sonnet 5.5 and Opus 5.5 safeguards decline the strict ruleset (see
// docs/HONEST-NUMBERS.md). Unknown model -> lite. 'manual': start off.
//
// Mode state is per session: <claude dir>/.steno/sessions/<session_id>.
// A session id that is missing or malformed falls back to one machine-wide
// file, so a host that sends no id still works.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const VALID_MODES = ['off', 'lite', 'steno', 'ultrasteno'];
const DEFAULT_MODES = [...VALID_MODES, 'manual', 'auto'];
const ALIASES = {
  on: 'auto', strict: 'steno', full: 'steno', light: 'lite', 'steno-lite': 'lite',
  ultra: 'ultrasteno', max: 'ultrasteno', none: 'off',
};
const RULESET_MODES = ['lite', 'steno', 'ultrasteno'];
const MODE_SKILL = { lite: 'steno-lite', steno: 'steno', ultrasteno: 'ultrasteno' };

// Strict steno only where it is known to be accepted. Everything else,
// including an unknown model, gets lite.
function resolveAuto(model) {
  const id = typeof model === 'string' ? model : (model && (model.id || model.name)) || '';
  return /haiku/i.test(String(id)) ? 'steno' : 'lite';
}

// Turns a configured or requested mode into a concrete one.
function concreteMode(mode, model) {
  if (mode === 'auto') return resolveAuto(model);
  if (mode === 'manual') return 'off';
  return mode;
}

// Best-effort model id for a hook run: payload first, then env. Claude Code's
// SessionStart payload carries no model, so callers also try settings files
// and, once the first reply exists, the transcript.
function modelFrom(payload) {
  const m = payload && payload.model;
  if (typeof m === 'string' && m) return m;
  if (m && typeof m === 'object' && (m.id || m.name)) return m.id || m.name;
  return process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || null;
}

// The "model" setting from project-local, project, then user settings.json.
function modelFromSettings(cwd) {
  const files = [];
  if (cwd) {
    files.push(path.join(cwd, '.claude', 'settings.local.json'), path.join(cwd, '.claude', 'settings.json'));
  }
  files.push(path.join(claudeDir(), 'settings.json'));
  for (const f of files) {
    try {
      const m = parseConfigFile(f).model;
      if (typeof m === 'string' && m) return m;
    } catch (e) { /* absent or invalid */ }
  }
  return null;
}

// The model that wrote the latest assistant message in a transcript (JSONL).
// Reads only the tail of the file.
function modelFromTranscript(file) {
  if (typeof file !== 'string' || !file) return null;
  try {
    const st = fs.statSync(file);
    const len = Math.min(st.size, 256 * 1024);
    const buf = Buffer.alloc(len);
    const fd = fs.openSync(file, 'r');
    try { fs.readSync(fd, buf, 0, len, st.size - len); } finally { fs.closeSync(fd); }
    const hits = buf.toString('utf8').match(/"model"\s*:\s*"(claude-[^"]{1,100})"/g);
    if (!hits) return null;
    return hits[hits.length - 1].replace(/^.*"(claude-[^"]+)"$/, '$1');
  } catch (e) {
    return null;
  }
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
  if (process.env.XDG_CONFIG_HOME) return [path.join(process.env.XDG_CONFIG_HOME, 'steno', 'config.json')];
  const unix = path.join(home, '.config', 'steno', 'config.json');
  if (process.platform === 'win32') {
    return [path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'steno', 'config.json'), unix];
  }
  return [unix];
}

function getDefaultMode(startDir) {
  const env = canonicalMode(process.env.STENO_DEFAULT_MODE);
  if (env) return env;
  try {
    let dir = path.resolve(startDir || process.cwd());
    for (let i = 0; i < 64; i++) {
      for (const rel of [path.join('.steno', 'config.json'), '.steno.json']) {
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
  return 'manual';
}

// ---------------------------------------------------------------------------
// Per-session state
// ---------------------------------------------------------------------------

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function stateDir(dir) {
  return path.join(dir || claudeDir(), '.steno', 'sessions');
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

// The model seen at session start, so a later bare `/steno` can resolve 'auto'.
function writeSessionModel(dir, sid, model) {
  if (typeof model !== 'string' || !model) return false;
  try {
    const file = statePath(dir, sid) + '.model';
    try { if (fs.lstatSync(file).isSymbolicLink()) fs.unlinkSync(file); } catch (e) { /* absent */ }
    fs.mkdirSync(stateDir(dir), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, model.slice(0, 128), { mode: 0o600 });
    return true;
  } catch (e) {
    return false;
  }
}

function readSessionModel(dir, sid) {
  try {
    const file = statePath(dir, sid) + '.model';
    if (!fs.lstatSync(file).isFile()) return null;
    return fs.readFileSync(file, 'utf8').slice(0, 128).trim() || null;
  } catch (e) {
    return null;
  }
}

// Marks a session whose mode came from 'auto' before its model was known, so
// the prompt hook can settle it once the transcript names the model.
function setAutoPending(dir, sid, pending) {
  const file = statePath(dir, sid) + '.auto';
  try {
    if (pending) {
      fs.mkdirSync(stateDir(dir), { recursive: true, mode: 0o700 });
      try { if (fs.lstatSync(file).isSymbolicLink()) fs.unlinkSync(file); } catch (e) { /* absent */ }
      fs.writeFileSync(file, '1', { mode: 0o600 });
    } else {
      fs.unlinkSync(file);
    }
    return true;
  } catch (e) {
    return false;
  }
}

function isAutoPending(dir, sid) {
  try { return fs.lstatSync(statePath(dir, sid) + '.auto').isFile(); } catch (e) { return false; }
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
  list.push(path.join(hooksDir, '..', 'skills', mode, 'SKILL.md'));       // install: steno/hooks -> steno/skills
  list.push(path.join(hooksDir, 'skills', mode, 'SKILL.md'));
  return list;
}

function stripFrontmatter(text) {
  return text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

function loadRuleset(mode, hooksDir) {
  if (!RULESET_MODES.includes(mode)) return null;
  for (const file of skillPathCandidates(MODE_SKILL[mode], hooksDir || __dirname)) {
    try {
      const body = stripFrontmatter(fs.readFileSync(file, 'utf8'));
      if (body) {
        // ultrasteno builds on steno: ship both, ultra last so it wins.
        if (mode === 'ultrasteno') {
          const base = loadRuleset('steno', hooksDir);
          return base ? base + '\n\n---\n\n' + body : body;
        }
        return body;
      }
    } catch (e) { /* try next layout */ }
  }
  return null;
}

// Used only when no SKILL.md can be found (a partial install). Short, but it
// carries every hard rule so steno still behaves.
function fallbackRuleset(mode) {
  if (mode === 'lite') {
    return [
      'Keep each reasoning step to a minimal draft: one short line, a few words.',
      'Prefer compact notation where it is shorter: → for "so", =, !=, <, >, true, false, if, else. → and => are 1 token; -> is 2; ∴ ≠ ≥ ✓ are 4.',
      'Give a long term you repeat a one-letter name. Keep every step and check you would normally do.',
      'Write the reply normally, in the user\'s language.',
    ].join('\n');
  }
  const ultra = mode === 'ultrasteno'
    ? '\nULTRA: no # notes, no do: plans, alias at first mention, one-word keys, no articles/pronouns/auxiliary verbs, lines under ~12 tokens.'
    : '';
  return [
    'Think in steno. Reply in prose.',
    'Thinking only: every line is one form: find: | key: value | A := thing | a → b | expr = value | code line | case ... | ? question | !: wrong → fix | check: expr true|false | do: a; b | # note | => result.',
    'Measured 1-token forms: → => = != > < & not in none * / + - true false if else case ==. Banned (2-5 tokens): ∴ ∵ ≠ ≥ ≤ ≈ ∀ ∃ ∈ ∅ ✓ ✗ ¬ ∧ ∨ -> ~ e.g. i.e.',
    'Newline is the only connective. No narration (let me, okay, hmm, the user wants, I think). Aliases: one capital letter; never letter+digit.',
    'Same reasoning: every step and check kept. Payload exact, negations kept. Think in English.',
    'Shorthand, not a cipher: every line legible, every consideration that shapes the answer stays in the trace.',
    'Reply: normal prose for the reader, in the user\'s language, aliases expanded.',
  ].join('\n') + ultra;
}

function rulesetBanner(mode) {
  return 'STENO MODE ACTIVE: mode ' + mode + '. Steno is a shorthand for your reasoning. Your reply is written normally.';
}

// Lite ships as its bare skill text, nothing added: that exact text is what
// was tested against the Sonnet 5.5 / Opus 5.5 safeguards and accepted, and
// the banner + reminder variant was not. See docs/HONEST-NUMBERS.md.
function buildRuleset(mode, hooksDir) {
  const body = loadRuleset(mode, hooksDir) || fallbackRuleset(mode);
  return mode === 'lite' ? body : rulesetBanner(mode) + '\n\n' + body;
}

// Per-turn reinforcement. Short on purpose: it is paid on every prompt.
// Lite has no per-turn reminder (see buildRuleset); returns null.
function reminder(mode) {
  if (mode === 'lite') return null;
  const extra = mode === 'ultrasteno' ? ' Ultra: no notes/plans, alias at first mention, no glue words.' : '';
  return 'Steno active (' + mode + '). Thinking: steno lines only, measured forms (→ => = != true false ? !: :=), '
    + 'newline as connective, aliases, no narration, every step and check kept.' + extra
    + ' Shorthand stays legible and complete. Reply: normal prose in the user\'s language, aliases expanded.';
}

module.exports = {
  VALID_MODES,
  DEFAULT_MODES,
  RULESET_MODES,
  MODE_SKILL,
  resolveAuto,
  concreteMode,
  modelFrom,
  modelFromSettings,
  modelFromTranscript,
  setAutoPending,
  isAutoPending,
  writeSessionModel,
  readSessionModel,
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
  rulesetBanner,
  buildRuleset,
  reminder,
};
