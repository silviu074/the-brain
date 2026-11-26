// Makes a made-up Claude Code setup in demo/sample-home, so you can try the Brain (and record demos) without your own data.
// Run:  node demo/make-sample-home.mjs
// Then: BRAIN_HOME=demo/sample-home node app/scan.mjs   and   BRAIN_HOME=demo/sample-home node app/server.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), 'sample-home')); // or a folder you name
const CLAUDE = path.join(HOME, '.claude');
const PROJ = path.join(HOME, 'projects', 'weather-app');
fs.rmSync(HOME, { recursive: true, force: true });
const write = (p, text) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };

// ---------- the setup ----------
write(path.join(CLAUDE, 'CLAUDE.md'), `# My rules

## How to work
- Say what you assume. Ask when a request can be read two ways.
- Build only what was asked. Keep changes small.
- Run the tests before saying something is done.

## Answers
- Start with the result. Short sentences, plain words.
`);
write(path.join(CLAUDE, 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(npm test)', 'Bash(git status)', 'Read', 'Grep', 'Glob'], ask: ['Bash(git push:*)'] } }, null, 2));
const SKILLS = {
  'write-tests': 'Write unit tests for a change and run them. Use after adding or fixing code.',
  'bug-hunt': 'Reproduce a bug, find the root cause, make one fix and prove it works.',
  'ui-polish': 'Tidy spacing, colors and states of a screen so it looks finished.',
  'release-notes': 'Turn merged changes into short release notes for users.',
  'deploy-site': 'Build the site and deploy it to the preview host, then check it loads.',
};
for (const [name, desc] of Object.entries(SKILLS))
  write(path.join(CLAUDE, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n\n# ${name}\n\n## Steps\n1. Read what changed.\n2. Do the work.\n3. Check it.\n`);
const AGENTS = {
  reviewer: ['Reviews a diff for bugs and unclear code. Reports only.', 'Read, Grep, Glob'],
  researcher: ['Looks things up on the web and returns a short answer with sources.', 'WebSearch, WebFetch'],
  tester: ['Runs the test suite and the app, and reports what fails.', 'Bash, Read, mcp__playwright__browser_navigate'],
};
for (const [name, [desc, tools]] of Object.entries(AGENTS))
  write(path.join(CLAUDE, 'agents', name + '.md'), `---\nname: ${name}\ndescription: ${desc}\ntools: ${tools}\nmodel: sonnet\n---\n\nYou are the ${name}.\n`);
write(path.join(HOME, '.claude.json'), JSON.stringify({ mcpServers: {
  github: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
  playwright: { command: 'npx', args: ['-y', '@playwright/mcp'] },
} }, null, 2));
write(path.join(PROJ, 'CLAUDE.md'), `# Weather app

A small web app that shows the weather for your city.

## Which skill for what
| Task | Skill |
|---|---|
| New feature or fix | \`write-tests\` |
| Something is broken | \`bug-hunt\` |
| A screen looks rough | \`ui-polish\` |
| Shipping a version | \`release-notes\`, \`deploy-site\` |
`);

// ---------- the history: made-up prompts and steps over the last 3 weeks ----------
const enc = p => p.replace(/[^A-Za-z0-9]/g, '-');
const SESS = path.join(CLAUDE, 'projects', enc(PROJ));
const T = [ // [prompt, steps]; a step is [tool name, input]
  ['Add a 5-day forecast under today\'s weather', [['Read', { file_path: 'src/App.jsx' }], ['Grep', { pattern: 'fetchWeather' }], ['Edit', { file_path: 'src/Forecast.jsx' }], ['Skill', { skill: 'write-tests' }], ['Bash', { command: 'npm test' }]]],
  ['The temperature shows NaN when the city has a space in it', [['Skill', { skill: 'bug-hunt' }], ['Read', { file_path: 'src/api.js' }], ['Bash', { command: 'npm test -- api' }], ['Edit', { file_path: 'src/api.js' }], ['Bash', { command: 'npm test' }]]],
  ['Which free weather API has hourly data and no key?', [['Agent', { subagent_type: 'researcher', description: 'Find free weather APIs' }], ['WebSearch', { query: 'free weather API hourly no key' }], ['WebFetch', { url: 'https://open-meteo.com/en/docs' }]]],
  ['Make the forecast cards look nicer on phones', [['Skill', { skill: 'ui-polish' }], ['Read', { file_path: 'src/Forecast.css' }], ['Edit', { file_path: 'src/Forecast.css' }], ['mcp__playwright__browser_navigate', { url: 'http://localhost:5173' }]]],
  ['Review my changes before I push', [['Agent', { subagent_type: 'reviewer', description: 'Review the forecast diff' }], ['Bash', { command: 'git diff --stat' }], ['Read', { file_path: 'src/Forecast.jsx' }]]],
  ['Open a pull request for the forecast', [['Bash', { command: 'git status' }], ['mcp__github__create_pull_request', { title: 'Add 5-day forecast' }]]],
  ['Write release notes for 1.2', [['Skill', { skill: 'release-notes' }], ['Bash', { command: 'git log --oneline v1.1..HEAD' }], ['Write', { file_path: 'CHANGELOG.md' }]]],
  ['Deploy the preview', [['Skill', { skill: 'deploy-site' }], ['Bash', { command: 'npm run build' }], ['mcp__playwright__browser_navigate', { url: 'https://preview.example.com' }]]],
  ['Add a dark mode toggle', [['Read', { file_path: 'src/theme.css' }], ['Edit', { file_path: 'src/theme.css' }], ['Edit', { file_path: 'src/Header.jsx' }], ['Skill', { skill: 'write-tests' }], ['Bash', { command: 'npm test' }]]],
  ['Run all the tests and tell me what fails', [['Agent', { subagent_type: 'tester', description: 'Run tests and app' }], ['Bash', { command: 'npm test' }]]],
  ['Show the wind speed in km/h', [['Grep', { pattern: 'wind' }], ['Edit', { file_path: 'src/Today.jsx' }], ['Bash', { command: 'npm test' }]]],
  ['Why is the first load so slow?', [['Skill', { skill: 'bug-hunt' }], ['mcp__playwright__browser_navigate', { url: 'http://localhost:5173' }], ['Read', { file_path: 'vite.config.js' }], ['Edit', { file_path: 'src/api.js' }]]],
];
const DAY = 864e5, now = Date.now();
let n = 0;
const id = () => 'demo' + String(++n).padStart(8, '0');
const files = {};
for (let k = 0; k < 30; k++) {
  const [prompt, steps] = T[k % T.length];
  const sess = 's' + (k % 3), lines = (files[sess] ??= []);
  let t = now - (29 - k) * 0.7 * DAY - (k % 5) * 3600e3; // spread over three weeks, newest last
  const at = () => new Date(t += 4000 + (n % 7) * 2500).toISOString();
  const base = { sessionId: 'sample-' + sess, cwd: PROJ };
  lines.push({ ...base, type: 'user', uuid: id(), timestamp: at(), message: { role: 'user', content: prompt } });
  const usage = () => ({ input_tokens: 800 + (n % 9) * 300, cache_creation_input_tokens: 2000 + (n % 4) * 900, cache_read_input_tokens: 18000 + (n % 11) * 2500, output_tokens: 300 + (n % 6) * 140 });
  for (const [name, input] of steps) {
    const tu = id();
    lines.push({ ...base, type: 'assistant', uuid: id(), timestamp: at(), message: { id: id(), model: 'claude-opus-5-5', stop_reason: 'tool_use', usage: usage(), content: [{ type: 'tool_use', id: tu, name, input }] } });
    lines.push({ ...base, type: 'user', uuid: id(), timestamp: at(), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tu, content: 'ok' }] } });
  }
  lines.push({ ...base, type: 'assistant', uuid: id(), timestamp: at(), message: { id: id(), model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: usage(), content: [{ type: 'text', text: 'Done. ' + prompt + ': changed and checked.' }] } });
}
for (const [sess, lines] of Object.entries(files)) write(path.join(SESS, `sample-${sess}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n') + '\n');
// newest session last, so the Brain picks this project
fs.utimesSync(path.join(SESS, 'sample-s2.jsonl'), new Date(), new Date());
console.log('Sample home written to ' + HOME);
