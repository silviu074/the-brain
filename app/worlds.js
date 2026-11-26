// Worlds: planets in the Brain's sky. index.html draws each planet from this list (at, size, colors, ring).
// Planets with a page (the Brain itself and Drop Convert): click one, then scroll to fly in and open its page.
// Planets marked deco: true are scenery only: no name, no click, no page.
// To add one: copy an entry, give it a new id, a free spot in the sky (at) and a page() that returns its HTML.
// A planet can also have a notes file, worlds/<id>.md, shown on its page.
(() => {
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------------- Drop Convert ----------------
const convertPage = () => simplePage('convert', {
  kicker: 'APP · WINDOWS AND MAC', title: 'Drop Convert',
  lead: 'Drop a file on the orange bubble, pick a format, and the converted copy shows up next to the original. A separate app: download and install it first, then start it from here.',
  where: [['Get it first', 'separate download from github.com/silviu074/drop-convert'], ['Start button', 'works once Drop Convert is installed']],
  open: `<a class="wp-btn main" href="${esc(W.convert.repo)}/releases/latest" target="_blank" rel="noopener">1 · Download Drop Convert</a><button class="wp-btn" data-launch="drop-convert">2 · Start Drop Convert</button>`,
  more: [
    ['What it converts', `<table><tr><td>Video</td><td>MP4, MOV, WEBM, GIF, or just the sound as MP3 or WAV</td></tr>
      <tr><td>GIF</td><td>MP4, MOV, WEBM</td></tr>
      <tr><td>Audio</td><td>MP3, WAV, FLAC, M4A, OGG</td></tr>
      <tr><td>Image</td><td>PNG, JPG, WEBP, BMP</td></tr>
      <tr><td>Document</td><td>PDF, DOCX, ODT, RTF, TXT</td></tr>
      <tr><td>PDF</td><td>DOCX, TXT, or one JPG / PNG per page</td></tr></table>`],
    ['Good to know', `<ul><li>The new file lands in the same folder as the original. The original is never changed, and nothing is overwritten.</li>
      <li>Your files never leave the computer: it uses free ffmpeg for media and Word, running hidden, for documents.</li>
      <li>GIFs are capped at 480 px wide and 12 frames per second to keep the size sane.</li>
      <li>JPG has no transparency, so see-through parts turn white.</li></ul>`],
    ['How it was made', `<ul><li>Made with AI: I described what I wanted in plain words, Claude Code wrote and tested the code, and I reviewed and used it.</li>
      <li>One file of C# on Windows (built with the compiler that ships with Windows) and one Swift file on Mac.</li>
      <li>Needs ffmpeg for video, audio and images, and Microsoft Word for documents.</li></ul>`]] });

// ---------------- Missions: a guided path on each app planet ----------------
// One chapter at a time: a picture that draws itself, a few lines and ONE glowing next step. Doing the step unlocks the
// next chapter. Some chapters first ask you to click parts of the picture or the cards (need). Progress: localStorage 'brain.mission'.
const MK = 'brain.mission';
let ms; try { ms = JSON.parse(localStorage.getItem(MK)) || {}; } catch { ms = {}; }
const msSave = () => { try { localStorage.setItem(MK, JSON.stringify(ms)); } catch {} };
const mView = {}, mHot = {};
let after = null; // what to try on the map once the flight back ends (window.brainDo in index.html)

// Diagrams, after the diagram-design skill: 4 px grid, boxes rx 6, right-angle arrows with r 8 elbows, one accent focal
// per picture, a short reveal (0.6 s per step, under 5 s) and at most one looping token. Reduced motion shows it complete.
let figN = 0;
function fig(h, inner, label) {
  const p = 'dg' + (++figN);
  return `<div class="dg"><svg viewBox="0 0 720 ${h}" role="img" aria-label="${esc(label)}"><defs>
    <marker id="${p}m" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" class="dg-mk"/></marker>
    <marker id="${p}a" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" class="dg-mka"/></marker></defs>
    ${inner.replaceAll('@@m', `url(#${p}m)`).replaceAll('@@a', `url(#${p}a)`)}</svg></div>`;
}
const N = (x, y, w, h, name, sub, o = {}) => `<g class="dg-n${o.focal ? ' focal' : ''}${o.dash ? ' opt' : ''}${o.cls ? ' ' + o.cls : ''}"${o.hot ? ` data-hot="${o.hot}"` : ''}${o.go != null ? ` data-go="${o.go}"` : ''} style="--d:${o.s || 0}">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/><text x="${x + w / 2}" y="${y + h / 2 + (sub ? -2 : 4)}" class="dg-t">${esc(name)}</text>${sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 13}" class="dg-s">${esc(sub)}</text>` : ''}</g>`;
const A = (d, s, acc, dash) => `<path class="dg-a${acc ? ' acc' : ''}${dash ? ' opt' : ''}" d="${d}" marker-end="${acc ? '@@a' : '@@m'}" style="--d:${s}"/>` +
  (acc ? `<path class="dg-draw" pathLength="1" d="${d}" style="--d:${s}" aria-hidden="true"/>` : '');
const TOK = (d, dur = 3.2) => `<circle r="3.5" class="dg-tok"><animateMotion dur="${dur}s" repeatCount="indefinite" path="${d}"/></circle>`;
const LBL = (x, y, t, s) => `<text x="${x}" y="${y}" class="dg-l" style="--d:${s}">${esc(t)}</text>`;

const FIGS = {
  brainFlow: () => fig(260, A('M128 124 H172', 1) + A('M304 124 H348', 2) + A('M472 110 H512 Q520 110 520 102 V56 Q520 48 528 48 H564', 4) +
    A('M472 124 H564', 4, true) + A('M472 138 H512 Q520 138 520 146 V192 Q520 200 528 200 H564', 4) + A('M412 152 V192', 5, false, true) + LBL(420, 176, 'LOGS', 5) +
    N(16, 96, 112, 56, 'You', 'A MESSAGE', { hot: 'you', s: 0 }) + N(176, 96, 128, 56, 'Rules and lessons', 'CLAUDE.MD', { hot: 'rules', s: 1 }) +
    N(352, 96, 120, 56, 'Claude', 'THE CORE', { hot: 'claude', focal: true, s: 2 }) + N(568, 24, 136, 48, 'Skills', 'RECIPES', { hot: 'skills', s: 3 }) +
    N(568, 100, 136, 48, 'Agents', 'HELPERS', { hot: 'agents', s: 3 }) + N(568, 176, 136, 48, 'MCP servers', 'OTHER PROGRAMS', { hot: 'mcp', s: 3 }) +
    N(352, 196, 120, 48, 'The Brain', 'THIS MAP', { hot: 'brain', dash: true, s: 5 }) + TOK('M128 124 H564'), 'How a message travels through the setup'),
  live: () => fig(120, A('M144 60 H180', 1) + A('M312 60 H348', 2) + A('M480 60 H516', 3, true) +
    N(16, 36, 128, 48, 'You type', 'IN CLAUDE CODE', { s: 0 }) + N(184, 36, 128, 48, 'Claude works', 'TOOLS, SKILLS', { s: 1 }) +
    N(352, 36, 128, 48, 'Session file', 'EVERY STEP', { s: 2 }) + N(520, 36, 184, 48, 'LIVE tab lights up', 'WHAT WAS USED', { focal: true, s: 3 }) + TOK('M144 60 H516'), 'From your message to the LIVE tab'),
  heat: () => fig(152, A('M160 68 H184 Q192 68 192 60 V48 Q192 40 200 40 H220', 1) + A('M160 84 H184 Q192 84 192 92 V104 Q192 112 200 112 H220', 1) +
    A('M384 40 H408 Q416 40 416 48 V60 Q416 68 424 68 H444', 3, true) + A('M384 112 H408 Q416 112 416 104 V92 Q416 84 424 84 H444', 3) +
    N(16, 52, 144, 48, 'Last 30 days', 'DAY · WEEK · MONTH', { s: 0 }) + N(224, 16, 160, 48, 'HEAT', 'HOW OFTEN', { s: 2 }) + N(224, 88, 160, 48, 'COST', 'TOKENS PER MESSAGE', { s: 2 }) +
    N(448, 52, 256, 48, 'Trim what you never use', 'SMALLER, FASTER MESSAGES', { focal: true, s: 4 }), 'HEAT and COST show what to trim'),
  planets: () => fig(168, A('M144 72 H200 Q208 72 208 64 V44 Q208 36 216 36 H284', 1) + A('M144 84 H284', 1) + A('M144 96 H200 Q208 96 208 104 V124 Q208 132 216 132 H284', 1) +
    A('M472 84 H540', 3, true) +
    N(16, 60, 128, 48, 'The Brain', 'THE CORE', { s: 0 }) + N(288, 12, 184, 48, 'Drop Convert', 'APP', { s: 2 }) + N(288, 60, 184, 48, 'Other planets', 'SCENERY ONLY', { dash: true, s: 2 }) +
    N(288, 108, 184, 48, 'Your own app', 'ADD IT IN WORLDS.JS', { dash: true, s: 2 }) + N(544, 60, 160, 48, 'Click, then scroll', 'TO FLY IN', { focal: true, s: 4 }), 'The planets around the Brain'),
  start: () => fig(120, A('M176 60 H228', 1, true) + A('M432 60 H484', 3, false, true) +
    N(16, 36, 160, 48, 'Start button', 'ON THIS PAGE', { s: 0 }) + N(232, 36, 200, 48, 'Orange bubble', 'ON YOUR DESKTOP', { focal: true, s: 2 }) +
    N(488, 36, 216, 48, 'Drag it anywhere', 'IT REMEMBERS THE SPOT', { dash: true, s: 4 }), 'Starting Drop Convert'),
  convert: () => fig(120, A('M144 60 H180', 1) + A('M296 60 H332', 2) + A('M480 60 H516', 3, true) +
    N(16, 36, 128, 48, 'Your file', 'MP4 PNG DOCX PDF', { s: 0 }) + N(184, 36, 112, 48, 'The bubble', 'DROP IT HERE', { s: 1 }) +
    N(336, 36, 144, 48, 'Round menu', 'ONLY WHAT FITS', { s: 2 }) + N(520, 36, 184, 48, 'New copy', 'NEXT TO THE ORIGINAL', { focal: true, s: 3 }) + TOK('M144 60 H516'), 'How a file gets converted'),
};
const TRICKS = [['all', 'Every format at once', 'Point at the orange ring around the menu (or its ALL tab), then click. You get one copy in every format.'],
  ['many', 'Several files', 'Select them all and drag them onto the bubble together.'], ['move', 'Move the bubble', 'Hold the left mouse button on it and drag. It opens in the same spot next time.'],
  ['quit', 'Close and quit', 'Esc or a click outside closes the menu. Right-click the bubble and choose Quit to stop it.']];

const MISSIONS = {
  brain: [
    { t: 'How a message travels', d: 'Click the parts of the picture to see what each one does.', fig: FIGS.brainFlow, need: 3, needT: 'Click 3 boxes in the picture',
      body: '<p>Every message you send passes through the same few stops. The map is built from exactly these parts: click them.</p>',
      hot: { you: 'You type a request in Claude Code. Every message starts here.', rules: 'Your rules and lessons load with every message, so Claude follows them even when you forget to say them.',
        claude: 'Claude reads all of that plus the chat, decides what to do and calls tools. On the map it is the glowing core.', skills: 'Skills are recipes. Claude loads one only when the task matches it, then follows its steps.',
        agents: 'Agents are helpers with a fresh context. Claude hands them a brief and they report back.', mcp: 'MCP servers let Claude drive other programs, like Blender or the browser.',
        brain: 'Every step lands in Claude Code\'s session file. The Brain reads it and lights up what was used.' },
      go: 'Got it, next step', act: c => c.done() },
    { t: 'Watch Claude work', d: 'Open LIVE and see the map light up.', fig: FIGS.live,
      body: '<p>The LIVE tab follows the chat that is running right now. Every skill, agent and tool Claude touches lights up, with comets running to the core.</p><p>Open it, then send any message in Claude Code and watch.</p>',
      go: 'Take me to LIVE', act: c => c.away('live') },
    { t: 'Find what costs you', d: 'Turn the knob to HEAT and see what you really use.', fig: FIGS.heat,
      body: '<p>HEAT shows how often each thing was used. COST shows how many tokens each thing adds to every message. What you never use but still pay for is the first thing to trim.</p>',
      go: 'Show me HEAT', act: c => c.away('heat') },
    { t: 'Visit a planet', d: 'Fly to the Drop Convert planet.', fig: FIGS.planets,
      body: '<p>A planet with a name has its own page. Click it, then scroll down to fly in, the same way you got here. The nameless planets are scenery.</p>',
      go: 'Show me Drop Convert', act: c => c.away('planet:convert') },
  ],
  convert: [
    { t: 'See it in 30 seconds', d: 'Click the three steps of the demo.', need: 3, needT: 'Click the 3 steps of the demo',
      body: `<div class="dm"><video id="dmVid" src="media/drop-convert-demo.mp4" muted autoplay loop playsinline controls preload="auto"></video>
        <div class="dm-steps">
        <button class="dm-step" data-hot="gif" data-seek="1.5" data-end="9"><em>0:02</em><b>Drop a video, pick GIF</b><span>Drag a video onto the bubble. The round menu shows only the formats that fit a video. Click GIF and the GIF appears next to the original.</span></button>
        <button class="dm-step" data-hot="pdf" data-seek="9" data-end="19"><em>0:09</em><b>Word to PDF</b><span>Drop a Word file and pick PDF. Word does the work hidden in the background; you never see it open.</span></button>
        <button class="dm-step" data-hot="all" data-seek="19" data-end="28"><em>0:19</em><b>Every format at once</b><span>Drop an image and point at the orange ring: every slice lights up. One click saves a copy in each format.</span></button>
        </div></div>`,
      go: 'Now start it yourself', act: c => c.done() },
    { t: 'Start it', d: 'Start Drop Convert right from here.', fig: FIGS.start,
      body: '<p>Drop Convert is a separate app: a small orange bubble that floats on your desktop, above your other windows. Download and install it first from its GitHub page (button 1 at the top of this page). Then start it here and look for the bubble.</p>',
      go: 'Start Drop Convert', act: c => c.launch('drop-convert', 'Started. Look for the orange bubble on your desktop.') },
    { t: 'Convert a file', d: 'Drop a real file on the bubble and pick a format.', fig: FIGS.convert,
      body: '<p>Drag any video, image, audio file, Word file or PDF onto the bubble. The round menu shows only the formats that fit. Click one and the copy lands next to the original. The original is never changed.</p>',
      go: 'I converted a file', act: c => c.done() },
    { t: 'Learn the tricks', d: 'Flip the four cards.', need: 4, needT: 'Flip the 4 cards',
      body: `<p>Four things that save time once you use it every day.</p><div class="ms-flips">${TRICKS.map(([k, t, x]) => `<button class="ms-flip" data-hot="${k}"><b>${t}</b><span>${x}</span></button>`).join('')}</div>`,
      go: 'Finish the mission', act: c => c.done() },
  ],
};

// Nothing is ever locked: every chapter opens and every button works. The guidance is the glow: the chapter that is
// UP NEXT pulses, its step button glows, and a tip says what to try first. Progress: the list of chapters done.
const dn = id => { const v = ms[id]; return new Set(Array.isArray(v) ? v : Array.from({ length: v || 0 }, (_, i) => i)); }; // older saves kept a count
const nextUp = id => MISSIONS[id].findIndex((_, i) => !dn(id).has(i)); // -1: all done
const markDone = (id, i) => { ms[id] = [...dn(id).add(i)]; msSave(); };
function missionHtml(id) {
  const M = MISSIONS[id], D = dn(id), nx = nextUp(id), cur = Math.min(mView[id] ?? Math.max(nx, 0), M.length - 1), c = M[cur];
  return `<div class="ms" data-cur="${cur}">
    <div class="ms-bar"><span>${nx < 0 ? 'MISSION COMPLETE' : 'MISSION · ' + D.size + ' OF ' + M.length + ' DONE'}</span><i>${M.map((_, i) => `<b class="${D.has(i) ? 'ok' : i === nx ? 'now' : ''}"></b>`).join('')}</i>${D.size ? '<button class="ms-reset" data-mreset>start over</button>' : ''}</div>
    <div class="kt-chaps ms-chaps" style="--n:${M.length}">${M.map((m, i) => `<button class="kt-chap${i === cur ? ' on' : ''}${D.has(i) ? ' ok' : ''}${i === nx ? ' next' : ''}" data-mgo="${i}">
      <em>0${i + 1} / 0${M.length}${D.has(i) ? ' · DONE' : i === nx ? ' · UP NEXT' : ''}</em><b>${esc(m.t)}</b><span>${esc(m.d)}</span></button>`).join('')}</div>
    <section class="wp-card ms-now"><h2>${String(cur + 1).padStart(2, '0')} · ${esc(c.t)}</h2>${c.fig ? c.fig() : ''}<div class="ms-body">${c.body}</div>
      ${c.hot ? '<div class="ms-hot">Click one to read about it here.</div>' : ''}
      <div class="wp-btns ms-go">${goBtn(id, cur)}</div><div class="wp-note ms-note"></div></section></div>`;
}
function goBtn(id, i) {
  const M = MISSIONS[id], c = M[i], nx = nextUp(id), seen = mHot[id]?.[i]?.size || 0;
  if (dn(id).has(i)) return nx < 0 ? '<span class="ms-done">Mission complete. Well done.</span>' : `<button class="wp-btn main go" data-mgo="${nx}">Next: ${esc(M[nx].t)}</button>`;
  if (c.need && seen < c.need) return `<button class="wp-btn main" data-mdo="${i}">${esc(c.go)}</button><span class="ms-tip">Try this first: ${esc(c.needT.toLowerCase())} · ${seen} / ${c.need}</span>`;
  return `<button class="wp-btn main go" data-mdo="${i}">${esc(c.go)}</button>`;
}
function renderMission() { // redraws in place: clicks never move the page
  const el = page.querySelector('.ms'); if (!el) return;
  el.outerHTML = missionHtml(cur.id); bindPage(page.querySelector('.wp-body'));
}
function missionClick(e) { // true when the click was the mission's
  const box = e.target.closest('.ms'); if (!box || !cur) return false;
  const id = cur.id, i = +box.dataset.cur, M = MISSIONS[id];
  const hot = e.target.closest('[data-hot]'), mgo = e.target.closest('[data-mgo]'), mdo = e.target.closest('[data-mdo]');
  if (hot) { // a part of the picture, a chip or a card: mark it, show its text, count it
    ((mHot[id] ||= {})[i] ||= new Set()).add(hot.dataset.hot); hot.classList.add('seen');
    const txt = M[i].hot?.[hot.dataset.hot], out = box.querySelector('.ms-hot');
    if (txt && out) { out.innerHTML = `<b>${esc(hot.querySelector('.dg-t, b')?.textContent || '')}</b>${esc(txt)}`; out.classList.remove('pop'); void out.offsetWidth; out.classList.add('pop'); }
    box.querySelector('.ms-go').innerHTML = goBtn(id, i);
    return !hot.dataset.seek; // a demo step also jumps the video
  }
  if (mgo) { mView[id] = +mgo.dataset.mgo; renderMission(); return true; }
  if (e.target.closest('[data-mreset]')) { ms[id] = []; mView[id] = 0; mHot[id] = {}; msSave(); renderMission(); return true; }
  if (mdo) {
    const note = t => box.querySelector('.ms-note').textContent = t;
    const complete = () => { markDone(id, i); mdo.textContent = 'Done'; mdo.classList.remove('go'); mdo.disabled = true; box.querySelector('.ms-tip')?.remove();
      setTimeout(() => { if (page.querySelector('.ms') !== box) return; const nx = nextUp(id); mView[id] = nx < 0 ? i : nx; renderMission(); if (nx >= 0) page.querySelector('.kt-chap.on')?.classList.add('unlock'); }, 900); };
    M[i].act({
      done: complete,
      link: url => { window.open(url, '_blank', 'noopener'); complete(); },
      launch: (app, okText) => { note('Starting...'); fetch('/api/launch?app=' + encodeURIComponent(app), { method: 'POST' }).then(r => r.json())
        .then(r => { if (r.ok) { note(okText); complete(); } else note('Could not start it: ' + (r.error || 'unknown error')); }).catch(() => note('Could not reach the Brain server.')); },
      away: k => { markDone(id, i); const nx = nextUp(id); mView[id] = nx < 0 ? i : nx; after = () => window.brainDo?.(k); leave(); },
    });
    return true;
  }
  return false;
}
function bindPage(body) { // the demo video: highlight the step that is playing
  const vid = body.querySelector('#dmVid'); if (!vid || vid.dataset.b) return; vid.dataset.b = 1; vid.muted = true;
  vid.addEventListener('timeupdate', () => { for (const s of body.querySelectorAll('.dm-step')) s.classList.toggle('cur', vid.currentTime >= +s.dataset.seek && vid.currentTime < +s.dataset.end); });
}

// ---------------- The Brain (the core in the middle: click it, then scroll down) ----------------
const brainPage = () => simplePage('brain', {
  kicker: 'APP · WINDOWS AND MAC', title: 'The <em>Brain</em>',
  lead: 'A visual way to follow what AI does on your computer: live while it works, and everything it did before. It is also a hub for your own apps, one planet each.',
  where: [['Folder', 'app', true], ['Runs at', 'http://localhost:8767']],
  open: `<p class="wp-how">To open it again later, use The Brain shortcut on the Desktop or in the Start menu.</p>${W.brain.repo ? `<a class="wp-btn" href="${esc(W.brain.repo)}" target="_blank" rel="noopener">Code on GitHub</a>` : ''}`,
  more: [
    ['Using it', `<table><tr><td>Move around</td><td>Scroll. Click the core or a planet, then scroll down to fly into its page; scroll up at the top to fly back out</td></tr>
      <tr><td>See an item</td><td>Click it: it locks, and only it and what it talks to stay lit</td></tr>
      <tr><td>Fly behind an item</td><td>Double-click it; Esc flies home</td></tr>
      <tr><td>Find anything</td><td>Press / to search, or Ctrl+K for the command list</td></tr>
      <tr><td>Watch Claude work</td><td>Open the LIVE tab; HISTORY replays a past prompt</td></tr>
      <tr><td>What gets used, what costs</td><td>Turn the knob to HEAT or COST and pick DAY, WEEK or MONTH</td></tr>
      <tr><td>Panels</td><td>The left rail: layers, usage, files, planets</td></tr>
      <tr><td>Visit a planet</td><td>Click it, then scroll down to fly in; scroll up at the top of its page to leave</td></tr></table>`],
    ['What you see', `<ul><li>The core in the middle is Claude. The rings around it are the layers of the setup: rules, skills, agents, plugins, MCP servers and programs.</li>
      <li>Lines and comets show who talks to whom, only while something runs.</li>
      <li>The day reel at the bottom shows the last 30 days; taller frames mean more tokens.</li>
      <li>The Brain is also a hub for your apps: each named planet is one app or project with its own page. Drop Convert is the example (a separate download); the nameless planets are scenery. Add your own in app/worlds.js.</li></ul>`],
    ['How it was made', `<ul><li>Made with AI: I described what I wanted in plain words, Claude Code wrote and tested the code, and I reviewed and used it.</li>
      <li>One HTML page with three.js, plus a small Node server that reads Claude Code's own session files on this computer.</li>
      <li>Nothing leaves the computer.</li></ul>`]] });

// notes + handoffs from brain/worlds/<id>.md: two buttons; they open in the right panel like a file in an editor
const mdInline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '$1');
function mdHtml(md) { // enough markdown for the notes and handoff files: headings, - and 1. lists, **bold**, paragraphs
  let html = '', list = '';
  for (const line of md.split(/\r?\n/)) {
    const li = line.match(/^\s*(-|\d+\.)\s+(.*)/), h = line.match(/^#{1,3}\s+(.*)/), tag = li ? (li[1] === '-' ? 'ul' : 'ol') : '';
    if (list && tag !== list) { html += `</${list}>`; list = ''; }
    if (h) html += `<h3>${mdInline(h[1])}</h3>`;
    else if (li) { if (!list) { html += `<${tag}>`; list = tag; } html += `<li>${mdInline(li[2])}</li>`; }
    else if (line.trim()) html += `<p>${mdInline(line)}</p>`;
  }
  return html + (list ? `</${list}>` : '');
}
window.brainMd = mdHtml; // the core card in index.html renders brain/worlds/brain.md with it too
const notesOf = {}; // planet id -> what /api/worlds said, for the right panel
const fileName = f => f.split(/[\\/]/).pop();
function fillNotes(id, el) {
  fetch('/api/worlds').then(r => r.json()).then(all => {
    const w = all[id]; if (!w || !el.isConnected) return;
    w.all = [...w.handoffs.map(h => ({ ...h, wait: true })), ...(w.used || [])]; notesOf[id] = w;
    const sep = w.root.includes('\\') ? '\\' : '/'; // "where it lives" paths, written relative to the hub folder
    page.querySelectorAll('[data-rel]').forEach(s => s.textContent = w.root + sep + s.dataset.rel.replaceAll('/', sep));
    el.innerHTML = `<button class="wp-btn" data-notes>Notes</button>${w.all.length ? `<button class="wp-btn" data-hofs>Handoffs · ${w.all.length}</button>
      <div class="wp-hlist" hidden>${w.all.map((h, i) => `<button class="wp-hrow" data-hof="${i}"><b>${esc(fileName(h.file))}</b><span>${h.wait ? 'Waiting' : 'Used'} · ${esc(h.written)}</span><em>${esc(h.title)}</em></button>`).join('')}</div>` : ''}`;
  }).catch(() => {});
}
function fileClick(e) { // notes, handoffs and a page's extra parts open in the right panel; the tour unfolds in place
  const t = e.target.closest('[data-notes], [data-hofs], [data-hof], [data-more], [data-tour]'); if (!t) return false;
  const w = notesOf[cur.id], d = t.dataset;
  if (d.hofs != null || d.tour != null) {
    const box = page.querySelector(d.hofs != null ? '.wp-hlist' : '.wp-tour'); box.hidden = !box.hidden; t.classList.toggle('sel', !box.hidden);
  } else if (d.more != null) { const [name, html] = MORE[cur.id][+d.more]; openSide(t, name, '', html); }
  else if (d.notes != null) openSide(t, fileName(w.file), w.file, mdHtml(w.notes));
  else { const h = w.all[+d.hof]; openSide(t, fileName(h.file), h.file, mdHtml(h.text), h.wait && h.name); }
  return true;
}
function openSide(btn, name, file, html, copy) {
  if (btn.classList.contains('sel') && page.classList.contains('side')) return closeSide(); // its second click closes it
  page.querySelectorAll('.wp-body .sel:not([data-hofs], [data-tour])').forEach(b => b.classList.remove('sel')); btn.classList.add('sel');
  side.querySelector('.ws-name').textContent = name;
  side.querySelector('.ws-path').innerHTML = file ? `<span>${esc(file)}</span>${copy ? `<button class="ws-copy" data-copy="continue the ${esc(copy)} handoff">Copy resume prompt</button>` : ''}` : '';
  const b = side.querySelector('.ws-b'); b.innerHTML = html; b.scrollTop = 0;
  side.style.setProperty('--st', page.querySelector('.wp-top').offsetHeight + 'px'); page.classList.add('side');
}
function closeSide() { page?.classList.remove('side'); page?.querySelectorAll('.wp-body .sel:not([data-hofs], [data-tour])').forEach(b => b.classList.remove('sel')); }

// the simple planet pages: one line, where it lives and how to open it; everything else opens in the right panel
const MORE = {}; // planet id -> [[button name, html]]
const whereRows = rows => rows.map(([k, v, rel]) => `<div><span>${k}</span><b${rel ? ` data-rel="${v}"` : ''}>${esc(v)}</b></div>`).join('');
const simplePage = (id, o) => { MORE[id] = o.more; return `
  <div class="wp-hero"><div class="wp-kicker">${o.kicker}</div><h1>${o.title}</h1><p class="wp-lead">${o.lead}</p></div>
  <div class="wp-where">${whereRows(o.where)}<div class="wp-btns">${o.open}</div><div class="wp-note" id="wpLaunch"></div></div>
  <div class="wp-more">${MISSIONS[id] ? '<button class="wp-tourbtn sel" data-tour>Guided tour</button>' : ''}${o.more.map(([t], i) => `<button class="wp-btn" data-more="${i}">${esc(t)}</button>`).join('')}
    <span id="wpNotes"></span></div>
  ${MISSIONS[id] ? `<div class="wp-tour">${missionHtml(id)}</div>` : ''}`; };

// ---------------- the list the Brain draws ----------------
const W = {
  convert: { id: 'convert', style: 'iris', name: 'DROP CONVERT', sub: 'FILE CONVERTER APP', color: '#ff8a3a', at: [460, -40, -160], size: 19, seed: 7, tilt: 0.35,
    cols: ['#2a0d02', '#a8410f', '#ff8a3a', '#5a1d05', '#ffc27a', '#3a1404'], page: convertPage, repo: 'https://github.com/silviu074/drop-convert' },
  deco1: { id: 'deco1', deco: true, color: '#6fd6ff', at: [-170, 95, -620], size: 18, seed: 31, tilt: -0.25, ring: true,
    cols: ['#04121c', '#0f4a66', '#6fd6ff', '#0a2a3c', '#bdefff', '#062033'] },
  deco2: { id: 'deco2', deco: true, color: '#8be07a', at: [300, -170, 60], size: 15, seed: 53, tilt: 0.15,
    cols: ['#061a08', '#1f5a24', '#8be07a', '#0d2e10', '#d2ffc4', '#103a14'] },
  deco3: { id: 'deco3', deco: true, color: '#e0a03c', at: [400, 90, -620], size: 17, seed: 89, tilt: -0.4,
    cols: ['#0a1406', '#2e4a12', '#ff5a1f', '#16210a', '#e0a03c', '#3a1a08'] },
  deco4: { id: 'deco4', deco: true, color: '#c9a0ff', at: [-180, -170, 80], size: 14, seed: 17, tilt: 0.2,
    cols: ['#120a1f', '#4a2a78', '#c9a0ff', '#24143c', '#ecdcff', '#1a0f2c'] },
  deco5: { id: 'deco5', deco: true, color: '#ff5a4f', at: [120, 160, -380], size: 16, seed: 71, tilt: 0.3,
    cols: ['#1c0605', '#6a1a14', '#ff5a4f', '#340c09', '#ffc2bb', '#240807'] },
  brain: { id: 'brain', style: 'neural', name: 'THE BRAIN', sub: 'LIVE MAP OF YOUR CLAUDE SETUP', color: '#ffcf7a', page: brainPage, repo: 'https://github.com/silviu074/the-brain' }, // no spot: it opens from the core
};
window.BRAIN_WORLDS = Object.values(W);

// ---------------- the planet page (opens after the warp) ----------------
const css = `
#worldPage { position: fixed; inset: 0; z-index: 60; background: radial-gradient(1200px 700px at 70% -10%, color-mix(in srgb, var(--a) 14%, transparent), transparent 60%), #070605; color: var(--text); pointer-events: none; display: flex; flex-direction: column; font: 15px/1.6 var(--sans); visibility: hidden; }
#worldPage.vis { visibility: visible; } #worldPage.on { pointer-events: auto; }
#worldPage .wp-top, #worldPage .wp-body { opacity: var(--c, 0); transform: translateY(calc((1 - var(--c, 0)) * 24px)); }
/* the way in and out, scrubbed by the mouse wheel: a portal ring at the planet and a hint across the middle */
#worldIris { position: fixed; z-index: 61; left: 0; top: 0; width: 40px; height: 40px; margin: -20px 0 0 -20px; border: 2px solid var(--a); box-shadow: 0 0 30px var(--a), inset 0 0 30px var(--a); pointer-events: none; opacity: 0; border-radius: 50%; }
#worldIris.diamond { border-radius: 4px; }
#worldIris.neural { width: 120px; height: 120px; margin: -60px 0 0 -60px; border-style: dashed; }
#worldIris.rock { border-radius: 42% 58% 63% 37% / 45% 38% 62% 55%; }
/* the fancy part of the flight: warp streaks, a glowing portal edge, shockwaves and a flash, drawn over everything */
#worldFx { position: fixed; inset: 0; z-index: 61; width: 100%; height: 100%; pointer-events: none; }
/* the page's parts arrive one after another, out of blur and depth (and leave the same way) */
#worldPage .wp-stg { --k: clamp(0, calc(var(--c, 0) * 2.2 - var(--i, 0) * 0.16), 1); opacity: var(--k); transform: translateY(calc((1 - var(--k)) * 70px)) scale(calc(0.92 + var(--k) * 0.08)); filter: blur(calc((1 - var(--k)) * 8px)); }
#worldPage.arrive::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at var(--ax, 50%) var(--ay, 50%), color-mix(in srgb, var(--a) 18%, transparent), transparent 65%); animation: wpArrive 1.1s ease-out forwards; }
@keyframes wpArrive { from { opacity: 1; } to { opacity: 0; } }
#worldTitle { position: fixed; z-index: 62; left: 50%; bottom: 12%; transform: translateX(-50%); text-align: center; pointer-events: none; color: var(--a); opacity: 0; white-space: nowrap; transition: opacity .3s; }
#worldTitle.on { opacity: 1; }
#worldTitle small { display: block; font: 600 13px/1 var(--mono); letter-spacing: .4em; color: #fff6e8; margin-bottom: 12px; }
#worldTitle b { display: block; font: 600 30px/1 var(--mono); letter-spacing: calc(.14em + var(--p, 0) * .4em); text-shadow: 0 0 calc(24px + var(--p, 0) * 10px) var(--a), 0 0 4px #000; }
#worldTitle i { display: block; width: 320px; height: 3px; margin: 16px auto 0; background: rgba(255, 255, 255, .12); position: relative; overflow: hidden; border-radius: 2px; }
#worldTitle i::after { content: ''; position: absolute; inset: 0; width: calc(var(--p, 0) * 100%); background: var(--a); box-shadow: 0 0 12px var(--a); }
#worldTitle kbd { display: inline-block; margin-top: 10px; font: 600 11px var(--mono); letter-spacing: .2em; color: var(--dim); animation: wpBob 1.4s ease-in-out infinite; }
@keyframes wpBob { 50% { transform: translateY(5px); } }
#worldPage .wp-top { display: flex; justify-content: space-between; align-items: center; padding: 14px 22px; border-bottom: 1px solid color-mix(in srgb, var(--a) 22%, transparent); font: 600 10px/1 var(--mono); letter-spacing: .2em; color: var(--a); flex: none; }
#worldPage .wp-x { font: 600 10px/1 var(--mono); letter-spacing: .16em; color: var(--text); background: none; border: 1px solid color-mix(in srgb, var(--a) 40%, transparent); border-radius: 3px; padding: 8px 12px; cursor: pointer; }
#worldPage .wp-x:hover { background: color-mix(in srgb, var(--a) 16%, transparent); }
#worldPage .wp-x kbd { margin-left: 8px; color: var(--dim); font: inherit; }
#worldPage .wp-body { flex: 1; overflow: auto; }
#worldPage .wp-in { max-width: 1060px; margin: 0 auto; padding: 34px 28px 60px; }
#worldPage h1 { font: 600 34px/1.15 var(--sans); margin: 6px 0 12px; color: #fff6e8; }
#worldPage h2 { font: 600 13px/1.2 var(--mono); letter-spacing: .14em; color: var(--a); margin: 0 0 14px; text-transform: uppercase; }
#worldPage h3 { font: 600 12px/1.2 var(--mono); letter-spacing: .14em; color: var(--a); margin: 14px 0 6px; text-transform: uppercase; } #worldPage h3:first-of-type { margin-top: 0; }
#worldPage .wp-kicker { font: 600 12px/1.2 var(--mono); letter-spacing: .16em; color: var(--a); opacity: .85; }
#worldPage .wp-lead { font-size: 17px; color: #e6dfd0; max-width: 720px; margin: 0 0 18px; }
#worldPage .wp-btns { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 16px 0 0; }
#worldPage .wp-btn { font: 600 12.5px/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--text); background: none; border: 1px solid color-mix(in srgb, var(--a) 45%, transparent); border-radius: 3px; padding: 11px 16px; cursor: pointer; text-decoration: none; }
#worldPage .wp-btn:hover { background: color-mix(in srgb, var(--a) 16%, transparent); }
#worldPage .wp-btn.main { background: var(--a); color: #0b0906; border-color: var(--a); }
#worldPage .wp-btn.main:hover { filter: brightness(1.1); }
#worldPage .wp-btn.off { opacity: .5; cursor: default; }
#worldPage .wp-note { margin-top: 10px; min-height: 20px; color: var(--a); font-size: 13px; }
#worldPage .wp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; margin-top: 14px; }
#worldPage .wp-card { background: rgba(255, 255, 255, .025); border: 1px solid color-mix(in srgb, var(--a) 18%, transparent); border-radius: 4px; padding: 18px 20px; margin-top: 14px; }
#worldPage .wp-grid .wp-card { margin-top: 0; }
#worldPage .wp-card p { margin: 0 0 6px; color: #e6dfd0; }
#worldPage table { width: 100%; border-collapse: collapse; font-size: 14.5px; }
#worldPage td { padding: 8px 0; border-top: 1px solid rgba(255, 255, 255, .06); vertical-align: top; color: #e6dfd0; }
#worldPage td:first-child { color: #fff6e8; font-weight: 600; width: 38%; padding-right: 12px; }
#worldPage ul { margin: 0; padding-left: 18px; color: #e6dfd0; } #worldPage li + li { margin-top: 7px; }
#worldPage .wp-hero { padding-bottom: 6px; }
.dm { display: grid; grid-template-columns: 300px 1fr; gap: 22px; align-items: start; }
.dm video { width: 300px; aspect-ratio: 9 / 16; border-radius: 10px; background: #000; border: 1px solid color-mix(in srgb, var(--a) 30%, transparent); box-shadow: 0 0 40px color-mix(in srgb, var(--a) 18%, transparent); }
.dm-steps { display: grid; gap: 10px; }
.dm-step { text-align: left; background: rgba(255, 255, 255, .03); border: 1px solid rgba(255, 255, 255, .1); border-left: 3px solid rgba(255, 255, 255, .15); border-radius: 4px; padding: 14px 16px; cursor: pointer; color: #e6dfd0; font: 15px/1.5 var(--sans); transition: border-color .3s, background .3s; }
.dm-step:hover { border-color: color-mix(in srgb, var(--a) 50%, transparent); }
.dm-step.cur { border-left-color: var(--a); background: color-mix(in srgb, var(--a) 10%, transparent); }
.dm-step em { font: 600 12px/1 var(--mono); color: var(--a); font-style: normal; margin-right: 10px; } .dm-step b { font-size: 16.5px; color: #fff6e8; } .dm-step span { display: block; margin-top: 4px; }
.dm-tip { color: var(--dim); font-size: 13px; margin: 2px 0 0; }
/* where it lives and how to open it (the simple pages) */
.wp-where { margin-top: 8px; padding: 16px 20px; border: 1px solid rgba(255, 255, 255, .08); border-radius: 4px; background: rgba(255, 255, 255, .02); }
.wp-where > div:not(.wp-btns):not(.wp-note) { display: grid; grid-template-columns: 150px 1fr; gap: 12px; padding: 5px 0; }
.wp-where span { color: var(--dim); font-size: 14px; } .wp-where b { font: 500 13.5px/1.5 var(--mono); color: #f2ece1; word-break: break-all; user-select: text; }
.wp-where .wp-btns { margin-top: 14px; } .wp-how { margin: 0; color: #d9d2c4; }
/* notes, handoffs and a page's extra parts: buttons that open in the right panel */
.wp-more, #wpNotes { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; margin-top: 22px; } .wp-more #wpNotes { display: contents; }
/* the guided tour toggle: a pill set apart from the other buttons, open at the start */
.wp-tourbtn { display: inline-flex; align-items: center; gap: 9px; margin-right: 12px; padding: 10px 18px 10px 14px; border-radius: 999px; border: 1px solid var(--a); background: color-mix(in srgb, var(--a) 8%, transparent); color: var(--a); font: 600 14px/1 var(--sans); cursor: pointer; }
.wp-tourbtn::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--a); box-shadow: 0 0 8px var(--a); }
.wp-tourbtn::after { content: '▸'; font-size: 12px; transition: transform .2s; } .wp-tourbtn.sel::after { transform: rotate(90deg); }
.wp-tourbtn:hover { background: color-mix(in srgb, var(--a) 16%, transparent); }
#worldPage .wp-btn.sel { background: color-mix(in srgb, var(--a) 16%, transparent); border-color: var(--a); }
.wp-hlist { flex-basis: 100%; display: grid; gap: 4px; }
.wp-hrow { display: grid; grid-template-columns: auto auto minmax(0, 1fr); gap: 4px 14px; align-items: baseline; text-align: left; background: rgba(255, 255, 255, .025); border: 1px solid rgba(255, 255, 255, .08); border-radius: 4px; padding: 10px 14px; color: #d9d2c4; font: 14px/1.4 var(--sans); cursor: pointer; }
.wp-hrow:hover, .wp-hrow.sel { border-color: color-mix(in srgb, var(--a) 50%, transparent); }
.wp-hrow b { font: 500 13px var(--mono); color: #f2ece1; } .wp-hrow span { font-size: 12.5px; color: var(--dim); } .wp-hrow em { font-style: normal; color: #bfb8aa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* the right panel: like a file open in an editor, plain and calm */
#worldPage { --sw: min(620px, 46vw); } #worldPage.side .wp-body { margin-right: var(--sw); }
#wpSide { position: absolute; right: 0; top: var(--st, 41px); bottom: 0; width: var(--sw); display: flex; flex-direction: column; background: #0e0d0c; border-left: 1px solid rgba(255, 255, 255, .09); transform: translateX(100%); visibility: hidden; transition: transform .22s ease, visibility .22s; }
#worldPage.side #wpSide { transform: none; visibility: inherit; } /* inherit: hidden whenever the page is */
.ws-tab { display: flex; border-bottom: 1px solid rgba(255, 255, 255, .08); flex: none; }
.ws-name { padding: 11px 16px 9px; font: 500 13px/1.2 var(--sans); color: #f2ece1; border-bottom: 2px solid var(--a); margin-bottom: -1px; }
.ws-x { margin-left: auto; background: none; border: 0; color: var(--dim); font: 20px/1 var(--sans); padding: 0 16px; cursor: pointer; } .ws-x:hover { color: #f2ece1; }
.ws-path { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 9px 16px; font: 12px/1.4 var(--mono); color: #8f887c; border-bottom: 1px solid rgba(255, 255, 255, .06); flex: none; user-select: text; word-break: break-all; } .ws-path:empty { display: none; }
.ws-copy { background: none; border: 1px solid rgba(255, 255, 255, .15); border-radius: 3px; color: #d9d2c4; font: 12px var(--sans); padding: 4px 9px; cursor: pointer; } .ws-copy:hover { border-color: var(--a); }
.ws-b { flex: 1; overflow: auto; padding: 20px 28px 40px; font: 15px/1.7 var(--sans); color: #d9d2c4; user-select: text; }
#worldPage #wpSide h3 { font: 600 16px/1.35 var(--sans); letter-spacing: 0; text-transform: none; color: #f4efe6; margin: 22px 0 6px; } #worldPage #wpSide h3:first-child { margin-top: 0; }
#wpSide p { margin: 0 0 10px; } #worldPage #wpSide ul, #worldPage #wpSide ol { margin: 0 0 12px; padding-left: 22px; color: #d9d2c4; } #worldPage #wpSide li + li { margin-top: 4px; } #wpSide b { color: #f4efe6; font-weight: 600; }
@media (max-width: 900px) { #worldPage { --sw: 100vw; } #worldPage.side .wp-body { margin-right: 0; } }
/* my setup kit: the five chapters from its setup page */
#worldPage h1 em { font-style: normal; color: var(--a); text-shadow: 0 0 28px color-mix(in srgb, var(--a) 45%, transparent); }
#worldPage [hidden] { display: none !important; }
.kt-chaps { display: grid; grid-template-columns: repeat(var(--n, 3), minmax(0, 1fr)); gap: 10px; margin: 14px 0 14px; }
/* missions: a bar of steps, chapter cards that unlock, one glowing next step */
.ms { margin-top: 26px; }
.ms-bar { display: flex; align-items: center; gap: 14px; font: 600 11.5px/1 var(--mono); letter-spacing: .16em; color: var(--a); }
.ms-bar i { flex: 1; display: grid; grid-auto-flow: column; gap: 4px; } .ms-bar i b { height: 6px; border-radius: 2px; background: rgba(255, 255, 255, .1); }
.ms-bar i b.ok { background: var(--a); } .ms-bar i b.now { background: color-mix(in srgb, var(--a) 45%, transparent); animation: msPulse 1.6s ease-in-out infinite; }
.ms-reset { background: none; border: 0; color: var(--dim); font: 11px var(--mono); letter-spacing: .1em; cursor: pointer; text-decoration: underline; }
.kt-chap.ok em { color: #8be07a; } .kt-chap.next:not(.on) { animation: msNext 2s ease-in-out infinite; }
@keyframes msNext { 50% { border-color: var(--a); box-shadow: 0 0 18px -8px var(--a); } }
.ms-tip { font: 600 11.5px var(--mono); letter-spacing: .1em; color: var(--a); text-transform: uppercase; }
.kt-chap.unlock { animation: msUnlock .9s cubic-bezier(.2, .8, .2, 1); }
.ms-now { animation: msIn .5s cubic-bezier(.2, .8, .2, 1) both; }
.ms-body > p { margin: 0 0 10px; max-width: 760px; }
.ms-hot { min-height: 46px; margin: 14px 0 0; padding: 12px 16px; border-left: 2px solid var(--a); background: rgba(0, 0, 0, .25); border-radius: 0 4px 4px 0; color: var(--dim); font-size: 14.5px; }
.ms-hot b { display: block; color: #fff6e8; margin-bottom: 2px; } .ms-hot.pop { animation: msIn .35s cubic-bezier(.2, .8, .2, 1); color: #e6dfd0; }
.ms-go { margin-top: 18px; } .ms-done { font: 600 13px var(--mono); letter-spacing: .12em; color: #8be07a; text-transform: uppercase; }
#worldPage .wp-btn.go { animation: msGo 1.8s ease-in-out infinite; } #worldPage .wp-btn:disabled { opacity: .55; cursor: default; }
.ms-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.ms-chip { display: inline-flex; align-items: center; gap: 8px; background: rgba(255, 255, 255, .03); border: 1px solid color-mix(in srgb, var(--a) 28%, transparent); border-radius: 4px; padding: 8px 12px; color: #e6dfd0; font: 14px var(--sans); cursor: pointer; transition: background .2s, border-color .2s; }
.ms-chip:hover { border-color: var(--a); } .ms-chip.seen { background: color-mix(in srgb, var(--a) 14%, transparent); border-color: var(--a); }
.ms-chip em { font: 600 11px var(--mono); color: var(--a); font-style: normal; } .ms-chip b { font-weight: 500; }
.ms-flips { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-top: 12px; perspective: 800px; }
.ms-flip { min-height: 116px; text-align: left; background: rgba(255, 255, 255, .03); border: 1px solid color-mix(in srgb, var(--a) 28%, transparent); border-radius: 4px; padding: 14px; color: #e6dfd0; font: 14px/1.45 var(--sans); cursor: pointer; }
.ms-flip b { display: block; color: #fff6e8; font-size: 16px; } .ms-flip span { display: none; margin-top: 8px; }
.ms-flip:not(.seen) b::after { content: 'Click to flip'; display: block; margin-top: 10px; font: 600 11px var(--mono); letter-spacing: .12em; color: var(--a); text-transform: uppercase; }
.ms-flip.seen { border-color: var(--a); background: color-mix(in srgb, var(--a) 10%, transparent); animation: msFlip .5s cubic-bezier(.2, .8, .2, 1); } .ms-flip.seen span { display: block; }
.dm-step.seen em::after { content: ' · SEEN'; }
@keyframes msIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes msPulse { 50% { background: var(--a); } }
@keyframes msGo { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--a) 55%, transparent); } 50% { box-shadow: 0 0 0 8px transparent, 0 0 26px color-mix(in srgb, var(--a) 50%, transparent); } }
@keyframes msUnlock { 0% { transform: scale(.94); box-shadow: 0 0 0 0 var(--a); } 60% { transform: scale(1.03); } 100% { transform: none; } }
@keyframes msFlip { from { transform: rotateY(90deg); } to { transform: none; } }
/* diagrams (diagram-design skill rules): boxes, right-angle arrows, one accent, a short draw-in */
.dg { margin: 4px 0 16px; } .dg svg { width: 100%; height: auto; display: block; overflow: visible; }
.dg-n rect { fill: #0d0c0a; stroke: rgba(230, 223, 208, .45); stroke-width: 1; transition: stroke .2s, fill .2s; }
.dg-n.focal rect { fill: color-mix(in srgb, var(--a) 12%, #0d0c0a); stroke: var(--a); stroke-width: 1.2; }
.dg-n.opt rect { stroke-dasharray: 4 3; }
.dg-t { font: 600 12px var(--sans); fill: #e6dfd0; text-anchor: middle; } .dg-s { font: 9px var(--mono); fill: rgba(230, 223, 208, .62); text-anchor: middle; letter-spacing: .06em; }
.dg-l { font: 500 8px var(--mono); letter-spacing: .06em; fill: rgba(230, 223, 208, .7); }
.dg-a { fill: none; stroke: rgba(230, 223, 208, .55); stroke-width: 1; } .dg-a.acc { stroke: var(--a); stroke-width: 1.2; } .dg-a.opt { stroke-dasharray: 4 3; }
.dg-mk { fill: rgba(230, 223, 208, .55); } .dg-mka { fill: var(--a); } .dg-tok { fill: var(--a); }
.dg-b { fill: rgba(230, 223, 208, .22); }
.dg-n, .dg-a, .dg-l, .dg-b { animation: dgIn .48s cubic-bezier(.2, .8, .2, 1) both; animation-delay: calc(var(--d, 0) * .6s); }
.dg-draw { fill: none; stroke: var(--a); stroke-width: 3; stroke-dasharray: 1; stroke-dashoffset: 1; pointer-events: none; animation: dgDraw .48s linear forwards; animation-delay: calc(var(--d, 0) * .6s + .3s); }
.dg-n[data-hot], .dg-n[data-go] { cursor: pointer; } .dg-n[data-hot]:hover rect, .dg-n[data-go]:hover rect { stroke: var(--a); }
.dg-n[data-hot]:not(.seen) rect { animation: dgAsk 1.6s ease-in-out infinite; animation-delay: 3s; }
.dg-n.seen rect { stroke: var(--a); fill: color-mix(in srgb, var(--a) 9%, #0d0c0a); } .dg-n.lesson.seen .dg-s { fill: var(--a); }
@keyframes dgIn { from { opacity: .12; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes dgDraw { to { stroke-dashoffset: 0; } }
@keyframes dgAsk { 50% { stroke: var(--a); } }
@media (prefers-reduced-motion: reduce) { .dg *, .ms *, #worldPage .wp-btn.go { animation: none !important; } .dg-draw, .dg-tok { display: none; } }
.kt-chap { text-align: left; background: rgba(255, 255, 255, .02); border: 1px solid color-mix(in srgb, var(--a) 20%, transparent); border-radius: 4px; padding: 14px; color: var(--dim); cursor: pointer; font: 13.5px/1.45 var(--sans); transition: border-color .2s, background .2s, transform .2s; }
.kt-chap:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--a) 50%, transparent); }
.kt-chap em { display: flex; align-items: center; gap: 8px; font: 600 11px/1 var(--mono); letter-spacing: .12em; color: var(--a); font-style: normal; }
.kt-chap em::before { content: ''; width: 18px; height: 1px; background: var(--a); box-shadow: 0 0 8px var(--a); }
.kt-chap b { display: block; margin: 10px 0 6px; font: 600 19px/1.1 var(--sans); color: #fff6e8; }
.kt-chap.on { border-color: var(--a); background: color-mix(in srgb, var(--a) 10%, transparent); box-shadow: 0 0 24px -8px var(--a); }
.kt-steps { list-style: none; counter-reset: s; padding: 0; margin: 0; display: grid; gap: 14px; }
.kt-steps li { counter-increment: s; display: grid; grid-template-columns: 32px 1fr; gap: 12px; align-items: start; }
.kt-steps li::before { content: counter(s); width: 32px; height: 32px; border-radius: 50%; background: var(--a); color: #0b0906; font: 700 14px/32px var(--mono); text-align: center; }
.kt-steps p { margin: 4px 0 0; }
.kt-rules, .kt-cols { columns: 2 220px; margin: 0; padding-left: 22px; } .kt-rules li, .kt-cols li { margin: 2px 0; }
@media (max-width: 900px) { .kt-chaps { grid-template-columns: 1fr 1fr; } }
@media (max-width: 760px) { .dm { grid-template-columns: 1fr; } .dm video { width: 100%; max-width: 300px; } }
.ac { display: grid; grid-template-columns: 270px 1fr; height: 100%; }
.ac-side { border-right: 1px solid color-mix(in srgb, var(--a) 18%, transparent); padding: 22px 14px; overflow: auto; }
.ac-main { overflow: auto; padding: 34px 40px 60px; }
.ac-main > * { max-width: 820px; }
.ac-pips { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; margin: 2px 10px 0; }
.ac-pips i { height: 6px; border-radius: 2px; background: rgba(255, 255, 255, .1); transition: background .4s, box-shadow .4s; }
.ac-pips i.ok { background: var(--a); box-shadow: 0 0 8px color-mix(in srgb, var(--a) 60%, transparent); }
.ac-rt { margin: 10px 10px 16px; font: 600 11.5px/1 var(--mono); letter-spacing: .14em; color: var(--a); text-transform: uppercase; }
.ac-pick { margin: 12px 0 0; font: 600 12px var(--mono); letter-spacing: .1em; color: var(--a); text-transform: uppercase; animation: wpBob 1.4s ease-in-out infinite; }
.ac-ab.ask .ac-opt { animation: msNext 2s ease-in-out infinite; } /* guidance, not a lock: the A/B cards pulse until you pick one */
.ac-open { animation: msIn .6s cubic-bezier(.2, .8, .2, 1) both; }
.ac-item { display: flex; gap: 10px; align-items: flex-start; width: 100%; text-align: left; background: none; border: 0; border-radius: 3px; padding: 8px 10px; color: #e0d8c8; font: 14.5px/1.35 var(--sans); cursor: pointer; }
.ac-item:hover { background: rgba(255, 255, 255, .04); }
.ac-item.cur { background: color-mix(in srgb, var(--a) 14%, transparent); color: #fff6e8; }
.ac-item i { flex: none; width: 9px; height: 9px; margin-top: 4px; border-radius: 50%; border: 1px solid var(--faint); }
.ac-item.ok i { background: #7be38a; border-color: #7be38a; box-shadow: 0 0 6px #7be38a; }
.ac-item em { display: block; font: 600 11px/1.4 var(--mono); letter-spacing: .14em; color: var(--a); opacity: .8; font-style: normal; }
.ac-reset { margin: 18px 10px 0; background: none; border: 0; color: var(--faint); font: 11px var(--sans); cursor: pointer; text-decoration: underline; }
.ac-how { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin: 8px 0 14px; }
.ac-how div { border: 1px solid color-mix(in srgb, var(--a) 18%, transparent); border-radius: 4px; padding: 14px 16px; color: #e6dfd0; font-size: 15px; }
.ac-how b { display: block; color: var(--a); font: 600 12.5px/1.6 var(--mono); letter-spacing: .14em; text-transform: uppercase; margin-bottom: 4px; }
.ac-small { color: var(--dim); font-size: 13px; }
.ac-g { color: #7be38a; }
.ac-ab { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.ac-opt { display: flex; flex-direction: column; justify-content: flex-start; text-align: left; background: rgba(255, 255, 255, .03); border: 1px solid rgba(255, 255, 255, .1); border-radius: 4px; padding: 16px 18px; color: #f0e9da; font: 15.5px/1.55 var(--sans); cursor: pointer; }
.ac-opt:hover { border-color: color-mix(in srgb, var(--a) 50%, transparent); }
.ac-opt em { display: block; font: 600 13px/1.6 var(--mono); letter-spacing: .14em; color: var(--a); font-style: normal; margin-bottom: 4px; }
.ac-opt.good { border-color: #7be38a; background: rgba(123, 227, 138, .07); } .ac-opt.good em::after { content: ' · WORKS'; color: #7be38a; }
.ac-opt.bad { opacity: .6; } .ac-opt.bad em::after { content: ' · WEAK'; color: #ff8a7a; }
.ac-reveal { margin-top: 12px; padding: 14px 16px; border-left: 3px solid var(--a); background: color-mix(in srgb, var(--a) 7%, transparent); color: #f0e9da; font-size: 15.5px; }
.ac-q { padding: 14px 0; border-top: 1px solid rgba(255, 255, 255, .08); } .ac-q:first-of-type { border-top: 0; padding-top: 0; }
.ac-q b { display: block; margin-bottom: 8px; color: #fff6e8; font-weight: 600; font-size: 17px; }
.ac-q label, .ac-check label { display: flex; gap: 12px; align-items: flex-start; padding: 7px 10px; margin: 2px 0; border-radius: 4px; cursor: pointer; color: #f0e9da; font-size: 16px; }
.ac-q label:hover, .ac-check label:hover { background: rgba(255, 255, 255, .04); }
.ac-q input, .ac-check input { margin-top: 5px; width: 16px; height: 16px; accent-color: var(--a); flex: none; }
.ac-q.right b::after { content: '  correct'; color: #7be38a; font: 600 13px var(--mono); letter-spacing: .12em; }
.ac-q.wrong b::after { content: '  not quite'; color: #ff8a7a; font: 600 13px var(--mono); letter-spacing: .12em; }
.ac-res { font-size: 15px; color: var(--dim); }
.ac-guides { display: grid; gap: 10px; } .ac-guides a { display: block; border: 1px solid color-mix(in srgb, var(--a) 22%, transparent); border-radius: 4px; padding: 12px 16px; color: #e6dfd0; text-decoration: none; }
.ac-guides a:hover { background: color-mix(in srgb, var(--a) 10%, transparent); } .ac-guides b { display: block; color: var(--a); } .ac-guides span { font-size: 13px; color: var(--dim); }
@media (max-width: 760px) { .ac { grid-template-columns: 1fr; } .ac-side { display: none; } .ac-main { padding: 24px 16px 40px; } .ac-ab { grid-template-columns: 1fr; } #worldPage h1 { font-size: 26px; } }
`;
let page = null, side = null, iris = null, title = null, fx = null, fxg = null, cur = null, atFn = null, onClose = null, onGone = null;
const STREAKS = [], TENDRILS = [], JAG = [], CRACKS = []; // warp streaks, the Brain's nerve tendrils and the rock style's shapes, made once with a fixed seed
{
  let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 150; i++) STREAKS.push({ a: rnd() * 6.2832, s: 0.6 + rnd() * 0.9, o: rnd() });
  for (let i = 0; i < 18; i++) { // each tendril: a jagged line from the core outward (in units of the screen radius)
    let a = i / 18 * 6.2832 + rnd() * 0.3; const pts = [[0, 0]];
    for (let j = 1; j <= 14; j++) { a += (rnd() - 0.5) * 0.5; const r = j / 14 * (0.7 + rnd() * 0.35); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    TENDRILS.push(pts);
  }
  for (let i = 0; i < 22; i++) JAG.push([i / 22 * 6.2832 + (rnd() - 0.5) * 0.18, 0.62 + rnd() * 0.38]); // the rock style's cave mouth: angle, reach
  for (let i = 0; i < 12; i++) { // and its cracks: sharp zigzags out from the planet
    let a = i / 12 * 6.2832 + rnd() * 0.4; const pts = [[Math.cos(a) * 0.04, Math.sin(a) * 0.04]];
    for (let j = 1; j <= 9; j++) { a += (rnd() - 0.5) * 0.9; const r = 0.04 + j / 9 * (0.75 + rnd() * 0.4); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    CRACKS.push(pts);
  }
}
function build() {
  const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  page = document.createElement('div'); page.id = 'worldPage';
  page.innerHTML = '<div class="wp-top"><span class="wp-tag"></span><button class="wp-x">BACK TO THE BRAIN<kbd>ESC</kbd></button></div><div class="wp-body"></div>';
  iris = document.createElement('div'); iris.id = 'worldIris';
  title = document.createElement('div'); title.id = 'worldTitle';
  fx = document.createElement('canvas'); fx.id = 'worldFx'; fxg = fx.getContext('2d');
  document.body.append(page, fx, iris, title);
  side = document.createElement('div'); side.id = 'wpSide'; // the right panel: notes, handoffs and a page's extra parts
  side.innerHTML = '<div class="ws-tab"><span class="ws-name"></span><button class="ws-x" title="Close (Esc)">×</button></div><div class="ws-path"></div><div class="ws-b"></div>';
  page.append(side);
  page.querySelector('.wp-x').onclick = () => leave();
  const onClick = e => {
    if (e.target.closest('.ws-x')) return closeSide();
    if (missionClick(e) || fileClick(e)) return; // the planet's mission: chapters, parts to click, the one glowing next step
    const jp = e.target.closest('[data-jump]'); // prehistoric apps: a fossil in the timeline scrolls to its app
    if (jp) { page.querySelector('#' + jp.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const pl = e.target.closest('[data-planet]'); // my CV: a planet button flies back out, then on to that planet
    if (pl) { after = () => window.brainDo?.('planet:' + pl.dataset.planet); leave(); return; }
    const l = e.target.closest('[data-launch]'), cp = e.target.closest('[data-copy]'), sk = e.target.closest('[data-seek]');
    if (cp) e.preventDefault(); // the copy button sits in a handoff's summary: don't fold it
    if (l) { const note = page.querySelector('#wpLaunch'); note.textContent = 'Starting...';
      fetch('/api/launch?app=' + encodeURIComponent(l.dataset.launch), { method: 'POST' }).then(r => r.json())
        .then(r => note.textContent = r.ok ? (l.dataset.launch === 'friend-kit' ? 'Opened the zips folder.' : 'Started. Look for the orange bubble on your desktop.') : 'Could not start it: ' + (r.error || 'unknown error'))
        .catch(() => note.textContent = 'Could not reach the Brain server.');
      return; }
    if (cp) { navigator.clipboard?.writeText(cp.dataset.copy).then(() => { cp.textContent = 'Copied'; setTimeout(() => cp.textContent = 'Copy resume prompt', 1500); }); return; }
    if (sk) { const v = page.querySelector('#dmVid'); v.currentTime = +sk.dataset.seek; v.muted = true; v.play().catch(() => {}); return; }
    if (e.currentTarget !== side) cur?.click?.(e, page.querySelector('.wp-body'));
  };
  page.querySelector('.wp-body').addEventListener('click', onClick); side.addEventListener('click', onClick);
  page.addEventListener('scroll', () => lastInner = performance.now(), { capture: true, passive: true });
  addEventListener('wheel', onWheel, { capture: true, passive: false }); // runs before the Brain's own zoom
  addEventListener('keydown', e => { if (e.key === 'Escape' && mode !== 'idle') { e.preventDefault(); e.stopImmediatePropagation(); if (page.classList.contains('side')) closeSide(); else leave(); } }, { capture: true });
  addEventListener('pointerdown', e => { if (mode === 'armed' && !entered && p < 0.02 && !page.contains(e.target)) cancel(); }, { capture: true }); // clicked away before flying in
}

// The fly-in, scrubbed by the wheel. p: 0 = the Brain, 1 = the planet page. Every style has warp streaks, a glowing
// portal edge, three shockwaves, a flash as the page takes over, a blurred, brightened map behind and page parts that
// arrive one by one. Then each has its own portal (the page shows only inside it):
// iris: a camera aperture (a turning hexagon). blinds: slats that slide in from both sides, top to bottom.
// diamond: a lattice of diamonds that spreads out from the planet. neural (the Brain): rings that sweep open around
// the core, alternating direction, while nerve tendrils grow out to the screen edges. rock (prehistoric apps): a jagged
// cave mouth opens while cracks race out, rock chips fly and the map shakes as you scroll.
let mode = 'idle', p = 0, pT = 0, entered = false, lastInner = 0, armedAt = 0, raf = 0, lastT = 0, hintNow = '', lastP = 0, spd = 0;
const clamp = x => Math.max(0, Math.min(1, x)), f1 = v => v.toFixed(1);
function shape(st, e, at, W, H, R) { // the portal as one SVG path (several pieces), used both to clip the page and to draw its glowing edge
  let d = '';
  if (st === 'iris') {
    const r = e * R * 1.2, a0 = (1 - e) * 2.2;
    for (let i = 0; i < 6; i++) { const a = a0 + i * Math.PI / 3; d += (i ? 'L' : 'M') + f1(at.x + Math.cos(a) * r) + ' ' + f1(at.y + Math.sin(a) * r); }
    return d + 'Z';
  }
  if (st === 'blinds') {
    const N = 12, h = H / N;
    for (let i = 0; i < N; i++) { const w = clamp(e * 1.6 - i / N * 0.6) * W, y = i * h, x0 = i % 2 ? W - w : 0; if (w > 0.5) d += `M${f1(x0)} ${f1(y)}H${f1(x0 + w)}V${f1(y + h + 0.5)}H${f1(x0)}Z`; }
  }
  if (st === 'diamond') {
    const S = 120;
    for (let gy = -1; gy <= H / S + 1; gy++) for (let gx = -1; gx <= W / S + 1; gx++) for (const o of [0, 0.5]) {
      const cx = (gx + o) * S, cy = (gy + o) * S, k = clamp(e * 2.4 - Math.hypot(cx - at.x, cy - at.y) / R * 1.4); if (k <= 0) continue;
      const r = k * S * 0.56; d += `M${f1(cx)} ${f1(cy - r)}L${f1(cx + r)} ${f1(cy)}L${f1(cx)} ${f1(cy + r)}L${f1(cx - r)} ${f1(cy)}Z`;
    }
  }
  if (st === 'neural') {
    const K = 6, n = 40;
    for (let j = 0; j < K; j++) {
      const k = clamp(e * 1.8 - j / K * 0.8); if (k <= 0) continue;
      const r0 = j / K * R * 1.02, r1 = (j + 1) / K * R * 1.02 + 2, sw = k * 6.2832, a0 = j * 1.3 - (j % 2 ? sw : 0); // odd rings sweep the other way
      for (let i = 0; i <= n; i++) { const a = a0 + sw * i / n; d += (i ? 'L' : 'M') + f1(at.x + Math.cos(a) * r1) + ' ' + f1(at.y + Math.sin(a) * r1); }
      if (j) for (let i = n; i >= 0; i--) { const a = a0 + sw * i / n; d += 'L' + f1(at.x + Math.cos(a) * r0) + ' ' + f1(at.y + Math.sin(a) * r0); }
      else d += `L${f1(at.x)} ${f1(at.y)}`;
      d += 'Z';
    }
  }
  if (st === 'rock') { // a jagged cave mouth that cracks open from the planet and turns a little
    const r = e * R * 1.6;
    JAG.forEach(([a, k], i) => { d += (i ? 'L' : 'M') + f1(at.x + Math.cos(a + e * 0.5) * r * k) + ' ' + f1(at.y + Math.sin(a + e * 0.5) * r * k); });
    d += 'Z';
  }
  return d || 'M0 0Z';
}
function drawFx(st, e, at, R, d) {
  const dpr = Math.min(devicePixelRatio || 1, 1.5), W = innerWidth, H = innerHeight, g = fxg;
  if (fx.width !== (W * dpr | 0) || fx.height !== (H * dpr | 0)) { fx.width = W * dpr | 0; fx.height = H * dpr | 0; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  spd = spd * 0.85 + Math.min(1, Math.abs(p - lastP) * 30) * 0.15; lastP = p;
  if (p < 0.001 || p > 0.999) return;
  const col = cur.color, I = Math.sin(Math.PI * e), now = performance.now() / 1000;
  g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
  for (let i = 0; i < STREAKS.length; i++) { // warp streaks out of the planet, longer the faster you scroll
    const s = STREAKS[i], t = (s.o + now * 0.18 * s.s + e * 1.6 * s.s) % 1, r = t * t * R * 1.3, len = r * (0.06 + 0.3 * I + 0.5 * spd), c = Math.cos(s.a), sn = Math.sin(s.a);
    g.strokeStyle = col; g.globalAlpha = I * Math.min(1, t * 4) * 0.4; g.lineWidth = 0.6 + t * 2.2;
    g.beginPath(); g.moveTo(at.x + c * (r - len), at.y + sn * (r - len)); g.lineTo(at.x + c * r, at.y + sn * r); g.stroke();
  }
  if (st === 'neural') { // nerve tendrils grow from the core to the edges, with bright knots
    const k = clamp(e * 1.5);
    for (const T of TENDRILS) {
      const m = Math.max(1, Math.round(k * (T.length - 1)));
      g.globalAlpha = I * 0.5; g.strokeStyle = col; g.lineWidth = 1.4; g.beginPath(); g.moveTo(at.x, at.y);
      for (let j = 1; j <= m; j++) g.lineTo(at.x + T[j][0] * R, at.y + T[j][1] * R);
      g.stroke(); g.fillStyle = col;
      for (let j = 3; j <= m; j += 3) { g.beginPath(); g.arc(at.x + T[j][0] * R, at.y + T[j][1] * R, 2.2, 0, 6.283); g.fill(); }
    }
  }
  if (st === 'rock') { // cracks race out like breaking stone, and chips of rock fly off the edge
    const k = clamp(e * 1.7); g.lineJoin = 'miter';
    for (const T of CRACKS) {
      const m = Math.max(1, Math.round(k * (T.length - 1)));
      g.beginPath(); g.moveTo(at.x + T[0][0] * R, at.y + T[0][1] * R);
      for (let j = 1; j <= m; j++) g.lineTo(at.x + T[j][0] * R, at.y + T[j][1] * R);
      g.globalAlpha = I * 0.18; g.strokeStyle = col; g.lineWidth = 7; g.stroke();
      g.globalAlpha = I * 0.55; g.strokeStyle = col; g.lineWidth = 1.3; g.stroke();
    }
    g.fillStyle = col;
    for (let i = 0; i < 46; i++) {
      const s = STREAKS[i], t = (s.o + e * 1.4 * s.s) % 1, r = (0.1 + t) * R * 0.9, z = 3 + s.s * 5;
      g.globalAlpha = I * (1 - t) * 0.5; g.save(); g.translate(at.x + Math.cos(s.a) * r, at.y + Math.sin(s.a) * r); g.rotate(t * 9 * s.s); g.fillRect(-z / 2, -z / 2, z, z * 0.7); g.restore();
    }
  }
  if (d) { const P = new Path2D(d); g.globalAlpha = I * 0.15; g.strokeStyle = col; g.lineWidth = 8; g.stroke(P); g.globalAlpha = I * 0.55; g.lineWidth = 1.4; g.stroke(P); } // the portal's edge glows
  for (const [lag, w] of [[0, 3], [0.14, 1.6], [0.28, 1]]) { // shockwaves
    const k = e - lag; if (k <= 0) continue;
    g.globalAlpha = Math.sin(Math.PI * Math.min(1, k / (1 - lag))) * 0.22; g.strokeStyle = col; g.lineWidth = w + 12 * (1 - k);
    g.beginPath(); g.arc(at.x, at.y, k * R * 1.1, 0, 6.283); g.stroke();
  }
  const fl = Math.max(0, 1 - Math.abs(e - 0.72) / 0.2); // the flash as the page takes over
  if (fl > 0) { const gr = g.createRadialGradient(at.x, at.y, 0, at.x, at.y, R * 0.9); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = fl * 0.14; g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}
const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const layers = () => [document.getElementById('gl'), document.getElementById('labels')].filter(Boolean);
function onWheel(e) {
  if (mode === 'idle') return;
  if (mode === 'open') { // reading the page: wheel up at the very top (after a short pause) starts the way back
    if (e.deltaY >= 0) return;
    const sc = e.target.closest?.('.ac-main, .ac-side, .wp-body, .ws-b') || page.querySelector('.wp-body');
    if (sc.scrollTop > 0 || performance.now() - lastInner < 300) return;
    mode = 'armed'; hint('SCROLL UP TO LEAVE', 'BACK TO THE BRAIN'); closeSide(); // the right panel never follows you out
  }
  e.preventDefault(); e.stopImmediatePropagation();
  const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
  pT = Math.min(1, Math.max(0, pT + d / 700));
  if (pT === 0 && !entered && d < 0) return cancel(); // scrolled back before ever going in
  armedAt = performance.now(); tick();
}
function apply() {
  const e = ease(p), st = cur.style, at = atFn?.() || { x: innerWidth / 2, y: innerHeight / 2 }, W = innerWidth, H = innerHeight;
  const R = Math.hypot(Math.max(at.x, W - at.x), Math.max(at.y, H - at.y)) * 1.05; // from the planet to the farthest corner
  page.classList.toggle('vis', p > 0.001);
  const d = p > 0.001 && p < 0.999 ? shape(st, e, at, W, H, R) : '';
  page.style.clipPath = d ? `path('${d}')` : '';
  page.style.setProperty('--c', clamp((p - 0.55) / 0.4));
  // the Brain behind: zooms toward the planet, blurs and brightens, with a different turn per style
  const mv = { iris: ` rotate(${-e * 8}deg)`, blinds: ` rotate(${e * 14}deg)`, diamond: ` translateY(${e * 6}%) rotate(${-e * 5}deg)`, neural: ` rotate(${-e * 14}deg)`,
    rock: ` rotate(${-e * 4}deg) translate(${f1(Math.sin(performance.now() / 29) * 16 * spd)}px, ${f1(Math.cos(performance.now() / 23) * 10 * spd)}px)` }[st] || ''; // rock: the map shakes while you scroll
  const tf = p > 0.001 ? `scale(${1 + e * (st === 'neural' ? 3.4 : 2.6)})` + mv : '';
  const fl = p > 0.001 ? `blur(${(e * 5).toFixed(2)}px) brightness(${(1 + e * 0.25).toFixed(3)}) saturate(${(1 + e * 0.3).toFixed(3)})` : '';
  for (const el of layers()) { el.style.transformOrigin = `${at.x}px ${at.y}px`; el.style.transform = tf; el.style.filter = fl; }
  iris.className = st; iris.style.left = at.x + 'px'; iris.style.top = at.y + 'px';
  iris.style.opacity = p < 0.001 ? (entered ? 0 : 0.9) : Math.max(0, 1 - e * 1.4);
  iris.style.transform = `scale(${1 + e * 40 + (p < 0.001 ? 0.12 * Math.sin(performance.now() / 260) : 0)})` + (st === 'diamond' ? ` rotate(${45 + e * 180}deg)` : st === 'neural' ? ` rotate(${e * 120 + performance.now() / 40}deg)` : '');
  drawFx(st, e, at, R, d);
  title.style.setProperty('--p', p.toFixed(3));
  title.classList.toggle('on', mode === 'armed' && p < 0.98);
}
function tick() {
  if (raf) return;
  lastT = performance.now();
  const step = now => {
    raf = 0;
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    p += (pT - p) * Math.min(1, dt * 9); if (Math.abs(pT - p) < 0.002) p = pT;
    if (mode === 'idle') return;
    apply();
    if (p === 1 && pT === 1 && mode === 'armed') { // inside: the Brain stops drawing, and a last glow washes over the page from the planet's spot
      mode = 'open'; entered = true; page.classList.add('on'); window.fleetHold = true; title.classList.remove('on');
      const at = atFn?.(); if (at) { page.style.setProperty('--ax', at.x + 'px'); page.style.setProperty('--ay', at.y + 'px'); }
      page.classList.remove('arrive'); void page.offsetWidth; page.classList.add('arrive');
    }
    if (mode === 'armed' && p < 1) { page.classList.remove('on'); window.fleetHold = false; }
    if (p === 0 && pT === 0 && entered) return finish();
    if (mode === 'armed' && p === 0 && !entered && now - armedAt > 20000) return cancel(); // clicked but never scrolled
    if (mode === 'open') return; // nothing moves while reading; the wheel wakes it up again
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
function hint(top, name) {
  if (hintNow === top + name) return; hintNow = top + name;
  title.innerHTML = `<small>${top}</small><b>${esc(name)}</b><i></i>` + (top === 'LEAVING' ? '' : `<kbd>${top.startsWith('SCROLL UP') ? '▲ WHEEL UP' : '▼ WHEEL DOWN'}</kbd>`);
}
let vio = null; // watches the page's autoplay videos
window.openWorld = (id, at, done, gone) => { // at(): the planet's screen spot; done(): the Brain's own effect when we come back; gone(): never flew in
  const w = W[id]; if (!w) return;
  if (!page) build();
  if (mode === 'open') return;
  cur = w; atFn = at; onClose = done; onGone = gone; entered = false; p = pT = 0; mode = 'armed'; armedAt = performance.now();
  page.querySelector('.wp-tag').textContent = w.name; page.dataset.world = id; closeSide();
  const body = page.querySelector('.wp-body');
  body.innerHTML = w.click ? w.page() : `<div class="wp-in">${w.page()}</div>`;
  body.style.overflow = w.click ? 'hidden' : 'auto'; body.scrollTop = 0;
  body.querySelectorAll('.wp-in > :not(.wp-grid), .wp-in > .wp-grid > *, .ac-side, .ac-main').forEach((el, i) => { el.classList.add('wp-stg'); el.style.setProperty('--i', Math.min(i, 6)); });
  const notes = body.querySelector('#wpNotes'); if (notes) fillNotes(id, notes);
  bindPage(body);
  vio?.disconnect(); vio = null; const auto = body.querySelectorAll('video[data-auto]'); // demo videos play (muted) only while on screen
  if (auto.length) { vio = new IntersectionObserver(es => { for (const x of es) if (x.isIntersecting) { x.target.muted = true; x.target.play().catch(() => {}); } else x.target.pause(); }, { root: body, threshold: 0.6 }); auto.forEach(v => vio.observe(v)); }
  for (const el of [page, iris, title]) el.style.setProperty('--a', w.color);
  hint('SCROLL TO FLY IN', w.name); tick();
};
function leave() { // Esc or the button: the same flight, played out by itself
  if (mode === 'idle') return;
  if (!entered) return cancel();
  mode = 'armed'; hint('LEAVING', 'BACK TO THE BRAIN'); pT = 0; closeSide(); page.querySelectorAll('video').forEach(v => v.pause()); tick();
}
function reset() {
  mode = 'idle'; p = pT = 0; cancelAnimationFrame(raf); raf = 0; window.fleetHold = false; hintNow = ''; closeSide();
  page.classList.remove('on', 'vis', 'arrive'); page.style.clipPath = '';
  for (const el of layers()) el.style.transform = el.style.filter = '';
  iris.style.opacity = 0; title.classList.remove('on'); fxg.clearRect(0, 0, fx.width, fx.height);
}
function finish() { const done = onClose, then = after; after = null; vio?.disconnect(); page.querySelectorAll('video').forEach(v => v.pause()); reset(); cur = null; done?.(); then?.(); } // then: a mission step to try on the map
function cancel() { const gone = onGone; reset(); cur = null; gone?.(); }
window.closeWorld = () => { if (mode === 'armed' && !entered) cancel(); }; // the Brain flies to another planet before you scrolled in
})();
