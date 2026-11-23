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

/* ---------------- phone + OTP login ----------------
 * A real code, sent through whatever provider is configured. If none is, the code
 * goes to the console and (only then) back to the client, so the flow is testable
 * without an SMS bill. Set AUTH_DEV_MODE=0 to refuse that echo in production.
 *
 *   TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM (or TWILIO_MESSAGING_SERVICE_SID)
 *   MSG91_AUTH_KEY + MSG91_TEMPLATE_ID
 *   FAST2SMS_API_KEY [+ FAST2SMS_ROUTE]
 *   VONAGE_API_KEY + VONAGE_API_SECRET + VONAGE_FROM
 *   SMS_WEBHOOK_URL      -> POST { phone, otp, ttl_seconds, message }  [+ SMS_WEBHOOK_TOKEN]
 */
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_LEN = 6;
const OTP_MAX_ATTEMPTS = 5;
const OTP_PER_HOUR_PHONE = 5;
const OTP_PER_HOUR_IP = 12;
const OTP_RESEND_SEC = 30;
const APP_NAME = process.env.APP_NAME || 'swiggy-live';
const DEV_MODE = String(process.env.AUTH_DEV_MODE || '1') !== '0';

/* ---------------- claim slots ----------------
 * One claim per slot per IST calendar day, per access key. Windows are IST.
 */
const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const CLAIM_SLOTS = {
  breakfast: { label: 'Breakfast', code: 'BREAKFAST60', flat: 60, min: 149, from: 5, to: 11 },
  dinner: { label: 'Dinner', code: 'DINNER100', flat: 100, min: 249, from: 18, to: 24 },
};

/* ---------------- persistence ---------------- */
let db = { users: {}, sessions: {}, requests: {}, device_keys: {}, access_keys: {}, claims: {}, otp: {} };
try {
  db = Object.assign(db, JSON.parse(fs.readFileSync(STORE, 'utf8')));
} catch (e) {}
db.access_keys = db.access_keys || {};
db.otp = db.otp || {};
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

/* ---------------- sms ----------------
 * Returns { provider } for the first configured channel, or provider:null for the
 * console fallback. Nothing here is required for the app to boot.
 */
function smsConfig() {
  const e = process.env;
  if (e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && (e.TWILIO_FROM || e.TWILIO_MESSAGING_SERVICE_SID)) return { provider: 'twilio' };
  if (e.MSG91_AUTH_KEY && e.MSG91_TEMPLATE_ID) return { provider: 'msg91' };
  if (e.FAST2SMS_API_KEY) return { provider: 'fast2sms' };
  if (e.VONAGE_API_KEY && e.VONAGE_API_SECRET && e.VONAGE_FROM) return { provider: 'vonage' };
  if (e.SMS_WEBHOOK_URL) return { provider: 'webhook' };
  return { provider: null };
}

function smsText(code) {
  return `${code} is your ${APP_NAME} login code. Valid for 5 minutes. Do not share it with anyone.`;
}

async function sendSms(phone, code) {
  const e = process.env;
  const { provider } = smsConfig();
  const text = smsText(code);

  if (!provider) {
    console.log(`
  ── OTP ─────────────────────────────
   +91 ${phone}  →  ${code}
   valid 5 min · console mode (no SMS provider configured)
  ────────────────────────────────────
`);
    return DEV_MODE
      ? { ok: true, channel: 'console' }
      : { ok: false, error: 'SMS_NOT_CONFIGURED' };
  }

  try {
    if (provider === 'twilio') {
      const sid = e.TWILIO_ACCOUNT_SID;
      const form = new URLSearchParams({ To: '+91' + phone, Body: text });
      if (e.TWILIO_MESSAGING_SERVICE_SID) form.set('MessagingServiceSid', e.TWILIO_MESSAGING_SERVICE_SID);
      else form.set('From', e.TWILIO_FROM);
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(sid + ':' + e.TWILIO_AUTH_TOKEN).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
      });
      if (!r.ok) throw new Error('twilio ' + r.status + ' ' + (await r.text()).slice(0, 160));
      return { ok: true, channel: 'twilio' };
    }

    if (provider === 'msg91') {
      /* v5 OTP flow — pass the code we generated so our own store stays the source of truth */
      const q = new URLSearchParams({ template_id: e.MSG91_TEMPLATE_ID, mobile: '91' + phone, authkey: e.MSG91_AUTH_KEY, otp: code });
      if (e.MSG91_SENDER) q.set('sender', e.MSG91_SENDER);
      const r = await fetch('https://control.msg91.com/api/v5/otp?' + q.toString(), { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const body = await r.text();
      if (!r.ok || /"type"\s*:\s*"error"/i.test(body)) throw new Error('msg91 ' + r.status + ' ' + body.slice(0, 160));
      return { ok: true, channel: 'msg91' };
    }

    if (provider === 'fast2sms') {
      const r = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: { authorization: e.FAST2SMS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ route: e.FAST2SMS_ROUTE || 'q', message: text, language: 'english', flash: 0, numbers: phone }),
      });
      const body = await r.text();
      if (!r.ok) throw new Error('fast2sms ' + r.status + ' ' + body.slice(0, 160));
      return { ok: true, channel: 'fast2sms' };
    }

    if (provider === 'vonage') {
      const q = new URLSearchParams({ api_key: e.VONAGE_API_KEY, api_secret: e.VONAGE_API_SECRET, to: '91' + phone, from: e.VONAGE_FROM, text });
      const r = await fetch('https://rest.nexmo.com/sms/json?' + q.toString(), { method: 'POST' });
      const body = await r.json().catch(() => ({}));
      const msg = body && body.messages && body.messages[0];
      if (!r.ok || !msg || String(msg.status) !== '0') throw new Error('vonage ' + r.status + ' ' + JSON.stringify(msg || body).slice(0, 160));
      return { ok: true, channel: 'vonage' };
    }

    /* generic webhook — your own gateway decides how to deliver it */
    const r = await fetch(e.SMS_WEBHOOK_URL, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, e.SMS_WEBHOOK_TOKEN ? { Authorization: 'Bearer ' + e.SMS_WEBHOOK_TOKEN } : {}),
      body: JSON.stringify({ phone, otp: code, ttl_seconds: Math.round(OTP_TTL_MS / 1000), message: text }),
    });
    if (!r.ok) throw new Error('webhook ' + r.status);
    return { ok: true, channel: 'webhook' };
  } catch (err) {
    console.error('[auth] sms failed:', err.message);
    return { ok: false, error: 'SMS_FAILED', detail: String(err.message || err).slice(0, 160) };
  }
}

/* 9876543210 | +919876543210 | 919876543210 | 098765... -> 9876543210 */
function normalisePhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  return d;
}

function validPhone(p) {
  return /^[6-9]\d{9}$/.test(p);
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
   * phone + OTP
   * ------------------------------------------------------------------ */
  if (route === '/api/auth/otp/status' && req.method === 'GET') {
    const cfg = smsConfig();
    return send(res, 200, {
      ok: true,
      configured: !!cfg.provider,
      provider: cfg.provider || 'console',
      devEcho: !cfg.provider && DEV_MODE,
      resendAfter: OTP_RESEND_SEC,
      ttlSeconds: Math.round(OTP_TTL_MS / 1000),
    });
  }

  if (route === '/api/auth/otp/request' && req.method === 'POST') {
    const body = (await readJson(req)) || {};
    const phone = normalisePhone(body.phone);
    if (!validPhone(phone)) {
      return send(res, 400, { ok: false, error: 'BAD_PHONE', message: 'Enter a valid 10-digit Indian mobile number.' });
    }
    if (!rateOk('ip', ip, OTP_PER_HOUR_IP)) return send(res, 429, { ok: false, error: 'RATE_IP', message: 'Too many codes from this connection. Try again later.' });
    if (!rateOk('phone', phone, OTP_PER_HOUR_PHONE)) return send(res, 429, { ok: false, error: 'RATE_PHONE', message: 'Too many codes for this number. Try again in an hour.' });

    /* retire this number's older codes: newest wins */
    for (const [id, r] of Object.entries(db.otp)) {
      if (r.phone === phone) delete db.otp[id];
    }
    /* housekeeping */
    for (const [id, r] of Object.entries(db.otp)) {
      if (r.exp < now || r.attempts >= OTP_MAX_ATTEMPTS) delete db.otp[id];
    }

    let code = '';
    for (let i = 0; i < OTP_LEN; i++) code += crypto.randomInt(0, 10);
    const salt = rid(12);
    const requestId = rid(18);
    db.otp[requestId] = {
      phone,
      salt,
      hash: sha(code + salt),
      exp: now + OTP_TTL_MS,
      attempts: 0,
      created: now,
      ip,
    };
    persist();

    const sent = await sendSms(phone, code);
    if (!sent.ok) {
      delete db.otp[requestId];
      persist();
      return send(res, 502, {
        ok: false,
        error: sent.error || 'SMS_FAILED',
        message:
          sent.error === 'SMS_NOT_CONFIGURED'
            ? 'No SMS provider is configured on this server. Set one of TWILIO_*, MSG91_*, FAST2SMS_API_KEY, VONAGE_* or SMS_WEBHOOK_URL.'
            : 'The SMS could not be sent. Check the provider credentials in the server log.',
      });
    }

    return send(res, 200, {
      ok: true,
      requestId,
      phone,
      masked: '+91 ' + phone.slice(0, 5) + ' ' + phone.slice(5),
      expiresIn: Math.round(OTP_TTL_MS / 1000),
      resendAfter: OTP_RESEND_SEC,
      channel: sent.channel,
      ...(sent.channel === 'console' ? { devCode: code, message: 'Dev mode — no SMS provider configured, the code is printed on the server console.' } : {}),
    });
  }

  if (route === '/api/auth/otp/verify' && req.method === 'POST') {
    const body = (await readJson(req)) || {};
    const requestId = String(body.requestId || '');
    const code = String(body.code || '').replace(/\D/g, '');
    const rec = db.otp[requestId];

    if (!rec) return send(res, 400, { ok: false, error: 'NO_REQUEST', message: 'That code has already been used or has expired. Send a new one.' });
    if (rec.exp < now) {
      delete db.otp[requestId];
      persist();
      return send(res, 400, { ok: false, error: 'EXPIRED', message: 'That code expired. Send a new one.' });
    }
    if (rec.attempts >= OTP_MAX_ATTEMPTS) {
      delete db.otp[requestId];
      persist();
      return send(res, 429, { ok: false, error: 'TOO_MANY_TRIES', message: 'Too many wrong attempts. Send a new code.' });
    }

    rec.attempts += 1;
    if (code.length !== OTP_LEN || sha(code + rec.salt) !== rec.hash) {
      const left = OTP_MAX_ATTEMPTS - rec.attempts;
      persist();
      return send(res, 401, {
        ok: false,
        error: 'BAD_CODE',
        message: left > 0 ? 'That code is not right.' : 'Too many wrong attempts. Send a new code.',
        attemptsLeft: Math.max(0, left),
      });
    }

    delete db.otp[requestId]; // single use
    const phone = rec.phone;
    const user = (db.users[phone] = db.users[phone] || { phone, since: now, logins: 0 });
    user.logins = (user.logins || 0) + 1;
    user.lastLogin = now;

    const sid = rid(32);
    db.sessions[sid] = { phone, via: 'otp', iat: now, seen: now, exp: now + SESSION_TTL_MS, ip };
    persist();
    setSessionCookie(res, sid, SESSION_TTL_MS / 1000);
    return send(res, 200, { ok: true, signedIn: true, user: publicUser(user), claims: claimsFor(db.sessions[sid]) });
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

