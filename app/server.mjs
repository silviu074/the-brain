// Local server for The Brain: serves the page, your prompt history (read from Claude's own session
// files in ~/.claude/projects) and a live stream of new steps. Listens on 127.0.0.1 only.
// Run: node server.mjs   (the Brain shortcut starts it for you)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';

const PORT = +process.env.BRAIN_PORT || 8767;
const DIR = path.dirname(fileURLToPath(import.meta.url));
// BRAIN_HOME points the Brain at another home folder (used for the demo's sample setup).
const HOME = process.env.BRAIN_HOME || os.homedir();
const PROJECTS = path.join(HOME, '.claude', 'projects');
const APPS = { // what the planet pages' buttons (worlds.js) may start: [program, arguments]; the last path must exist
  'drop-convert': process.platform === 'darwin'
    ? ['open', [path.join(HOME, 'Applications', 'Drop Convert.app')]]
    : [path.join(process.env.LOCALAPPDATA || '', 'DropConvert', 'DropConvert.exe')],
};
const TYPES = { '.mp4': 'video/mp4', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

// ---------- reading session files ----------
const sessionFiles = () => {
  const out = [];
  for (const proj of fs.readdirSync(PROJECTS, { withFileTypes: true })) {
    if (!proj.isDirectory()) continue;
    const dir = path.join(PROJECTS, proj.name);
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.jsonl')) out.push(path.join(dir, f));
  }
  return out;
};
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b.type === 'text').map(b => b.text).join('\n') : '';
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };
const isHumanPrompt = r => {
  if (r.type !== 'user' || r.isMeta || r.isSidechain) return false;
  const c = r.message?.content;
  if (Array.isArray(c) && c.some(b => b.type === 'tool_result')) return false;
  if (r.origin) return r.origin.kind === 'human';
  const t = textOf(c).trim();
  return !!t && !t.startsWith('<') && !t.startsWith('[Request interrupted');
};
// Keep only the input fields the page needs to place a step on the brain.
function slimInput(name, i = {}) {
  const o = {};
  for (const k of ['skill', 'subagent_type', 'description', 'file_path', 'path', 'pattern', 'query', 'url', 'notebook_path', 'action', 'title'])
    if (i[k] != null) o[k] = clip(i[k], 300);
  if (i.command) o.command = clip(i.command, 400);
  if (i.prompt && name !== 'Agent' && name !== 'Task') o.prompt = clip(i.prompt, 200);
  if (i.args && name === 'Skill') o.args = clip(i.args, 200);
  return o;
}

// A tool result closes its step: how long it took, and the error if it failed.
function closeStep(pending, b, r) {
  const s = pending.get(b.tool_use_id);
  if (!s) return null;
  pending.delete(b.tool_use_id);
  s.ms = Date.parse(r.timestamp) - Date.parse(s.t);
  if (b.is_error) s.error = clip(textOf(b.content) || 'error', 200);
  return s;
}

// Agents (background ones too) write their own steps to <session>/subagents/agent-*.jsonl;
// the .meta.json beside each one names the Agent call that started it.
const subFiles = file => {
  const dir = path.join(file.slice(0, -'.jsonl'.length), 'subagents');
  try { return fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => path.join(dir, f)); } catch { return []; }
};
function parseSub(file) {
  let meta; try { meta = JSON.parse(fs.readFileSync(file.slice(0, -'.jsonl'.length) + '.meta.json', 'utf8')); } catch { return null; }
  const steps = [], pending = new Map();
  let stop = null, handedBack = false;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (r.type === 'assistant') {
      stop = r.message?.stop_reason || stop;
      for (const b of r.message?.content || []) if (b.type === 'tool_use') {
        if (b.name === 'SubagentHandback') { handedBack = true; continue; } // a background agent's last call; its report shows up in the session
        const s ={ t: r.timestamp, kind: 'tool', name: b.name, input: slimInput(b.name, b.input), sub: meta.agentType || 'general-purpose' };
        steps.push(s); pending.set(b.id, s);
      }
    }
    if (r.type === 'user' && Array.isArray(r.message?.content))
      for (const b of r.message.content) if (b.type === 'tool_result') { stop = null; closeStep(pending, b, r); }
  }
  return { toolUseId: meta.toolUseId, steps, done: stop === 'end_turn' || handedBack };
}

const cache = new Map(); // file -> { stamp, turns }
function parseFile(file) {
  const subs = subFiles(file);
  const stamp = [file, ...subs].map(f => { const st = fs.statSync(f); return st.mtimeMs + ':' + st.size; }).join('|');
  const hit = cache.get(file);
  if (hit && hit.stamp === stamp) return hit.turns;
  const turns = [];
  let cur = null, title = '', firstCwd = '';
  const pending = new Map(); // tool_use id -> step
  const agentTurn = new Map(); // Agent tool_use id -> the turn that started it
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    if (r.type === 'custom-title') title = r.customTitle || title;
    if (!firstCwd && r.cwd) firstCwd = r.cwd;
    if (isHumanPrompt(r)) {
      const c = r.message.content;
      cur = { id: r.sessionId + ':' + r.uuid, session: r.sessionId, cwd: firstCwd || r.cwd || '', time: r.timestamp, end: r.timestamp,
        text: textOf(c), images: Array.isArray(c) ? c.filter(b => b.type === 'image').length : 0, steps: [], reply: '', msgs: new Map() };
      turns.push(cur);
      continue;
    }
    if (!cur || r.isSidechain) continue;
    if (r.timestamp) cur.end = r.timestamp;
    if (r.type === 'assistant') cur.stop = r.message?.stop_reason || cur.stop;
    // token counts: one reply is written as several lines with the same message id, so the last line per id wins
    if (r.type === 'assistant' && r.message?.usage) { cur.msgs.set(r.message.id || r.uuid, r.message.usage); cur.model = r.message.model || cur.model; }
    if (r.type === 'attachment' && r.attachment?.type === 'queued_command' && r.attachment.prompt) cur.stop = null;
    if (r.type === 'attachment' && r.attachment?.type === 'queued_command' && r.attachment.prompt) {
      const o = r.attachment.origin; // a subagent's hand-back arrives here too, from a 'peer' instead of you
      cur.steps.push(o && o.kind !== 'human' ? { t: r.timestamp, kind: 'report', name: o.name || 'agent', text: clip((o.body || r.attachment.prompt).split('The report follows:').pop().trim(), 600) }
        : { t: r.timestamp, kind: 'user', text: clip(r.attachment.prompt, 600) });
    }
    if (r.type === 'assistant') {
      for (const b of r.message?.content || []) {
        const last = cur.steps[cur.steps.length - 1];
        if (b.type === 'thinking') {
          if (last?.kind === 'think') last.text += b.thinking || '';
          else cur.steps.push({ t: r.timestamp, kind: 'think', text: b.thinking || '' });
        } else if (b.type === 'text' && b.text.trim()) {
          cur.steps.push({ t: r.timestamp, kind: 'say', text: clip(b.text, 1200) });
          cur.reply = clip(b.text, 1200);
        } else if (b.type === 'tool_use') {
          const s = { t: r.timestamp, kind: 'tool', name: b.name, input: slimInput(b.name, b.input) };
          cur.steps.push(s); pending.set(b.id, s);
          if (b.name === 'Agent' || b.name === 'Task') agentTurn.set(b.id, cur);
        }
      }
    }
    if (r.type === 'user' && Array.isArray(r.message?.content)) {
      for (const b of r.message.content) {
        if (b.type !== 'tool_result') continue;
        cur.stop = null; // a tool finished, so Claude is working again
        const s = closeStep(pending, b, r);
        if (!s) continue;
        const u = r.toolUseResult;
        if (u && typeof u === 'object' && 'totalToolUseCount' in u)
          s.agent = { model: u.resolvedModel, tools: u.totalToolUseCount, ms: u.totalDurationMs, tokens: u.totalTokens };
      }
    }
  }
  // Agent steps join the turn that started the agent, in time order with its own steps.
  for (const f of subs) {
    let sub; try { sub = parseSub(f); } catch { continue; }
    const t = sub && agentTurn.get(sub.toolUseId);
    if (!t || !sub.steps.length) continue;
    t.steps.push(...sub.steps);
    t.steps.sort((a, b) => a.t.localeCompare(b.t));
    if (sub.steps.at(-1).t > t.end) t.end = sub.steps.at(-1).t;
    if (!sub.done) t.busy = true;
  }
  // A turn is done when a later prompt exists, or its last assistant message ended the turn and no agent it started is still working.
  turns.forEach((t, i) => { t.done = i < turns.length - 1 || (t.stop === 'end_turn' && !t.busy); delete t.stop; delete t.busy; });
  for (const t of turns) { t.title = title; for (const s of t.steps) if (s.kind === 'think') s.text = clip(s.text, 1500); }
  // tokens per turn: new input, cache writes, cache reads, output, plus what its agents used
  for (const t of turns) {
    const k = { in: 0, cw: 0, cr: 0, out: 0, sub: 0 };
    for (const u of t.msgs.values()) { k.in += u.input_tokens || 0; k.cw += u.cache_creation_input_tokens || 0; k.cr += u.cache_read_input_tokens || 0; k.out += u.output_tokens || 0; }
    for (const s of t.steps) if (s.agent?.tokens) k.sub += s.agent.tokens;
    t.tok = k; delete t.msgs;
  }
  cache.set(file, { stamp, turns });
  return turns;
}
const allTurns = () => sessionFiles().flatMap(f => { try { return parseFile(f); } catch { return []; } })
  .sort((a, b) => b.time.localeCompare(a.time));
// Estimated load on the plan limits: new input and output count in full, cached input at about 10%. An estimate, not the app's own counter.
const loadOf = k => k ? Math.round(k.in + k.cw + k.out + k.cr * 0.1) : 0; // agents' tokens (k.sub) are shown apart: their cached share is unknown
const summary = t => ({
  id: t.id, session: t.session, cwd: t.cwd, title: t.title, time: t.time, end: t.end, done: t.done, text: clip(t.text, 400), images: t.images,
  steps: t.steps.filter(s => s.kind === 'tool').length, tok: t.tok, load: loadOf(t.tok), model: t.model, failed: t.steps.filter(s => s.error).length,
  used: [...new Set(t.steps.filter(s => s.kind === 'tool' && (s.name === 'Skill' || s.name === 'Agent' || s.name === 'Task'))
    .map(s => s.input.skill || s.input.subagent_type || 'general-purpose'))],
});

// ---------- live stream: re-read a session file when it changes, send what's new ----------
const clients = new Set();
const seen = new Map(); // turn id -> number of steps already sent
const seenDone = new Map(); // turn id -> done flag already sent
const seenFin = new Map(); // turn id -> step count when its newest step was last reported finished
function pushChanges(file) {
  let turns; try { turns = parseFile(file); } catch { return; }
  for (const t of turns.slice(-3)) {
    const n = seen.get(t.id);
    if (n === undefined) { seen.set(t.id, t.steps.length); if (clients.size && Date.now() - Date.parse(t.time) < 120000) send({ type: 'prompt', turn: summary(t), steps: t.steps }); continue; }
    if (t.steps.length > n || seenDone.get(t.id) !== t.done) { send({ type: 'steps', id: t.id, steps: t.steps.slice(n), turn: summary(t) }); seen.set(t.id, t.steps.length); }
    // the newest step got its result: tell the page it finished (its usual-time lap stops)
    else if (t.steps.length && t.steps[t.steps.length - 1].ms != null && seenFin.get(t.id) !== t.steps.length) send({ type: 'fin', id: t.id, n: t.steps.length });
    if (t.steps.length && t.steps[t.steps.length - 1].ms != null) seenFin.set(t.id, t.steps.length);
    seenDone.set(t.id, t.done);
  }
}
function send(ev) { const msg = `data: ${JSON.stringify(ev)}\n\n`; for (const c of clients) c.write(msg); }
for (const f of sessionFiles()) try { for (const t of parseFile(f)) { seen.set(t.id, t.steps.length); seenDone.set(t.id, t.done); } } catch {}
const timers = new Map();
fs.watch(PROJECTS, { recursive: true }, (_, name) => {
  if (!name || !name.endsWith('.jsonl')) return;
  // An agent's log belongs to its session: re-read the session file, which now includes the agent's steps.
  const sub = path.join(PROJECTS, name).match(/^(.*)[\\/]subagents[\\/][^\\/]+$/);
  const file = sub ? sub[1] + '.jsonl' : path.join(PROJECTS, name);
  clearTimeout(timers.get(file));
  timers.set(file, setTimeout(() => pushChanges(file), 250));
});
setInterval(() => send({ type: 'ping' }), 20000);

// Started by the taskbar shortcut with --auto-exit: stop once no Brain window has been open for 5 minutes.
let lastSeen = Date.now();
if (process.argv.includes('--auto-exit'))
  setInterval(() => { if (clients.size) lastSeen = Date.now(); else if (Date.now() - lastSeen > 5 * 60000) process.exit(0); }, 30000);

// Context fill of the most recently active session, from the token counts of its last reply.
function latestContext() {
  const f = sessionFiles().map(p => [p, fs.statSync(p).mtimeMs]).sort((a, b) => b[1] - a[1])[0];
  if (!f) return null;
  const fd = fs.openSync(f[0], 'r'), size = fs.fstatSync(fd).size, n = Math.min(size, 512 * 1024), buf = Buffer.alloc(n);
  fs.readSync(fd, buf, 0, n, size - n); fs.closeSync(fd);
  for (const line of buf.toString('utf8').split('\n').reverse()) {
    if (!line.includes('"usage"')) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    const u = r.message?.usage;
    if (r.type !== 'assistant' || r.isSidechain || !u) continue;
    return { tokens: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0), time: Date.parse(r.timestamp) || f[1] };
  }
  return null;
}

// ---------- sync: rescan the setup and report what is new ----------
const brainNodes = () => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'data.js'), 'utf8').replace(/^[\s\S]*?window\.BRAIN = /, '').replace(/;\s*$/, '')).nodes; } catch { return []; } };
const brief = n => ({ id: n.id, kind: n.kind, name: n.name });
function sync() {
  return new Promise(resolve => {
    const before = new Map(brainNodes().map(n => [n.id, n]));
    execFile(process.execPath, [path.join(DIR, 'scan.mjs')], { cwd: DIR, timeout: 60000 }, (err, out) => {
      if (err) return resolve({ ok: false, error: String(err.message).slice(0, 300) });
      const after = new Map(brainNodes().map(n => [n.id, n]));
      resolve({ ok: true, summary: out.trim(),
        added: [...after.values()].filter(n => !before.has(n.id)).map(brief),
        removed: [...before.values()].filter(n => !after.has(n.id)).map(brief),
        changed: [...after.values()].filter(n => { const b = before.get(n.id); return b && (b.desc !== n.desc || b.tokens !== n.tokens || JSON.stringify(b.issues) !== JSON.stringify(n.issues)); }).map(brief) });
    });
  });
}

// ---------- planet notes: worlds/<id>.md, shown on that planet's page ----------
const readText = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const listDir = (d, re) => { try { return fs.readdirSync(d).filter(f => re.test(f)); } catch { return []; } };
function worldNotes() {
  const out = {};
  for (const f of listDir(path.join(DIR, 'worlds'), /\.md$/)) {
    const md = readText(path.join(DIR, 'worlds', f)), head = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    out[f.slice(0, -3)] = { notes: head ? md.slice(head[0].length) : md, handoffs: [], used: [], file: path.join(DIR, 'worlds', f), root: DIR };
  }
  return out;
}

// ---------- stats: how often each part of the setup was used, and where the tokens went (last 30 days) ----------
const PROG_RE = [['prog:ffmpeg', /\bffmpeg|ffprobe/i], ['prog:blender', /blender(\.exe)?["']?\s+(-b|--background)|blender\.exe/i], ['prog:whisper', /whisper/i],
  ['prog:ytdlp', /yt-dlp/i], ['prog:autoeditor', /auto-editor/i], ['prog:flutter', /\bflutter\b|gradle|adb\b/i], ['prog:unity', /unity\.exe/i]];
// Raw keys for what a step touched; the page maps them onto its nodes (same rules as its mapStep).
function stepKeys(s) {
  const P = s.input || {}, n = s.name || '', out = [];
  if (n === 'Skill') out.push('skill:' + (P.skill || '').split(':').pop());
  else if (n === 'Agent' || n === 'Task') out.push('agent:' + (P.subagent_type || 'general-purpose'));
  else if (n.startsWith('mcp__')) out.push('mcp:' + (n.match(/^mcp__(.+?)__/) || [])[1]);
  else if (/^(Read|Write|Edit|NotebookEdit|Grep|Glob|Bash|PowerShell)$/.test(n)) out.push('tool:files');
  else if (/^Web(Fetch|Search)$/.test(n)) out.push('tool:web');
  if (P.command) for (const [id, re] of PROG_RE) if (re.test(P.command)) out.push(id);
  const low = [P.command, P.file_path, P.path, P.notebook_path].filter(Boolean).join(' ').replace(/\//g, '\\').toLowerCase();
  for (const m of low.matchAll(/\\skills\\([\w-]+)\\/g)) out.push('skill:' + m[1]);
  for (const m of low.matchAll(/\\agents\\([\w-]+)\.md/g)) out.push('agent:' + m[1]);
  if (s.sub) out.push('agent:' + s.sub);
  return new Set(out);
}
const localDay = iso => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function stats() {
  const now = Date.now(), DAY = 864e5, use = {}, days = {}, models = {}, calls = {}, heavy = [];
  let load7 = 0, turns7 = 0, turns24 = 0, turns30 = 0;
  for (const t of allTurns()) {
    const age = now - Date.parse(t.time);
    if (age > 30 * DAY) break; // newest first
    const load = loadOf(t.tok), week = age < 7 * DAY, day = age < DAY, seen = {};
    turns30++; if (day) turns24++;
    const d = days[localDay(t.time)] ??= { load: 0, turns: 0, use: {} }; d.load += load; d.turns++; // cooler 15b: use = what each day touched, for the day reel
    if (week) {
      load7 += load; turns7++;
      const m = models[t.model || 'unknown'] ??= { load: 0, turns: 0 }; m.load += load; m.turns++;
      heavy.push({ id: t.id, time: t.time, text: clip(t.text, 140), where: t.title || path.basename(t.cwd || ''), load, tok: t.tok, model: t.model, steps: t.steps.filter(s => s.kind === 'tool').length });
    }
    for (const s of t.steps) {
      if (s.kind !== 'tool') continue;
      for (const k of stepKeys(s)) { const u = use[k] ??= { h24: 0, d7: 0, d30: 0, last: '', hits: [] }; u.d30++; if (week) u.d7++; if (day) u.h24++; if (s.t > u.last) u.last = s.t; d.use[k] = (d.use[k] || 0) + 1; seen[k] = (seen[k] || 0) + 1; }
      const name = s.name.startsWith('mcp__') ? (s.name.match(/^mcp__(.+?)__/) || [])[1] + ' (connector)' : s.name;
      const c = calls[name] ??= { n: 0, err: 0 }; c.n++; if (s.error) c.err++;
    }
    // the prompts that used each thing (when and why), newest first, for the HEAT and COST views' details
    for (const [k, n] of Object.entries(seen)) if (use[k].hits.length < 25) use[k].hits.push({ t: t.time, id: t.id, text: clip(t.text, 110), where: t.title || path.basename(t.cwd || ''), n });
  }
  heavy.sort((a, b) => b.load - a.load);
  const fails = Object.entries(calls).filter(([, c]) => c.err >= 3).map(([name, c]) => ({ name, ...c })).sort((a, b) => b.err - a.err).slice(0, 6);
  return { time: now, use, days, models, heavy: heavy.slice(0, 8), fails, load7, turns7, turns24, turns30 };
}

// ---------- auto-sync: rescan when a rules, skill, agent, plugin or settings file changes ----------
const HOME_CLAUDE = path.join(HOME, '.claude');
const WATCH = [[path.join(HOME_CLAUDE, 'skills'), true], [path.join(HOME_CLAUDE, 'agents'), true], [path.join(HOME_CLAUDE, 'plugins'), false], [HOME_CLAUDE, false]];
const SETUP_FILE = /(\.md|settings\.json|installed_plugins\.json|\.mcp\.json)$/i;
let syncTimer = null;
const autoSync = async () => {
  const r = await sync();
  if (r.ok && (r.added.length || r.removed.length || r.changed.length)) send({ type: 'sync', ...r });
};
for (const [dir, recursive] of WATCH) try {
  fs.watch(dir, { recursive }, (_, name) => {
    if (!name || !SETUP_FILE.test(name) || /(^|[\\/])\.git[\\/]/.test(name)) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(autoSync, 4000);
  });
} catch {}
setTimeout(autoSync, 3000); // once at start, so a page opened later gets a fresh scan

// ---------- http ----------
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const json = obj => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (url.pathname === '/api/sync' && req.method === 'POST') return json(await sync());
  if (url.pathname === '/api/history') return json(allTurns().slice(0, 400).map(summary));
  if (url.pathname === '/api/context') return json(latestContext());
  if (url.pathname === '/api/stats') return json(stats());
  if (url.pathname === '/api/next') return json({ time: Date.now(), handoffs: [], projects: [], plan: null });
  if (url.pathname === '/api/launch' && req.method === 'POST') { // a planet page's Start button; only apps listed in APPS
    const [exe, args] = APPS[url.searchParams.get('app')] || [];
    if (!exe || !fs.existsSync(args ? args[0] : exe)) return json({ ok: false, error: 'it is not installed. Get it from github.com/silviu074/drop-convert' });
    spawn(exe, args || [], { cwd: args ? DIR : path.dirname(exe), detached: true, stdio: 'ignore' }).unref(); return json({ ok: true });
  }
  if (url.pathname === '/api/worlds') return json(worldNotes());
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
  const size = fs.statSync(file).size, rg = /bytes=(\d*)-(\d*)/.exec(req.headers.range || ''); // ranges, so the demo video can seek
  if (rg && (rg[1] || rg[2])) {
    const start = rg[1] ? +rg[1] : size - +rg[2], end = rg[1] && rg[2] ? Math.min(+rg[2], size - 1) : size - 1;
    res.writeHead(206, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store' });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Content-Length': size, 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`The Brain is running at http://localhost:${PORT}  (close this window to stop it)`));
