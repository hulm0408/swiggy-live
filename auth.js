/* auth.js — access-key login, JSON in / JSON out.
 *
 *  - one credential shape: SWG-XXXX-XXXX-XXXX, provisioned server-side
 *  - keys are stored as sha256, never in the clear, and are revocable
 *  - sessions are opaque random ids held server-side, delivered as an HttpOnly
 *    cookie (nothing the page can read or leak)
 *  - rate limited per IP on login and on claim
 *  - claims are one per slot per IST calendar day, per key, kept server-side so
 *    clearing browser storage does not reset them
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* on Render a persistent disk mounts at /var/data, so the store must be relocatable */
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const STORE = path.join(DATA_DIR, 'auth.json');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const IP_PER_HOUR = 12;

const COOKIE = 'swg_sid';
const IS_SECURE = String(process.env.COOKIE_SECURE || '') === '1';

/* ---------------- access keys (the only login the app exposes) ----------------
 * SWG-XXXX-XXXX-XXXX. Provisioned server-side, hash-stored, revocable.
 * AUTH_ACCESS_KEYS="SWG-AAAA-BBBB-CCCC=Owner:admin,SWG-DDDD-EEEE-FFFF=Table 4"
 */
const ACCESS_KEY_PREFIX = 'SWG';
const ACCESS_KEY_RE = /^SWG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/* No key is ever written into source. Keys come from AUTH_ACCESS_KEYS, or — when
   nothing is configured — one is generated at boot and printed once to the console,
   exactly like a dev OTP. A committed key is a key you cannot rotate and everyone
   who can read the repo can use. */
let BOOT_GENERATED_KEY = null;

/* Keys that appeared in a commit are public. Rotate them out on sight rather than
   trusting that nobody kept a copy of the file. */
const BURNED_KEYS = ['SWG-WZEY-9089-69ZS'];

/* ---------------- claim slots ----------------
 * One claim per slot per IST calendar day, per access key. Windows are IST.
 */
const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const CLAIM_SLOTS = {
  breakfast: { label: 'Breakfast', code: 'BREAKFAST60', flat: 60, min: 149, from: 5, to: 11 },
  dinner: { label: 'Dinner', code: 'DINNER100', flat: 100, min: 249, from: 18, to: 24 },
};

/* ---------------- persistence ---------------- */
let db = { users: {}, sessions: {}, requests: {}, device_keys: {}, access_keys: {}, claims: {} };
try {
  db = Object.assign(db, JSON.parse(fs.readFileSync(STORE, 'utf8')));
} catch (e) {}
db.access_keys = db.access_keys || {};
db.claims = db.claims || {};

let flushT;
function storeInfo() {
  const persistent = !!process.env.DATA_DIR;
  return {
    path: STORE,
    persistent,
    exists: fs.existsSync(STORE),
    accessKeys: Object.values(db.access_keys).filter((k) => !k.revoked).length,
  };
}

function persist() {
  clearTimeout(flushT);
  flushT = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const now = Date.now();
      // drop expired junk before it hits disk
      for (const [k, r] of Object.entries(db.requests)) if (r.exp < now) delete db.requests[k];
      for (const [k, s] of Object.entries(db.sessions)) if (s.exp < now) delete db.sessions[k];
      const tmp = STORE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, STORE);
    } catch (e) {
      console.error('[auth] persist failed', e.message);
    }
  }, 120);
}

/* ---------------- helpers ---------------- */
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const rid = (n = 24) => crypto.randomBytes(n).toString('base64url');

/* IST calendar day + hour, no timezone database needed — India has no DST */
function istParts(ts) {
  const t = ts || Date.now();
  const d = new Date(t + IST_OFFSET_MS);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}
function istHourDecimal(ts) {
  const p = istParts(ts);
  return p.hour + p.minute / 60;
}
function slotState(slotId, now) {
  const slot = CLAIM_SLOTS[slotId];
  if (!slot) return null;
  const t = now || Date.now();
  const h = istHourDecimal(t);
  const open = h >= slot.from && h < slot.to;
  // local midnight of today, as an epoch ms; IST is a fixed +05:30
  const p = istParts(t);
  const midnight = Date.parse(p.day + 'T00:00:00.000Z') - IST_OFFSET_MS;
  let opensAt = midnight + slot.from * 3600_000;
  if (opensAt <= t) opensAt += 86_400_000;
  return { id: slotId, label: slot.label, code: slot.code, flat: slot.flat, min: slot.min, from: slot.from, to: slot.to, open, opensAt };
}

/* mint SWG-XXXX-XXXX-XXXX until it collides with nothing */
function newAccessKey() {
  for (let attempt = 0; attempt < 64; attempt++) {
    const groups = [];
    for (let g = 0; g < 3; g++) {
      let chunk = '';
      for (let i = 0; i < 4; i++) chunk += KEY_ALPHABET[crypto.randomInt(0, KEY_ALPHABET.length)];
      groups.push(chunk);
    }
    const key = ACCESS_KEY_PREFIX + '-' + groups.join('-');
    if (!db.access_keys[sha(key)]) return key;
  }
  throw new Error('key space exhausted');
}

function registerAccessKey(key, label, admin) {
  const raw = String(key).trim().toUpperCase();
  if (!ACCESS_KEY_RE.test(raw)) return null;
  const rec = {
    label: String(label || 'key').slice(0, 40),
    admin: !!admin,
    tail: raw.slice(-4),
    created: Date.now(),
    uses: 0,
    revoked: false,
  };
  db.access_keys[sha(raw)] = rec;
  persist();
  return rec;
}

/* seed once, from the built-in list and AUTH_ACCESS_KEYS. Existing entries win,
   so a key revoked here stays revoked. */
function seedAccessKeys() {
  const want = [];
  const env = String(process.env.AUTH_ACCESS_KEYS || '');
  for (const part of env.split(',')) {
    const s = part.trim();
    if (!s) continue;
    const [k, rest] = s.split('=');
    const [label, flags] = String(rest || 'key').split(':');
    want.push({ key: k.trim().toUpperCase(), label: label || 'key', admin: flags === 'admin' });
  }
  let added = 0;
  for (const w of want) {
    if (!ACCESS_KEY_RE.test(w.key)) continue;
    if (db.access_keys[sha(w.key)]) continue;
    registerAccessKey(w.key, w.label, w.admin);
    added++;
  }
  if (added) persist();

  /* a key that has been in git is no longer a secret */
  for (const burned of BURNED_KEYS) {
    const rec = db.access_keys[sha(burned)];
    if (rec && !rec.revoked) {
      rec.revoked = true;
      rec.revokedReason = 'published in repository history';
      console.log(`  revoked previously committed key (${burned.slice(0, 8)}…)`);
    }
  }

  /* nothing configured anywhere: mint one admin key for this boot only */
  const live = Object.values(db.access_keys).filter((k) => !k.revoked);
  if (!live.length) {
    const key = newAccessKey();
    registerAccessKey(key, 'Owner', true);
    BOOT_GENERATED_KEY = key;
    console.log(`
  ── ACCESS KEY (dev) ────────────────────────────────
   ${key}
   sign in with this · it is regenerated whenever the
   container restarts, so set AUTH_ACCESS_KEYS for a
   key that survives a deploy
  ────────────────────────────────────────────────────
`);
  }

  persist();
  return added + (BOOT_GENERATED_KEY ? 1 : 0);
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(res, sid, maxAgeSec) {
  const bits = [`${COOKIE}=${sid}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (IS_SECURE) bits.push('Secure');
  res.setHeader('Set-Cookie', bits.join('; '));
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/* sliding-window rate limiter, in memory */
const hits = { phone: new Map(), ip: new Map() };
function rateOk(bucket, key, limit, windowMs = 3600_000) {
  const now = Date.now();
  const list = (hits[bucket].get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= limit) return false;
  list.push(now);
  hits[bucket].set(key, list);
  return true;
}

/* ---------------- routes ---------------- */
async function handle(req, res, url, send) {
  const route = url.pathname;
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  /* who am I */
  if (route === '/api/auth/me' && req.method === 'GET') {
    const sess = sessionOf(req);
    if (!sess) return send(res, 200, { ok: false, signedIn: false });
    sess.seen = now;
    if (sess.seen - sess.iat > 24 * 3600_000) sess.exp = now + SESSION_TTL_MS; // roll long sessions
    persist();
    return send(res, 200, { ok: true, signedIn: true, user: sessionUser(sess), claims: claimsFor(sess) });
  }

  /* ------------------------------------------------------------------ *
   * JSON-only login: POST {"key":"SWG-XXXX-XXXX-XXXX"} -> session cookie
   * ------------------------------------------------------------------ */
  if (route === '/api/auth/login' && req.method === 'POST') {
    const body = (await readJson(req)) || {};
    const raw = String(body.key || '').trim().toUpperCase().replace(/\s+/g, '-').replace(/-{2,}/g, '-');
    if (!rateOk('ip', ip, IP_PER_HOUR)) return send(res, 429, { ok: false, error: 'RATE_IP', message: 'Too many attempts from this connection. Try again in an hour.' });
    if (!ACCESS_KEY_RE.test(raw)) return send(res, 400, { ok: false, error: 'BAD_KEY_FORMAT', message: 'Enter the key as SWG-XXXX-XXXX-XXXX.' });

    const rec = db.access_keys[sha(raw)];
    if (!rec || rec.revoked) return send(res, 401, { ok: false, error: 'BAD_KEY', message: 'That key is not valid.' });

    const sid = rid(32);
    db.sessions[sid] = {
      keyId: sha(raw),
      label: rec.label,
      admin: !!rec.admin,
      iat: now,
      seen: now,
      exp: now + SESSION_TTL_MS,
      ip,
      via: 'access_key',
    };
    rec.uses = (rec.uses || 0) + 1;
    rec.lastUsed = now;
    persist();
    setSessionCookie(res, sid, SESSION_TTL_MS / 1000);
    return send(res, 200, { ok: true, signedIn: true, user: sessionUser(db.sessions[sid]), claims: claimsFor(db.sessions[sid]) });
  }

  /* ------------------------------------------------------------------ *
   * claims
   * ------------------------------------------------------------------ */
  if (route === '/api/auth/claims' && req.method === 'GET') {
    const sess = sessionOf(req);
    if (!sess) return send(res, 401, { ok: false, error: 'NO_SESSION', message: 'Sign in first.' });
    return send(res, 200, { ok: true, user: sessionUser(sess), claims: claimsFor(sess), slots: Object.keys(CLAIM_SLOTS).map((id) => slotState(id, now)) });
  }

  if (route === '/api/auth/claim' && req.method === 'POST') {
    const sess = sessionOf(req);
    if (!sess) return send(res, 401, { ok: false, error: 'NO_SESSION', message: 'Sign in first.' });
    const body = (await readJson(req)) || {};
    const slotId = String(body.slot || '').toLowerCase();
    const slot = CLAIM_SLOTS[slotId];
    if (!slot) return send(res, 400, { ok: false, error: 'BAD_SLOT', message: 'No such offer.' });
    if (!rateOk('ip', ip, 60)) return send(res, 429, { ok: false, error: 'RATE_IP', message: 'Slow down.' });

    const state = slotState(slotId, now);
    if (!state.open) {
      return send(res, 409, {
        ok: false,
        error: 'OUTSIDE_WINDOW',
        message: `${slot.label} claims open at ${fmtHour(slot.from)} IST.`,
        slot: state,
      });
    }

    const today = istParts(now).day;
    const ledger = (db.claims[sess.keyId || 'anon:' + sess.phone] = db.claims[sess.keyId || 'anon:' + sess.phone] || {});
    if (ledger[slotId] && ledger[slotId].day === today) {
      return send(res, 409, {
        ok: false,
        error: 'ALREADY_CLAIMED',
        message: `${slot.label} offer already claimed today.`,
        claim: ledger[slotId],
        slot: state,
      });
    }

    ledger[slotId] = {
      day: today,
      at: now,
      code: slot.code,
      flat: slot.flat,
      min: slot.min,
      label: slot.label,
      by: sess.label || sess.phone,
    };
    persist();
    return send(res, 200, { ok: true, claim: ledger[slotId], slot: state, claims: claimsFor(sess) });
  }

  /* mint a key for someone else — admin access keys only */
  if (route === '/api/auth/keys/mint' && req.method === 'POST') {
    const sess = sessionOf(req);
    if (!sess) return send(res, 401, { ok: false, error: 'NO_SESSION', message: 'Sign in first.' });
    if (!sess.admin) return send(res, 403, { ok: false, error: 'NOT_ADMIN', message: 'Only an admin key can mint keys.' });
    const body = (await readJson(req)) || {};
    let key;
    try {
      key = newAccessKey();
    } catch (e) {
      return send(res, 500, { ok: false, error: 'KEYGEN_FAIL', message: e.message });
    }
    registerAccessKey(key, body.label || 'guest', !!body.admin);
    const rec = db.access_keys[sha(key)];
    return send(res, 200, { ok: true, key, label: rec.label, admin: rec.admin, created: rec.created });
  }

  /* list every live access key (admin only) */
  if (route === '/api/auth/keys/all' && req.method === 'GET') {
    const sess = sessionOf(req);
    if (!sess) return send(res, 401, { ok: false, error: 'NO_SESSION', message: 'Sign in first.' });
    if (!sess.admin) return send(res, 403, { ok: false, error: 'NOT_ADMIN', message: 'Only an admin key can list keys.' });
    const out = Object.entries(db.access_keys)
      .filter(([, k]) => !k.revoked)
      .map(([h, k]) => ({ id: h.slice(0, 12), label: k.label, tail: k.tail || '', admin: !!k.admin, created: k.created, uses: k.uses || 0, lastUsed: k.lastUsed || null }));
    return send(res, 200, { ok: true, keys: out });
  }

  /* revoke any access key (admin only) */
  if (route === '/api/auth/keys/revoke' && req.method === 'POST') {
    const sess = sessionOf(req);
    if (!sess) return send(res, 401, { ok: false, error: 'NO_SESSION', message: 'Sign in first.' });
    if (!sess.admin) return send(res, 403, { ok: false, error: 'NOT_ADMIN', message: 'Only an admin key can revoke keys.' });
    const body = (await readJson(req)) || {};
    const raw = String(body.key || '').trim().toUpperCase();
    const id = raw ? sha(raw) : String(body.id || '');
    for (const [h, k] of Object.entries(db.access_keys)) {
      if ((raw && h === id) || (!raw && h.slice(0, 12) === id)) {
        k.revoked = true;
        for (const [sid, s] of Object.entries(db.sessions)) if (s.keyId === h) delete db.sessions[sid];
        persist();
        return send(res, 200, { ok: true, id: h.slice(0, 12) });
      }
    }
    return send(res, 404, { ok: false, error: 'NOT_FOUND', message: 'No such key.' });
  }

  /* out */
  if (route === '/api/auth/logout' && req.method === 'POST') {
    const sid = parseCookies(req)[COOKIE];
    if (sid && db.sessions[sid]) {
      delete db.sessions[sid];
      persist();
    }
    clearSessionCookie(res);
    return send(res, 200, { ok: true });
  }

  return false;
}

function signedIn(req) {
  const sid = parseCookies(req)[COOKIE];
  const sess = sid && db.sessions[sid];
  if (!sess || sess.exp < Date.now()) return null;
  return db.users[sess.phone] || { phone: sess.phone };
}

/* the live session record behind the cookie, or null */
function sessionOf(req) {
  const sid = parseCookies(req)[COOKIE];
  const sess = sid && db.sessions[sid];
  if (!sess || sess.exp < Date.now()) return null;
  // an access key revoked after login kills its sessions immediately
  if (sess.via === 'access_key') {
    const rec = db.access_keys[sess.keyId];
    if (!rec || rec.revoked) return null;
  }
  return sess;
}

function maskKey(rec) {
  const tail = rec && rec.tail ? rec.tail : '••••';
  return 'SWG-••••-••••-' + tail;
}

/* one shape for both session kinds */
function sessionUser(sess) {
  if (sess.via === 'access_key') {
    const rec = db.access_keys[sess.keyId] || {};
    return {
      via: 'access_key',
      keyId: sess.keyId.slice(0, 12),
      masked: maskKey(rec),
      label: rec.label || sess.label,
      admin: !!(rec.admin !== undefined ? rec.admin : sess.admin),
      since: sess.iat,
      lastLogin: sess.iat,
      logins: 1,
    };
  }
  const u = db.users[sess.phone] || { phone: sess.phone, since: sess.iat };
  return publicUser(u);
}

/* what this session has claimed today, plus when each slot opens next */
function claimsFor(sess, now) {
  const t = now || Date.now();
  const id = sess.keyId || 'anon:' + sess.phone;
  const ledger = db.claims[id] || {};
  const today = istParts(t).day;
  const out = {};
  for (const slotId of Object.keys(CLAIM_SLOTS)) {
    const state = slotState(slotId, t);
    const c = ledger[slotId];
    out[slotId] = {
      slot: state,
      claimed: !!(c && c.day === today),
      claim: c && c.day === today ? c : null,
      lastDay: c ? c.day : null,
    };
  }
  return out;
}

function fmtHour(h) {
  const hh = String(Math.floor(h)).padStart(2, '0');
  const mm = String(Math.round((h % 1) * 60)).padStart(2, '0');
  return `${hh}:${mm}`;
}

function publicUser(u) {
  return {
    phone: u.phone,
    masked: '+91 ' + u.phone.slice(0, 5) + ' ' + u.phone.slice(5),
    since: u.since,
    lastLogin: u.lastLogin || null,
    logins: u.logins || 0,
  };
}

function readJson(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 4096) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

/* current user for other routes (catalog calls can be attributed later) */
function currentUser(req) {
  const sid = parseCookies(req)[COOKIE];
  const sess = sid && db.sessions[sid];
  if (!sess || sess.exp < Date.now()) return null;
  return db.users[sess.phone] || { phone: sess.phone };
}

module.exports = {
  storeInfo,
  handle,
  currentUser,
  sessionOf,
  sessionUser,
  claimsFor,
  registerAccessKey,
  newAccessKey,
  CLAIM_SLOTS,
  ACCESS_KEY_RE,
};

/* provision the built-in + env keys before the first request lands */
const seeded = seedAccessKeys();
if (seeded) console.log(`[auth] seeded ${seeded} access key(s) into ${STORE}`);

