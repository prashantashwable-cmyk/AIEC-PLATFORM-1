// Builds a static preview of the public pages for GitHub Pages (or any static host).
// GitHub Pages can only serve files, and the application needs a Node.js server and PostgreSQL,
// so this renders the public pages from a running server (in English, Hindi and Marathi), removes
// the scripts and points the links at a notice page. Nothing here is the application itself.
//
//   BASE_URL=http://localhost:3000 PAGES_BASE=/repo-name REPO_URL=https://github.com/owner/repo \
//     node scripts/pages-preview.mjs dist-pages
import { chromium } from 'playwright';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const B = (process.env.PAGES_BASE ?? '').replace(/\/$/, ''); // '' or '/repo-name'
const repoUrl = process.env.REPO_URL ?? '';
const out = process.argv[2] ?? 'dist-pages';
const LOCALES = ['en', 'hi', 'mr'];
const PAGES = [{ path: '/', dir: '' }, { path: '/privacy', dir: 'privacy/' }];

const TEXT = {
  en: {
    banner: 'Static preview of the public pages. The application itself (sign-in, enquiry form, workspaces) is not running here.',
    more: 'About this preview',
    title: 'About this preview',
    body: 'GitHub Pages can only host static files. The AIEC application needs a Node.js server and a PostgreSQL database, so sign-in, the enquiry form and the admin, partner, customer and technician workspaces cannot run here. This site shows the public pages exactly as the application renders them, in English, Hindi and Marathi.',
    back: '← Back to the home page', source: 'View the source code',
  },
  hi: {
    banner: 'सार्वजनिक पृष्ठों का स्थिर पूर्वावलोकन। एप्लिकेशन स्वयं (साइन-इन, पूछताछ फ़ॉर्म, कार्यक्षेत्र) यहाँ चालू नहीं है।',
    more: 'इस पूर्वावलोकन के बारे में',
    title: 'इस पूर्वावलोकन के बारे में',
    body: 'GitHub Pages केवल स्थिर फ़ाइलें होस्ट कर सकता है। AIEC एप्लिकेशन को Node.js सर्वर और PostgreSQL डेटाबेस चाहिए, इसलिए साइन-इन, पूछताछ फ़ॉर्म और एडमिन, पार्टनर, ग्राहक व तकनीशियन कार्यक्षेत्र यहाँ नहीं चल सकते। यह साइट सार्वजनिक पृष्ठों को वैसा ही दिखाती है जैसा एप्लिकेशन उन्हें अंग्रेज़ी, हिन्दी और मराठी में प्रस्तुत करता है।',
    back: '← मुख्य पृष्ठ पर लौटें', source: 'स्रोत कोड देखें',
  },
  mr: {
    banner: 'सार्वजनिक पानांचे स्थिर पूर्वावलोकन. ॲप्लिकेशन स्वतः (साइन-इन, चौकशी फॉर्म, कार्यक्षेत्रे) येथे चालू नाही.',
    more: 'या पूर्वावलोकनाबद्दल',
    title: 'या पूर्वावलोकनाबद्दल',
    body: 'GitHub Pages फक्त स्थिर फाइल्स होस्ट करू शकते. AIEC ॲप्लिकेशनला Node.js सर्व्हर आणि PostgreSQL डेटाबेस लागतो, म्हणून साइन-इन, चौकशी फॉर्म आणि ॲडमिन, पार्टनर, ग्राहक व तंत्रज्ञ कार्यक्षेत्रे येथे चालू शकत नाहीत. ही साइट सार्वजनिक पाने ॲप्लिकेशन जशी दाखवते तशीच इंग्रजी, हिंदी आणि मराठीत दाखवते.',
    back: '← मुख्य पृष्ठावर परत जा', source: 'सोर्स कोड पहा',
  },
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function transform(html, locale) {
  const t = TEXT[locale];
  let h = html;
  h = h.replace(/<script\b[\s\S]*?<\/script>/g, '');
  h = h.replace(/<link\b[^>]*\brel="(?:preload|modulepreload|manifest)"[^>]*>/g, '');
  h = h.replace(/<next-route-announcer[\s\S]*?<\/next-route-announcer>/g, '');
  h = h.replace(/\snonce="[^"]*"/g, '');
  // Links first, while they are still the application's own paths: home and its anchors, and the privacy
  // page, stay in the static copy; everything that needs the application goes to the notice page.
  h = h.replace(/<a\b[^>]*>/g, (tag) => tag.replace(/href="(\/[^"]*)"/, (_m, href) => {
    if (href === '/' || href.startsWith('/#')) return `href="${B}/${locale}/${href.slice(1)}"`;
    if (href === '/privacy') return `href="${B}/${locale}/privacy/"`;
    return `href="${B}/${locale}/preview/"`;
  }));
  // The language buttons become links between the three static copies.
  h = h.replace(/<button type="button" lang="(\w+)"([^>]*)>([\s\S]*?)<\/button>/g, (_m, code, attrs, label) =>
    `<a href="${B}/${code}/" lang="${code}"${attrs.replace(/\sdisabled=""/, '')}>${label}</a>`);
  // Assets and icon.
  h = h.replace(/(href|src)="\/_next\//g, `$1="${B}/_next/`);
  h = h.replace(/href="\/icon\.svg[^"]*"/g, `href="${B}/icon.svg"`);
  const banner = `<div role="note" style="background:#fef3c7;color:#451a03;padding:8px 16px;font-size:13px;text-align:center;border-bottom:1px solid #fcd34d">${esc(t.banner)} <a href="${B}/${locale}/preview/" style="text-decoration:underline;font-weight:600">${esc(t.more)}</a><br>${LOCALES.map((c) => `<a href="${B}/${c}/" lang="${c}" style="margin:0 6px;${c === locale ? 'font-weight:700;' : 'text-decoration:underline;'}">${{ en: 'English', hi: 'हिन्दी', mr: 'मराठी' }[c]}</a>`).join('')}</div>`;
  h = h.replace(/(<body[^>]*>)/, `$1${banner}`);
  return h;
}

function noticePage(landing, locale) {
  const t = TEXT[locale];
  const source = repoUrl ? `<p style="margin-top:12px"><a href="${esc(repoUrl)}" style="color:#5b21b6;text-decoration:underline">${esc(t.source)}</a></p>` : '';
  const body = `<body style="background:var(--page-bg,#fff)"><main id="main" style="max-width:640px;margin:0 auto;padding:48px 20px">
<h1 style="font-size:28px;font-weight:700;margin-bottom:16px">${esc(t.title)}</h1>
<p style="font-size:16px;line-height:1.7">${esc(t.body)}</p>
<p style="margin-top:20px"><a href="${B}/${locale}/" style="color:#5b21b6;text-decoration:underline">${esc(t.back)}</a></p>${source}
</main></body>`;
  return landing.replace(/<body[\s\S]*<\/body>/, body).replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(t.title)}</title>`);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
for (const locale of LOCALES) {
  await context.clearCookies();
  await context.addCookies([{ name: 'aiec_locale', value: locale, url: base }]);
  let landing = '';
  for (const { path, dir } of PAGES) {
    const res = await page.goto(base + path, { waitUntil: 'load' });
    if (!res || res.status() !== 200) throw new Error(`${path} (${locale}) returned ${res?.status()}`);
    await page.evaluate(() => document.fonts.ready);
    const html = transform(`<!DOCTYPE html>${await page.evaluate(() => document.documentElement.outerHTML)}`, locale);
    const dest = join(out, locale, dir);
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, 'index.html'), html);
    if (path === '/') landing = html;
  }
  mkdirSync(join(out, locale, 'preview'), { recursive: true });
  writeFileSync(join(out, locale, 'preview', 'index.html'), noticePage(landing, locale));
}
await browser.close();

cpSync(join('.next', 'static'), join(out, '_next', 'static'), { recursive: true });
if (existsSync(join('public', 'icon.svg'))) cpSync(join('public', 'icon.svg'), join(out, 'icon.svg'));
writeFileSync(join(out, '.nojekyll'), '');
writeFileSync(join(out, 'index.html'), `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>AIEC</title><meta name="viewport" content="width=device-width,initial-scale=1">
<script>var l=(navigator.language||'en').slice(0,2);location.replace('${B}/'+(l==='hi'||l==='mr'?l:'en')+'/');</script>
<meta http-equiv="refresh" content="0; url=${B}/en/"></head><body><p><a href="${B}/en/">English</a> · <a href="${B}/hi/">हिन्दी</a> · <a href="${B}/mr/">मराठी</a></p></body></html>`);
console.log(`static preview written to ${out} (base path "${B || '/'}")`);
