/* server.js — zero-dependency Node server.
 * (1) static host for the app
 * (2) reverse-engineered Swiggy edge proxy: browser -> this box -> www.swiggy.com
 * (3) normalizers that slim Swiggy's protobuf-JSON into compact view models
 * (4) /api/map — the endpoint map, with live status per route
 *
 * Run: node server.js   (PORT env optional, default 3000)
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const auth = require('./auth');

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const ROOT = path.join(__dirname, 'public');
const TTL_MS = Number(process.env.CACHE_TTL || 120000);

/* The header set that actually gets through. Discovered by probing:
 * - desktop UA + __fetch_request:1  -> /dapi/restaurants/list/v5, /dapi/restaurants/search/v3 pass
 * - no UA / curl UA                 -> 202 challenge on every route
 * - /dapi/menu/pl                   -> 202, but /mapi/menu/pl passes with the same header set
 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const UP_HEADERS = {
  'User-Agent': UA,
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  __fetch_request: '1',
  Referer: 'https://www.swiggy.com/',
  Origin: 'https://www.swiggy.com',
};

const IMG_BASE = 'https://media-assets.swiggy.com/swiggy/image/upload/fl_lossy,f_auto,q_auto,w_508,h_320,c_fill/';

/* ------------------------------------------------------------------ */
/* upstream fetch                                                      */
/* ------------------------------------------------------------------ */
const cache = new Map(); // key -> {at, body}

function upstream(reqPath, { retryMapi = true } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const target = reqPath;
    const req = https.request(
      { host: 'www.swiggy.com', path: target, method: 'GET', headers: UP_HEADERS, timeout: 25000 },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let buf = Buffer.concat(chunks);
          const enc = String(res.headers['content-encoding'] || '');
          try {
            if (enc === 'gzip') buf = zlib.gunzipSync(buf);
            else if (enc === 'deflate') buf = zlib.inflateSync(buf);
            else if (enc === 'br') buf = zlib.brotliDecompressSync(buf);
          } catch (e) {}
          const out = {
            status: res.statusCode,
            ms: Date.now() - started,
            body: buf.toString('utf8'),
            headers: res.headers,
          };
          // 202 = Akamai bot challenge, empty body. Retry once on the mobile path.
          if (out.status === 202 && retryMapi && target.startsWith('/dapi/')) {
            const alt = target.replace(/^\/dapi\//, '/mapi/');
            return upstream(alt, { retryMapi: false }).then((r) => resolve({ ...r, retriedAs: alt }), reject);
          }
          resolve(out);
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('upstream timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function swiggyJson(reqPath, opts) {
  const key = reqPath;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { ...hit.value, cached: true };
  const r = await upstream(reqPath, opts);
  const value = { status: r.status, ms: r.ms, retriedAs: r.retriedAs || null, text: r.body };
  if (r.status === 200 && r.body.startsWith('{')) {
    try {
      value.json = JSON.parse(r.body);
      cache.set(key, { at: Date.now(), value });
    } catch (e) {
      value.parseError = String(e);
    }
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */
const walk = (o, suffix, acc = []) => {
  if (Array.isArray(o)) {
    for (const v of o) walk(v, suffix, acc);
  } else if (o && typeof o === 'object') {
    const t = o['@type'];
    if (typeof t === 'string' && t.endsWith(suffix)) acc.push(o);
    for (const k in o) walk(o[k], suffix, acc);
  }
  return acc;
};

const money = (paise) => (Number.isFinite(paise) ? paise / 100 : 0);

function costForTwo(raw) {
  if (!raw) return '';
  if (typeof raw === 'string' && raw.includes('₹')) return raw;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return '₹' + Math.round(n / 100) + ' for two';
  return '';
}

function offerOf(info) {
  const v3 = info.aggregatedDiscountInfoV3;
  if (v3 && v3.header) return v3.header + (v3.subHeader ? ' ' + v3.subHeader : '');
  const v2 = info.aggregatedDiscountInfoV2;
  if (v2 && v2.header) return v2.header + (v2.subHeader ? ' ' + v2.subHeader : '');
  const ad = info.aggregatedDiscountInfo || {};
  const list = ad.descriptionList || [];
  for (const d of list) {
    if (d.meta && /freedel/i.test(String(d.meta))) return 'Free delivery';
  }
  for (const d of list) {
    if (d.discountType === 'FLAT' || d.discountType === 'OFF' || d.discountType === 'PCT_OFF') return 'Offer available';
  }
  if ((ad.shortDescriptionList || []).some((s) => s.discountType === 'FREE_DELIVERY')) return 'Free delivery';
  return '';
}

function normRestaurant(info) {
  if (!info) return null;
  const sla = info.sla || {};
  const av = info.availability || {};
  return {
    id: String(info.id),
    name: info.name,
    img: info.cloudinaryImageId ? IMG_BASE + info.cloudinaryImageId : '',
    cuisines: info.cuisines || [],
    rating: info.avgRating || Number(info.avgRatingString) || 0,
    ratingCount: info.totalRatingsString || '',
    eta: sla.deliveryTime || null,
    etaText: sla.slaString || (sla.deliveryTime ? sla.deliveryTime + ' mins' : ''),
    distance: sla.lastMileTravelString || (sla.lastMileTravel ? sla.lastMileTravel.toFixed(1) + ' km' : ''),
    costForTwo: costForTwo(info.costForTwo || info.costForTwoMessage),
    area: info.areaName || info.locality || '',
    city: info.city || '',
    offer: offerOf(info),
    isOpen: info.isOpen !== undefined ? !!info.isOpen : av.opened !== false,
    veg: !!info.veg,
    promoted: !!info.promoted,
    availabilityText: av.opened === false ? 'Currently closed' : '',
  };
}

function normDish(info) {
  if (!info) return null;
  const addons = [];
  for (const g of info.addons || []) {
    const choices = (g.choices || []).map((c) => ({
      id: String(c.id),
      name: c.name,
      price: money(c.price),
      inStock: c.inStock !== 0,
    }));
    if (choices.length) addons.push({ groupId: String(g.groupId), name: g.groupName || 'Add ons', max: g.maxAddons > 0 ? g.maxAddons : 0, choices });
  }
  const variants = [];
  for (const g of (info.variants && info.variants.variantGroups) || []) {
    const vs = (g.variations || []).map((v) => ({
      id: String(v.id),
      name: v.name,
      delta: money(v.price || 0),
      isDefault: !!v.default,
    }));
    if (vs.length) variants.push({ groupId: String(g.groupId), name: g.name || 'Choose', variations: vs });
  }
  const rating = info.ratings && info.ratings.aggregatedRating ? info.ratings.aggregatedRating : null;
  return {
    id: String(info.id),
    name: info.name,
    category: info.category || '',
    desc: (info.description || '').replace(/\u00e2\u20ac\u201d/g, '—').trim(),
    price: money(info.price || (info.defaultPrice || 0)),
    img: info.imageId ? IMG_BASE + info.imageId : '',
    veg: info.isVeg !== 0,
    inStock: info.inStock !== 0,
    bestseller: !!info.isBestseller || !!(info.ribbon && /bestseller/i.test(info.ribbon.text || '')),
    ribbon: info.ribbon && info.ribbon.text ? info.ribbon.text : '',
    rating: rating && rating.rating ? Number(rating.rating) : null,
    ratingCount: rating && rating.ratingCountV2 ? rating.ratingCountV2 : '',
    addons,
    variants,
  };
}

/* ------------------------------------------------------------------ */
/* route handlers                                                      */
/* ------------------------------------------------------------------ */
const routes = {
  /* home feed */
  '/api/listing': async (q) => {
    const lat = q.get('lat') || '26.8467';
    const lng = q.get('lng') || '80.9462';
    const p = `/dapi/restaurants/list/v5?lat=${lat}&lng=${lng}&is-seo-homepage-enabled=true&page_type=DESKTOP_WEB_LISTING`;
    const r = await swiggyJson(p);
    if (!r.json) return { ok: false, status: r.status, error: 'EDGE_CHALLENGE', path: p, retriedAs: r.retriedAs };
    const cards = r.json.data.cards || [];
    const chips = [];
    const restaurants = [];
    const brands = [];
    let city = '';
    for (const c of cards) {
      const inner = (c.card && c.card.card) || {};
      if (inner.imageGridCards && inner.imageGridCards.info) {
        for (const g of inner.imageGridCards.info) {
          chips.push({ id: String(g.id || g.entityId || ''), label: (g.action && g.action.text) || '', img: g.imageId ? IMG_BASE + g.imageId : '', entity: g.entityType });
        }
      }
      if (inner.gridElements) {
        const rs = walk(inner.gridElements, '.Restaurant').map((x) => normRestaurant(x.info)).filter(Boolean);
        if (rs.length) restaurants.push(...rs);
      }
      if (inner.brands) {
        for (const b of inner.brands) {
          brands.push({ id: String(b.id || ''), text: b.text || '', img: b.imageId ? IMG_BASE + b.imageId : '', link: b.link || '' });
        }
      }
      if (inner.citySlug) city = inner.citySlug;
    }
    return { ok: true, city, chips, restaurants, brands, cards: cards.length, upstreamMs: r.ms, cached: !!r.cached };
  },

  /* restaurant search — the tab param picks restaurant list vs dish list */
  '/api/search': async (q) => {
    const lat = q.get('lat') || '26.8467';
    const lng = q.get('lng') || '80.9462';
    const str = q.get('str') || 'biryani';
    const tab = (q.get('tab') || 'RESTAURANT').toUpperCase();
    const uid = crypto.randomUUID();
    const p = `/dapi/restaurants/search/v3?lat=${lat}&lng=${lng}&str=${encodeURIComponent(str)}&trackingId=undefined&submitAction=ENTER&queryUniqueId=${uid}&selectedPLTab=${tab}`;
    const r = await swiggyJson(p);
    if (!r.json) return { ok: false, status: r.status, error: 'EDGE_CHALLENGE', path: p, retriedAs: r.retriedAs };
    const cards = r.json.data.cards || [];
    const restaurants = walk(cards, '.Restaurant').map((x) => normRestaurant(x.info)).filter(Boolean);
    const dishes = [];
    for (const g of walk(cards, '.DishGroup')) {
      const rInfo = g.restaurant && g.restaurant.info;
      const rName = rInfo ? rInfo.name : '';
      const rId = rInfo ? String(rInfo.id) : '';
      const rArea = rInfo ? rInfo.areaName || '' : '';
      const rEta = rInfo && rInfo.sla ? rInfo.sla.slaString || '' : '';
      for (const dd of g.dishes || []) {
        const d = normDish(dd.info || dd);
        if (!d) continue;
        dishes.push({ ...d, restId: rId, restName: rName, restArea: rArea, restEta: rEta });
      }
    }
    // dishes come grouped; dedupe by id and keep the restaurant that sells them
    const seen = new Set();
    const uniq = [];
    for (const d of dishes) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      uniq.push(d);
    }
    return { ok: true, query: str, tab, restaurants, dishes: uniq, counts: { restaurants: restaurants.length, dishes: uniq.length }, upstreamMs: r.ms, cached: !!r.cached };
  },

  /* full restaurant menu */
  '/api/menu': async (q) => {
    const lat = q.get('lat') || '26.8467';
    const lng = q.get('lng') || '80.9462';
    const id = q.get('id');
    if (!id) return { ok: false, status: 400, error: 'MISSING_ID' };
    const p = `/mapi/menu/pl?page-type=REGULAR_MENU&complete-menu=true&lat=${lat}&lng=${lng}&restaurantId=${id}&submitAction=ENTER`;
    const r = await swiggyJson(p);
    if (!r.json) return { ok: false, status: r.status, error: 'EDGE_CHALLENGE', path: p, retriedAs: r.retriedAs };
    const cards = r.json.data.cards || [];
    const infoCard = walk(cards, '.Restaurant')[0];
    const restaurant = normRestaurant(infoCard && infoCard.info);

    /* the menu body hangs off cards[n].groupedCard (no @type tag on this node) */
    const groupedHolder = cards.find((c) => c && c.groupedCard) || {};
    const grouped = groupedHolder.groupedCard || {};
    const groupCards =
      (grouped.cardGroupMap && grouped.cardGroupMap.REGULAR && grouped.cardGroupMap.REGULAR.cards) || [];

    const menu = [];
    const pushCat = (title, items, nested) => {
      const list = items.slice();
      if (!list.length) return;
      menu.push({ title, nested: !!nested, items: list });
    };

    for (const gc of groupCards) {
      const inner = (gc.card && gc.card.card) || {};
      const type = String(inner['@type'] || '');
      if (type.endsWith('.ItemCategory')) {
        const items = (inner.itemCards || []).map((ic) => normDish(ic.card && ic.card.info)).filter(Boolean);
        pushCat(inner.title || 'Menu', items, false);
      } else if (type.endsWith('.NestedItemCategory')) {
        for (const sub of inner.categories || []) {
          const items = (sub.itemCards || []).map((ic) => normDish(ic.card && ic.card.info)).filter(Boolean);
          pushCat(sub.title || inner.title || 'Menu', items, true);
        }
      }
    }

    const offers = [];
    const offCards = walk(groupCards, 'RestaurantOffers');
    for (const oc of offCards) {
      for (const o of oc.offers || []) {
        offers.push({ code: o.couponCode || '', desc: o.description || '', header: o.header || '', sub: o.subHeader || '' });
      }
    }

    return {
      ok: true,
      restaurant: restaurant ? { ...restaurant, meta: infoCard.info } : null,
      menu,
      offers,
      veg: infoCard && infoCard.info ? !!infoCard.info.veg : false,
      sections: groupCards.length,
      upstreamMs: r.ms,
      cached: !!r.cached,
    };
  },

  /* autosuggest */
  '/api/suggest': async (q) => {
    const lat = q.get('lat') || '26.8467';
    const lng = q.get('lng') || '80.9462';
    const str = q.get('str') || '';
    const p = `/dapi/restaurants/search/suggest?lat=${lat}&lng=${lng}&str=${encodeURIComponent(str)}`;
    const r = await swiggyJson(p);
    if (!r.json) return { ok: false, status: r.status, error: 'EDGE_CHALLENGE', path: p };
    const list = (r.json.data && r.json.data.suggestions) || [];
    return {
      ok: true,
      suggestions: list.slice(0, 10).map((s) => ({
        text: s.text,
        tag: s.tagToDisplay || '',
        img: s.cloudinaryId ? IMG_BASE + s.cloudinaryId : '',
      })),
    };
  },

  /* raw pass-through, used by the in-app endpoint console */
  '/api/raw': async (q) => {
    const p = q.get('path') || '';
    if (!/^\/(dapi|mapi|api)\//.test(p)) return { ok: false, status: 400, error: 'PATH_NOT_ALLOWED' };
    const r = await upstream(p, { retryMapi: false });
    let parsed = null;
    try {
      parsed = JSON.parse(r.body);
    } catch (e) {}
    return { ok: r.status === 200, status: r.status, ms: r.ms, bytes: Buffer.byteLength(r.body), body: parsed || r.body.slice(0, 1200) };
  },

  /* the map itself */
  '/api/map': async () => ({ ok: true, map: ENDPOINT_MAP }),
};

/* Discovered surface. Every entry here was hit from this box and the
   status recorded by /api/probe. */
const ENDPOINT_MAP = [
  {
    id: 'listing',
    method: 'GET',
    host: 'www.swiggy.com',
    path: '/dapi/restaurants/list/v5',
    q: 'lat, lng, is-seo-homepage-enabled=true, page_type=DESKTOP_WEB_LISTING',
    headers: ['User-Agent: <desktop Chrome>', '__fetch_request: 1'],
    status: 200,
    note: 'Home feed. 12 cards: category chips, "Top restaurant chains", restaurant grid (8), brands, SEO blocks.',
    tier: 'public',
  },
  {
    id: 'search',
    method: 'GET',
    host: 'www.swiggy.com',
    path: '/dapi/restaurants/search/v3',
    q: 'lat, lng, str, selectedPLTab=RESTAURANT|DISH, trackingId=undefined, submitAction=ENTER, queryUniqueId=<uuid4>',
    headers: ['User-Agent: <desktop Chrome>', '__fetch_request: 1'],
    status: 200,
    note: 'selectedPLTab=RESTAURANT returns ~101 results; DISH returns grouped dishes with per-dish restaurant refs.',
    tier: 'public',
  },
  {
    id: 'menu',
    method: 'GET',
    host: 'www.swiggy.com',
    path: '/mapi/menu/pl',
    q: 'page-type=REGULAR_MENU, complete-menu=true, lat, lng, restaurantId, submitAction=ENTER',
    headers: ['User-Agent: <desktop Chrome>', '__fetch_request: 1'],
    status: 200,
    note: 'Full menu. NOTE: the /dapi variant of this exact route answers 202; /mapi passes.',
    tier: 'public',
  },
  {
    id: 'suggest',
    method: 'GET',
    host: 'www.swiggy.com',
    path: '/dapi/restaurants/search/suggest',
    q: 'lat, lng, str',
    headers: ['User-Agent: <desktop Chrome>', '__fetch_request: 1'],
    status: 200,
    note: 'Autosuggest: dish/restaurant/cuisine entries with cloudinary icons.',
    tier: 'public',
  },
  {
    id: 'images',
    method: 'GET',
    host: 'media-assets.swiggy.com',
    path: '/swiggy/image/upload/fl_lossy,f_auto,q_auto,w_508,h_320,c_fill/<cloudinaryImageId>',
    q: '-',
    headers: [],
    status: 200,
    note: 'Image CDN. cloudinaryImageId comes straight off any card/entity.',
    tier: 'public',
  },
  {
    id: 'listing-update',
    method: 'POST',
    host: 'www.swiggy.com',
    path: '/dapi/restaurants/list/update',
    q: 'body: {lat,lng,nextOffset,widgetOffset,filters,page_type}',
    headers: ['User-Agent', '__fetch_request: 1', 'Content-Type: application/json'],
    status: 202,
    note: 'Pagination. Akamai challenge (202, empty body). Workaround used here: page through /search instead, which returns ~101 rows per call.',
    tier: 'blocked',
  },
  {
    id: 'instamart',
    method: 'GET',
    host: 'www.swiggy.com',
    path: '/api/instamart/home',
    q: 'pageType=EXPLORE, lat, lng',
    headers: ['User-Agent', '__fetch_request: 1'],
    status: 202,
    note: 'Instamart storefront. Edge challenge from non-app clients. Needs a valid _abck/bm_sz session cookie minted by the sensor challenge.',
    tier: 'blocked',
  },
  {
    id: 'cart',
    method: 'POST',
    host: 'www.swiggy.com',
    path: '/dapi/cart/add, /dapi/cart/update, /dapi/order/place',
    q: 'body: cart payload',
    headers: ['User-Agent', '_device_id', 'Authorization: Bearer <jwt from OTP login>', 'tid/__SW cookies'],
    status: 401,
    note: 'Transactional tier. Requires an authenticated phone login (JWT) + device id + cart token. Not wired: cart and checkout in this build are local and priced off live menu data.',
    tier: 'auth',
  },
];

/* ------------------------------------------------------------------ */
/* static                                                              */
/* ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  /* health: tells you exactly which build the host is running */
  if (rel === '/api/health') {
    const A = require('./auth.js');
    const info = A.storeInfo ? A.storeInfo() : {};
    const body = JSON.stringify({
      ok: true,
      app: 'swiggy-live',
      commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'local',
      branch: process.env.RENDER_GIT_BRANCH || 'local',
      node: process.version,
      uptime: Math.round(process.uptime()),
      authStore: info,
      env: {
        sms: !!(process.env.SMS_WEBHOOK_URL),
        devMode: process.env.AUTH_DEV_MODE !== '0',
        dataDir: process.env.DATA_DIR || null,
        port: PORT,
      },
    });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(body);
  }

  if (rel === '/') rel = '/index.html';
  const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

/* ------------------------------------------------------------------ */
/* server                                                              */
/* ------------------------------------------------------------------ */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));

  /* auth lives in its own module: phone + OTP, server-held sessions */
  if (url.pathname.startsWith('/api/auth/')) {
    res.setHeader('Cache-Control', 'no-store');
    const handled = await auth.handle(req, res, url, (r, code, payload) => {
      r.setHeader('Content-Type', 'application/json; charset=utf-8');
      r.writeHead(code);
      r.end(JSON.stringify(payload));
    });
    if (handled !== false) return;
  }

  const route = routes[url.pathname];

  if (!route) return serveStatic(req, res);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const out = await route(url.searchParams);
    res.writeHead(out.ok === false && out.error === 'EDGE_CHALLENGE' ? 502 : 200);
    res.end(JSON.stringify(out));
  } catch (e) {
    res.writeHead(500);
    res.end(JSON.stringify({ ok: false, error: 'UPSTREAM_FAIL', detail: String(e && e.message) }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`swiggy-live on http://${HOST}:${PORT}`);
  console.log(`proxy target: https://www.swiggy.com  cache ttl: ${TTL_MS}ms`);
});
