// Browser test of the technician offline flow against a running server with demo data:
// actions taken with no connection are queued on the device, sent once when the connection
// returns, and never duplicated by a retry. Run it on freshly seeded demo data (npm run db:reset).
// Usage: node scripts/e2e.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import pg from 'pg';

const base = process.env.BASE_URL ?? 'http://localhost:3000';
const outDir = process.argv[2];
if (outDir) mkdirSync(outDir, { recursive: true });
let dbUrl = process.env.DATABASE_URL;
if (!dbUrl && existsSync('.env.local')) dbUrl = /^DATABASE_URL=(.*)$/m.exec(readFileSync('.env.local', 'utf8'))?.[1];
const db = new pg.Client({ connectionString: dbUrl });
await db.connect();
const counts = async () => (await db.query(
  `select (select count(*)::int from technician_attendance) as attendance, (select count(*)::int from client_events) as events,
          (select count(*)::int from project_tasks where status = 'IN_PROGRESS') as started`)).rows[0];
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) process.exitCode = 1; };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
await context.addCookies([{ name: 'aiec_locale', value: 'mr', url: base }]);
const page = await context.newPage();
await page.goto(`${base}/login`, { waitUntil: 'load' });
await page.locator('[data-testid=demo-TECHNICIAN]').first().click();
await page.waitForSelector('[data-testid=sync-bar]', { timeout: 30000 });
await page.waitForSelector('[data-testid=check-in]');
await page.waitForFunction(() => document.querySelector('[data-testid=sync-bar]')?.getAttribute('data-pending') === '0');
const before = await counts();

await context.setOffline(true);
await page.waitForFunction(() => document.querySelector('[data-testid=sync-bar]')?.getAttribute('data-online') === 'false');
await page.locator('[data-testid=check-in]').first().click();
await page.waitForSelector('[data-testid=tech-message]');
await page.locator('[data-testid=task-start]').first().click();
await page.waitForFunction(() => document.querySelector('[data-testid=sync-bar]')?.getAttribute('data-pending') === '2');
check('two actions queued on the device while offline', true);
const offline = await counts();
check('nothing reached the server while offline', JSON.stringify(offline) === JSON.stringify(before), JSON.stringify(offline));
check('the task shows its queued status straight away', (await page.locator('[data-testid=task-card][data-status=IN_PROGRESS]').count()) >= 1);
await page.evaluate(() => window.scrollTo(0, 0));
if (outDir) await page.screenshot({ path: `${outDir}/tech-offline-queued-mr-mobile.png`, fullPage: true });

await context.setOffline(false);
await page.waitForFunction(() => document.querySelector('[data-testid=sync-bar]')?.getAttribute('data-pending') === '0', null, { timeout: 30000 });
const synced = await counts();
check('attendance recorded exactly once after reconnecting', synced.attendance === before.attendance + 1, `${before.attendance} → ${synced.attendance}`);
check('task moved to in-progress on the server', synced.started === before.started + 1, `${before.started} → ${synced.started}`);
check('two client events stored', synced.events === before.events + 2, `${before.events} → ${synced.events}`);

// A retry of the same queue (lost acknowledgement) must change nothing.
const replay = await page.evaluate(async () => {
  const open = indexedDB.open('aiec-tech');
  const dbh = await new Promise((res, rej) => { open.onsuccess = () => res(open.result); open.onerror = () => rej(open.error); });
  const items = await new Promise((res) => { const r = dbh.transaction('queue').objectStore('queue').getAll(); r.onsuccess = () => res(r.result); });
  const events = items.map((i) => ({ clientEventId: i.clientEventId, capturedAt: i.capturedAt, type: i.type, ...i.payload }));
  const response = await fetch('/api/tech/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }) });
  return { sent: events.length, body: await response.json() };
});
const acks = replay.body?.data?.acks ?? replay.body?.acks ?? [];
check('replayed events are acknowledged as duplicates', replay.sent >= 2 && acks.length === replay.sent && acks.every((a) => a.status === 'DUPLICATE'), JSON.stringify(replay.body).slice(0, 200));
const after = await counts();
check('replay created no duplicate records', JSON.stringify(after) === JSON.stringify(synced), JSON.stringify(after));
await page.goto(`${base}/tech/sync`, { waitUntil: 'load' });
await page.waitForSelector('[data-testid=queue-item]');
check('sync history shows the items as synced', (await page.locator('[data-testid=queue-item][data-status=SYNCED]').count()) >= 2);
if (outDir) await page.screenshot({ path: `${outDir}/tech-sync-history-mr-mobile.png`, fullPage: true });

await browser.close();
await db.end();
console.log(process.exitCode ? 'E2E FAILED' : 'E2E PASSED');
