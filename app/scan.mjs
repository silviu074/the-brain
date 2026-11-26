// Scans your Claude Code setup (skills, agents, rules, tools, folders) and writes data.js for index.html.
// Run by The Brain shortcut on every start, and by the SYNC button.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// BRAIN_HOME points the Brain at another home folder (used for the demo's sample setup).
const HOME = process.env.BRAIN_HOME || os.homedir();
const CLAUDE = path.join(HOME, '.claude');
// Where the Claude desktop app keeps its config: %APPDATA% on Windows, ~/Library/Application Support on a Mac.
const APPDATA = process.env.BRAIN_HOME ? path.join(HOME, 'AppData') : process.env.APPDATA || path.join(HOME, process.platform === 'darwin' ? 'Library/Application Support' : '.config');

const read = p => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const readJson = p => { try { return JSON.parse(read(p)); } catch { return null; } };
const exists = p => fs.existsSync(p);
const dirs = p => { try { return fs.readdirSync(p, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { return []; } };
const files = p => { try { return fs.readdirSync(p, { withFileTypes: true }).filter(d => d.isFile()).map(d => d.name); } catch { return []; } };
const tok = s => Math.round((s || '').length / 4);
const headings = s => (s || '').split(/\r?\n/).filter(l => /^#{2,3} /.test(l)).map(l => l.replace(/^#+ /, '').trim()).slice(0, 14);

// The project used most recently (newest session log), so its CLAUDE.md, skills, agents and connectors show too.
const SESSIONS = path.join(CLAUDE, 'projects');
let latest = null;
for (const d of dirs(SESSIONS)) for (const f of files(path.join(SESSIONS, d)).filter(x => x.endsWith('.jsonl'))) {
  const p = path.join(SESSIONS, d, f), m = fs.statSync(p).mtimeMs;
  if (!latest || m > latest.m) latest = { p, m, dir: path.join(SESSIONS, d) };
}
const cwdOf = p => {
  const fd = fs.openSync(p, 'r'), buf = Buffer.alloc(256 * 1024), n = fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
  const m = buf.toString('utf8', 0, n).match(/"cwd":("(?:[^"\\]|\\.)*")/);
  return m ? JSON.parse(m[1]) : null;
};
const ROOT = (latest && cwdOf(latest.p)) || HOME;

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

const nodes = [];
const edges = [];
const add = n => { nodes.push(n); return n; };
// Health check: 'warn' = worth fixing (the page puts a warning ring on the node), 'info' = worth a look.
const flag = (n, level, text) => { if (n) (n.issues ??= []).push({ level, text }); };
const link = (from, to, label) => { if (from !== to && !edges.some(e => e[0] === from && e[1] === to)) edges.push([from, to, label]); };

// ---------- core ----------
add({ id: 'core', kind: 'core', ring: 0, name: 'Claude',
  desc: 'The model you are talking to. Each message, it reads everything in its context window, decides what to do, and calls tools.' });

// ---------- always-loaded context ----------
const ctxFiles = [
  ['ctx:global', 'Global CLAUDE.md', path.join(CLAUDE, 'CLAUDE.md'), 'Your global instructions in ~/.claude. Applies to every project.'],
  ['ctx:project', (path.basename(ROOT) || ROOT) + ' CLAUDE.md', path.join(ROOT, 'CLAUDE.md'), `Loaded when Claude is opened in ${ROOT}, the project you used most recently.`],
  ['ctx:memory', 'Auto memory', path.join(latest?.dir || SESSIONS, 'memory', 'MEMORY.md'), 'Index of facts Claude saved for itself in this project.'],
];
// Files pulled in with @path lines are loaded too.
for (const [, name, p] of ctxFiles.slice(0, 2))
  for (const [, ref] of (read(p) || '').matchAll(/^@(\S+)/gm)) {
    const f = ref.startsWith('~') ? path.join(HOME, ref.slice(1)) : path.resolve(path.dirname(p), ref);
    if (exists(f) && !ctxFiles.some(c => c[2] === f)) ctxFiles.push(['ctx:import:' + ctxFiles.length, path.basename(f), f, `Imported by ${name} via @${ref}.`]);
  }
for (const [id, name, p, how] of ctxFiles) {
  const t = read(p);
  const n = add({ id, kind: 'context', ring: 1, name, path: p, tokens: tok(t), exists: t !== null, outline: headings(t),
    lines: t ? t.split(/\r?\n/).filter(l => l.trim()).length : 0, desc: how, text: t || '' }); // text: for the page's search
  if (t === null && id !== 'ctx:memory') flag(n, 'info', 'File not found.');
  // paths written in the rules that no longer exist
  if (t) {
    const gone = [...new Set([...t.matchAll(/`([A-Za-z]:\\[^`\n]+)`/g)].map(m => m[1].trim()).filter(x => !/[<>*…]|YYYY/.test(x)))].filter(x => !exists(x));
    for (const x of gone) flag(n, 'warn', `Points at ${x}, which no longer exists.`);
  }
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
  const twin = nodes.find(n => n.id === id);
  if (twin) { if (twin.path !== p && scope !== 'app' && twin.scope !== 'app') flag(twin, 'info', `A second skill with this name exists at ${p}. Only one can load.`); return null; }
  skillTexts[id] = t;
  const subs = dirs(dir).filter(d => exists(path.join(dir, d, 'SKILL.md')) || d.startsWith(name.split('-')[0] + '-'));
  const extra = files(dir).filter(x => x !== 'SKILL.md');
  const n = add({ id, kind: 'skill', scope, ring, group, name, path: p, desc: f.description || '', model: f.model, effort: f.effort,
    descTokens: tok(f.description), tokens: tok(t), outline: headings(f.body), subs, extra });
  if (!f.description) flag(n, 'warn', 'No description, so I cannot tell when to use it.');
  else if (n.descTokens > 220) flag(n, 'info', `Long description: about ${n.descTokens} tokens ride along with every message.`);
  return n;
}
for (const d of dirs(path.join(ROOT, '.claude', 'skills'))) addSkill(path.join(ROOT, '.claude', 'skills', d), 'project', 2, 'Your skills');
const walkSkills = (d, depth) => {
  if (depth > 3) return;
  if (exists(path.join(d, 'SKILL.md'))) {
    const synced = d.includes('synced');
    addSkill(d, synced ? 'app' : 'user', synced ? 3 : 2, synced ? 'Synced from the Claude app' : 'Your skills');
    return;
  }
  for (const s of dirs(d)) walkSkills(path.join(d, s), depth + 1);
};
walkSkills(path.join(CLAUDE, 'skills'), 0);

// ---------- plugins (and their skills/agents) ----------
const installed = readJson(path.join(CLAUDE, 'plugins', 'installed_plugins.json'))?.plugins || {};
const enabled = { ...(readJson(path.join(CLAUDE, 'settings.json'))?.enabledPlugins || {}), ...(readJson(path.join(ROOT, '.claude', 'settings.json'))?.enabledPlugins || {}) };
const pluginAgentDirs = [];
for (const [key, arr] of Object.entries(installed)) {
  const inst = arr[0];
  const [pname, market] = key.split('@');
  const dir = inst.installPath;
  const manifest = readJson(path.join(dir, '.claude-plugin', 'plugin.json')) || readJson(path.join(dir, 'package.json')) || {};
  // skills/ by default, plus any folders the manifest names (some plugins keep theirs in e.g. claude/skills)
  const skillRoots = [...new Set(['skills', ...[].concat(manifest.skills || [])].map(p => path.resolve(dir, p)))];
  const skillDirs = skillRoots.flatMap(r => dirs(r).map(s => path.join(r, s)));
  const id = 'plugin:' + pname;
  const pn = add({ id, kind: 'plugin', ring: 5, name: pname, path: dir, version: inst.version, market, on: !!enabled[key],
    desc: manifest.description || (skillDirs.length ? `A pack of ${skillDirs.length} skills.` : 'Plugin.'),
    isMod: market === 'claude-mods', hooks: exists(path.join(dir, 'hooks')) });
  if (!exists(dir)) flag(pn, 'warn', 'Its install folder is missing.');
  else if (!enabled[key]) flag(pn, 'info', 'Installed but not enabled in this folder.');
  for (const s of skillDirs) {
    const n = addSkill(s, 'plugin', 2, pname);
    if (n) { n.name = pname.split('-')[0] + ':' + n.name; link(id, n.id, 'contains'); }
  }
  if (exists(path.join(dir, 'agents'))) pluginAgentDirs.push([path.join(dir, 'agents'), id]);
}

// Built into the Claude app: not files on disk, listed so the picture is complete.
const BUILTIN_SKILLS = [
  ['docs', 'Shared documents people can comment on and export.'],
  ['pdf', 'Read, merge, split, fill or create PDF files.'],
  ['docx', 'Word documents.'], ['pptx', 'PowerPoint decks.'], ['xlsx', 'Spreadsheets.'],
  ['deep-research', 'Research a topic across many sources into a report.'],
  ['skill-creator', 'Make or improve a skill and test how well it triggers.'],
  ['schedule', 'Run a task automatically on a schedule.'],
  ['built-in-browser', 'How to drive the browser pane inside the app.'],
  ['chrome-browser', 'How to drive your real Chrome (Claude in Chrome).'],
  ['computer-use', 'Click and type in desktop apps on your PC.'],
  ['artifact-design', 'Design rules for published pages (Artifacts).'],
  ['dataviz', 'Charts and dashboards that read clearly.'],
  ['code-review', 'Review a diff for bugs.'], ['simplify', 'Clean up changed code.'],
  ['security-review', 'Security pass over pending changes.'],
  ['loop', 'Repeat a prompt on an interval.'], ['update-config', 'Change Claude Code settings and hooks.'],
  ['claude-api', 'Reference for building apps on the Claude API.'],
  ['plugin-authoring', 'Build mods: panes, status lines, hooks.'],
];
for (const [name, desc] of BUILTIN_SKILLS)
  if (!nodes.some(n => n.id === 'skill:' + name)) add({ id: 'skill:' + name, kind: 'skill', scope: 'builtin', ring: 3, group: 'Built into the app', name, desc, descTokens: tok(desc) + 25 });

// ---------- agents ----------
const agentTexts = {};
function addAgents(dir, scope, parent) {
  for (const fn of files(dir).filter(x => x.endsWith('.md'))) {
    const p = path.join(dir, fn);
    const t = read(p);
    const f = front(t);
    const id = 'agent:' + (f.name || fn.replace(/\.md$/, ''));
    agentTexts[id] = t;
    const tools = (f.tools || '').split(',').map(s => s.trim()).filter(Boolean);
    const n = add({ id, kind: 'agent', scope, ring: 4, name: f.name || fn, path: p, desc: f.description || '', model: f.model || 'inherit', effort: f.effort,
      tools, descTokens: tok(f.description), tokens: tok(t), outline: headings(f.body) });
    if (!f.description) flag(n, 'warn', 'No description, so I cannot tell when to hand work to it.');
    else if (n.descTokens > 220) flag(n, 'info', `Long description: about ${n.descTokens} tokens ride along with every message.`);
    if (parent) link(parent, id, 'contains');
  }
}
addAgents(path.join(ROOT, '.claude', 'agents'), 'project');
addAgents(path.join(CLAUDE, 'agents'), 'user');
for (const [d, pid] of pluginAgentDirs) addAgents(d, 'plugin', pid);
const BUILTIN_AGENTS = [
  ['Explore', 'Read-only search across many files. Returns only the conclusion.', 'cheaper'],
  ['Plan', 'Designs a step-by-step implementation plan before coding.', 'inherit'],
  ['general-purpose', 'Multi-step research or search tasks.', 'inherit'],
  ['claude-code-guide', 'Answers questions about Claude Code itself.', 'cheaper'],
];
for (const [name, desc, model] of BUILTIN_AGENTS)
  add({ id: 'agent:' + name, kind: 'agent', scope: 'builtin', ring: 4, name, desc, model, descTokens: tok(desc) + 20, tools: [] });

// ---------- tools: MCP servers, app connectors, local programs ----------
const mcp = {
  ...(readJson(path.join(APPDATA, 'Claude', 'claude_desktop_config.json'))?.mcpServers || {}),
  ...(readJson(path.join(HOME, '.claude.json'))?.mcpServers || {}),
  // servers added with `claude mcp add` in this folder (unity-editor, context7) sit under projects[...] in .claude.json
  ...(readJson(path.join(HOME, '.claude.json'))?.projects?.[ROOT.replace(/\\/g, '/')]?.mcpServers || {}),
  ...(readJson(path.join(ROOT, '.mcp.json'))?.mcpServers || {}),
};
for (const [name, cfg] of Object.entries(mcp))
  add({ id: 'mcp:' + name, kind: 'tool', sub: 'MCP server', ring: 5, name: name + ' MCP', path: path.join(APPDATA, 'Claude', 'claude_desktop_config.json'),
    desc: `A connector (MCP server) that gives Claude tools named mcp__${name}__*. Started with: ${cfg.command || ''} ${(cfg.args || []).join(' ')}`.trim() });
const APP_TOOLS = [
  ['tool:files', 'Files & shell', 'built in', 'Read, Write, Edit, Grep, Glob, Bash, PowerShell. How Claude looks at and changes files on your PC.'],
  ['tool:web', 'Web search & fetch', 'built in', 'WebSearch and WebFetch: read pages and search results as text.'],
  ['tool:browser', 'Built-in browser', 'app connector', 'The browser pane inside the Claude app. Can click, type and read pages.'],
  ['tool:chrome', 'Claude in Chrome', 'app connector', 'Your real Chrome with your logins. Only used when you ask for it.'],
];
for (const [id, name, sub, desc] of APP_TOOLS) add({ id, kind: 'tool', sub, ring: 5, name, desc });

// ---------- guards ----------
const settingsFiles = [...new Set([path.join(CLAUDE, 'settings.json'), path.join(ROOT, '.claude', 'settings.json'), path.join(ROOT, '.claude', 'settings.local.json')])];
const perms = { allow: [], ask: [] };
for (const s of settingsFiles.map(readJson).filter(Boolean)) { perms.allow.push(...(s.permissions?.allow || [])); perms.ask.push(...(s.permissions?.ask || [])); }
add({ id: 'guard:perms', kind: 'plugin', ring: 5, name: 'Permissions', path: settingsFiles[0], isGuard: true,
  desc: `Which tool calls run without asking. Allowed: ${perms.allow.length}, always ask: ${perms.ask.join(', ') || 'none'}.`,
  allow: perms.allow, ask: perms.ask });

// ---------- storage ----------
const STORAGE = [
  ['store:projects', 'projects', 'One folder per project: a log file per conversation and Claude\'s auto memory.'],
  ['store:skills', 'skills', 'Your own skills, one folder each.'],
  ['store:agents', 'agents', 'Your own subagents, one .md file each.'],
  ['store:plugins', 'plugins', 'Installed plugins and the marketplaces they came from.'],
  ['store:commands', 'commands', 'Your own slash commands.'],
];
for (const [id, name, desc] of STORAGE) {
  const p = path.join(CLAUDE, name);
  if (!exists(p)) continue;
  const big = name === 'projects' || name === 'plugins';
  add({ id, kind: 'storage', ring: 6, name: name + '/', path: p, desc, items: dirs(p).concat(big ? [] : files(p)).slice(0, 12),
    files: big ? null : countFiles(p) });
}

// ---------- links: who mentions whom ----------
const ALIASES = {
  'mcp:blender': [/mcp__blender/i, /blender mcp/i, /mcp for blender/i, /blender_mcp/i],
  'mcp:unity-editor': [/mcp__unity-editor/i, /unity mcp/i],
  'tool:browser': [/built-in browser/i, /claude_browser/i], 'tool:chrome': [/claude in chrome/i],
  'tool:web': [/websearch|webfetch/i],
};
// Plain-word names (docs, loop, Plan) only count when written as `name`; hyphenated names count anywhere.
for (const n of nodes) if (n.kind === 'skill' || n.kind === 'agent') {
  const nm = n.name.split(':').pop();
  ALIASES[n.id] = [nm.includes('-') ? new RegExp('(^|[^\\w-])' + nm.replace(/-/g, '\\-') + '(?![\\w-])') : new RegExp('`' + nm + '`')];
}
const texts = { ...skillTexts, ...agentTexts };
for (const [from, t] of Object.entries(texts))
  for (const [to, res] of Object.entries(ALIASES))
    if (nodes.some(n => n.id === to) && res.some(r => r.test(t))) link(from, to, to.startsWith('store:') ? 'reads / writes' : 'mentions');
for (const n of nodes.filter(n => n.kind === 'agent'))
  for (const t of n.tools) {
    if (/^(Read|Write|Edit|Glob|Grep|Bash|PowerShell)$/.test(t)) link(n.id, 'tool:files', 'has tool');
    else if (/^Web/.test(t)) link(n.id, 'tool:web', 'has tool');
    else { const m = t.match(/^mcp__(\w+?)__/); if (m && nodes.some(x => x.id === 'mcp:' + m[1])) link(n.id, 'mcp:' + m[1], 'has tool'); }
  }
for (const n of nodes.filter(n => n.kind === 'context')) link('core', n.id, 'always loaded');

// ---------- routing table from the project CLAUDE.md ----------
const routes = [];
const proj = read(path.join(ROOT, 'CLAUDE.md')) || '';
const tableStart = proj.indexOf('## Which skill for what');
if (tableStart >= 0) {
  for (const line of proj.slice(tableStart).split(/\r?\n/).slice(1)) {
    if (/^## /.test(line)) break;
    const cols = line.split('|').map(s => s.trim());
    if (cols.length < 4 || /^-+$/.test(cols[1]) || cols[1] === 'Task') continue;
    const named = [...cols[2].matchAll(/`([^`]+)`/g)].map(m => m[1]);
    const find = name => nodes.find(n => (n.kind === 'skill' || n.kind === 'agent') && n.name.split(':').pop() === name)?.id ||
      nodes.find(n => n.kind === 'plugin' && n.name === name)?.id;
    const targets = named.map(find).filter(Boolean);
    // only names shaped like a skill (lower-case with a hyphen) count as missing; paths and theme names don't
    for (const name of named) if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(name) && !find(name)) flag(nodes.find(n => n.id === 'ctx:project'), 'warn', `The skill table names ${name}, which is not installed.`);
    routes.push({ task: cols[1], targets });
    for (const t of targets) link('ctx:project', t, 'routes to');
  }
}

// ---------- origin: made by you (mine), built into Claude (claude), cloned from GitHub (github), or a program from its maker's site (web) ----------
const markets = readJson(path.join(CLAUDE, 'plugins', 'known_marketplaces.json')) || {};
const fromGit = m => (markets[m]?.source || {}).source === 'github';
for (const n of nodes) {
  if (n.kind === 'core') continue;
  const plug = n.scope === 'plugin' ? nodes.find(p => p.id === 'plugin:' + n.group) : null;
  n.origin = n.kind === 'plugin' ? (n.isGuard ? 'mine' : fromGit(n.market) ? 'github' : 'mine')
    : plug ? (fromGit(plug.market) ? 'github' : 'mine')
    : n.scope === 'builtin' || n.scope === 'app' || ['built in', 'app connector'].includes(n.sub) ? 'claude'
    : n.kind === 'tool' ? 'github'
    : 'mine';
}

const catalogTokens = nodes.filter(n => n.kind === 'skill' || n.kind === 'agent').reduce((a, n) => a + (n.descTokens || 0) + 8, 0);
const data = { scannedAt: new Date().toISOString(), root: ROOT, nodes, edges, routes, catalogTokens };
fs.writeFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'data.js'),
  '// Generated by scan.mjs. Do not edit; press SYNC in the Brain.\nwindow.BRAIN = ' + JSON.stringify(data, null, 1) + ';\n');
const count = k => nodes.filter(n => n.kind === k).length;
console.log(`Scanned: ${count('skill')} skills, ${count('agent')} agents, ${count('tool')} tools, ${count('context')} context files, ${count('storage')} folders, ${count('plugin')} plugins/guards, ${edges.length} links, ${routes.length} routes.`);
