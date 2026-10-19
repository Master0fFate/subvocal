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
const cfg = require(path.join(HOOKS, 'subvocal-config.js'));
const { parseCommand } = require(path.join(HOOKS, 'subvocal-parse.js'));

// Minimal env for child hooks; Windows needs SystemRoot and TEMP to start Node.
const BASE_ENV = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP']
  .filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'subvocal-test-'));
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
  assert.deepEqual(parseCommand('/subvocal'), { action: 'set', mode: 'subvocal' });
  assert.deepEqual(parseCommand('/subvocal lite'), { action: 'set', mode: 'subvocal' });
  assert.deepEqual(parseCommand('/subvocal ultra'), { action: 'set', mode: 'ultrasubvocal' });
  assert.deepEqual(parseCommand('/ultrasubvocal'), { action: 'set', mode: 'ultrasubvocal' });
  assert.deepEqual(parseCommand('/subvocal:ultrasubvocal'), { action: 'set', mode: 'ultrasubvocal' });
  assert.deepEqual(parseCommand('/subvocal off'), { action: 'set', mode: 'off' });
  assert.deepEqual(parseCommand('/subvocal status'), { action: 'status' });
  assert.deepEqual(parseCommand('  /SUBVOCAL Ultra  then explain this'), { action: 'set', mode: 'ultrasubvocal' });
});

test('slash commands do not match lookalikes', () => {
  assert.equal(parseCommand('/stenography'), null);
  assert.equal(parseCommand('/subvocal banana'), null);
  assert.equal(parseCommand('please run /subvocal'), null);
});

test('natural language switches only when short and explicit', () => {
  assert.deepEqual(parseCommand('stop subvocal'), { action: 'set', mode: 'off' });
  assert.deepEqual(parseCommand('Normal mode please.'), { action: 'set', mode: 'off' });
  assert.deepEqual(parseCommand('subvocal mode'), { action: 'set', mode: 'subvocal' });
  assert.deepEqual(parseCommand('think in subvocal'), { action: 'set', mode: 'subvocal' });
  assert.deepEqual(parseCommand('ultrasubvocal'), { action: 'set', mode: 'ultrasubvocal' });
  assert.equal(parseCommand('explain what normal mode means in vim'), null);
  assert.equal(parseCommand('how do I stop subvocal from compressing my commit messages in this repo?'), null);
  assert.equal(parseCommand(''), null);
  assert.equal(parseCommand(undefined), null);
});

// ---------------------------------------------------------------- config

test('mode names and aliases', () => {
  assert.equal(cfg.canonicalMode('LITE'), 'subvocal');
  assert.equal(cfg.canonicalMode('ultra'), 'ultrasubvocal');
  assert.equal(cfg.canonicalMode('strict'), null);
  assert.equal(cfg.canonicalMode('auto'), 'auto');
  assert.equal(cfg.canonicalMode('auto', cfg.VALID_MODES), null);
  assert.equal(cfg.canonicalMode('nonsense'), null);
});

test('auto is subvocal, manual is off', () => {
  assert.equal(cfg.concreteMode('auto'), 'subvocal');
  assert.equal(cfg.concreteMode('manual'), 'off');
  assert.equal(cfg.concreteMode('ultrasubvocal'), 'ultrasubvocal');
});

test('default mode: env, then repo config walking up, then user config', () => {
  const root = tmp();
  const deep = path.join(root, 'a', 'b');
  fs.mkdirSync(deep, { recursive: true });
  const saved = { ...process.env };
  try {
    delete process.env.SUBVOCAL_DEFAULT_MODE;
    process.env.XDG_CONFIG_HOME = tmp();
    assert.equal(cfg.getDefaultMode(deep), 'auto', 'subvocal everywhere by default');
    fs.mkdirSync(path.join(process.env.XDG_CONFIG_HOME, 'subvocal'));
    fs.writeFileSync(path.join(process.env.XDG_CONFIG_HOME, 'subvocal', 'config.json'), '{"defaultMode":"lite"}');
    assert.equal(cfg.getDefaultMode(deep), 'subvocal');
    fs.writeFileSync(path.join(root, '.subvocal.json'), '// comment\n{"defaultMode": "ultra",}\n');
    assert.equal(cfg.getDefaultMode(deep), 'ultrasubvocal');
    process.env.SUBVOCAL_DEFAULT_MODE = 'off';
    assert.equal(cfg.getDefaultMode(deep), 'off');
  } finally {
    process.env = saved;
  }
});

test('config files that are symlinks are ignored', { skip: process.platform === 'win32' }, () => {
  const root = tmp();
  const real = path.join(tmp(), 'cfg.json');
  fs.writeFileSync(real, '{"defaultMode":"off"}');
  fs.symlinkSync(real, path.join(root, '.subvocal.json'));
  const saved = { ...process.env };
  try {
    delete process.env.SUBVOCAL_DEFAULT_MODE;
    process.env.XDG_CONFIG_HOME = tmp();
    assert.equal(cfg.getDefaultMode(root), 'auto');
  } finally {
    process.env = saved;
  }
});

test('session state round trip, ids validated, symlinks replaced', () => {
  const dir = tmp();
  assert.equal(cfg.readSessionMode(dir, 'abc'), null);
  assert.ok(cfg.writeSessionMode(dir, 'abc', 'ultra'));
  assert.equal(cfg.readSessionMode(dir, 'abc'), 'ultrasubvocal');
  assert.equal(cfg.writeSessionMode(dir, 'abc', 'bogus'), false);
  assert.equal(cfg.validateSessionId('../etc/passwd'), null);
  cfg.writeSessionMode(dir, '../evil', 'subvocal');
  assert.ok(fs.existsSync(path.join(dir, '.subvocal', 'sessions', '_machine')));
  if (process.platform !== 'win32') {
    const target = path.join(tmp(), 'target');
    fs.writeFileSync(target, 'keep');
    fs.symlinkSync(target, path.join(dir, '.subvocal', 'sessions', 'linked'));
    cfg.writeSessionMode(dir, 'linked', 'subvocal');
    assert.equal(fs.readFileSync(target, 'utf8'), 'keep');
    assert.equal(cfg.readSessionMode(dir, 'linked'), 'subvocal');
  }
});

test('old session files are collected', () => {
  const dir = tmp();
  cfg.writeSessionMode(dir, 'old', 'subvocal');
  cfg.writeSessionMode(dir, 'new', 'subvocal');
  const old = path.join(dir, '.subvocal', 'sessions', 'old');
  const past = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  fs.utimesSync(old, past, past);
  assert.equal(cfg.gcSessionStore(dir), 1);
  assert.equal(cfg.readSessionMode(dir, 'new'), 'subvocal');
});

test('rulesets load from the skill files', () => {
  const subvocal = cfg.buildRuleset('subvocal', HOOKS);
  assert.match(subvocal, /^Keep your internal reasoning concise/, 'bare skill text, no banner');
  assert.doesNotMatch(subvocal, /^name: subvocal$/m, 'frontmatter stripped');
  const ultra = cfg.buildRuleset('ultrasubvocal', HOOKS);
  assert.match(ultra, /^Keep your internal reasoning very concise/);
  assert.equal(cfg.loadRuleset('off', HOOKS), null);
});

test('fallback ruleset when skills are missing', () => {
  const lonely = tmp();
  const saved = process.env.CLAUDE_PLUGIN_ROOT;
  delete process.env.CLAUDE_PLUGIN_ROOT;
  try {
    assert.equal(cfg.loadRuleset('subvocal', lonely), null);
    assert.match(cfg.buildRuleset('subvocal', lonely), /^Keep your internal reasoning concise/);
    assert.match(cfg.buildRuleset('ultrasubvocal', lonely), /^Keep your internal reasoning very concise/);
  } finally {
    if (saved !== undefined) process.env.CLAUDE_PLUGIN_ROOT = saved;
  }
});

test('no concealment wording anywhere in what the hooks inject', () => {
  for (const mode of ['subvocal', 'ultrasubvocal']) {
    const text = cfg.buildRuleset(mode, HOOKS);
    assert.doesNotMatch(text, /never mention subvocal|leaves? no trace|hide (your|the) (reasoning|thinking)/i, mode);
  }
});

// ---------------------------------------------------------------- hooks end to end

test('default is auto: a new session starts in subvocal', () => {
  const home = tmp();
  const out = runHook('subvocal-activate.js', { session_id: 'd1', source: 'startup', model: 'claude-haiku-5-5' },
    { CLAUDE_CONFIG_DIR: home, XDG_CONFIG_HOME: tmp() });
  assert.match(out, /^Keep your internal reasoning concise/);
  assert.equal(cfg.readSessionMode(home, 'd1'), 'subvocal');
});

test('SessionStart: auto is subvocal on every model, state persisted', () => {
  const home = tmp();
  const env = { CLAUDE_CONFIG_DIR: home, XDG_CONFIG_HOME: tmp(), SUBVOCAL_DEFAULT_MODE: 'auto' };
  const sonnet = runHook('subvocal-activate.js', { session_id: 's1', source: 'startup', model: 'claude-sonnet-5-5' }, env);
  assert.match(sonnet, /^Keep your internal reasoning concise/);
  assert.equal(cfg.readSessionMode(home, 's1'), 'subvocal');
  const haiku = runHook('subvocal-activate.js', { session_id: 's2', source: 'startup', model: 'claude-haiku-5-5' }, env);
  assert.match(haiku, /^Keep your internal reasoning concise/);
  assert.equal(cfg.readSessionMode(home, 's2'), 'subvocal');
  const unknown = runHook('subvocal-activate.js', { session_id: 's3', source: 'startup' }, env);
  assert.match(unknown, /^Keep your internal reasoning concise/);
});

test('SessionStart: resume keeps the session mode, manual starts off', () => {
  const home = tmp();
  const env = { CLAUDE_CONFIG_DIR: home, XDG_CONFIG_HOME: tmp(), SUBVOCAL_DEFAULT_MODE: 'auto' };
  cfg.writeSessionMode(home, 'r1', 'ultrasubvocal');
  const out = runHook('subvocal-activate.js', { session_id: 'r1', source: 'resume', model: 'claude-sonnet-5-5' }, env);
  assert.match(out, /^Keep your internal reasoning very concise/);
  const off = runHook('subvocal-activate.js', { session_id: 'm1', source: 'startup' }, { ...env, SUBVOCAL_DEFAULT_MODE: 'manual' });
  assert.equal(off, '');
  assert.equal(cfg.readSessionMode(home, 'm1'), 'off');
});

test('UserPromptSubmit: switch, status, no output otherwise', () => {
  const home = tmp();
  const env = { CLAUDE_CONFIG_DIR: home, XDG_CONFIG_HOME: tmp(), SUBVOCAL_DEFAULT_MODE: 'auto' };
  runHook('subvocal-activate.js', { session_id: 'u1', source: 'startup', model: 'claude-haiku-5-5' }, env);
  assert.equal(runHook('subvocal-mode-tracker.js', { session_id: 'u1', prompt: 'fix my bug' }, env), '');
  assert.match(ctx(runHook('subvocal-mode-tracker.js', { session_id: 'u1', prompt: '/subvocal ultra' }, env)), /^Keep your internal reasoning very concise/);
  assert.equal(cfg.readSessionMode(home, 'u1'), 'ultrasubvocal');
  assert.equal(runHook('subvocal-mode-tracker.js', { session_id: 'u1', prompt: 'fix my bug' }, env), '');
  assert.match(ctx(runHook('subvocal-mode-tracker.js', { session_id: 'u1', prompt: '/subvocal status' }, env)), /Subvocal mode: ultrasubvocal$/);
  assert.match(ctx(runHook('subvocal-mode-tracker.js', { session_id: 'u1', prompt: '/subvocal' }, env)), /^Keep your internal reasoning concise/);
  assert.equal(cfg.readSessionMode(home, 'u1'), 'subvocal');
  assert.match(ctx(runHook('subvocal-mode-tracker.js', { session_id: 'u1', prompt: 'stop subvocal' }, env)), /OFF/);
  assert.equal(runHook('subvocal-mode-tracker.js', { session_id: 'u1', prompt: 'hello' }, env), '');
});

test('SubagentStart passes the active ruleset, nothing when off', () => {
  const home = tmp();
  const env = { CLAUDE_CONFIG_DIR: home, XDG_CONFIG_HOME: tmp(), SUBVOCAL_DEFAULT_MODE: 'auto' };
  cfg.writeSessionMode(home, 'p1', 'subvocal');
  const out = JSON.parse(runHook('subvocal-activate.js', { session_id: 'p1' }, env, ['--subagent']));
  assert.equal(out.hookSpecificOutput.hookEventName, 'SubagentStart');
  assert.match(out.hookSpecificOutput.additionalContext, /^Keep your internal reasoning concise/);
  cfg.writeSessionMode(home, 'p2', 'off');
  assert.equal(runHook('subvocal-activate.js', { session_id: 'p2' }, env, ['--subagent']), '');
});

test('other hosts: cursor JSON, codex plain text, off prints nothing', () => {
  const env = { XDG_CONFIG_HOME: tmp(), SUBVOCAL_DEFAULT_MODE: 'auto' };
  const cursor = JSON.parse(runHook('subvocal-host-session-start.js', { workspace_roots: [tmp()] }, env, ['cursor']));
  assert.match(cursor.additional_context, /^Keep your internal reasoning concise/);
  const codex = runHook('subvocal-host-session-start.js', { cwd: tmp() }, { ...env, SUBVOCAL_DEFAULT_MODE: 'ultra' }, ['codex']);
  assert.match(codex, /^Keep your internal reasoning very concise/);
  assert.equal(runHook('subvocal-host-session-start.js', {}, { ...env, SUBVOCAL_DEFAULT_MODE: 'off' }, ['codex']), '');
  assert.equal(runHook('subvocal-host-session-start.js', {}, { ...env, SUBVOCAL_DEFAULT_MODE: 'off' }, ['copilot']), '{}');
});

test('statusline badge', () => {
  const home = tmp();
  cfg.writeSessionMode(home, 'b1', 'subvocal');
  assert.equal(runHook('subvocal-statusline.js', { session_id: 'b1' }, { CLAUDE_CONFIG_DIR: home }), '[SUBVOCAL]');
  cfg.writeSessionMode(home, 'b1', 'ultrasubvocal');
  assert.equal(runHook('subvocal-statusline.js', { session_id: 'b1' }, { CLAUDE_CONFIG_DIR: home }), '[SUBVOCAL:ULTRA]');
  cfg.writeSessionMode(home, 'b1', 'off');
  assert.equal(runHook('subvocal-statusline.js', { session_id: 'b1' }, { CLAUDE_CONFIG_DIR: home }), '');
});

test('hooks fail open on garbage input', () => {
  for (const script of ['subvocal-activate.js', 'subvocal-mode-tracker.js', 'subvocal-statusline.js']) {
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
  assert.match(s.statusLine.command, /subvocal-statusline\.js/);
  for (const k of ['subvocal', 'ultrasubvocal']) {
    assert.ok(fs.existsSync(path.join(home, 'skills', k, 'SKILL.md')), k);
  }
  // The installed hooks find their installed skills.
  const out = spawnSync(process.execPath, [path.join(home, 'subvocal', 'hooks', 'subvocal-activate.js')], {
    input: JSON.stringify({ session_id: 'i1', source: 'startup', model: 'claude-haiku-5-5' }),
    encoding: 'utf8', env: { ...BASE_ENV, HOME: home, CLAUDE_CONFIG_DIR: home, XDG_CONFIG_HOME: tmp(), SUBVOCAL_DEFAULT_MODE: 'ultrasubvocal' },
  }).stdout;
  assert.match(out, /^Keep your internal reasoning very concise/);

  install(home, '--uninstall');
  const after = JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8'));
  assert.deepEqual(after, { model: 'opus', hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] } });
  assert.ok(!fs.existsSync(path.join(home, 'subvocal')));
  assert.ok(!fs.existsSync(path.join(home, 'skills', 'subvocal')));
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
