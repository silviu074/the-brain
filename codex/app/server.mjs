// Local server for The Brain (Codex edition): serves the page, your prompt history (read from Codex's own
// session logs in ~/.codex/sessions), a live stream of new steps, and your plan limits. Listens on 127.0.0.1 only.
// Run: node server.mjs   (The Brain shortcut starts it for you)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const PORT = 8766;
const DIR = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'sessions');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.ogg': 'audio/ogg' };

// ---------- reading session files (sessions/YYYY/MM/DD/rollout-*.jsonl, or .jsonl.zst once Codex compresses old ones) ----------
const sessionFiles = () => {
  const out = [];
  const walk = (d, depth) => {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.isDirectory() && depth < 3) walk(path.join(d, e.name), depth + 1);
      else if (e.isFile() && /\.jsonl(\.zst)?$/.test(e.name)) out.push(path.join(d, e.name));
    }
  };
  walk(SESSIONS, 0);
  return out;
};
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b.text).map(b => b.text).join('\n') : '';
const parseArgs = a => { if (typeof a !== 'string') return a || {}; try { return JSON.parse(a); } catch { return { input: a }; } };

// Codex's tools, renamed to the step names the page already knows how to draw.
function toStep(name, args, t) {
  const cmd = [].concat(args.command ?? args.cmd ?? []).join(' ');
  if (/^(shell|shell_command|exec_command|local_shell)$/.test(name)) {
    const skill = cmd.match(/skills[\\/](?:\.system[\\/])?([\w.-]+)[\\/]SKILL\.md/i); // reading a SKILL.md is how Codex loads a skill
    if (skill) return { t, kind: 'tool', name: 'Skill', input: { skill: skill[1] } };
    return { t, kind: 'tool', name: 'Bash', input: { command: clip(cmd, 400) } };
  }
  if (name === 'apply_patch') {
    const patch = String(args.input ?? args.patch ?? '');
    const m = patch.match(/^\*\*\* (Add|Update|Delete) File: (.+)$/m);
    return { t, kind: 'tool', name: m?.[1] === 'Add' ? 'Write' : 'Edit', input: { file_path: clip(m ? m[2].trim() : 'patch', 300) } };
  }
  if (name === 'view_image') return { t, kind: 'tool', name: 'Read', input: { file_path: clip(args.path, 300) } };
  if (name === 'web_search') return { t, kind: 'tool', name: 'WebSearch', input: { query: clip(args.query, 300) } };
  if (name === 'spawn_agent') return { t, kind: 'tool', name: 'Agent', input: { subagent_type: args.agent_type || args.role || 'default', description: clip(args.message || args.prompt, 120) } };
  const o = {};
  for (const k of ['description', 'file_path', 'path', 'query', 'url', 'action', 'title', 'explanation']) if (args[k] != null && typeof args[k] !== 'object') o[k] = clip(args[k], 300);
  if (o.explanation && !o.description) o.description = o.explanation;
  return { t, kind: 'tool', name, input: o };
}
const failed = out => {
  const s = typeof out === 'string' ? out : JSON.stringify(out ?? '');
  const j = parseArgs(s);
  const code = j?.metadata?.exit_code ?? +(s.match(/^Exit code: (\d+)/m)?.[1] ?? 0);
  return code ? clip(j?.output || s, 200) : null;
};

const cache = new Map(); // file -> { mtime, size, turns, sub }
function parseFile(file) {
  const st = fs.statSync(file);
  const hit = cache.get(file);
  if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) return hit.turns;
  const turns = [];
  let cur = null, session = path.basename(file).replace(/\.jsonl(\.zst)?$/, ''), cwd = '', title = '', sub = false, n = 0;
  const pending = new Map(); // call_id -> step
  const raw = fs.readFileSync(file);
  for (const line of (file.endsWith('.zst') ? zlib.zstdDecompressSync(raw) : raw).toString('utf8').split('\n')) {
    if (!line) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    const p = r.payload || {}, t = r.timestamp;
    if (r.type === 'session_meta') {
      session = p.id || session; cwd = p.cwd || cwd;
      sub = !!(p.parent_thread_id || p.forked_from_id || p.agent_role || p.source?.subagent); // helper agents' own logs
      continue;
    }
    if (r.type === 'event_msg' && p.type === 'thread_name_updated') title = p.thread_name || title;
    if (r.type === 'event_msg' && p.type === 'user_message') {
      cur = { id: session + ':' + n++, session, cwd, time: t, end: t, text: p.message || '', images: (p.images || []).length + (p.local_images || []).length, steps: [], reply: '', done: false };
      turns.push(cur);
      continue;
    }
    if (!cur) continue;
    if (t) cur.end = t;
    if (r.type === 'event_msg' && /^(task_complete|turn_complete|turn_aborted)$/.test(p.type)) cur.done = true;
    if (r.type !== 'response_item') continue;
    const last = cur.steps[cur.steps.length - 1];
    if (p.type === 'reasoning') {
      const txt = (p.summary || []).map(s => s.text).join('\n');
      if (last?.kind === 'think') last.text += txt; else cur.steps.push({ t, kind: 'think', text: txt });
    } else if (p.type === 'message' && p.role === 'assistant') {
      const txt = textOf(p.content).trim();
      if (txt) { cur.steps.push({ t, kind: 'say', text: clip(txt, 1200) }); cur.reply = clip(txt, 1200); }
    } else if (p.type === 'function_call' || p.type === 'custom_tool_call') {
      const s = toStep(p.name, parseArgs(p.type === 'custom_tool_call' ? { input: p.input } : p.arguments), t);
      cur.steps.push(s); pending.set(p.call_id, s);
    } else if (p.type === 'local_shell_call') {
      const s = toStep('local_shell', { command: p.action?.command }, t);
      cur.steps.push(s); pending.set(p.call_id, s);
    } else if (p.type === 'web_search_call') {
      cur.steps.push({ t, kind: 'tool', name: 'WebSearch', input: { query: clip(p.action?.query || '', 300) } });
    } else if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output') {
      const s = pending.get(p.call_id);
      if (!s) continue;
      pending.delete(p.call_id);
      s.ms = Date.parse(t) - Date.parse(s.t);
      const err = failed(p.output);
      if (err) s.error = err;
    }
  }
  // A turn is also done once a later prompt exists.
  turns.forEach((tu, i) => { if (i < turns.length - 1) tu.done = true; tu.title = title; for (const s of tu.steps) if (s.kind === 'think') s.text = clip(s.text, 1500); });
  const kept = sub ? [] : turns;
  cache.set(file, { mtime: st.mtimeMs, size: st.size, turns: kept });
  return kept;
}
const allTurns = () => sessionFiles().flatMap(f => { try { return parseFile(f); } catch { return []; } })
  .sort((a, b) => b.time.localeCompare(a.time));
const summary = t => ({
  id: t.id, session: t.session, cwd: t.cwd, title: t.title, time: t.time, end: t.end, done: t.done, text: clip(t.text, 400), images: t.images,
  steps: t.steps.filter(s => s.kind === 'tool').length,
  used: [...new Set(t.steps.filter(s => s.kind === 'tool' && (s.name === 'Skill' || s.name === 'Agent')).map(s => s.input.skill || s.input.subagent_type))],
});

// ---------- live stream: re-read a session file when it changes, send what's new ----------
const clients = new Set();
const seen = new Map(); // turn id -> number of steps already sent
const seenDone = new Map(); // turn id -> done flag already sent
function pushChanges(file) {
  let turns; try { turns = parseFile(file); } catch { return; }
  for (const t of turns.slice(-3)) {
    const n = seen.get(t.id);
    if (n === undefined) { seen.set(t.id, t.steps.length); if (clients.size && Date.now() - Date.parse(t.time) < 120000) send({ type: 'prompt', turn: summary(t), steps: t.steps }); continue; }
    if (t.steps.length > n || seenDone.get(t.id) !== t.done) { send({ type: 'steps', id: t.id, steps: t.steps.slice(n), turn: summary(t) }); seen.set(t.id, t.steps.length); }
    seenDone.set(t.id, t.done);
  }
}
function send(ev) { const msg = `data: ${JSON.stringify(ev)}\n\n`; for (const c of clients) c.write(msg); }
const timers = new Map();
fs.mkdirSync(SESSIONS, { recursive: true }); // so the watch works before Codex's first session
fs.watch(SESSIONS, { recursive: true }, (_, name) => {
  if (!name || !name.endsWith('.jsonl')) return;
  const file = path.join(SESSIONS, name);
  clearTimeout(timers.get(file));
  timers.set(file, setTimeout(() => pushChanges(file), 250));
});
setInterval(() => send({ type: 'ping' }), 20000);

// Started by the shortcut with --auto-exit: stop once no Brain window has been open for 5 minutes.
let lastSeen = Date.now();
if (process.argv.includes('--auto-exit'))
  setInterval(() => { if (clients.size) lastSeen = Date.now(); else if (Date.now() - lastSeen > 5 * 60000) process.exit(0); }, 30000);

// The last token_count event of the most recently active session: context fill and plan limits.
function latestTokens() {
  const f = sessionFiles().filter(p => p.endsWith('.jsonl')).map(p => [p, fs.statSync(p).mtimeMs]).sort((a, b) => b[1] - a[1])[0];
  if (!f) return null;
  const fd = fs.openSync(f[0], 'r'), size = fs.fstatSync(fd).size, n = Math.min(size, 512 * 1024), buf = Buffer.alloc(n);
  fs.readSync(fd, buf, 0, n, size - n); fs.closeSync(fd);
  for (const line of buf.toString('utf8').split('\n').reverse()) {
    if (!line.includes('"token_count"')) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (r.payload?.type === 'token_count') return { ...r.payload, time: Date.parse(r.timestamp) || f[1] };
  }
  return null;
}
function latestContext() {
  const e = latestTokens(), u = e?.info?.last_token_usage;
  return u ? { tokens: u.total_tokens || (u.input_tokens || 0) + (u.output_tokens || 0), max: e.info.model_context_window || null, time: e.time } : null;
}
// Same shape as the Claude edition's usage.json, so the page's USAGE panel works unchanged.
function usage() {
  const e = latestTokens(), rl = e?.rate_limits;
  if (!rl) return null;
  const win = w => w && { used_percentage: w.used_percent, resets_at: w.resets_at || (w.resets_in_seconds != null ? e.time / 1000 + w.resets_in_seconds : 0) };
  return { time: e.time, plan: rl.plan_type || '', fiveHour: win(rl.primary), weekly: win(rl.secondary) };
}

// ---------- http ----------
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const json = obj => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  if (url.pathname === '/api/history') return json(allTurns().slice(0, 400).map(summary));
  if (url.pathname === '/api/context') return json(latestContext());
  if (url.pathname === '/usage.json') return json(usage());
  if (url.pathname === '/api/turn') return json(allTurns().find(t => t.id === url.searchParams.get('id')) || null);
  if (url.pathname === '/api/live') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('data: {"type":"hello"}\n\n');
    clients.add(res); req.on('close', () => clients.delete(res));
    return;
  }
  // A malformed %-escape makes decodeURIComponent throw, which would crash the whole server.
  let rel; try { rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)); } catch { res.writeHead(400); return res.end('bad request'); }
  const file = path.join(DIR, rel);
  if (!file.startsWith(DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`The Brain (Codex) is running at http://localhost:${PORT}`);
  // Index existing sessions only once the port is open, so a long history can't hold the server back past the launcher's wait.
  setImmediate(() => { for (const f of sessionFiles()) try { for (const t of parseFile(f)) if (!seen.has(t.id)) { seen.set(t.id, t.steps.length); seenDone.set(t.id, t.done); } } catch {} });
});
