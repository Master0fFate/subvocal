// steno — prompt command parsing and hook stdin reading. Pure functions,
// shared by the hooks and covered by tests/hooks.test.js.

'use strict';

// Returns {action: 'set', mode} | {action: 'status'} | null. mode may be
// 'auto': the caller resolves it against the session's model.
//
// Slash commands are matched at the start of the prompt only. Claude Code
// namespaces plugin skills, so `/steno:steno` and `/steno:ultrasteno` count
// too. Natural-language switches ("stop steno", "normal mode") count only when
// the message is short and is mostly the switch itself: "explain what normal
// mode means in vim" must not turn steno off.
function parseCommand(prompt) {
  if (typeof prompt !== 'string') return null;
  const text = prompt.trim();
  if (!text) return null;

  const slash = text.match(/^\/(?:steno:)?(steno-lite|steno|ultrasteno)(?![\w-])[ \t]*([A-Za-z-]*)/i);
  if (slash) {
    const cmd = slash[1].toLowerCase();
    const arg = (slash[2] || '').toLowerCase();
    if (cmd === 'ultrasteno') return arg === 'off' ? { action: 'set', mode: 'off' } : { action: 'set', mode: 'ultrasteno' };
    if (cmd === 'steno-lite') return arg === 'off' ? { action: 'set', mode: 'off' } : { action: 'set', mode: 'lite' };
    if (!arg || arg === 'on' || arg === 'auto') return { action: 'set', mode: 'auto' };
    if (arg === 'strict' || arg === 'full' || arg === 'steno') return { action: 'set', mode: 'steno' };
    if (arg === 'lite' || arg === 'light') return { action: 'set', mode: 'lite' };
    if (arg === 'ultra' || arg === 'ultrasteno' || arg === 'max') return { action: 'set', mode: 'ultrasteno' };
    if (arg === 'off' || arg === 'stop' || arg === 'normal' || arg === 'none') return { action: 'set', mode: 'off' };
    if (arg === 'status') return { action: 'status' };
    return null;
  }

  if (text.length > 60) return null;
  const plain = text.toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(please )?(stop|disable|end|exit|turn off) steno( mode)?( please)?$/.test(plain)
      || /^steno (mode )?off$/.test(plain)
      || /^(back to |switch to |go back to )?normal (mode|thinking)( please)?$/.test(plain)) {
    return { action: 'set', mode: 'off' };
  }
  if (/^(please )?(ultra steno|ultrasteno)( mode)?( on)?( please)?$/.test(plain)) {
    return { action: 'set', mode: 'ultrasteno' };
  }
  if (/^(please )?(start |enable |turn on |use )?(steno lite|light steno)( mode)?( on)?( please)?$/.test(plain)) {
    return { action: 'set', mode: 'lite' };
  }
  if (/^(please )?(start |enable |turn on |use )?strict steno( mode)?( on)?( please)?$/.test(plain)) {
    return { action: 'set', mode: 'steno' };
  }
  if (/^(please )?(start |enable |turn on |use )?steno( mode)?( on)?( please)?$/.test(plain)
      || /^think in steno( please)?$/.test(plain)) {
    return { action: 'set', mode: 'auto' };
  }
  return null;
}

// Reads the hook payload from stdin. Resolves on the first COMPLETE JSON
// object rather than at EOF, because some hosts keep the pipe open; a
// watchdog resolves with whatever arrived if the payload never completes.
function readPayload(timeoutMs = 2000) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve({}); return; }
    let input = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      try { process.stdin.pause(); } catch (e) { /* ignore */ }
      try { process.stdin.unref(); } catch (e) { /* ignore */ }
      let data = {};
      try { data = JSON.parse(input) || {}; } catch (e) { /* empty or partial */ }
      // Troubleshooting aid: STENO_DEBUG_PAYLOAD=<file> appends every payload.
      if (process.env.STENO_DEBUG_PAYLOAD) {
        try { require('fs').appendFileSync(process.env.STENO_DEBUG_PAYLOAD, JSON.stringify(data) + '\n'); } catch (e) { /* ignore */ }
      }
      resolve(typeof data === 'object' && data !== null ? data : {});
    };
    const watchdog = setTimeout(finish, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      input += chunk;
      try { JSON.parse(input); } catch (e) { return; }
      finish();
    });
    process.stdin.on('error', finish);
    process.stdin.on('end', finish);
  });
}

module.exports = { parseCommand, readPayload };
