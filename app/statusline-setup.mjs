// Turns the Brain's status line on or off in ~/.claude/settings.json. Run by the installer and uninstaller.
// on:  adds it only if no status line is set yet.   off: removes it only if it is the Brain's.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const file = path.join(os.homedir(), '.claude', 'settings.json');
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'statusline.mjs');
let s = {};
if (fs.existsSync(file)) {
  try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { console.log('Could not read ' + file + ', left it as it is.'); process.exit(0); }
}
const mine = s.statusLine && String(s.statusLine.command || '').includes('TheBrainClaude');

if (process.argv[2] === 'on') {
  if (s.statusLine && !mine) { console.log('You already have a status line, so it was left as it is. Plan limits will not show in the Brain.'); process.exit(0); }
  s.statusLine = { type: 'command', command: `"${process.execPath}" "${script}"` };
} else {
  if (!mine) process.exit(0);
  delete s.statusLine;
}
if (fs.existsSync(file)) fs.copyFileSync(file, file + '.brain-backup');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
console.log(process.argv[2] === 'on' ? 'Status line turned on (a backup of your settings is in settings.json.brain-backup).' : 'Status line removed.');
