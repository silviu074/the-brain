// Plays a made-up prompt into the sample home, one step every second or two, so the Brain's LIVE tab has something to show.
// Run after make-sample-home.mjs, while the Brain runs with BRAIN_HOME=demo/sample-home:  node demo/play-live.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), 'sample-home')); // or a folder you name
const PROJ = path.join(HOME, 'projects', 'weather-app');
const file = path.join(HOME, '.claude', 'projects', PROJ.replace(/[^A-Za-z0-9]/g, '-'), 'sample-s2.jsonl');
if (!fs.existsSync(file)) { console.log('Run demo/make-sample-home.mjs first.'); process.exit(1); }

const base = { sessionId: 'sample-s2', cwd: PROJ };
let n = 0;
const id = () => 'live' + Date.now() + (++n);
const add = r => fs.appendFileSync(file, JSON.stringify({ ...base, uuid: id(), timestamp: new Date().toISOString(), ...r }) + '\n');
const wait = ms => new Promise(r => setTimeout(r, ms));
const usage = { input_tokens: 1200, cache_creation_input_tokens: 3000, cache_read_input_tokens: 24000, output_tokens: 600 };
const STEPS = [
  ['Skill', { skill: 'bug-hunt' }], ['Read', { file_path: 'src/api.js' }], ['Grep', { pattern: 'units=' }],
  ['Agent', { subagent_type: 'researcher', description: 'Check the API units' }], ['WebFetch', { url: 'https://open-meteo.com/en/docs' }],
  ['Edit', { file_path: 'src/api.js' }], ['Skill', { skill: 'write-tests' }], ['Bash', { command: 'npm test' }],
  ['mcp__playwright__browser_navigate', { url: 'http://localhost:5173' }], ['mcp__github__create_pull_request', { title: 'Fix wind units' }],
];

add({ type: 'user', message: { role: 'user', content: 'The wind speed looks too high, fix it and open a PR' } });
await wait(1500);
for (const [name, input] of STEPS) {
  const tu = id();
  add({ type: 'assistant', message: { id: id(), model: 'claude-opus-5-5', stop_reason: 'tool_use', usage, content: [{ type: 'tool_use', id: tu, name, input }] } });
  await wait(1200 + Math.random() * 900);
  add({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tu, content: 'ok' }] } });
  await wait(300);
}
add({ type: 'assistant', message: { id: id(), model: 'claude-opus-5-5', stop_reason: 'end_turn', usage, content: [{ type: 'text', text: 'Fixed: the API sent m/s and the app showed it as km/h. Tests pass and the PR is open.' }] } });
console.log('Done.');
