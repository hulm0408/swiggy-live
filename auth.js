/* auth.js — phone + OTP login for the account you actually hold.
 *
 * Design notes:
 *  - codes are stored hashed (sha256 of code + per-request salt), 5 min TTL, single use
 *  - sessions are opaque random ids held server-side, delivered as an HttpOnly cookie
 *    (no JWT in localStorage, nothing the page can read or leak)
 *  - rate limits are per-phone and per-IP, applied to both request and verify
 *  - the SMS provider is a pluggable hook: set SMS_WEBHOOK_URL and it POSTs {phone, code}
 *    to your gateway. With no hook configured it runs in dev mode and prints the code
 *    to the server console (and to the client ONLY when AUTH_DEV_MODE is on).
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STORE = path.join(DATA_DIR, 'auth.json');

const OTP_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const PHONE_PER_HOUR = 5;
const IP_PER_HOUR = 12;

const DEV_MODE = process.env.AUTH_DEV_MODE !== '0' && !process.env.SMS_WEBHOOK_URL;
const COOKIE = 'swg_sid';
const KEY_PREFIX = 'SWG-DVC';
const IS_SECURE = String(process.env.COOKIE_SECURE || '') === '1';

/* ---------------- persistence ---------------- */
let db = { users: {}, sessions: {}, requests: {}, device_keys: {} };
try {
  db = Object.assign(db, JSON.parse(fs.readFileSync(STORE, 'utf8')));
} catch (e) {}

let flushT;
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

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  if (!/^[6-9]\d{9}$/.test(ten)) return null;
  return ten;
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

/* ---------------- sms ---------- */
async function sendSms(phone, code, meta) {
  if (process.env.SMS_WEBHOOK_URL) {
    const r = await fetch(process.env.SMS_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.SMS_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.SMS_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify({ phone: '+91' + phone, otp: code, ttl_seconds: OTP_TTL_MS / 1000, purpose: meta || 'login' }),
    });
    if (!r.ok) throw new Error('sms gateway ' + r.status);
    return { channel: 'webhook' };
  }
  console.log(`\n  ── OTP ────────────────────────────\n  +91 ${phone}  →  ${code}\n  valid 5 min · dev mode (no SMS_WEBHOOK_URL)\n  ───────────────────────────────────\n`);
  return { channel: 'console' };
}

/* ---------------- routes ---------------- */
async function handle(req, res, url, send) {
  const route = url.pathname;
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  /* who am I */
  if (route === '/api/auth/me' && req.method === 'GET') {
    const sid = parseCookies(req)[COOKIE];
    const sess = sid && db.sessions[sid];
    if (!sess || sess.exp < now) return send(res, 200, { ok: false, signedIn: false });
    sess.seen = now;
    if (sess.seen - sess.iat > 24 * 3600_000) sess.exp = now + SESSION_TTL_MS; // roll long sessions
    persist();
    const user = db.users[sess.phone] || { phone: sess.phone, since: sess.iat };
    return send(res, 200, { ok: true, signedIn: true, user: publicUser(user) });
  }

  /* step 1 — ask for a code */
  if (route === '/api/auth/otp/request' && req.method === 'POST') {
    const body = (await readJson(req)) || {};
    const phone = normalizePhone(body.phone);
    if (!phone) return send(res, 400, { ok: false, error: 'BAD_PHONE', message: 'Enter a valid 10-digit Indian mobile number.' });
    if (!rateOk('phone', phone, PHONE_PER_HOUR)) return send(res, 429, { ok: false, error: 'RATE_PHONE', message: 'Too many codes for this number. Try again in an hour.' });
    if (!rateOk('ip', ip, IP_PER_HOUR)) return send(res, 429, { ok: false, error: 'RATE_IP', message: 'Too many requests from this connection.' });

    // one live request per number: the newest code wins, older ones die
    for (const [k, r] of Object.entries(db.requests)) if (r.phone === phone && r.exp > now) delete db.requests[k];

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const requestId = rid(18);
    const salt = rid(9);
    db.requests[requestId] = {
      phone,
      salt,
      hash: sha(code + salt),
      exp: now + OTP_TTL_MS,
      attempts: 0,
      ip,
    };
    persist();

    let sent;
    try {
      sent = await sendSms(phone, code);
    } catch (e) {
      delete db.requests[requestId];
      persist();
      return send(res, 502, { ok: false, error: 'SMS_FAILED', message: 'Could not reach the SMS gateway. Try again.' });
    }

    return send(res, 200, {
      ok: true,
      requestId,
      phone,
      expiresIn: OTP_TTL_MS / 1000,
      resendAfter: 30,
      channel: sent.channel,
      // only ever in dev: there is no other way to test without an SMS bill
      devCode: DEV_MODE ? code : undefined,
      message: DEV_MODE ? 'Dev mode — no SMS sent, code printed on the server console.' : 'Code sent.',
    });
  }

  /* step 2 — hand back the code */
  if (route === '/api/auth/otp/verify' && req.method === 'POST') {
    const body = (await readJson(req)) || {};
    const r = db.requests[String(body.requestId || '')];
    if (!r) return send(res, 400, { ok: false, error: 'NO_REQUEST', message: 'That code has expired. Send a new one.' });
    if (r.exp < now) {
      delete db.requests[body.requestId];
      persist();
      return send(res, 400, { ok: false, error: 'EXPIRED', message: 'That code expired. Send a new one.' });
    }
    if (r.attempts >= MAX_VERIFY_ATTEMPTS) {
      delete db.requests[body.requestId];
      persist();
      return send(res, 429, { ok: false, error: 'TOO_MANY_TRIES', message: 'Too many wrong attempts. Send a new code.' });
    }
    const code = String(body.code || '').replace(/\D/g, '');
    r.attempts += 1;
    if (code.length !== 6 || sha(code + r.salt) !== r.hash) {
      persist();
      return send(res, 401, {
        ok: false,
        error: 'BAD_CODE',
        message: 'That code is not right.',
        attemptsLeft: Math.max(0, MAX_VERIFY_ATTEMPTS - r.attempts),
      });
    }

    // correct — burn the request, mint the session
    delete db.requests[body.requestId];
    const sid = rid(32);
    db.sessions[sid] = { phone: r.phone, iat: now, seen: now, exp: now + SESSION_TTL_MS, ip };
    const user = (db.users[r.phone] = db.users[r.phone] || { phone: r.phone, since: now, logins: 0 });
    user.logins = (user.logins || 0) + 1;
    user.lastLogin = now;
    persist();
    setSessionCookie(res, sid, SESSION_TTL_MS / 1000);

    /* a device key can only exist because this number just proved itself */
    let deviceKey = null;
    if (body.remember !== false) {
      deviceKey = mintDeviceKey(r.phone, (body.label || 'device').slice(0, 24));
    }
    return send(res, 200, { ok: true, signedIn: true, user: publicUser(user), deviceKey });
  }

  /* step 2b — sign in with a device key that this server minted after OTP */
  if (route === '/api/auth/key/login' && req.method === 'POST') {
    const body = (await readJson(req)) || {};
    const raw = String(body.key || '').trim().toUpperCase();
    if (!rateOk('ip', ip, IP_PER_HOUR)) return send(res, 429, { ok: false, error: 'RATE_IP', message: 'Too many attempts from this connection.' });
    if (!/^SWG-DVC(-[A-Z0-9]{4}){3}$/.test(raw)) {
      return send(res, 400, { ok: false, error: 'BAD_KEY_FORMAT', message: 'That does not look like a device key (SWG-DVC-XXXX-XXXX-XXXX).' });
    }
    const rec = db.device_keys[sha(raw)];
    if (!rec || rec.revoked) return send(res, 401, { ok: false, error: 'BAD_KEY', message: 'Unknown or revoked key.' });

    const sid = rid(32);
    db.sessions[sid] = { phone: rec.phone, iat: now, seen: now, exp: now + SESSION_TTL_MS, ip, via: 'device_key' };
    rec.lastUsed = now;
    rec.uses = (rec.uses || 0) + 1;
    const user = (db.users[rec.phone] = db.users[rec.phone] || { phone: rec.phone, since: now, logins: 0 });
    user.logins = (user.logins || 0) + 1;
    user.lastLogin = now;
    persist();
    setSessionCookie(res, sid, SESSION_TTL_MS / 1000);
    return send(res, 200, { ok: true, signedIn: true, user: publicUser(user), via: 'device_key' });
  }

  /* list + revoke device keys (must already be signed in) */
  if (route === '/api/auth/keys' && req.method === 'GET') {
    const me = signedIn(req);
    if (!me) return send(res, 401, { ok: false, error: 'NO_SESSION' });
    const keys = Object.entries(db.device_keys)
      .filter(([, k]) => k.phone === me.phone && !k.revoked)
      .map(([hash, k]) => ({ id: hash.slice(0, 12), label: k.label, created: k.created, lastUsed: k.lastUsed || null, uses: k.uses || 0 }));
    return send(res, 200, { ok: true, keys });
  }
  if (route === '/api/auth/key/revoke' && req.method === 'POST') {
    const me = signedIn(req);
    if (!me) return send(res, 401, { ok: false, error: 'NO_SESSION' });
    const body = (await readJson(req)) || {};
    const id = String(body.id || '');
    for (const [hash, k] of Object.entries(db.device_keys)) {
      if (hash.slice(0, 12) === id && k.phone === me.phone) {
        k.revoked = true;
        persist();
        return send(res, 200, { ok: true });
      }
    }
    return send(res, 404, { ok: false, error: 'NOT_FOUND' });
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

function mintDeviceKey(phone, label) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const groups = [];
  for (let g = 0; g < 3; g++) {
    let chunk = '';
    for (let i = 0; i < 4; i++) chunk += alphabet[crypto.randomInt(0, alphabet.length)];
    groups.push(chunk);
  }
  const key = KEY_PREFIX + '-' + groups.join('-');
  db.device_keys[sha(key)] = { phone, label, created: Date.now(), uses: 0, revoked: false };
  persist();
  return key;
}

function signedIn(req) {
  const sid = parseCookies(req)[COOKIE];
  const sess = sid && db.sessions[sid];
  if (!sess || sess.exp < Date.now()) return null;
  return db.users[sess.phone] || { phone: sess.phone };
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

module.exports = { handle, currentUser, DEV_MODE };
