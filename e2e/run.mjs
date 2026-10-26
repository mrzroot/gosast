// End-to-end check: loads the built extension into real Chrome (under xvfb), runs it on several pages and checks
// that the page is restored EXACTLY. Run with:  npm run build && npm run e2e
//
// What is asserted, per page:
//  - the overlay opens (one host element on <html>), its shadow root is closed
//  - tearing, shredding, sweeping and gluing change the picture; rewinding brings the very same picture back
//  - Esc removes the host and the page is byte-identical afterwards (outerHTML hash, form values, focus, scroll)
//  - the page only ever saw two DOM changes: the host added, the host removed
//  - no console errors, no page errors, and no network request at all while Parpar is open
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'e2e/out'); fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; let failed = 0;
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); }

// ---------- local test server ----------
const FIX = path.join(ROOT, 'e2e/fixtures');
const server = http.createServer((req, res) => {
  const f = path.join(FIX, req.url.split('?')[0].replace(/^\//, '') || 'static.html');
  if (!f.startsWith(FIX) || !fs.existsSync(f)) { res.writeHead(req.url === '/favicon.ico' ? 204 : 404); return res.end(); }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---------- helpers ----------
const SNAP = () => {
  const fields = [...document.querySelectorAll('input,textarea,select')].map((e) => [e.id || e.name, e.value, e.checked]);
  return { html: document.documentElement.outerHTML, active: document.activeElement && (document.activeElement.id || document.activeElement.tagName), scroll: [scrollX, scrollY], fields: JSON.stringify(fields) };
};
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Fraction of pixels (0..1) that differ noticeably between two PNG buffers, compared inside a scratch page. */
async function diff(browser, a, b) {
  const p = await browser.newPage();
  const r = await p.evaluate(async (a64, b64) => {
    const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + s; });
    const [A, B] = await Promise.all([load(a64), load(b64)]);
    if (A.width !== B.width || A.height !== B.height) return 1;
    const px = (i) => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height).data; };
    const da = px(A), db = px(B); let n = 0, total = 0;
    // the toolbar (top) and the two small pills (bottom) are Parpar's own UI, not page content: leave them out
    const W = A.width, top = Math.round(120 * A.height / 760), bottom = Math.round(90 * A.height / 760);
    for (let i = 0; i < da.length; i += 4) { const y = Math.floor(i / 4 / W); if (y < top || y > A.height - bottom) continue; total++; if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 36) n++; }
    return n / total;
  }, a.toString('base64'), b.toString('base64'));
  await p.close(); return r;
}

async function launch(extraArgs = []) {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: false, pipe: true,
    enableExtensions: [path.join(ROOT, 'dist/chrome')], defaultViewport: { width: 1100, height: 760 },
    args: ['--no-sandbox', '--window-size=1100,860', '--autoplay-policy=no-user-gesture-required', ...extraArgs]
  });
  const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes('background.js'), { timeout: 10000 });
  const swNet = [], swErrors = [];
  const cdp = await swTarget.createCDPSession();
  await cdp.send('Network.enable'); await cdp.send('Runtime.enable');
  cdp.on('Network.requestWillBeSent', (e) => swNet.push(e.request.url));
  cdp.on('Runtime.exceptionThrown', (e) => swErrors.push(e.exceptionDetails.text));
  cdp.on('Runtime.consoleAPICalled', (e) => { if (e.type === 'error') swErrors.push(JSON.stringify(e.args.map((a) => a.value))); });
  return { browser, swTarget, swNet, swErrors };
}

/** The virtual X display has a real pointer in the middle of the window; park it on the browser's own toolbar. */
function parkPointer() { try { execFileSync('xdotool', ['mousemove', '5', '5']); } catch (e) { /* no xdotool */ } }

async function openOverlay(page, env) {
  parkPointer();
  // 1) the real thing: the toolbar command shortcut, delivered by X as a genuine key press
  await page.bringToFront(); await sleep(300);
  try { execFileSync('xdotool', ['key', '--clearmodifiers', 'alt+shift+k']); } catch (e) { /* no xdotool */ }
  for (let i = 0; i < 25; i++) { if (await page.evaluate(() => !!document.querySelector('[data-parpar]'))) return 'shortcut (real activeTab grant)'; await sleep(200); }
  return null;
}

async function runPage(env, name, url, opts = {}) {
  const { browser } = env;
  const page = await browser.newPage();
  const errors = [], reqs = []; let armed = false;
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => { if (armed) reqs.push(r.url()); });
  await page.evaluateOnNewDocument(() => {
    window.__muts = [];
    new MutationObserver((l) => l.forEach((m) => window.__muts.push({ t: m.type, target: m.target.nodeName, add: [...m.addedNodes].map((n) => n.nodeName + (n.hasAttribute && n.hasAttribute('data-parpar') ? '[parpar]' : '')), rem: [...m.removedNodes].map((n) => n.nodeName + (n.hasAttribute && n.hasAttribute('data-parpar') ? '[parpar]' : '')) })))
      .observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  if (opts.reduced) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  console.log(`\n== ${name}  ${url}`);
  try { await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }); } catch (e) { check(`${name}: page loads`, false, e.message); await page.close(); return; }
  await sleep(500);
  if (opts.prepare) await opts.prepare(page);
  await page.evaluate(() => { window.__muts.length = 0; });
  const before = await page.evaluate(SNAP);
  const shotBefore = await page.screenshot({ path: `${OUT}/${name}-1-before.png` });
  armed = true; env.swNet.length = 0;
  const how = await openOverlay(page, env);
  check(`${name}: overlay opens`, !!how, how || 'host element never appeared');
  if (!how) { armed = false; await page.close(); return; }
  await sleep(700);
  const closed = await page.evaluate(() => { const h = document.querySelector('[data-parpar]'); return { n: document.querySelectorAll('[data-parpar]').length, shadow: h.shadowRoot === null }; });
  check(`${name}: exactly one host, closed shadow root`, closed.n === 1 && closed.shadow);
  const open0 = await page.screenshot({ path: `${OUT}/${name}-2-open.png` });
  check(`${name}: the open overlay looks like the page (page picture, plus a toolbar)`, (await diff(browser, shotBefore, open0)) < 0.2, '');

  // --- the language key flips the toolbar to Persian and back (looked at in the screenshots)
  await page.keyboard.press('l'); await sleep(500);
  await page.screenshot({ path: `${OUT}/${name}-2b-other-language.png` });
  await page.keyboard.press('l'); await sleep(300);

  // --- keyboard: shred everything, then rewind -> same picture again
  await page.keyboard.press('s'); await sleep(1500);
  const mid = await page.screenshot({ path: `${OUT}/${name}-3-shredding.png` }); await sleep(3000);
  const shredded = await page.screenshot({ path: `${OUT}/${name}-4-shredded.png` });
  const dShred = await diff(browser, open0, shredded);
  check(`${name}: shred-all visibly tears the page`, dShred > 0.05, `${(dShred * 100).toFixed(1)}% of pixels changed`);
  await page.keyboard.press('r');
  let dBack = 1; for (let i = 0; i < 24 && dBack > 0.01; i++) { await sleep(500); dBack = await diff(browser, open0, await page.screenshot()); }
  const rewound = await page.screenshot({ path: `${OUT}/${name}-5-rewound.png` });
  check(`${name}: rewind puts every piece back (same picture)`, dBack <= 0.01, `${(dBack * 100).toFixed(2)}% differs`);

  // --- pointer tools
  await page.keyboard.press('1');
  await page.mouse.move(200, 300); await page.mouse.down();
  for (let i = 0; i <= 20; i++) await page.mouse.move(200 + i * 30, 300 + Math.sin(i / 3) * 40, { steps: 2 });
  await page.mouse.up(); await sleep(2200);
  const torn = await page.screenshot({ path: `${OUT}/${name}-6-strips.png` });
  check(`${name}: strip tool tears paper`, (await diff(browser, open0, torn)) > 0.005);
  await page.keyboard.press('2'); await page.mouse.move(300, 420); await page.mouse.down(); await page.mouse.move(520, 440, { steps: 12 }); await page.mouse.up(); await sleep(1800);
  await page.keyboard.press('3'); await page.mouse.move(150, 650); await page.mouse.down(); await page.mouse.move(950, 650, { steps: 20 }); await page.mouse.up(); await sleep(1500);
  const swept = await page.screenshot({ path: `${OUT}/${name}-7-swept.png` });
  check(`${name}: confetti + broom change the picture again`, (await diff(browser, torn, swept)) > 0.002);
  await page.keyboard.press('4'); await page.mouse.move(150, 600); await page.mouse.down(); await page.mouse.move(950, 640, { steps: 20 }); await page.mouse.up(); await sleep(2500);
  await page.keyboard.press('g'); await page.keyboard.press('m'); await page.keyboard.press('m'); await page.keyboard.press('g');
  await page.keyboard.press('r'); await page.mouse.move(560, 40); parkPointer();   // leave the sheet so no cursor ring is drawn
  dBack = 1; for (let i = 0; i < 30 && dBack > 0.01; i++) { await sleep(500); dBack = await diff(browser, open0, await page.screenshot()); }
  await page.screenshot({ path: `${OUT}/${name}-7b-rewound-after-all-tools.png` });
  check(`${name}: after every tool, rewind restores the picture`, dBack <= 0.01, `${(dBack * 100).toFixed(2)}% differs`);

  // --- keyboard cannot reach the page, wheel cannot scroll it
  if (opts.typing) await opts.typing(page);
  await page.mouse.move(500, 400); await page.mouse.wheel({ deltaY: 400 }); await sleep(300);
  check(`${name}: wheel does not scroll the page behind`, (await page.evaluate(() => scrollY)) === before.scroll[1]);

  // --- leave
  await page.keyboard.press('Escape'); await sleep(500);
  armed = false;
  const gone = await page.evaluate(() => document.querySelectorAll('[data-parpar]').length);
  check(`${name}: Esc removes the overlay`, gone === 0);
  const after = await page.evaluate(SNAP);
  check(`${name}: page HTML identical (hash ${sha(before.html)})`, sha(before.html) === sha(after.html));
  check(`${name}: form values identical`, before.fields === after.fields);
  check(`${name}: focus and scroll position identical`, before.active === after.active && JSON.stringify(before.scroll) === JSON.stringify(after.scroll), `${before.active} -> ${after.active}`);
  const shotAfter = await page.screenshot({ path: `${OUT}/${name}-8-after.png` });
  check(`${name}: screenshot after = screenshot before`, (await diff(browser, shotBefore, shotAfter)) < 0.002);
  const muts = await page.evaluate(() => window.__muts);
  const ok = muts.length === 2 && muts[0].target === 'HTML' && muts[0].add.join() === 'DIV[parpar]' && muts[1].rem.join() === 'DIV[parpar]';
  check(`${name}: the page only saw "host added" and "host removed"`, ok, JSON.stringify(muts).slice(0, 200));
  // On a live site the page may send its own analytics beacons; those are the site's, not Parpar's. So for pages we do not host,
  // only requests from the extension (background) must be zero, and the page's own requests are listed for information.
  const own = url.startsWith(BASE);
  check(`${name}: no network requests while open`, (!own || reqs.length === 0) && env.swNet.length === 0, `page ${reqs.length}${own ? '' : ' (site\'s own, ignored)'}, background ${env.swNet.length} ${reqs.concat(env.swNet).slice(0, 3)}`);
  check(`${name}: no console/page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// ---------- run ----------
let env = await launch(['--lang=en-US']);
await runPage(env, 'static', `${BASE}/static.html`);
await runPage(env, 'forms', `${BASE}/forms.html`, {
  prepare: async (p) => { await p.focus('#name'); await p.keyboard.press('End'); },
  typing: async (p) => { await p.keyboard.type('zzz'); await p.keyboard.press('Space'); await p.keyboard.press('Enter'); await p.mouse.click(260, 120); }
});
await runPage(env, 'reduced-motion', `${BASE}/static.html`, { reduced: true });

// browser pages are refused
{
  const p = await env.browser.newPage(); await p.goto('about:blank'); await p.bringToFront(); await sleep(300);
  try { execFileSync('xdotool', ['key', '--clearmodifiers', 'alt+shift+k']); } catch (e) {}
  await sleep(1500);
  check('about:blank is refused (no overlay)', (await p.evaluate(() => document.querySelectorAll('[data-parpar]').length)) === 0);
  await p.close();
}
// a real, live page (needs internet access from this machine)
let live = true;
try { const t = await env.browser.newPage(); await t.goto('https://en.wikipedia.org/wiki/Paper_shredder', { timeout: 20000, waitUntil: 'domcontentloaded' }); await t.close(); } catch (e) { live = false; console.log('Wikipedia not reachable:', e.message); }
if (live) await runPage(env, 'wikipedia', 'https://en.wikipedia.org/wiki/Paper_shredder', { allowNet: true });
else check('wikipedia: skipped (not reachable from this machine)', true, 'SKIPPED');
check('background: no errors', env.swErrors.length === 0, env.swErrors.join(' | '));
await env.browser.close();

// Persian browser UI + right-to-left page
env = await launch(['--lang=fa-IR']);
await runPage(env, 'rtl-fa', `${BASE}/rtl.html`);
check('background (fa): no errors', env.swErrors.length === 0, env.swErrors.join(' | '));
await env.browser.close();
server.close();

fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed}/${results.length} checks passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed ? 1 : 0);
