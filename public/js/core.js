/* core.js — state, storage, router, cart engine, sheet/toast, fetch layer.
   Talks only to this box's /api/* (which talks to www.swiggy.com). */

const Core = (function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------- safe storage (sandboxed previews throw on localStorage) ---------- */
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : d;
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {}
    },
  };

  const money = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
  const paise = (n) => money(n);

  /* ---------- the state ---------- */
  const LOC = {
    gomti: { key: 'gomti', label: 'Gomti Nagar', lat: 26.8537, lng: 81.0045 },
    ganj: { key: 'ganj', label: 'Hazratganj', lat: 26.8489, lng: 80.9462 },
    aminabad: { key: 'aminabad', label: 'Aminabad', lat: 26.838, lng: 80.916 },
    aliganj: { key: 'aliganj', label: 'Aliganj', lat: 26.8899, lng: 80.9438 },
  };

  const S = {
    tab: 'food',
    theme: store.get('sw.theme', 'light'),
    stack: [{ v: 'home' }],
    loc: store.get('sw.loc', 'gomti'),
    addr: store.get('sw.addr', 'B-42, Sector 14, Gomti Nagar, Lucknow'),
    veg: store.get('sw.veg', false),
    cart: store.get('sw.cart', null),
    coupon: store.get('sw.coupon', null),
    orders: store.get('sw.orders', []),
    tip: 0,
    pay: 'upi',
    offline: false,
    user: null,
    auth: { step: 'phone', requestId: null, devCode: null, phone: null, resendAt: 0 },
    live: { listingMs: 0, menuMs: 0, calls: 0 },
  };

  const applyTheme = () => {
    document.documentElement.setAttribute('data-theme', S.theme === 'dark' ? 'dark' : 'light');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', S.theme === 'dark' ? '#0b1220' : '#38bdf8');
  };
  applyTheme();

  const save = () => {
    store.set('sw.theme', S.theme);
    store.set('sw.cart', S.cart);
    store.set('sw.coupon', S.coupon);
    store.set('sw.orders', S.orders.slice(0, 12));
    store.set('sw.loc', S.loc);
    store.set('sw.addr', S.addr);
    store.set('sw.veg', S.veg);
  };

  const here = () => LOC[S.loc] || LOC.gomti;
  const view = () => S.stack[S.stack.length - 1];

  /* ---------- fetch with in-memory cache ---------- */
  const cache = new Map();
  async function api(path, { ttl = 120000, force = false } = {}) {
    const hit = cache.get(path);
    if (!force && hit && Date.now() - hit.at < ttl) return hit.value;
    const t0 = performance.now();
    let res, json;
    try {
      res = await fetch(path, { headers: { accept: 'application/json' } });
      json = await res.json();
    } catch (e) {
      S.offline = true;
      return { ok: false, error: 'NO_ROUTE', detail: String(e && e.message) };
    }
    json.__ms = Math.round(performance.now() - t0);
    if (json.ok) {
      S.offline = false;
      S.live.calls++;
      S.offline = false;
      cache.set(path, { at: Date.now(), value: json });
    } else if (json.error === 'NO_ROUTE') {
      S.offline = true;
    }
    return json;
  }

  const q = (o) => new URLSearchParams(o).toString();
  const API = {
    listing: () => api('/api/listing?' + q({ lat: here().lat, lng: here().lng })),
    search: (str, tab) => api('/api/search?' + q({ str, tab: tab || 'RESTAURANT', lat: here().lat, lng: here().lng })),
    menu: (id) => api('/api/menu?' + q({ id, lat: here().lat, lng: here().lng })),
    suggest: (str) => api('/api/suggest?' + q({ str, lat: here().lat, lng: here().lng })),
    raw: (path) => api('/api/raw?' + q({ path }), { ttl: 0 }),
    map: () => api('/api/map', { ttl: Infinity }),

    /* ---- auth (phone + OTP, HttpOnly cookie session) ---- */
    me: () => api('/api/auth/me', { ttl: 0 }),
    requestOtp: (phone) => post('/api/auth/otp/request', { phone }),
    verifyOtp: (requestId, code) => post('/api/auth/otp/verify', { requestId, code }),
    logout: () => post('/api/auth/logout', {}),
    keyLogin: (key) => post('/api/auth/key/login', { key }),
    keys: () => api('/api/auth/keys', { ttl: 0 }),
    revokeKey: (id) => post('/api/auth/key/revoke', { id }),
  };

  async function post(path, body) {
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body || {}),
      });
      const json = await res.json();
      json.__status = res.status;
      return json;
    } catch (e) {
      return { ok: false, error: 'NO_ROUTE', message: 'Cannot reach the server. Is it running?' };
    }
  }

  async function refreshUser() {
    const r = await API.me();
    S.user = r && r.ok && r.signedIn ? r.user : null;
    return S.user;
  }

  /* ---------- router ---------- */
  let token = 0;
  const RENDERERS = {}; // filled by views.js
  function go(v, params) {
    S.stack.push({ v, params: params || {} });
    render();
  }
  function back() {
    if (S.stack.length > 1) S.stack.pop();
    render();
  }
  function reset(v, params) {
    S.stack = [{ v, params: params || {} }];
    render();
  }
  const appEl = () => document.getElementById('app');

  let lastKey = '';
  async function render() {
    const my = ++token;
    const v = view();
    const key = v.v + '|' + JSON.stringify(v.params || {});
    const fn = RENDERERS[v.v] || RENDERERS.home;
    const app = appEl();
    if (!app) return;
    const keep = app.scrollTop;
    let html;
    try {
      html = await fn(v.params, my);
    } catch (e) {
      html = `<div class="pad-24"><h3>Something broke in this view</h3><pre class="err">${escapeHtml(String(e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e))}</pre></div>`;
    }
    if (my !== token) return;
    app.innerHTML = html;
    app.scrollTop = key === lastKey ? keep : 0;
    lastKey = key;
    document.body.setAttribute('data-view', v.v);
    applyTheme();
    if (typeof window.__afterRender === 'function') window.__afterRender(app, v);
    paintChrome();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- cart engine (local; prices come from live menu data) ---------- */
  const cartCount = () => (S.cart ? Object.values(S.cart.items).reduce((a, i) => a + i.qty, 0) : 0);
  const cartItems = () => (S.cart ? Object.values(S.cart.items) : []);
  const itemTotal = () => cartItems().reduce((a, i) => a + i.price * i.qty, 0);

  function cartKey(id, variantId, addonIds) {
    return [id, variantId || '-', (addonIds || []).slice().sort().join('_')].join('|');
  }

  function addToCart(rest, dish, opts) {
    // single-restaurant cart, same rule the real app enforces
    if (S.cart && S.cart.restId !== rest.id && cartCount() > 0) {
      Core.sheet(`
        <div class="sheet-head"><h3>Start a new cart?</h3></div>
        <p class="sheet-copy">Your cart has items from <b>${escapeHtml(S.cart.restName)}</b>. Swiggy keeps one restaurant per order — starting a new cart clears it.</p>
        <div class="sheet-actions">
          <button class="btn ghost" data-act="sheet-close">Keep cart</button>
          <button class="btn solid" data-act="cart-reset-add" data-id="${rest.id}" data-dish="${dish.id}">New cart</button>
        </div>`);
      return false;
    }
    const key = cartKey(dish.id, opts && opts.variantId, opts && opts.addonIds);
    if (!S.cart) S.cart = { restId: rest.id, restName: rest.name, restEta: rest.etaText || rest.eta || '', img: rest.img, items: {} };
    const line = S.cart.items[key] || { key, id: dish.id, name: dish.name, price: dish.price, veg: dish.veg, img: dish.img, qty: 0, addonNames: (opts && opts.addonNames) || [], variantName: (opts && opts.variantName) || '' };
    line.price = (opts && opts.unitPrice) || line.price;
    line.qty += 1;
    S.cart.items[key] = line;
    S.cart.restName = rest.name;
    S.cart.restEta = rest.etaText || rest.eta || '';
    S.cart.img = rest.img;
    save();
    paintChrome();
    return true;
  }

  function setQty(key, qty) {
    if (!S.cart) return;
    if (qty <= 0) delete S.cart.items[key];
    else if (S.cart.items[key]) S.cart.items[key].qty = qty;
    if (Object.keys(S.cart.items).length === 0) {
      S.cart = null;
      S.coupon = null;
    }
    save();
    paintChrome();
  }
  const qtyOf = (key) => (S.cart && S.cart.items[key] ? S.cart.items[key].qty : 0);

  const COUPONS = {
    WELCOME50: { pct: 50, cap: 100, min: 199, label: '50% off up to ₹100' },
    TRYNEW: { pct: 30, cap: 75, min: 149, label: '30% off up to ₹75' },
    SWIGGYIT: { flat: 60, min: 299, label: 'Flat ₹60 off' },
    FREEDEL: { freedel: true, min: 99, label: 'Free delivery' },
  };

  function bill() {
    const items = itemTotal();
    const base = 199; // free-delivery threshold used by the storefront tile
    const c = S.coupon && COUPONS[S.coupon];
    let delivery = items >= base ? 0 : 25;
    if (c && c.freedel) delivery = 0;
    const platform = items > 0 ? 5 : 0;
    const gst = Math.round(items * 0.05 * 100) / 100;
    let discount = 0;
    if (c) {
      if (c.pct) discount = Math.min(Math.round((items * c.pct) / 100), c.cap);
      else if (c.flat && items >= c.min) discount = c.flat;
    }
    const tip = S.tip || 0;
    const total = Math.max(0, items + delivery + platform + gst + tip - discount);
    return { items, delivery, platform, gst, discount, tip, total };
  }

  function couponEligible(code) {
    const c = COUPONS[code];
    if (!c) return { ok: false, why: 'Unknown coupon' };
    const items = itemTotal();
    if (items < (c.min || 0)) return { ok: false, why: `Add ${money((c.min || 0) - items)} more to use ${code}` };
    return { ok: true };
  }

  /* ---------- toast / sheet ---------- */
  let toastT;
  function toast(msg, kind) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    clearTimeout(toastT);
    toastT = setTimeout(() => (el.className = 'toast'), 2400);
  }

  function sheet(inner, opts) {
    const wrap = document.getElementById('sheet');
    wrap.className = 'sheet-wrap open' + (opts && opts.up ? ' up' : '');
    wrap.innerHTML = `<div class="sheet-scrim" data-act="sheet-close"></div><div class="sheet-panel">${inner}</div>`;
  }
  function closeSheet() {
    const wrap = document.getElementById('sheet');
    if (!wrap) return;
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = '';
  }

  /* ---------- chrome: bottom nav + cart pill ---------- */
  const TABS = [
    { id: 'food', label: 'Food' },
    { id: 'search', label: 'Search' },
    { id: 'cart', label: 'Cart' },
    { id: 'orders', label: 'Orders' },
    { id: 'api', label: 'API' },
  ];

  function paintChrome() {
    const nav = document.getElementById('nav');
    if (nav) {
      nav.innerHTML = TABS.map(
        (t) => `<button class="tab ${S.tab === t.id ? 'on' : ''}" data-act="tab" data-tab="${t.id}">
        <span class="tab-ic">${tabIcon(t.id)}</span><span class="tab-lb">${t.label}</span></button>`
      ).join('');
    }
    const bar = document.getElementById('cartpill');
    const n = cartCount();
    if (bar) {
      const pillViews = ['home', 'search', 'resto'];
      bar.className = 'cartpill' + (n > 0 && pillViews.includes(view().v) ? ' show' : '');
      bar.innerHTML = n
        ? `<button class="cp-btn" data-act="go-cart"><span class="cp-n">${n} item${n > 1 ? 's' : ''}</span><span class="cp-m">${money(itemTotal())}</span><span class="cp-v">View Cart ${Art.icon('chev', 16)}</span></button>`
        : '';
    }
    const dot = document.getElementById('netdot');
    if (dot) dot.className = 'netdot' + (S.offline ? ' off' : '');
  }

  function tabIcon(id) {
    return (
      {
        food: Art.icon('store', 21),
        search: Art.icon('search', 21),
        cart: Art.icon('cart', 21),
        orders: Art.icon('clock', 21),
        api: Art.icon('bolt', 21),
      }[id] || Art.icon('store', 21)
    );
  }

  /* ---------- misc ---------- */
  const vegMark = (veg) => `<span class="vegmark ${veg ? 'veg' : 'nonveg'}" aria-label="${veg ? 'veg' : 'non-veg'}"><i></i></span>`;
  const ratingChip = (r, count, cls) =>
    `<span class="rchip ${cls || ''}">${Art.starSolid(10)}<b>${r || '—'}</b>${count ? `<span class="rc">(${count})</span>` : ''}</span>`;

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' hr ago';
    return Math.floor(s / 86400) + ' d ago';
  }

  function esc(s) {
    return escapeHtml(s);
  }

  return {
    S,
    $,
    $$,
    API,
    LOC,
    go,
    back,
    reset,
    render,
    RENDERERS,
    here,
    view,
    money,
    addToCart,
    setQty,
    qtyOf,
    cartCount,
    cartItems,
    itemTotal,
    bill,
    COUPONS,
    couponEligible,
    cartKey,
    toast,
    sheet,
    closeSheet,
    paintChrome,
    vegMark,
    ratingChip,
    esc,
    escapeHtml,
    save,
    timeAgo,
    store,
    applyTheme,
    refreshUser,
  };
})();
