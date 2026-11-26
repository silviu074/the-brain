// Scans the Codex setup (AGENTS.md, skills, agents, plugins, MCP servers, folders) and writes data.js for index.html.
// Run: node scan.mjs   (The Brain shortcut runs it for you)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HOME = os.homedir();
const CODEX = process.env.CODEX_HOME || path.join(HOME, '.codex');

const read = p => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const readJson = p => { try { return JSON.parse(read(p)); } catch { return null; } };
const exists = p => fs.existsSync(p);
const dirs = p => { try { return fs.readdirSync(p, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { return []; } };
const files = p => { try { return fs.readdirSync(p, { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name); } catch { return []; } };
const tok = s => Math.round((s || '').length / 4);
const headings = s => (s || '').split(/\r?\n/).filter(l => /^#{2,3} /.test(l)).map(l => l.replace(/^#+ /, '').trim()).slice(0, 14);

function countFiles(dir, cap = 5000) {
  let n = 0;
  const walk = d => {
    if (n >= cap) return;
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (n >= cap) return;
      if (e.isDirectory()) walk(path.join(d, e.name)); else n++;
    }
  };
  walk(dir);
  return n >= cap ? cap + '+' : n;
}

// Minimal YAML frontmatter reader (key: value, plus folded > / | blocks).
function front(text) {
  const m = (text || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const o = { body: m ? text.slice(m[0].length) : (text || '') };
  if (!m) return o;
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const k = lines[i].match(/^([\w-]+):\s*(.*)$/);
    if (!k) continue;
    let v = k[2];
    if (v === '>' || v === '|' || v === '>-' || v === '|-') {
      const parts = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) parts.push(lines[++i].trim());
      v = parts.join(' ');
    }
    o[k[1]] = v.replace(/^["']|["']$/g, '');
  }
  return o;
}

// Minimal TOML reader: [table.headers] and key = "string" | number | bool | ["array"]. Enough for config.toml.
function toml(text) {
  const out = {};
  let cur = out;
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const h = line.match(/^\[\[?(.+?)\]\]?$/);
    if (h) {
      cur = out;
      for (const part of h[1].match(/"[^"]*"|'[^']*'|[^.]+/g)) {
        const k = part.trim().replace(/^["']|["']$/g, '');
        cur = cur[k] = cur[k] && typeof cur[k] === 'object' ? cur[k] : {};
      }
      continue;
    }
    const kv = line.match(/^("[^"]*"|[\w-]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^\[.*\]$/.test(v)) v = [...v.matchAll(/"((?:[^"\\]|\\.)*)"|'([^']*)'/g)].map(m => m[1] ?? m[2]);
    else if (/^["']/.test(v)) v = v.slice(1, v.lastIndexOf(v[0]));
    else if (v === 'true' || v === 'false') v = v === 'true';
    else if (!isNaN(+v)) v = +v;
    cur[kv[1].replace(/^"|"$/g, '')] = v;
  }
  return out;
}
const config = toml(read(path.join(CODEX, 'config.toml')));

const nodes = [];
const edges = [];
const add = n => { nodes.push(n); return n; };
const link = (from, to, label) => { if (from !== to && !edges.some(e => e[0] === from && e[1] === to)) edges.push([from, to, label]); };

// ---------- core ----------
add({ id: 'core', kind: 'core', ring: 0, name: 'Codex',
  desc: 'The model you are talking to. Each message, it reads everything in its context window, decides what to do, and calls tools.' });

// ---------- always-loaded context ----------
const ctxFiles = [
  ['ctx:global', 'AGENTS.md', exists(path.join(CODEX, 'AGENTS.override.md')) ? path.join(CODEX, 'AGENTS.override.md') : path.join(CODEX, 'AGENTS.md'),
    'Your global instructions in the Codex folder. Read at the start of every session, in every project.'],
  ['ctx:memory', 'Memories', path.join(CODEX, 'memories', 'memory_summary.md'), 'Summary of facts Codex saved from past sessions (only when memories are turned on).'],
];
for (const [id, name, p, how] of ctxFiles) {
  const t = read(p);
  add({ id, kind: 'context', ring: 1, name, path: p, tokens: tok(t), exists: t !== null, outline: headings(t),
    lines: t ? t.split(/\r?\n/).filter(l => l.trim()).length : 0, desc: how });
}

// ---------- skills ----------
const skillTexts = {};
function addSkill(dir, scope, ring, group) {
  const p = path.join(dir, 'SKILL.md');
  const t = read(p);
  if (!t) return null;
  const f = front(t);
  const name = f.name || path.basename(dir);
  const id = 'skill:' + name;
  if (nodes.some(n => n.id === id)) return null;
  skillTexts[id] = t;
  const subs = dirs(dir).filter(d => exists(path.join(dir, d, 'SKILL.md')));
  const extra = files(dir).filter(x => x !== 'SKILL.md');
  return add({ id, kind: 'skill', scope, ring, group, name, path: p, desc: f.description || '',
    descTokens: tok(f.description), tokens: tok(t), outline: headings(f.body), subs, extra });
}
// Skills that ship with Codex sit in skills/.system; everything else is yours.
const walkSkills = (d, depth, system) => {
  if (depth > 3) return;
  if (exists(path.join(d, 'SKILL.md'))) {
    addSkill(d, system ? 'builtin' : 'user', system ? 3 : 2, system ? 'Comes with Codex' : 'Your skills');
    return;
  }
  for (const s of dirs(d)) walkSkills(path.join(d, s), depth + 1, system || s === '.system');
};
walkSkills(path.join(HOME, '.agents', 'skills'), 0, false);
walkSkills(path.join(CODEX, 'skills'), 0, false);

// ---------- plugins (and their skills) ----------
const enabledPlugins = config.plugins || {};
const pluginDirs = [];
const findPlugins = (d, depth) => {
  if (depth > 4) return;
  if (exists(path.join(d, '.codex-plugin', 'plugin.json'))) { pluginDirs.push(d); return; }
  for (const s of dirs(d)) findPlugins(path.join(d, s), depth + 1);
};
findPlugins(path.join(CODEX, 'plugins'), 0);
for (const dir of pluginDirs) {
  const manifest = readJson(path.join(dir, '.codex-plugin', 'plugin.json')) || {};
  const pname = manifest.name || path.basename(dir);
  const id = 'plugin:' + pname;
  if (nodes.some(n => n.id === id)) continue; // an older cached version of the same plugin
  const key = Object.keys(enabledPlugins).find(k => k.split('@')[0] === pname);
  const skillRoots = [...new Set(['skills', ...[].concat(manifest.skills || [])].map(p => path.resolve(dir, p)))];
  const skillDirs = skillRoots.flatMap(r => dirs(r).map(s => path.join(r, s)));
  add({ id, kind: 'plugin', ring: 5, name: pname, path: dir, version: manifest.version, on: key ? enabledPlugins[key].enabled !== false : true,
    desc: manifest.description || (skillDirs.length ? `A pack of ${skillDirs.length} skills.` : 'Plugin.'), hooks: exists(path.join(dir, 'hooks')) });
  for (const s of skillDirs) {
    const n = addSkill(s, 'plugin', 2, pname);
    if (n) { n.name = pname + ':' + n.name; link(id, n.id, 'contains'); }
  }
}

// ---------- agents ----------
const agentTexts = {};
const addAgent = (name, desc, p, text, scope, model) => {
  const id = 'agent:' + name;
  if (nodes.some(n => n.id === id)) return;
  if (text) agentTexts[id] = text;
  add({ id, kind: 'agent', scope, ring: 4, name, path: p, desc: desc || '', model: model || 'inherit', tools: [], descTokens: tok(desc), tokens: tok(text) });
};
for (const fn of files(path.join(CODEX, 'agents')).filter(x => x.endsWith('.toml'))) {
  const p = path.join(CODEX, 'agents', fn), t = read(p), a = toml(t);
  addAgent(a.name || fn.replace(/\.toml$/, ''), a.description, p, t, 'user', a.model);
}
for (const [name, a] of Object.entries(config.agents || {}))
  if (a && typeof a === 'object') addAgent(name, a.description, path.join(CODEX, 'config.toml'), a.description, 'user', a.model);
const BUILTIN_AGENTS = [
  ['default', 'A helper Codex with its own fresh context, started with spawn_agent.'],
  ['worker', 'A helper focused on carrying out a piece of the work.'],
  ['explorer', 'A helper that reads and searches, then reports back.'],
];
for (const [name, desc] of BUILTIN_AGENTS) addAgent(name, desc, null, null, 'builtin');

// ---------- tools: built in, plus MCP servers ----------
const BUILTIN_TOOLS = [
  ['tool:files', 'Files & shell', 'built in', 'Shell commands and apply_patch. How Codex looks at and changes files on your PC.'],
  ['tool:web', 'Web search', 'built in', 'Searches the web when web search is turned on.'],
];
for (const [id, name, sub, desc] of BUILTIN_TOOLS) add({ id, kind: 'tool', sub, ring: 5, name, desc });
for (const [name, cfg] of Object.entries(config.mcp_servers || {}))
  add({ id: 'mcp:' + name, kind: 'tool', sub: 'MCP server', ring: 5, name: name + ' MCP', path: path.join(CODEX, 'config.toml'),
    desc: `A connector (MCP server) that gives Codex extra tools. ${cfg.url ? 'Reached at: ' + cfg.url : 'Started with: ' + `${cfg.command || ''} ${(cfg.args || []).join(' ')}`.trim()}` +
      (cfg.enabled === false ? ' (turned off)' : '') });

// ---------- guards ----------
add({ id: 'guard:perms', kind: 'plugin', ring: 5, name: 'Approvals & sandbox', path: path.join(CODEX, 'config.toml'), isGuard: true,
  desc: `When Codex asks before acting, and what it may touch. Approval policy: ${config.approval_policy || 'default'}. Sandbox: ${config.sandbox_mode || 'default'}.`,
  allow: [], ask: [] });
const rules = files(path.join(CODEX, 'rules')).filter(f => f.endsWith('.rules'));
if (rules.length) add({ id: 'guard:rules', kind: 'plugin', ring: 5, name: 'Command rules', path: path.join(CODEX, 'rules'), isGuard: true,
  desc: `Rules that allow, ask about or block certain shell commands (${rules.join(', ')}).` });
if (exists(path.join(CODEX, 'hooks.json'))) add({ id: 'guard:hook', kind: 'plugin', ring: 5, name: 'Hooks', path: path.join(CODEX, 'hooks.json'), isGuard: true,
  desc: 'Your own scripts that run at set moments, e.g. before or after a tool call.' });

// ---------- storage: the folders inside the Codex home ----------
const STORAGE = {
  sessions: 'Every conversation, saved as a log file per session. The HISTORY and LIVE tabs read these.',
  archived_sessions: 'Sessions you archived.',
  skills: 'Your skills (plus .system, the ones that come with Codex).',
  memories: 'Facts Codex saved from past sessions.',
  plugins: 'Installed plugins.',
  rules: 'Command rules.',
  log: 'Codex\'s own debug logs.',
};
for (const name of dirs(CODEX)) {
  if (name.startsWith('.') || name === 'tmp' || name === 'cache') continue;
  const p = path.join(CODEX, name);
  const big = name === 'sessions' || name === 'plugins' || name === 'archived_sessions';
  add({ id: 'store:' + name, kind: 'storage', ring: 6, name: name + '/', path: p, desc: STORAGE[name] || 'A folder Codex keeps.',
    items: big ? dirs(p).slice(0, 12) : dirs(p).concat(files(p)).slice(0, 12), files: countFiles(p) });
}

// ---------- links: who mentions whom ----------
const ALIASES = { 'tool:web': [/web[_ ]search/i], 'ctx:global': [/AGENTS\.md/] };
for (const n of nodes) if (n.kind === 'skill' || n.kind === 'agent') {
  const nm = n.name.split(':').pop();
  ALIASES[n.id] = [nm.includes('-') ? new RegExp('(^|[^\\w-])' + nm.replace(/-/g, '\\-') + '(?![\\w-])') : new RegExp('`' + nm + '`')];
}
for (const n of nodes) if (n.id.startsWith('mcp:')) ALIASES[n.id] = [new RegExp('mcp__' + n.id.slice(4) + '__|\\b' + n.id.slice(4) + ' mcp', 'i')];
const texts = { ...skillTexts, ...agentTexts, 'ctx:global': read(ctxFiles[0][2]) || '' };
for (const [from, t] of Object.entries(texts))
  for (const [to, res] of Object.entries(ALIASES))
    if (nodes.some(n => n.id === to) && res.some(r => r.test(t))) link(from, to, 'mentions');
for (const n of nodes.filter(n => n.kind === 'context')) link('core', n.id, 'always loaded');

const catalogTokens = nodes.filter(n => n.kind === 'skill' || n.kind === 'agent').reduce((a, n) => a + (n.descTokens || 0) + 8, 0);
const data = { scannedAt: new Date().toISOString(), root: CODEX, nodes, edges, routes: [], catalogTokens };
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'data.js'),
  '// Generated by scan.mjs. Do not edit.\nwindow.BRAIN = ' + JSON.stringify(data, null, 1) + ';\n');
const count = k => nodes.filter(n => n.kind === k).length;
console.log(`Scanned ${CODEX}: ${count('skill')} skills, ${count('agent')} agents, ${count('tool')} tools, ${count('context')} context files, ${count('storage')} folders, ${count('plugin')} plugins/guards, ${edges.length} links.`);
