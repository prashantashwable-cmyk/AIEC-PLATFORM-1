// Usage: node scripts/shot.mjs <outDir> <name>=<path>[@mobile] ...   (env: BASE_URL, LOCALES, COOKIE)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [outDir, ...targets] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const locales = (process.env.LOCALES ?? 'en,hi,mr').split(',');
const scale = Number(process.env.SCALE ?? 1);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
let failed = false;
for (const locale of locales) {
  for (const target of targets) {
    const [name, rawPath] = target.split('=');
    const mobile = rawPath.endsWith('@mobile');
    const path = rawPath.replace('@mobile', '');
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 }, deviceScaleFactor: scale,
    });
    const cookies = [{ name: 'aiec_locale', value: locale, url: base }];
    if (process.env.COOKIE) cookies.push({ name: 'aiec_session', value: process.env.COOKIE, url: base });
    await context.addCookies(cookies);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const res = await page.goto(base + path, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const file = `${outDir}/${name}-${locale}${mobile ? '-mobile' : ''}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(`${res?.status()} ${file} overflowX=${overflow}${errors.length ? ' ERRORS: ' + errors.join(' | ') : ''}`);
    if ((res?.status() ?? 500) >= 400 || errors.length || overflow > 1) failed = true;
    await context.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
