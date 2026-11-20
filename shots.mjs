// Screenshot the token radar dashboard with headless Chromium (Playwright).
// Serves out/ on localhost, logs every request + console message (the dashboard must make no
// external requests), and writes the three gate screenshots into screenshots/.
// Usage: node shots.mjs   (run from the repo dir; Playwright comes from the cartoon-short kit)
import { createRequire } from 'node:module';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const require = createRequire('/home/hatch/workspace/shorts/eiffel-tower/package.json');
const { chromium } = require('playwright');

const OUT = '/home/hatch/workspace/makefun/token-radar-01-v2/out';
const SHOTS = '/home/hatch/workspace/makefun/token-radar-01-v2/screenshots';
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const path = join(OUT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'dashboard/index.html');
  if (!existsSync(path)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
  res.end(readFileSync(path));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/dashboard/index.html`;

const browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const requests = [];
const consoleMsgs = [];
page.on('request', (req) => requests.push(req.url()));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => consoleMsgs.push('pageerror: ' + e.message));

// 1 — the board: spotlight, breakdown, scatter and table.
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const rowCount = await page.evaluate(() => document.querySelectorAll('tr[data-selected]').length);
const spotCount = await page.evaluate(() => document.querySelectorAll('.spot-card').length);
const scatterOk = await page.evaluate(() => document.querySelectorAll('.scatter-wrap svg circle').length);
console.log('board rows rendered:', rowCount, '| spotlight cards:', spotCount, '| scatter dots:', scatterOk);
await page.screenshot({ path: join(SHOTS, '1-board.png') });

// 2 — a protocol detail view (click the first spotlight card).
await page.click('.spot-card:first-child');
await page.waitForTimeout(400);
const dialogOpen = await page.evaluate(() => { const d = document.querySelector('dialog.detail'); return d ? d.open : false; });
console.log('detail dialog open:', dialogOpen);
await page.screenshot({ path: join(SHOTS, '2-detail.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

// 3 — a filtered view (Farm verdict only). The hash alone is a same-document navigation, so force a reload.
// Scroll the board into view: the filter only changes the table, which sits below the fold.
await page.goto(base + '#verdict=Farm', { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const filteredCount = await page.evaluate(() => document.querySelectorAll('tr[data-selected]').length);
console.log('filtered (Farm) rows rendered:', filteredCount);
await page.evaluate(() => { var r = document.querySelector('tr[data-selected]'); if (r) r.scrollIntoView({ block: 'center' }); });
await page.waitForTimeout(300);
await page.screenshot({ path: join(SHOTS, '3-filtered.png') });

await browser.close();
server.close();

const external = requests.filter((u) => !u.startsWith('http://127.0.0.1'));
console.log('total requests:', requests.length);
console.log('requests:', JSON.stringify(requests, null, 1));
console.log('external (non-localhost) requests:', external.length, external);
console.log('console errors/warnings:', consoleMsgs.length, consoleMsgs);
