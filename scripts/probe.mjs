// Black-box deployment probe: security headers, anonymous access, forged sessions, cross-origin
// writes and the signed endpoints. Needs no credentials and writes nothing, so it is safe to run
// against a deployed URL.   Usage: BASE_URL=https://example.org node scripts/probe.mjs
const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const isLocal = /localhost|127\.0\.0\.1/.test(base);
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failed++; };
const warn = (name, detail) => console.log(`WARN ${name} — ${detail}`);
const get = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init });

// Headers
const home = await get('/');
check('home page loads', home.status === 200, String(home.status));
for (const [h, expected] of [['x-frame-options', 'DENY'], ['x-content-type-options', 'nosniff'], ['referrer-policy', null], ['permissions-policy', null], ['cross-origin-opener-policy', 'same-origin']]) {
  const value = home.headers.get(h);
  check(`header ${h}`, Boolean(value) && (expected === null || value === expected), String(value));
}
check('no X-Powered-By header', !home.headers.get('x-powered-by'));
if (!isLocal) check('Strict-Transport-Security on a deployed URL', Boolean(home.headers.get('strict-transport-security')));
if (!isLocal && !base.startsWith('https://')) check('deployed URL uses https', false, base);

// Anonymous access to workspaces: the page must send the visitor to /login and render nothing private.
for (const path of ['/admin', '/admin/leads', '/partner', '/partner/commissions', '/customer', '/tech']) {
  const res = await get(path);
  const body = await res.text();
  const toLogin = res.headers.get('location')?.includes('/login') || body.includes('NEXT_REDIRECT;replace;/login');
  check(`anonymous ${path} is sent to /login`, toLogin);
  check(`anonymous ${path} renders no workspace content`, !/data-nav|Command centre|कमांड सेंटर|कमांड केंद्र/.test(body));
}

// API without a session
for (const [method, path] of [['GET', '/api/leads'], ['GET', '/api/commissions'], ['POST', '/api/orders'], ['GET', '/api/files/00000000-0000-4000-8000-000000000000']]) {
  const res = await get(path, { method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
  check(`anonymous ${method} ${path} is refused`, res.status === 401, String(res.status));
}
const sync = await get('/api/tech/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"events":[]}' });
check('anonymous technician sync is refused', sync.status === 401, String(sync.status));

// Forged session cookie
for (const cookie of ['aiec_session=forged', 'aiec_session=' + 'a'.repeat(64), 'aiec_session=\' or 1=1 --']) {
  const res = await get('/api/leads', { headers: { cookie } });
  check(`forged session "${cookie.slice(0, 24)}" is refused`, res.status === 401, String(res.status));
}

// Cross-origin state change
const cross = await get('/api/leads', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
check('cross-origin POST is refused', [401, 403].includes(cross.status), String(cross.status));

// Signed endpoints
const hook = await get('/api/webhooks/reconciliation', { method: 'POST', headers: { 'content-type': 'application/json', 'x-aiec-signature': 'deadbeef' }, body: '{"eventId":"probe","companyId":"x","bankReference":"x","amount":"1"}' });
check('webhook with a bad signature is refused', hook.status === 403, String(hook.status));
const hookNone = await get('/api/webhooks/reconciliation', { method: 'POST', body: '{}' });
check('unsigned webhook is refused', hookNone.status === 403, String(hookNone.status));
check('housekeeping without the secret is refused', (await get('/api/jobs/housekeeping', { method: 'POST' })).status === 403);
check('housekeeping with a wrong secret is refused', (await get('/api/jobs/housekeeping', { method: 'POST', headers: { authorization: 'Bearer wrong-secret-wrong-secret' } })).status === 403);

// Sandbox switches must be off in production
const login = await (await get('/login')).text();
const sandbox = /data-testid="demo-/.test(login) || /sandbox|सँडबॉक्स|सैंडबॉक्स/i.test(login);
if (isLocal) console.log(`info sandbox sign-in is ${sandbox ? 'ON' : 'off'} (local)`);
else check('sandbox sign-in is off on a deployed URL', !sandbox, 'demo buttons or sandbox banner found on /login');

// Unknown paths
check('unknown page returns 404', (await get('/no-such-page-' + Date.now())).status === 404);
if (isLocal) warn('Content-Security-Policy', 'not set (see docs/security.md, known gaps)');
console.log(failed ? `PROBE FAILED (${failed})` : 'PROBE PASSED');
process.exit(failed ? 1 : 0);
