// Checks the static preview produced by scripts/pages-preview.mjs while it is served at ROOT
// (for example http://localhost:8099/repo-name). JavaScript is switched off, as the preview has none.
//   node scripts/pages-check.mjs http://localhost:8099/repo-name [screenshotDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const root = (process.argv[2] ?? '').replace(/\/$/, '');
const shots = process.argv[3];
if (!root) { console.error('usage: node scripts/pages-check.mjs <root-url> [screenshotDir]'); process.exit(2); }
if (shots) mkdirSync(shots, { recursive: true });
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failed++; };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, javaScriptEnabled: false });
const page = await context.newPage();
let bad = [];
page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
page.on('requestfailed', (r) => bad.push(`failed ${r.url()}`));

for (const locale of ['en', 'hi', 'mr']) {
  for (const [name, path] of [['home', `/${locale}/`], ['privacy', `/${locale}/privacy/`], ['notice', `/${locale}/preview/`]]) {
    bad = [];
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      const res = await page.goto(root + path, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      check(`${locale} ${name} @${width} loads`, res?.status() === 200, String(res?.status()));
      check(`${locale} ${name} @${width} has no horizontal overflow`, (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
      if (shots && width === 1366 && name === 'home') await page.screenshot({ path: `${shots}/preview-${locale}-home.png` });
      if (shots && width === 390 && name === 'home') await page.screenshot({ path: `${shots}/preview-${locale}-home-mobile.png` });
    }
    check(`${locale} ${name} requests all succeed`, bad.length === 0, bad.slice(0, 3).join(' | '));
    check(`${locale} ${name} is styled`, await page.evaluate(() => getComputedStyle(document.body).fontFamily !== 'Times New Roman' && !/^(Times|serif)/.test(getComputedStyle(document.body).fontFamily)));
    check(`${locale} ${name} contains no scripts`, (await page.locator('script').count()) === 0);
    check(`${locale} ${name} says it is a static preview`, (await page.locator('[role=note]').count()) >= 1 || name === 'notice');
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`${root}/${locale}/`, { waitUntil: 'load' });
  const other = locale === 'en' ? 'hi' : 'en';
  await page.locator(`a[lang="${other}"]`).first().click();
  check(`${locale} language link opens /${other}/`, page.url() === `${root}/${other}/`, page.url());
  await page.goto(`${root}/${locale}/`, { waitUntil: 'load' });
  await page.locator(`a[href$="/${locale}/preview/"]`).first().click();
  check(`${locale} sign-in / enquiry links open the notice`, page.url() === `${root}/${locale}/preview/`, page.url());
  const text = await page.locator('main').innerText();
  check(`${locale} notice explains why the application is not here`, /Node\.js/.test(text));
}
await page.goto(`${root}/`, { waitUntil: 'load' });
await page.waitForTimeout(300);
check('root opens a language copy', /\/(en|hi|mr)\/$/.test(page.url()) || (await page.locator('a[href$="/en/"]').count()) > 0, page.url());
await browser.close();
console.log(failed ? `PAGES CHECK FAILED (${failed})` : 'PAGES CHECK PASSED');
process.exit(failed ? 1 : 0);
