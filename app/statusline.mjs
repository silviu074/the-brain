// Claude Code status line: saves the plan limits to usage.json for The Brain's usage panel,
// and prints a short line for the terminal. Turned on in ~/.claude/settings.json by statusline-setup.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const d = JSON.parse(raw || '{}');
const lim = d.rate_limits || {}, ctx = d.context_window || {};
const usage = {
  time: Date.now(),
  fiveHour: lim.five_hour || null,   // { used_percentage, resets_at (unix seconds) }
  weekly: lim.seven_day || null,
  contextMax: ctx.context_window_size || null,
};
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'usage.json');
// Limits only arrive after a session's first reply; keep the last known ones instead of blanking them.
try {
  const old = JSON.parse(fs.readFileSync(out, 'utf8')), live = w => w && w.resets_at * 1000 > Date.now() ? w : null;
  usage.fiveHour ??= live(old.fiveHour); usage.weekly ??= live(old.weekly); usage.plan = old.plan; // plan name comes from a session snapshot
} catch {}
fs.writeFileSync(out + '.tmp', JSON.stringify(usage));
fs.renameSync(out + '.tmp', out);

const pct = w => w ? Math.round(w.used_percentage) + '%' : '-';
console.log(`5h ${pct(usage.fiveHour)} · week ${pct(usage.weekly)} · context ${ctx.used_percentage == null ? '-' : Math.round(ctx.used_percentage) + '%'}`);
