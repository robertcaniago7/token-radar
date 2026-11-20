// Verify the token-radar v2 output against every gate limit from competition.yaml.
// Usage: node verify-gate.mjs   (run from the repo dir)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT = '/home/hatch/workspace/makefun/token-radar-01-v2/out';
const SNAP = '/home/hatch/workspace/makefun/token-radar-01-kit/input/snapshot.json';
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

const snap = JSON.parse(readFileSync(SNAP, 'utf8'));
const snapSlugs = new Set(snap.protocols.map((p) => p.slug));
const board = JSON.parse(readFileSync(join(OUT, 'board.json'), 'utf8'));
const rows = board.rows;
const dossier = JSON.parse(readFileSync(join(OUT, 'dossier.json'), 'utf8'));

console.log('== board.json ==');
check('rows 100..4000', rows.length >= 100 && rows.length <= 4000, rows.length + ' rows');
const boardBytes = statSync(join(OUT, 'board.json')).size;
check('board.json <= 8 MiB', boardBytes <= 8 * 1024 * 1024, boardBytes + ' bytes');
check('ranks exactly 1..N', rows.every((r, i) => r.rank === i + 1));
let mono = true;
for (let i = 1; i < rows.length; i++) if (rows[i].implied_value_usd > rows[i - 1].implied_value_usd) mono = false;
check('implied_value non-increasing with rank', mono);
const wl = snap.watchlist;
const wlPresent = wl.filter((s) => rows.some((r) => r.slug === s)).length;
check('watchlist 40/40', wlPresent === 40, wlPresent + '/40');
check('every slug in snapshot', rows.every((r) => snapSlugs.has(r.slug)));
check('every name non-empty', rows.every((r) => typeof r.name === 'string' && r.name.trim().length > 0));
check('rank positive integer', rows.every((r) => Number.isInteger(r.rank) && r.rank > 0));
check('implied_value positive integer <= $100T', rows.every((r) => Number.isInteger(r.implied_value_usd) && r.implied_value_usd > 0 && r.implied_value_usd <= 1e14));
let stepsOk = true, stepsBad = 0;
for (const r of rows) {
  const s = r.farm_steps;
  if (!Array.isArray(s) || s.length < 3 || s.length > 12) { stepsOk = false; stepsBad++; continue; }
  for (const step of s) if (typeof step !== 'string' || step.trim() !== step || step.length < 20 || step.length > 600) { stepsOk = false; stepsBad++; break; }
}
check('farm_steps 3..12, each 20..600 chars trimmed', stepsOk, stepsBad ? stepsBad + ' rows bad' : 'all ' + rows.length + ' rows');
// Trap check: whole-word wrapped/staked/staking (so "restaking" — a legitimate restaking
// primitive like EigenLayer — is not a false positive), or a name that is itself a live token.
const liveNames = new Set(snap.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd !== undefined).map((p) => p.name.toLowerCase()));
const trap = rows.filter((r) => /\bwrapped\b|\bstaked\b|\bstaking\b/.test(r.slug) || liveNames.has(r.name.toLowerCase()));
check('no wrapped/staked/bridged product of a live token ranked', trap.length === 0, trap.length ? trap.map((r) => r.slug).join(', ') : 'none');
check('every row has a non-empty edge sentence', rows.every((r) => typeof r.edge === 'string' && r.edge.trim().length >= 20), rows.filter((r) => typeof r.edge !== 'string' || r.edge.trim().length < 20).length + ' rows lack one');
check('all rows have a farm plan + verdict', rows.every((r) => r.farm && ['Farm', 'Thin', 'Skip'].includes(r.farm.verdict) && typeof r.farm.net_usd_per_hour === 'number'));

console.log('== dashboard/ ==');
const dashFiles = readdirSync(join(OUT, 'dashboard'));
let dashBytes = 0;
for (const f of dashFiles) dashBytes += statSync(join(OUT, 'dashboard', f)).size;
check('dashboard <= 400 files', dashFiles.length <= 400, dashFiles.length + ' files');
check('dashboard <= 4 MiB', dashBytes <= 4 * 1024 * 1024, dashBytes + ' bytes');
check('dashboard source <= 65536 bytes (dossier text cap)', dashBytes <= 65536, dashBytes + ' bytes');
check('has index.html', dashFiles.includes('index.html'));
check('has >= 1 .css', dashFiles.some((f) => f.endsWith('.css')));
check('has >= 1 .js', dashFiles.some((f) => f.endsWith('.js')));
let extUrl = null;
for (const f of dashFiles) {
  const text = readFileSync(join(OUT, 'dashboard', f), 'utf8');
  if (f.endsWith('.html') && /(?:src|href)\s*=\s*["']https?:\/\//i.test(text)) extUrl = f + ' (html attr)';
  if (f.endsWith('.css') && /https?:\/\//.test(text)) extUrl = f + ' (css url)';
  if (f.endsWith('.js') && /(?:import|from)\s+["']https?:\/\//.test(text)) extUrl = f + ' (js import)';
}
check('no http(s):// in HTML attrs, CSS, or JS imports', extUrl === null, extUrl || 'clean');

console.log('== screenshots/ ==');
const shots = readdirSync(join(OUT, 'screenshots'));
check('3..4 screenshots', shots.length >= 3 && shots.length <= 4, shots.length + ' images');
for (const f of shots) {
  const buf = readFileSync(join(OUT, 'screenshots', f));
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  const w = isPng ? buf.readUInt32BE(16) : 0;
  const h = isPng ? buf.readUInt32BE(20) : 0;
  const long = Math.max(w, h), short = Math.min(w, h);
  check(f + ' whole PNG/JPEG, <=512 KiB, long<=1440, short>=800',
    (isPng || isJpg) && buf.length <= 524288 && long <= 1440 && short >= 800,
    buf.length + ' bytes, ' + w + 'x' + h);
}

console.log('== dossier.json ==');
const dossierBytes = statSync(join(OUT, 'dossier.json')).size;
check('dossier <= 1.5 MiB', dossierBytes <= 1572864, dossierBytes + ' bytes');
const textBytes = Buffer.byteLength(dossier.text || '', 'utf8');
check('dossier text <= 65536 bytes', textBytes <= 65536, textBytes + ' bytes');
check('dossier schema makefun/dossier/v1', dossier.schema === 'makefun/dossier/v1', dossier.schema);

console.log('== data.js ==');
check('data.js exists', existsSync(join(OUT, 'data.js')));
const dataJs = readFileSync(join(OUT, 'data.js'), 'utf8');
check('data.js sets window.RADAR', dataJs.includes('window.RADAR'));
const data = JSON.parse(dataJs.replace(/^window\.RADAR=/, '').replace(/;\s*$/, ''));
check('data.js scatter has 128 live points', Array.isArray(data.scatter) && data.scatter.length === 128, (data.scatter || []).length + ' points');
check('data.js model_version radar-3', data.model_version === 'radar-3', data.model_version);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
