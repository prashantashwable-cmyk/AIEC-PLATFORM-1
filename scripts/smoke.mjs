// Signs in as a demo role (sandbox) and visits pages, reporting HTTP errors, console errors,
// horizontal overflow and untranslated keys. Usage:
//   node scripts/smoke.mjs <ROLE> <locale> <outDir|-> <path> [<path>...]   (path may end with @mobile)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [role, locale, outDir, ...paths] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:3000';
if (outDir !== '-') mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: Number(process.env.SCALE ?? 1) });
await context.addCookies([{ name: 'aiec_locale', value: locale, url: base }]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror ${e}`));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
if (role !== 'ANON') {
  await page.goto(`${base}/login`, { waitUntil: 'load' });
  await page.locator(`[data-testid=demo-${role}]`).first().click();
  await page.waitForURL((u) => /^\/(admin|partner|customer|tech)/.test(u.pathname) || u.pathname === '/app', { timeout: 30000 });
  // Users with one workspace are redirected straight to it; others see the chooser first.
  await page.waitForSelector('aside [data-nav], [data-testid^=portal-]', { state: 'attached', timeout: 30000 });
  if (await page.locator('[data-testid^=portal-]').count()) await page.locator('[data-testid^=portal-]').first().click();
  await page.waitForSelector('aside [data-nav]', { state: 'attached', timeout: 30000 });
}
let failed = 0;
const targets = paths.length ? paths : ['__nav__'];
const visit = async (raw) => {
  const mobile = raw.endsWith('@mobile');
  const path = raw.replace('@mobile', '');
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 });
  errors.length = 0;
  const res = await page.goto(base + path, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const text = await page.locator('body').innerText();
  const rawKeys = [...new Set(text.match(/\b(?:[a-z]{1,10}\.)+[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Z_]+)?\b/g) ?? [])]
    .filter((k) => /^(common|site|landing|footer|zone|auth|enquiry|privacy|err|e|portal|nav|f|a|p|m|n|q|gate|dup|og|set)\./.test(k))
    .filter((k) => !(path === '/admin/audit' && /^[a-z]+\.[a-z_]+$/.test(k))); // audit action codes such as auth.login are data, not untranslated keys
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const status = res?.status() ?? 0;
  const notFound = /^404\b/m.test(text) && (await page.locator('main p.text-5xl').count()) > 0;
  const bad = status >= 400 || errors.length || overflow > 1 || rawKeys.length || notFound;
  if (bad) failed++;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${notFound ? 'NOT-FOUND' : status} ${path}${mobile ? ' (mobile)' : ''}${overflow > 1 ? ` overflowX=${overflow}` : ''}${rawKeys.length ? ` RAW_KEYS=${rawKeys.slice(0, 12).join(',')}${rawKeys.length > 12 ? `…(+${rawKeys.length - 12})` : ''}` : ''}${errors.length ? ` ERRORS=${errors.slice(0, 3).join(' | ')}` : ''}`);
  if (outDir !== '-') await page.screenshot({ path: `${outDir}/${role.toLowerCase()}${path.replace(/[^a-z0-9]+/gi, '-')}-${locale}${mobile ? '-mobile' : ''}.png`, fullPage: true });
};
if (targets[0] === '__nav__') {
  const links = await page.locator('aside [data-nav]').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  for (const link of links) await visit(link);
} else {
  for (const t of targets) await visit(t);
}
await browser.close();
process.exit(failed ? 1 : 0);
