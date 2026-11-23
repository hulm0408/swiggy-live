/* harness/smoke.js — drives the real shipped files in a real DOM against a
   real server. Not a re-implementation: it starts server.js on a throwaway
   port and store, loads public/index.html and its scripts, and clicks the same
   buttons a person would.

       npm test
*/
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');

const PORT = Number(process.env.TEST_PORT || 3999);
const BASE = 'http://127.0.0.1:' + PORT + '/';
/* the harness provisions its own key — never one that exists in git */
const KEY = process.env.TEST_KEY || 'SWG-TEST-HARN-ESS0';
const ROOT = path.join(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'swg-test-'));

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('  ok   ' + name);
  } else {
    fail++;
    console.log('  FAIL ' + name + (extra ? '  →  ' + extra : ''));
  }
}

function makeJarFetch() {
  const jar = {};
  return async function fetchWithJar(url, opts) {
    opts = opts || {};
    const u = new URL(url, BASE);
    const headers = new Headers(opts.headers || {});
    const cookie = Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
    if (cookie) headers.set('cookie', cookie);
    const res = await fetch(u.href, Object.assign({}, opts, { headers }));
    for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
      const pair = c.split(';')[0];
      const i = pair.indexOf('=');
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (!v || /max-age=0/i.test(c)) delete jar[k];
      else jar[k] = v;
    }
    return res;
  };
}

const SCRIPTS = ['js/art.js', 'js/data.js', 'js/core.js', 'js/views.js'];

async function bootDom(hash) {
  const raw = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  /* pull the inline boot script out so it runs after the polyfills are in */
  const m = raw.match(/<script>\s*([\s\S]*?)\s*<\/script>\s*<\/body>/);
  if (!m) throw new Error('could not find the inline boot script in index.html');
  const bootSrc = m[1];
  const html = raw.replace(m[0], '</body>');

  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    if (!/Could not load|css|stylesheet/i.test(e.message)) console.log('  [jsdom] ' + e.message);
  });
  const frag = String(hash || '');
  const dom = new JSDOM(html, {
    url: BASE + (frag ? (frag.charAt(0) === '#' ? frag : '#' + frag) : ''),
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const win = dom.window;
  win.fetch = makeJarFetch();
  win.TextEncoder = TextEncoder;
  win.TextDecoder = TextDecoder;
  win.document.execCommand = () => false; // jsdom has none; exercise the fallback

  /* inject as real <script> elements so the top-level `const Core` lands in the
     shared global lexical scope exactly the way the browser does it */
  const run = (src) => {
    const el = win.document.createElement('script');
    el.textContent = src;
    win.document.body.appendChild(el);
  };
  for (const s of SCRIPTS) run(fs.readFileSync(path.join(ROOT, 'public', s), 'utf8'));
  run(bootSrc);
  run('window.__Core = Core;');

  await waitFor(() => win.__Core && win.__Core.S, 'Core');
  Object.defineProperty(win, 'Core', { get: () => win.__Core });
  return dom;
}

function waitFor(fn, label, ms) {
  const limit = ms || 8000;
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      let v = null;
      try {
        v = fn();
      } catch (e) {}
      if (v) return resolve(v);
      if (Date.now() - t0 > limit) return reject(new Error('timeout waiting for ' + label));
      setTimeout(tick, 40);
    };
    tick();
  });
}

const text = (win) => (win.document.getElementById('app').textContent || '').replace(/\s+/g, ' ');
const viewOf = (win) => win.document.body.getAttribute('data-view');
function click(win, act) {
  const el = win.document.querySelector('[data-act="' + act + '"]');
  if (!el) throw new Error('no element with data-act=' + act);
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
  return el;
}

let server;
function startServer() {
  server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      DATA_DIR,
      AUTH_ACCESS_KEYS: KEY + '=Owner:admin',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => process.stdout.write('  [server] ' + d));
  return waitForHttp(BASE + 'api/health');
}
function waitForHttp(url) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const r = await fetch(url);
        if (r.ok) return resolve();
      } catch (e) {}
      if (Date.now() - t0 > 15000) return reject(new Error('server never came up on ' + url));
      setTimeout(tick, 100);
    };
    tick();
  });
}

(async () => {
  await startServer();
  console.log('\n── 1. cold boot, no session, no link ──────────────────────────');
  let dom = await bootDom('');
  let win = dom.window;
  await waitFor(() => viewOf(win) === 'login', 'login view');
  check('cold boot lands on the login view', viewOf(win) === 'login', viewOf(win));
  check('login screen has a key field', !!win.document.getElementById('akey'));
  check('login screen carries no explanation copy', !/hashed|OTP|SMS|endpoint|probe/i.test(text(win)), text(win).slice(0, 120));
  check('no OTP tab or device-key tab', !/Access key|Send OTP/i.test(text(win)));

  console.log('\n── 2. JSON-only sign in ───────────────────────────────────────');
  win.document.getElementById('akey').value = 'nope';
  click(win, 'key-login');
  await waitFor(() => /SWG-XXXX-XXXX-XXXX/.test(win.document.getElementById('keyErr').textContent), 'format error');
  check('bad key rejected with the format message', true);

  win.document.getElementById('akey').value = 'SWG-AAAA-BBBB-CCCC';
  click(win, 'key-login');
  await waitFor(() => /not valid/i.test(win.document.getElementById('keyErr').textContent), 'unknown key');
  check('unknown key rejected', true);

  // the field also takes the JSON body itself
  win.document.getElementById('akey').value = JSON.stringify({ key: KEY });
  click(win, 'key-login');
  await waitFor(() => viewOf(win) === 'claim', 'claim view');
  check('JSON body {"key":...} signs in and lands on Offers', viewOf(win) === 'claim', viewOf(win));
  check('signed-in user is the seeded key', win.Core.S.user && win.Core.S.user.label === 'Owner', JSON.stringify(win.Core.S.user));
  check('claim page shows both slots', /Breakfast offer/.test(text(win)) && /Dinner offer/.test(text(win)), text(win).slice(0, 200));
  check('admin key sees the Keys section', /Keys/.test(text(win)));

  console.log('\n── 3. claiming ────────────────────────────────────────────────');
  const istHour = new Date(Date.now() + 5.5 * 3600e3).getUTCHours();
  const openSlot = istHour >= 5 && istHour < 11 ? 'breakfast' : istHour >= 18 ? 'dinner' : null;
  console.log('  (IST hour is ' + istHour + ', open slot: ' + (openSlot || 'none') + ')');

  if (openSlot) {
    click(win, 'do-claim');
    await waitFor(() => viewOf(win) === 'success', 'success view');
    const succText = text(win);
    check('claim lands on #success', true);
    check('success shows the coupon code', /BREAKFAST60|DINNER100/.test(succText), succText.slice(0, 160));
    check('coupon registered in the bill engine', !!win.Core.COUPONS.BREAKFAST60 || !!win.Core.COUPONS.DINNER100);
    check('coupon auto-applied to the cart state', !!win.Core.S.coupon, win.Core.S.coupon);

    win.document.querySelector('.succ-acts [data-tab="claim"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitFor(() => viewOf(win) === 'claim', 'claim view 2');
    check('claimed slot renders as claimed', /claimed today/.test(text(win)) && /Use on this order/.test(text(win)), text(win).slice(0, 200));

    // server must refuse a second claim for the same slot today
    const dup = await win.Core.API.claim(openSlot);
    check('second claim the same day is refused', dup.ok === false && dup.error === 'ALREADY_CLAIMED', JSON.stringify(dup).slice(0, 160));
  } else {
    check('no slot open at this IST hour — skipped live claim', true);
  }

  const shutSlot = openSlot === 'breakfast' ? 'dinner' : 'breakfast';
  const shut = await win.Core.API.claim(shutSlot);
  check('closed slot refuses with OUTSIDE_WINDOW', shut.ok === false && (shut.error === 'OUTSIDE_WINDOW' || shut.error === 'ALREADY_CLAIMED'), JSON.stringify(shut).slice(0, 160));

  console.log('\n── 4. mint a key for someone else ─────────────────────────────');
  const minted = await win.Core.API.mintKey('guest');
  check('admin can mint a key', minted.ok === true && /^SWG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(minted.key || ''), JSON.stringify(minted).slice(0, 140));

  console.log('\n── 5. address by link ─────────────────────────────────────────');
  win.Core.S.addr = 'Flat 7, Cyber Heights, Gomti Nagar, Lucknow';
  win.Core.S.loc = 'gomti';
  const addrUrl = win.Core.Links.addrUrl();
  check('address link is a #a= deep link', new RegExp('^' + BASE.replace(/[.:/]/g, '\\$&') + '#a=[A-Za-z0-9_-]+$').test(addrUrl), addrUrl);
  check('address link carries no readable address', !/Gomti/.test(addrUrl), addrUrl);

  const dom2 = await bootDom(addrUrl.split('/').pop());
  const win2 = dom2.window;
  await waitFor(() => win2.Core && win2.Core.S && win2.Core.S.addr, 'addr state');
  await waitFor(() => win2.document.getElementById('app').innerHTML.length > 200, 'rendered');
  check('link address applied on boot', win2.Core.S.addr === 'Flat 7, Cyber Heights, Gomti Nagar, Lucknow', win2.Core.S.addr);
  check('link lat/lng became the live location', win2.Core.here().lat === 26.8537 && win2.Core.here().lng === 81.0045, JSON.stringify(win2.Core.here()));

  console.log('\n── 6. cart by link ────────────────────────────────────────────');
  win.Core.S.cart = {
    restId: 'R42', restName: 'Tunday Kababi', restEta: '28 mins', img: '',
    items: {
      'D1|-|': { key: 'D1|-|', id: 'D1', name: 'Galouti Kebab', price: 320, veg: false, img: '', qty: 2, addonNames: [], variantName: '' },
      'D2|-|': { key: 'D2|-|', id: 'D2', name: 'Sheermal', price: 60, veg: true, img: '', qty: 3, addonNames: ['Butter'], variantName: 'Size: Large' },
    },
  };
  const cartUrl = win.Core.Links.cartUrl();
  check('cart link is a #cart&c= deep link', new RegExp('^' + BASE.replace(/[.:/]/g, '\\$&') + '#cart&c=[A-Za-z0-9_-]+$').test(cartUrl), cartUrl.slice(0, 90) + '…');

  const dom3 = await bootDom(cartUrl.split('/').pop().replace('#', ''));
  const win3 = dom3.window;
  await waitFor(() => viewOf(win3) === 'cart', 'cart view');
  const ct = text(win3);
  check('cart link opened the cart view', viewOf(win3) === 'cart', viewOf(win3));
  check('cart link restored the restaurant', /Tunday Kababi/.test(ct), ct.slice(0, 140));
  check('cart link restored both lines with quantities', /Galouti Kebab/.test(ct) && /Sheermal/.test(ct));
  check('cart link restored the item total (320×2 + 60×3 = 820)', /820/.test(ct), ct.slice(0, 220));
  check('cart link restored variant + addon', /Size: Large/.test(ct) && /Butter/.test(ct));
  check('cart pill shows 5 items', win3.Core.cartCount() === 5, String(win3.Core.cartCount()));

  console.log('\n── 6b. checkout → order → tracking ────────────────────────────');
  click(win3, 'go-checkout');
  await waitFor(() => viewOf(win3) === 'checkout', 'checkout view');
  const coText = text(win3);
  check('checkout renders the bill summary', /Bill summary/.test(coText), coText.slice(0, 140));
  check('checkout shows the linked address', /Cyber Heights|Gomti/.test(coText) || /Deliver to/.test(coText));
  click(win3, 'place-order');
  await waitFor(() => viewOf(win3) === 'track', 'track view');
  const trText = text(win3);
  check('placing an order lands on tracking', true);
  check('tracking shows the order id', /Order #SW\d{6}/.test(trText), trText.slice(0, 140));
  check('tracking renders the map', !!win3.document.querySelector('.mapsvg'));
  check('order recorded in the session list', win3.Core.S.orders.length === 1, String(win3.Core.S.orders.length));
  check('cart cleared after the order', win3.Core.cartCount() === 0);

  console.log('\n── 7. key by link ─────────────────────────────────────────────');
  const dom4 = await bootDom('claim&k=' + (minted.key || KEY));
  const win4 = dom4.window;
  await waitFor(() => win4.Core.S.user, 'signed in from link');
  check('a key in the link signs the visitor in', !!win4.Core.S.user, JSON.stringify(win4.Core.S.user));
  check('…and lands them on Offers', viewOf(win4) === 'claim', viewOf(win4));

  console.log('\n── 8. no explanation copy anywhere ────────────────────────────');
  const BANNED = /endpoint|probe|Akamai|reverse-engineer|dapi|mapi|202|modelled locally|authed tier|hashed at rest|dev mode|__fetch_request|swiggy\.com/i;
  const views = ['home', 'search', 'cart', 'orders', 'claim', 'login'];
  for (const v of views) {
    win4.Core.reset(v === 'orders' ? 'account' : v);
    await waitFor(() => win4.document.getElementById('app').innerHTML.length > 100, v + ' render');
    await new Promise((r) => setTimeout(r, 120));
    const t = text(win4);
    check('view "' + v + '" is clean', !BANNED.test(t), (t.match(BANNED) || [''])[0]);
  }
  check('bottom nav has no API tab', !/API/.test(win4.document.getElementById('nav').textContent), win4.document.getElementById('nav').textContent);
  check('bottom nav has Offers', /Offers/.test(win4.document.getElementById('nav').textContent));

  console.log('\n── 9. sign out ────────────────────────────────────────────────');
  win4.Core.reset('account');
  await waitFor(() => /Sign out/.test(text(win4)), 'account');
  click(win4, 'sign-out');
  await waitFor(() => !win4.Core.S.user, 'signed out');
  check('sign out clears the session', win4.Core.S.user === null);
  const me = await win4.Core.API.me();
  check('server agrees the session is gone', me.signedIn === false, JSON.stringify(me));

  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('  ' + pass + ' passed, ' + fail + ' failed');
  done(fail ? 1 : 0);
})().catch((e) => {
  console.error('\n  harness error: ' + (e && e.stack ? e.stack : e));
  done(2);
});

function done(code) {
  try {
    if (server) server.kill('SIGKILL');
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch (e) {}
  process.exit(code);
}
