// Hook, config and installer tests. Run: node --test tests/*.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const HOOKS = path.join(REPO, 'src', 'hooks');
const cfg = require(path.join(HOOKS, 'steno-config.js'));
const { parseCommand } = require(path.join(HOOKS, 'steno-parse.js'));

// Minimal env for child hooks; Windows needs SystemRoot and TEMP to start Node.
const BASE_ENV = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP']
  .filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'steno-test-'));
}

// Runs a hook with a JSON payload in an isolated config dir.
function runHook(script, payload, env = {}, args = []) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, script), ...args], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...BASE_ENV, HOME: env.HOME || tmp(), ...env },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

function ctx(out) {
  return JSON.parse(out).hookSpecificOutput.additionalContext;
}

// ---------------------------------------------------------------- parsing

test('slash commands', () => {
  assert.deepEqual(parseCommand('/steno'), { action: 'set', mode: 'auto' });
  assert.deepEqual(parseCommand('/steno strict'), { action: 'set', mode: 'steno' });
  assert.deepEqual(parseCommand('/steno lite'), { action: 'set', mode: 'lite' });
  assert.deepEqual(parseCommand('/steno ultra'), { action: 'set', mode: 'ultrasteno' });
  assert.deepEqual(parseCommand('/ultrasteno'), { action: 'set', mode: 'ultrasteno' });
  assert.deepEqual(parseCommand('/steno-lite'), { action: 'set', mode: 'lite' });
  assert.deepEqual(parseCommand('/steno:steno-lite'), { action: 'set', mode: 'lite' });
  assert.deepEqual(parseCommand('/steno:ultrasteno'), { action: 'set', mode: 'ultrasteno' });
  assert.deepEqual(parseCommand('/steno off'), { action: 'set', mode: 'off' });
  assert.deepEqual(parseCommand('/steno status'), { action: 'status' });
  assert.deepEqual(parseCommand('  /STENO Strict  then explain this'), { action: 'set', mode: 'steno' });
});

test('slash commands do not match lookalikes', () => {
  assert.equal(parseCommand('/stenography'), null);
  assert.equal(parseCommand('/steno banana'), null);
  assert.equal(parseCommand('please run /steno'), null);
});

test('natural language switches only when short and explicit', () => {
  assert.deepEqual(parseCommand('stop steno'), { action: 'set', mode: 'off' });
  assert.deepEqual(parseCommand('Normal mode please.'), { action: 'set', mode: 'off' });
  assert.deepEqual(parseCommand('steno lite'), { action: 'set', mode: 'lite' });
  assert.deepEqual(parseCommand('think in steno'), { action: 'set', mode: 'auto' });
  assert.equal(parseCommand('explain what normal mode means in vim'), null);
  assert.equal(parseCommand('how do I stop steno from compressing my commit messages in this repo?'), null);
  assert.equal(parseCommand(''), null);
  assert.equal(parseCommand(undefined), null);
});

// ---------------------------------------------------------------- config

test('mode names and aliases', () => {
  assert.equal(cfg.canonicalMode('STRICT'), 'steno');
  assert.equal(cfg.canonicalMode('ultra'), 'ultrasteno');
  assert.equal(cfg.canonicalMode('light'), 'lite');
  assert.equal(cfg.canonicalMode('auto'), 'auto');
  assert.equal(cfg.canonicalMode('auto', cfg.VALID_MODES), null);
  assert.equal(cfg.canonicalMode('nonsense'), null);
});

test('auto picks strict only on Haiku', () => {
  assert.equal(cfg.resolveAuto('claude-haiku-5-5'), 'steno');
  assert.equal(cfg.resolveAuto({ id: 'claude-haiku-5-5' }), 'steno');
  assert.equal(cfg.resolveAuto('claude-sonnet-5-5'), 'lite');
  assert.equal(cfg.resolveAuto('claude-opus-5-5'), 'lite');
  assert.equal(cfg.resolveAuto(null), 'lite');
  assert.equal(cfg.concreteMode('manual', 'x'), 'off');
  assert.equal(cfg.concreteMode('ultrasteno', 'claude-sonnet-5-5'), 'ultrasteno');
});

test('default mode: env, then repo config walking up, then user config', () => {
  const root = tmp();
  const deep = path.join(root, 'a', 'b');
  fs.mkdirSync(deep, { recursive: true });
  const saved = { ...process.env };
  try {
    delete process.env.STENO_DEFAULT_MODE;
    process.env.XDG_CONFIG_HOME = tmp();
    assert.equal(cfg.getDefaultMode(deep), 'manual', 'off until /steno by default');
    fs.mkdirSync(path.join(process.env.XDG_CONFIG_HOME, 'steno'));
    fs.writeFileSync(path.join(process.env.XDG_CONFIG_HOME, 'steno', 'config.json'), '{"defaultMode":"lite"}');
    assert.equal(cfg.getDefaultMode(deep), 'lite');
    fs.writeFileSync(path.join(root, '.steno.json'), '// comment\n{"defaultMode": "ultra",}\n');
    assert.equal(cfg.getDefaultMode(deep), 'ultrasteno');
    process.env.STENO_DEFAULT_MODE = 'off';
    assert.equal(cfg.getDefaultMode(deep), 'off');
  } finally {
    process.env = saved;
  }
});

test('config files that are symlinks are ignored', { skip: process.platform === 'win32' }, () => {
  const root = tmp();
  const real = path.join(tmp(), 'cfg.json');
  fs.writeFileSync(real, '{"defaultMode":"off"}');
  fs.symlinkSync(real, path.join(root, '.steno.json'));
  const saved = { ...process.env };
  try {
    delete process.env.STENO_DEFAULT_MODE;
    process.env.XDG_CONFIG_HOME = tmp();
    assert.equal(cfg.getDefaultMode(root), 'manual');
  } finally {
    process.env = saved;
  }
});

test('session state round trip, ids validated, symlinks replaced', () => {
  const dir = tmp();
  assert.equal(cfg.readSessionMode(dir, 'abc'), null);
  assert.ok(cfg.writeSessionMode(dir, 'abc', 'ultra'));
  assert.equal(cfg.readSessionMode(dir, 'abc'), 'ultrasteno');
  assert.equal(cfg.writeSessionMode(dir, 'abc', 'bogus'), false);
  assert.equal(cfg.validateSessionId('../etc/passwd'), null);
  cfg.writeSessionMode(dir, '../evil', 'lite');
  assert.ok(fs.existsSync(path.join(dir, '.steno', 'sessions', '_machine')));
  if (process.platform !== 'win32') {
    const target = path.join(tmp(), 'target');
    fs.writeFileSync(target, 'keep');
    fs.symlinkSync(target, path.join(dir, '.steno', 'sessions', 'linked'));
    cfg.writeSessionMode(dir, 'linked', 'steno');
    assert.equal(fs.readFileSync(target, 'utf8'), 'keep');
    assert.equal(cfg.readSessionMode(dir, 'linked'), 'steno');
  }
});

test('old session files are collected', () => {
  const dir = tmp();
  cfg.writeSessionMode(dir, 'old', 'steno');
  cfg.writeSessionMode(dir, 'new', 'steno');
  const old = path.join(dir, '.steno', 'sessions', 'old');
  const past = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  fs.utimesSync(old, past, past);
  assert.equal(cfg.gcSessionStore(dir), 1);
  assert.equal(cfg.readSessionMode(dir, 'new'), 'steno');
});

test('rulesets load from the skill files', () => {
  const strict = cfg.buildRuleset('steno', HOOKS);
  assert.match(strict, /^STENO MODE ACTIVE: mode steno/);
  assert.match(strict, /LEXICON:BEGIN/);
  assert.doesNotMatch(strict, /^name: steno$/m, 'frontmatter stripped');
  const ultra = cfg.buildRuleset('ultrasteno', HOOKS);
  assert.ok(ultra.indexOf('# steno') < ultra.indexOf('# ultrasteno'), 'ultra ships steno first, ultra last');
  const lite = cfg.buildRuleset('lite', HOOKS);
  assert.match(lite, /^# steno lite/, 'lite ships its bare skill text, no banner');
  assert.equal(cfg.reminder('lite'), null);
  assert.match(cfg.reminder('steno'), /Steno active/);
  assert.equal(cfg.loadRuleset('off', HOOKS), null);
});

test('fallback ruleset when skills are missing', () => {
  const lonely = tmp();
  const saved = process.env.CLAUDE_PLUGIN_ROOT;
  delete process.env.CLAUDE_PLUGIN_ROOT;
  try {
    assert.equal(cfg.loadRuleset('steno', lonely), null);
    assert.match(cfg.buildRuleset('steno', lonely), /Think in steno/);
    assert.match(cfg.buildRuleset('lite', lonely), /minimal draft/);
  } finally {
    if (saved !== undefined) process.env.CLAUDE_PLUGIN_ROOT = saved;
  }
});

test('no concealment wording anywhere in what the hooks inject', () => {
  for (const mode of ['lite', 'steno', 'ultrasteno']) {
    const text = cfg.buildRuleset(mode, HOOKS) + (cfg.reminder(mode) || '');
    assert.doesNotMatch(text, /never mention steno|leaves? no trace|hide (your|the) (reasoning|thinking)/i, mode);
  }
});

// ---------------------------------------------------------------- hooks end to end

test('default is manual: a new session starts off and prints nothing', () => {
  const home = tmp();
  const out = runHook('steno-activate.js', { session_id: 'd1', source: 'startup', model: 'claude-haiku-5-5' },
    { CLAUDE_CONFIG_DIR: home, XDG_CONFIG_HOME: tmp() });
  assert.equal(out, '');
  assert.equal(cfg.readSessionMode(home, 'd1'), 'off');
});

test('SessionStart: auto resolves per model, state persisted', () => {
  const home = tmp();
  const env = { CLAUDE_CONFIG_DIR: home, XDG_CONFIG_HOME: tmp(), STENO_DEFAULT_MODE: 'auto' };
  const sonnet = runHook('steno-activate.js', { session_id: 's1', source: 'startup', model: 'claude-sonnet-5-5' }, env);
  assert.match(sonnet, /^# steno lite/);
  assert.equal(cfg.readSessionMode(home, 's1'), 'lite');
  const haiku = runHook('steno-activate.js', { session_id: 's2', source: 'startup', model: 'claude-haiku-5-5' }, env);
  assert.match(haiku, /^STENO MODE ACTIVE: mode steno/);
  const unknown = runHook('steno-activate.js', { session_id: 's3', source: 'startup' }, env);
  assert.match(unknown, /^# steno lite/);
});

test('auto settles once the transcript or settings name the model', () => {
  const home = tmp();
  const env = { CLAUDE_CONFIG_DIR: home, XDG_CONFIG_HOME: tmp(), STENO_DEFAULT_MODE: 'auto' };
  const start = runHook('steno-activate.js', { session_id: 'a1', source: 'startup', cwd: tmp() }, env);
  assert.match(start, /^# steno lite/, 'unknown model starts lite');
  assert.ok(cfg.isAutoPending(home, 'a1'));
  const transcript = path.join(tmp(), 't.jsonl');
  fs.writeFileSync(transcript, JSON.stringify({ type: 'assistant', message: { model: 'claude-haiku-5-5', content: [] } }) + '\n');
  const up = ctx(runHook('steno-mode-tracker.js', { session_id: 'a1', prompt: 'next', transcript_path: transcript }, env));
  assert.match(up, /mode steno/, 'haiku reply upgrades to strict');
  assert.equal(cfg.readSessionMode(home, 'a1'), 'steno');
  assert.ok(!cfg.isAutoPending(home, 'a1'));
  // Sonnet in the transcript: stays lite, pending cleared, no output.
  runHook('steno-activate.js', { session_id: 'a2', source: 'startup', cwd: tmp() }, env);
  fs.writeFileSync(transcript, JSON.stringify({ message: { model: 'claude-sonnet-5-5' } }) + '\n');
  assert.equal(runHook('steno-mode-tracker.js', { session_id: 'a2', prompt: 'x', transcript_path: transcript }, env), '');
  assert.equal(cfg.readSessionMode(home, 'a2'), 'lite');
  // A model in settings.json resolves at session start.
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({ model: 'haiku' }));
  assert.match(runHook('steno-activate.js', { session_id: 'a3', source: 'startup', cwd: tmp() }, env), /mode steno/);
});

test('SessionStart: resume keeps the session mode, manual starts off', () => {
  const home = tmp();
  const env = { CLAUDE_CONFIG_DIR: home, XDG_CONFIG_HOME: tmp(), STENO_DEFAULT_MODE: 'auto' };
  cfg.writeSessionMode(home, 'r1', 'ultrasteno');
  const out = runHook('steno-activate.js', { session_id: 'r1', source: 'resume', model: 'claude-sonnet-5-5' }, env);
  assert.match(out, /mode ultrasteno/);
  const off = runHook('steno-activate.js', { session_id: 'm1', source: 'startup' }, { ...env, STENO_DEFAULT_MODE: 'manual' });
  assert.equal(off, '');
  assert.equal(cfg.readSessionMode(home, 'm1'), 'off');
});

test('UserPromptSubmit: switch, status, reminder', () => {
  const home = tmp();
  const env = { CLAUDE_CONFIG_DIR: home, XDG_CONFIG_HOME: tmp(), STENO_DEFAULT_MODE: 'auto' };
  runHook('steno-activate.js', { session_id: 'u1', source: 'startup', model: 'claude-haiku-5-5' }, env);
  assert.match(ctx(runHook('steno-mode-tracker.js', { session_id: 'u1', prompt: 'fix my bug' }, env)), /^Steno active \(steno\)/);
  assert.match(ctx(runHook('steno-mode-tracker.js', { session_id: 'u1', prompt: '/steno ultra' }, env)), /switched to ultrasteno/);
  assert.equal(cfg.readSessionMode(home, 'u1'), 'ultrasteno');
  assert.match(ctx(runHook('steno-mode-tracker.js', { session_id: 'u1', prompt: '/steno status' }, env)), /Steno mode: ultrasteno$/);
  assert.match(ctx(runHook('steno-mode-tracker.js', { session_id: 'u1', prompt: '/steno' }, env)), /mode steno/, 'bare /steno on haiku -> strict');
  assert.match(ctx(runHook('steno-mode-tracker.js', { session_id: 'u1', prompt: 'stop steno' }, env)), /OFF/);
  assert.equal(runHook('steno-mode-tracker.js', { session_id: 'u1', prompt: 'hello' }, env), '');
});

test('UserPromptSubmit: lite gets no per-turn reminder, bare /steno resolves to lite on sonnet', () => {
  const home = tmp();
  const env = { CLAUDE_CONFIG_DIR: home, XDG_CONFIG_HOME: tmp(), STENO_DEFAULT_MODE: 'auto' };
  runHook('steno-activate.js', { session_id: 'l1', source: 'startup', model: 'claude-sonnet-5-5' }, env);
  assert.equal(runHook('steno-mode-tracker.js', { session_id: 'l1', prompt: 'explain this' }, env), '');
  runHook('steno-mode-tracker.js', { session_id: 'l1', prompt: '/steno off' }, env);
  const on = ctx(runHook('steno-mode-tracker.js', { session_id: 'l1', prompt: '/steno' }, env));
  assert.match(on, /^# steno lite/);
  assert.equal(cfg.readSessionMode(home, 'l1'), 'lite');
});

test('SubagentStart passes the active ruleset, nothing when off', () => {
  const home = tmp();
  const env = { CLAUDE_CONFIG_DIR: home, XDG_CONFIG_HOME: tmp(), STENO_DEFAULT_MODE: 'auto' };
  cfg.writeSessionMode(home, 'p1', 'steno');
  const out = JSON.parse(runHook('steno-activate.js', { session_id: 'p1' }, env, ['--subagent']));
  assert.equal(out.hookSpecificOutput.hookEventName, 'SubagentStart');
  assert.match(out.hookSpecificOutput.additionalContext, /mode steno/);
  cfg.writeSessionMode(home, 'p2', 'off');
  assert.equal(runHook('steno-activate.js', { session_id: 'p2' }, env, ['--subagent']), '');
});

test('other hosts: cursor JSON, codex plain text, off prints nothing', () => {
  const env = { XDG_CONFIG_HOME: tmp(), STENO_DEFAULT_MODE: 'auto' };
  const cursor = JSON.parse(runHook('steno-host-session-start.js', { workspace_roots: [tmp()] }, env, ['cursor']));
  assert.match(cursor.additional_context, /^# steno lite/);
  const codex = runHook('steno-host-session-start.js', { cwd: tmp() }, { ...env, STENO_DEFAULT_MODE: 'strict' }, ['codex']);
  assert.match(codex, /^STENO MODE ACTIVE: mode steno/);
  assert.equal(runHook('steno-host-session-start.js', {}, { ...env, STENO_DEFAULT_MODE: 'off' }, ['codex']), '');
  assert.equal(runHook('steno-host-session-start.js', {}, { ...env, STENO_DEFAULT_MODE: 'off' }, ['copilot']), '{}');
});

test('statusline badge', () => {
  const home = tmp();
  cfg.writeSessionMode(home, 'b1', 'lite');
  assert.equal(runHook('steno-statusline.js', { session_id: 'b1' }, { CLAUDE_CONFIG_DIR: home }), '[STENO:LITE]');
  cfg.writeSessionMode(home, 'b1', 'off');
  assert.equal(runHook('steno-statusline.js', { session_id: 'b1' }, { CLAUDE_CONFIG_DIR: home }), '');
});

test('hooks fail open on garbage input', () => {
  for (const script of ['steno-activate.js', 'steno-mode-tracker.js', 'steno-statusline.js']) {
    const r = spawnSync(process.execPath, [path.join(HOOKS, script)], {
      input: '{not json', encoding: 'utf8', env: { ...BASE_ENV, HOME: tmp(), CLAUDE_CONFIG_DIR: tmp() },
    });
    assert.equal(r.status, 0, script);
  }
});

// ---------------------------------------------------------------- installer

function install(home, ...flags) {
  const r = spawnSync(process.execPath, [path.join(REPO, 'installer', 'install.js'), ...flags], {
    encoding: 'utf8', env: { ...BASE_ENV, HOME: home, CLAUDE_CONFIG_DIR: home },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test('installer: idempotent, keeps foreign settings, uninstalls cleanly', () => {
  const home = tmp();
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({
    model: 'opus',
    hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] },
  }));
  install(home);
  install(home, '--statusline');
  const s = JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8'));
  assert.equal(s.model, 'opus');
  assert.equal(s.hooks.SessionStart.length, 2, 'foreign hook kept, ours added once');
  assert.equal(s.hooks.UserPromptSubmit.length, 1);
  assert.equal(s.hooks.SubagentStart.length, 1);
  assert.match(s.statusLine.command, /steno-statusline\.js/);
  for (const k of ['steno', 'steno-lite', 'ultrasteno']) {
    assert.ok(fs.existsSync(path.join(home, 'skills', k, 'SKILL.md')), k);
  }
  // The installed hooks find their installed skills.
  const out = spawnSync(process.execPath, [path.join(home, 'steno', 'hooks', 'steno-activate.js')], {
    input: JSON.stringify({ session_id: 'i1', source: 'startup', model: 'claude-haiku-5-5' }),
    encoding: 'utf8', env: { ...BASE_ENV, HOME: home, CLAUDE_CONFIG_DIR: home, XDG_CONFIG_HOME: tmp(), STENO_DEFAULT_MODE: 'auto' },
  }).stdout;
  assert.match(out, /LEXICON:BEGIN/);

  install(home, '--uninstall');
  const after = JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8'));
  assert.deepEqual(after, { model: 'opus', hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] } });
  assert.ok(!fs.existsSync(path.join(home, 'steno')));
  assert.ok(!fs.existsSync(path.join(home, 'skills', 'steno')));
});

test('installer dry run changes nothing', () => {
  const home = tmp();
  const out = install(home, '--dry-run');
  assert.match(out, /\[dry-run\]/);
  assert.deepEqual(fs.readdirSync(home), []);
});

// ---------------------------------------------------------------- manifests

test('plugin manifests are valid and point at real files', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin', 'plugin.json'), 'utf8'));
  for (const event of ['SessionStart', 'SubagentStart', 'UserPromptSubmit']) {
    const cmd = plugin.hooks[event][0].hooks[0].command;
    const script = cmd.match(/src\/hooks\/([\w-]+\.js)/)[1];
    assert.ok(fs.existsSync(path.join(HOOKS, script)), script);
  }
  JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin', 'marketplace.json'), 'utf8'));
  JSON.parse(fs.readFileSync(path.join(REPO, '.cursor-plugin', 'plugin.json'), 'utf8'));
  JSON.parse(fs.readFileSync(path.join(REPO, 'hooks', 'hooks-cursor.json'), 'utf8'));
  JSON.parse(fs.readFileSync(path.join(REPO, '.codex', 'hooks.json'), 'utf8'));
  const versions = [
    plugin.version,
    JSON.parse(fs.readFileSync(path.join(REPO, '.cursor-plugin', 'plugin.json'), 'utf8')).version,
    JSON.parse(fs.readFileSync(path.join(REPO, 'gemini-extension.json'), 'utf8')).version,
    JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version,
  ];
  assert.equal(new Set(versions).size, 1, 'versions in sync: ' + versions.join(', '));
});

test('every skill has frontmatter with a name matching its folder', () => {
  for (const dir of fs.readdirSync(path.join(REPO, 'skills'))) {
    const file = path.join(REPO, 'skills', dir, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    const head = fs.readFileSync(file, 'utf8').split('\n').slice(0, 3).join('\n');
    assert.match(head, new RegExp('^---\\nname: ' + dir + '\\n'), dir);
  }
});
