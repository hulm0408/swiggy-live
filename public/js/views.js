/* views.js — every screen in the app. Live data only; offline catalog as fallback. */
(function () {
  const C = Core;
  const {
    S, $, $$, API, go, back, reset, RENDERERS, here, money, addToCart, setQty, qtyOf,
    cartCount, cartItems, itemTotal, bill, COUPONS, couponEligible, toast, sheet, closeSheet,
    vegMark, ratingChip, esc, save, timeAgo,
  } = C;
  const { icon, starSolid, art } = Art;

  const MENUS = {}; // restaurantId -> normalized menu (in-memory)
  const DISHES = {}; // dishId -> dish

  /* ---------------------------------------------------------------- atoms */
  function img(src, kind, seed, cls, alt) {
    const ph = art(kind || 'thali', seed || 1);
    const s = src || ph;
    return `<img class="${cls || ''}" src="${s}" alt="${esc(alt || '')}" loading="lazy"
      onerror="this.onerror=null;this.src='${ph}'">`;
  }

  const fmtEta = (r) => (r.etaText || (r.eta ? r.eta + ' mins' : '')).replace('MINS', 'mins');

  function headerLive(route, r, extra) {
    const status = r && r.ok ? '200' : r && r.status ? r.status : '—';
    const ms = r && (r.upstreamMs || r.__ms) ? (r.upstreamMs || r.__ms) + ' ms' : '—';
    const cached = r && r.cached ? ' · cache hit' : '';
    return `<div class="prov">
      <span class="dot-live"></span>
      <code>GET ${route}</code><b>${status}</b><span>${ms}${cached}</span>${extra ? `<span class="prov-x">${extra}</span>` : ''}
      <button class="prov-btn" data-act="tab" data-tab="api">map</button>
    </div>`;
  }

  function appBar() {
    return `<header class="appbar">
      <div class="brand">
        <div class="logo-tile">S</div>
        <span class="wordmark">Swiggy</span>
        <span class="prochip">LIVE</span>
      </div>
      <div class="hdr-actions">
        <button class="loc-pill" data-act="pick-loc">
          ${icon('pin', 13)}<span class="lp-t">${esc(here().label)}</span>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <button class="theme-btn" data-act="toggle-theme" aria-label="Theme">${icon(S.theme === 'dark' ? 'sun' : 'moon', 16)}</button>
      </div>
    </header>`;
  }

  function locBar() {
    return `${appBar()}
    <div class="loc-row">
      <button class="loc-main" data-act="pick-loc">
        <div class="loc-top">Deliver to ${esc(S.addr.split(',')[0])} ${icon('caret', 13)}</div>
        <div class="loc-addr">${esc(S.addr)}</div>
      </button>
      <button class="av-btn" data-act="go-account" aria-label="Account">${icon('user', 18)}</button>
    </div>`;
  }

  function sectionHead(iconName, title, count) {
    return `<h2 class="sec-title">${icon(iconName, 16)}<span>${esc(title)}</span>
      <i class="line"></i>${count !== undefined ? `<span class="count">${count}</span>` : ''}</h2>`;
  }

  function searchEntry() {
    return `<div class="searchwrap">
      <button class="searchbox" data-act="go-search">
        ${icon('search', 17)}
        <span class="sb-ph">Search for <b>'biryani'</b>, <b>'paneer'</b>, <b>'chai'</b></span>
      </button>
      <button class="vegsw ${S.veg ? 'on' : ''}" data-act="toggle-veg" title="Veg mode">
        <span class="vegsw-track"><i></i></span>
        <span class="vegsw-lb">Veg</span>
      </button>
    </div>`;
  }

  function restoCard(r, i) {
    return `<article class="rcard" data-act="open-resto" data-id="${r.id}">
      <div class="rthumb">
        ${img(r.img, ['biryani', 'kebab', 'thali', 'pizza', 'burger', 'dosa', 'noodles', 'roll'][i % 8], i + 5, 'rimg', r.name)}
        <div class="rgrad"></div>
        ${r.offer ? `<div class="offer-strip"><span>${esc(r.offer)}</span></div>` : ''}
        ${r.promoted ? `<div class="promo-tag">Ad</div>` : ''}
      </div>
      <div class="rbody">
        <div class="rtop">
          <h3 class="rname">${esc(r.name)}</h3>
          <div class="rmeta-line">
            ${ratingChip(r.rating ? r.rating.toFixed(1) : '—', r.ratingCount)}
            <span class="rdot">•</span><span class="reta">${esc(fmtEta(r))}</span>
            <span class="rdot">•</span><span class="rcost">${esc(r.costForTwo || '')}</span>
          </div>
          <div class="rcuis">${esc((r.cuisines || []).slice(0, 3).join(', '))}</div>
          <div class="rfoot"><span class="rarea">${esc(r.area)}${r.distance ? ' · ' + esc(r.distance) : ''}</span>
            ${r.isOpen === false ? '<span class="closed">Closed</span>' : ''}</div>
        </div>
      </div>
    </article>`;
  }

  /* ---------------------------------------------------------------- HOME */
  RENDERERS.home = async function () {
    S.tab = 'food';
    const r = await API.listing();
    if (!r.ok) return offlineHome(r);

    const city = (r.city || 'lucknow').replace(/^\w/, (c) => c.toUpperCase());
    const chips = (r.chips || []).slice(0, 18);
    const rests = r.restaurants || [];
    const ms = r.upstreamMs || r.__ms || 0;

    return `${locBar()}
    ${searchEntry()}

    <div class="banner-card" data-act="tab" data-tab="api">
      <div class="bc-icon">${icon('bolt', 20)}</div>
      <div class="bc-text">
        <div class="bc-title">Live catalog · ${city}</div>
        <div class="bc-sub">${rests.length} restaurants · 200 OK · ${ms} ms</div>
      </div>
      <span class="bc-go">Map ${icon('chev', 13)}</span>
    </div>

    <div class="rail" id="chiprail">
      ${chips
        .map(
          (ch, i) => `<button class="chip-c" data-act="search-chip" data-q="${esc(ch.label)}">
        <span class="chip-img">${img(ch.img, ['biryani', 'pizza', 'burger', 'dosa', 'noodles', 'roll', 'dessert', 'kebab'][i % 8], i + 11, '', ch.label)}</span>
        <span class="chip-lb">${esc(ch.label)}</span>
      </button>`
        )
        .join('')}
    </div>

    <div class="pillbar">
      <button class="pill ${S.veg ? 'on' : ''}" data-act="toggle-veg">${icon('leaf', 13)} Pure Veg</button>
      <button class="pill" data-act="noop">${icon('filter', 13)} Filters</button>
      <button class="pill" data-act="noop">${icon('sort', 13)} Sort</button>
      <button class="pill" data-act="noop">Fast Delivery</button>
      <button class="pill" data-act="noop">Offers</button>
    </div>

    ${sectionHead('store', 'Restaurants near ' + esc(here().label), rests.length)}
    <div class="cards">${rests.map(restoCard).join('')}</div>

    <div class="pad-16">
      <button class="btn ghost wide" data-act="tab" data-tab="api">Endpoint map — how this feed is fetched</button>
    </div>
    <div class="foot-note">Live catalog · ${rests.length} open restaurants near ${esc(here().label)} · data straight off the app's own endpoints</div>`;
  };

  function offlineHome(r) {
    const cat = window.CATALOG || { R: [] };
    const why = r && r.error === 'NO_ROUTE'
      ? 'This page was opened as a file, so it has no route to the backend.'
      : 'The edge returned a challenge instead of data.';
    return `${locBar()}
    ${searchEntry()}
    <div class="banner warn">
      <b>Offline catalog.</b> ${esc(why)} The live build runs on the Node proxy (port 3000) which reaches <code>www.swiggy.com</code>. Everything below is local demo data.
      ${r && r.status ? `<div class="banner-code">upstream status: ${r.status}${r.retriedAs ? ' (retried as ' + esc(r.retriedAs) + ')' : ''}</div>` : ''}
    </div>
    <h2 class="sec-title">Demo restaurants</h2>
    <div class="cards">${(cat.R || [])
      .map((x, i) => restoCard({ id: x.id, name: x.name, img: '', offer: x.offer, cuisines: x.cuisines, rating: x.rating, ratingCount: x.ratingCount, etaText: x.time + ' mins', costForTwo: '₹' + x.priceForOne + ' for one', area: x.area, distance: x.distance + ' km', isOpen: true }, i))
      .join('')}</div>`;
  }

  /* ---------------------------------------------------------------- SEARCH */
  RENDERERS.search = async function (params) {
    S.tab = 'search';
    const str = params && params.str ? params.str : '';
    const tab = (params && params.tab) || 'RESTAURANT';
    let results = '';
    if (str) {
      const r = tab === 'DISH' ? await API.search(str, 'DISH') : await API.search(str, 'RESTAURANT');
      results = r.ok ? renderSearchResults(r, tab, str) : `<div class="banner warn">Search failed — ${esc(r.error || 'error')} ${r.status || ''}</div>`;
    }
    return `<div class="searchhead">
      <button class="iconbtn" data-act="back">${icon('back', 20)}</button>
      <div class="searchfield">
        ${icon('search', 17)}
        <input id="q" autocomplete="off" placeholder="Search for restaurants and dishes" value="${esc(str)}">
      </div>
    </div>
    <div id="results">${results || emptySearch()}</div>`;
  };

  function emptySearch() {
    const pop = ['Biryani', 'Pizza', 'Kebabs', 'Chinese', 'Dosa', 'Burger', 'Rolls', 'Cake', 'Momo', 'Paneer'];
    return `<div class="pad-16">
      <div class="muted small">TRY SEARCHING FOR</div>
      <div class="tags">${pop.map((p) => `<button class="tag" data-act="quick-search" data-q="${p}">${p}</button>`).join('')}</div>
      <div class="muted small mt-24">RECENT</div>
      <div class="tags">${['chai', 'shawarma', 'thali'].map((p) => `<button class="tag" data-act="quick-search" data-q="${p}">${p}</button>`).join('')}</div>
    </div>`;
  }

  function renderSearchResults(r, tab, str) {
    const tabs = `<div class="searchtabs">
      <button class="stab ${tab === 'RESTAURANT' ? 'on' : ''}" data-act="search-tab" data-tab="RESTAURANT" data-q="${esc(str)}">Restaurants <span>${r.counts ? r.counts.restaurants : ''}</span></button>
      <button class="stab ${tab === 'DISH' ? 'on' : ''}" data-act="search-tab" data-tab="DISH" data-q="${esc(str)}">Dishes <span>${r.counts ? r.counts.dishes : ''}</span></button>
    </div>`;

    if (tab === 'DISH') {
      const list = (r.dishes || []).filter((d) => !S.veg || d.veg);
      return `${headerLive('/dapi/restaurants/search/v3 · DISH', r, `${list.length} dishes`)}${tabs}
      <div class="dishlist">${list
        .map(
          (d) => `<div class="drow" data-act="open-dish-result" data-rest="${d.restId}" data-dish="${d.id}">
          <div class="drow-l">
            ${vegMark(d.veg)}
            <div class="dname">${esc(d.name)}</div>
            <div class="dprice">${money(d.price)}</div>
            <div class="drest">${esc(d.restName)} · ${esc(d.restArea)}</div>
          </div>
          ${d.img ? `<div class="dthumb">${img(d.img, 'thali', 3, '', d.name)}</div>` : ''}
        </div>`
        )
        .join('')}</div>`;
    }
    const list = (r.restaurants || []).filter((x) => !S.veg || x.veg);
    return `${headerLive('/dapi/restaurants/search/v3 · RESTAURANT', r, `${list.length} restaurants`)}${tabs}
      <div class="cards">${list.map(restoCard).join('')}</div>
      <div class="foot-note">${list.length} live results for “${esc(str)}”</div>`;
  }

  /* ---------------------------------------------------------------- RESTAURANT */
  RENDERERS.resto = async function (params) {
    S.tab = 'food';
    const id = params.id;
    const r = await API.menu(id);
    if (!r.ok) {
      return `<div class="searchhead"><button class="iconbtn" data-act="back">${icon('back', 20)}</button><b>Restaurant</b></div>
        <div class="banner warn">Menu fetch failed — ${esc(r.error || 'error')} ${r.status || ''}${r.retriedAs ? ' · retried as ' + esc(r.retriedAs) : ''}</div>`;
    }
    MENUS[id] = r;
    const rest = r.restaurant || {};
    Object.values(r.menu || []).forEach((c) => c.items.forEach((d) => (DISHES[d.id] = { ...d, restId: id, restName: rest.name })));

    const cats = (r.menu || []).filter((c) => (c.items || []).length);
    const itemsCount = cats.reduce((a, c) => a + c.items.length, 0);

    return `<div class="resto-hero">
      ${img(rest.img, 'thali', 7, 'heroimg', rest.name)}
      <div class="hero-grad"></div>
      <button class="hero-btn back" data-act="back">${icon('back', 20)}</button>
      <button class="hero-btn share" data-act="toast" data-msg="Link copied">${icon('share', 18)}</button>
    </div>

    <div class="resto-head">
      <h1>${esc(rest.name)}</h1>
      <div class="rcuis">${esc((rest.cuisines || []).join(', '))}</div>
      <div class="resto-meta">
        <span>${esc(rest.area)}${rest.distance ? ' · ' + esc(rest.distance) : ''}</span>
      </div>
      <div class="resto-badges">
        <div class="rbadge"><div class="rb-top">${starSolid(11)} ${rest.rating ? Number(rest.rating).toFixed(1) : '—'}</div><div class="rb-bot">${esc(rest.ratingCount || '')}</div></div>
        <div class="rbadge"><div class="rb-top">${esc(fmtEta(rest))}</div><div class="rb-bot">Delivery</div></div>
        <div class="rbadge"><div class="rb-top">${esc(rest.costForTwo || '—')}</div><div class="rb-bot">Cost for two</div></div>
      </div>
      ${headerLive('/mapi/menu/pl', r, `${cats.length} sections · ${itemsCount} items`)}
    </div>

    ${(r.offers || []).length ? `<div class="offers">${r.offers.slice(0, 3).map((o) => `<div class="offer-row">${icon('tag', 16)}<div><b>${esc(o.header || o.code || 'Offer')}</b>${o.desc ? `<span>${esc(o.desc)}</span>` : ''}</div></div>`).join('')}</div>` : ''}

    <div class="vegbar">
      <span>Veg mode</span>
      <button class="vegsw ${S.veg ? 'on' : ''}" data-act="toggle-veg"> <span class="vegsw-track"><i></i></span></button>
    </div>

    <div class="menu-wrap">
      <aside class="cat-rail" id="catrail">
        ${cats.map((c, i) => `<button class="catb ${i === 0 ? 'on' : ''}" data-cat="c${i}">${esc(c.title)}<span>${c.items.length}</span></button>`).join('')}
      </aside>
      <div class="menu-list" id="menulist">
        ${cats
          .map(
            (c, i) => `<section class="mcat" id="c${i}">
          <h2 class="mcat-t">${esc(c.title)} <span>${c.items.length}</span></h2>
          ${(c.items || [])
            .filter((d) => !S.veg || d.veg)
            .map((d) => menuRow(d, rest))
            .join('')}
        </section>`
          )
          .join('')}
      </div>
    </div>
    <div class="foot-note">Menu served by ${esc(rest.name)} · ${itemsCount} items · prices as listed in the app's own catalog</div>`;
  };

  function menuRow(d, rest) {
    const hasChoices = (d.variants && d.variants.length) || (d.addons && d.addons.length);
    const key = C.cartKey(d.id, '', []);
    const qty = qtyOf(key);
    const stepper = `<div class="addwrap">
      ${qty > 0 && !hasChoices
        ? `<div class="stepper"><button data-act="dec" data-key="${key}">−</button><b>${qty}</b><button data-act="inc" data-key="${key}">+</button></div>`
        : `<button class="addbtn ${hasChoices ? 'custom' : ''}" data-act="${hasChoices ? 'open-dish' : 'add'}" data-dish="${d.id}">ADD</button>`}
      ${hasChoices ? '<div class="customise">customisable</div>' : ''}
    </div>`;

    return `<div class="mrow ${d.inStock === false ? 'oos' : ''}">
      <div class="mrow-l">
        ${d.bestseller ? `<div class="bs">${starSolid(8)} Bestseller</div>` : ''}
        <div class="mname">${vegMark(d.veg)}<span>${esc(d.name)}</span></div>
        <div class="mprice">${money(d.price)}</div>
        ${d.rating ? `<div class="mrate">${starSolid(8)} ${d.rating}${d.ratingCount ? ` <em>(${esc(d.ratingCount)})</em>` : ''}</div>` : ''}
        <div class="mdesc">${esc((d.desc || '').slice(0, 110))}</div>
      </div>
      <div class="mrow-r">
        ${d.img ? `<div class="mthumb">${img(d.img, 'thali', Number(d.id) % 9 + 1, '', d.name)}</div>` : `<div class="mthumb empty">${starSolid(1)}</div>`}
        ${stepper}
      </div>
    </div>`;
  }

  /* ---------------------------------------------------------------- CART */
  RENDERERS.cart = async function () {
    S.tab = 'cart';
    const cart = S.cart;
    if (!cart || !cartCount()) {
      return `<div class="searchhead"><button class="iconbtn" data-act="back">${icon('back', 20)}</button><b>Cart</b></div>
      <div class="empty">
        <div class="empty-art">${img('', 'roll', 4, '', 'empty')}</div>
        <h3>Your cart is empty</h3>
        <p>Good food is a scroll away.</p>
        <button class="btn solid" data-act="tab" data-tab="food">Browse restaurants</button>
      </div>`;
    }
    const b = bill();
    const items = cartItems();
    return `<div class="searchhead"><button class="iconbtn" data-act="back">${icon('back', 20)}</button><b>Cart</b></div>
    <div class="cart-resto">
      <div class="cr-thumb">${img(cart.img, 'thali', 6, '', cart.restName)}</div>
      <div><div class="cr-name">${esc(cart.restName)}</div><div class="cr-eta">${icon('clock', 12)} Delivering in ${esc((cart.restEta || '30 mins').toLowerCase())}</div></div>
    </div>

    <div class="cart-items">
      ${items
        .map(
          (i) => `<div class="crow">
        ${vegMark(i.veg)}
        <div class="cr-main">
          <div class="cr-i-name">${esc(i.name)}</div>
          ${i.variantName ? `<div class="cr-var">${esc(i.variantName)}</div>` : ''}
          ${i.addonNames && i.addonNames.length ? `<div class="cr-var">+ ${esc(i.addonNames.join(', '))}</div>` : ''}
        </div>
        <div class="stepper sm"><button data-act="dec" data-key="${i.key}">−</button><b>${i.qty}</b><button data-act="inc" data-key="${i.key}">+</button></div>
        <div class="cr-price">${money(i.price * i.qty)}</div>
      </div>`
        )
        .join('')}
    </div>

    <button class="addmore" data-act="open-resto" data-id="${cart.restId}">${icon('plus', 14)} Add more items</button>

    <div class="coupon-row">
      ${icon('tag', 16)}
      <div class="cp-l"><b>${S.coupon ? S.coupon + ' applied' : 'Apply coupon'}</b><span>${S.coupon ? COUPONS[S.coupon].label : 'Save more on this order'}</span></div>
      <button class="linkbtn" data-act="open-coupons">${S.coupon ? 'Change' : 'Apply'}</button>
    </div>

    <div class="bill">
      <h3>Bill details</h3>
      <div class="bl"><span>Item total</span><b>${money(b.items)}</b></div>
      <div class="bl"><span>Delivery fee ${b.delivery === 0 ? '<em class="free">FREE</em>' : ''}</span><b>${b.delivery === 0 ? '₹0' : money(b.delivery)}</b></div>
      <div class="bl"><span>Platform fee</span><b>${money(b.platform)}</b></div>
      <div class="bl"><span>GST & restaurant charges</span><b>${money(b.gst)}</b></div>
      ${b.discount ? `<div class="bl disc"><span>Coupon ${esc(S.coupon)}</span><b>− ${money(b.discount)}</b></div>` : ''}
      <div class="bl tot"><span>To Pay</span><b>${money(b.total)}</b></div>
      <div class="bill-note">Fees modelled locally — the fee service sits behind the authed tier.</div>
    </div>

    <div class="stickybar">
      <div class="sb-l"><b>${money(b.total)}</b><span>TOTAL</span></div>
      <button class="sb-btn" data-act="go-checkout">Proceed to checkout ${icon('chev', 16)}</button>
    </div>
    <div class="sticky-pad"></div>`;
  };

  /* ---------------------------------------------------------------- CHECKOUT */
  RENDERERS.checkout = async function () {
    S.tab = 'cart';
    if (!S.cart) return RENDERERS.cart();
    const b = bill();
    const pays = [
      ['upi', 'UPI', 'Google Pay, PhonePe, Paytm'],
      ['card', 'Credit / Debit card', 'Visa, Mastercard, RuPay'],
      ['wallet', 'Wallets', 'Swiggy Money, Amazon Pay'],
      ['cod', 'Cash on delivery', 'Pay the rider'],
    ];
    return `<div class="searchhead"><button class="iconbtn" data-act="back">${icon('back', 20)}</button><b>Checkout</b></div>
    <div class="co-block">
      <div class="co-h">${icon('pin', 16)} Deliver to</div>
      <div class="co-addr"><b>${esc(S.addr.split(',')[0])}</b><span>${esc(S.addr)}</span></div>
      <button class="linkbtn" data-act="pick-loc">Change</button>
    </div>

    <div class="co-block">
      <div class="co-h">${icon('clock', 16)} Delivery instructions</div>
      <div class="tags">${['Leave at door', 'Avoid calling', 'Meet at gate'].map((t) => `<button class="tag" data-act="toast" data-msg="${t} noted">${t}</button>`).join('')}</div>
    </div>

    <div class="co-block">
      <div class="co-h">Tip the delivery partner</div>
      <div class="tips">${[0, 10, 20, 30].map((t) => `<button class="tag ${S.tip === t ? 'on' : ''}" data-act="set-tip" data-t="${t}">${t === 0 ? 'None' : '₹' + t}</button>`).join('')}</div>
    </div>

    <div class="co-block">
      <div class="co-h">Payment method</div>
      ${pays
        .map(
          ([id, name, sub]) => `<button class="payrow ${S.pay === id ? 'on' : ''}" data-act="set-pay" data-p="${id}">
        <span class="radio"></span><div><b>${name}</b><span>${sub}</span></div>
      </button>`
        )
        .join('')}
    </div>

    <div class="bill">
      <h3>Bill summary</h3>
      <div class="bl"><span>Item total</span><b>${money(b.items)}</b></div>
      <div class="bl"><span>Delivery + platform + GST</span><b>${money(b.delivery + b.platform + b.gst)}</b></div>
      ${b.tip ? `<div class="bl"><span>Delivery partner tip</span><b>${money(b.tip)}</b></div>` : ''}
      ${b.discount ? `<div class="bl disc"><span>Coupon ${esc(S.coupon)}</span><b>− ${money(b.discount)}</b></div>` : ''}
      <div class="bl tot"><span>To Pay</span><b>${money(b.total)}</b></div>
    </div>

    <div class="stickybar">
      <div class="sb-l"><b>${money(b.total)}</b><span>TOTAL</span></div>
      <button class="sb-btn" data-act="place-order">Place order</button>
    </div>
    <div class="sticky-pad"></div>`;
  };

  /* ---------------------------------------------------------------- TRACK */
  RENDERERS.track = async function (params) {
    S.tab = 'orders';
    const o = S.orders.find((x) => x.id === params.id) || S.orders[0];
    if (!o) return `<div class="pad-24"><p>No order found.</p></div>`;
    const elapsed = (Date.now() - o.placedAt) / 1000;
    const steps = [
      ['Order placed', 0, 'We sent your order to the restaurant'],
      ['Restaurant accepted', 6, 'Kitchen has started on it'],
      ['Preparing your food', 14, o.restName + ' is cooking'],
      ['Rider picked up', 34, 'Rider is on the way'],
      ['Delivered', 52, 'Enjoy your meal'],
    ];
    let active = 0;
    steps.forEach((s, i) => (elapsed >= s[1] ? (active = i) : null));
    const done = active === steps.length - 1;
    const etaMin = Math.max(0, Math.ceil((52 - elapsed) * 0.6));

    return `<div class="track-hero">
      <div class="tr-map">${mapArt(elapsed, done)}</div>
      <div class="tr-top">${done ? 'Delivered' : 'Arriving in ' + etaMin + ' min'}</div>
      <div class="tr-sub">Order #${esc(o.id)} · ${esc(o.restName)}</div>
    </div>
    <div class="tr-steps">
      ${steps
        .map(
          (s, i) => `<div class="step ${i <= active ? 'done' : ''} ${i === active ? 'now' : ''}">
        <span class="step-dot">${i < active || done ? icon('check', 12) : ''}</span>
        <div><b>${s[0]}</b><span>${esc(s[2])}</span></div>
        ${i === active && !done ? '<em class="pulse"></em>' : ''}
      </div>`
        )
        .join('')}
    </div>
    <div class="tr-card">
      <div class="tr-rider">${icon('bike', 18)} <b>${esc(o.rider || 'Ravi K.')}</b><span>Your delivery partner</span></div>
      <button class="btn ghost" data-act="toast" data-msg="Calling is mocked in this build">Call</button>
    </div>
    <div class="bill">
      <h3>Order summary</h3>
      ${o.items.map((i) => `<div class="bl"><span>${i.qty} × ${esc(i.name)}</span><b>${money(i.price * i.qty)}</b></div>`).join('')}
      <div class="bl tot"><span>Paid</span><b>${money(o.total)}</b></div>
      <div class="bl"><span>Payment</span><b>${esc(o.pay.toUpperCase())}</b></div>
    </div>
    <div class="pad-16"><button class="btn solid wide" data-act="tab" data-tab="food">Order something else</button></div>`;
  };

  function mapArt(elapsed, done) {
    const t = Math.min(1, elapsed / 52);
    const x = 40 + t * 246;
    const y = 122 - Math.sin(t * Math.PI) * 60;
    return `<svg viewBox="0 0 340 220" class="mapsvg">
      <rect width="340" height="220" fill="var(--map-ground)"/>
      <path d="M0 170 H340 M0 96 H340 M84 0 V220 M232 0 V220" stroke="var(--map-line)" stroke-width="14"/>
      <path d="M0 170 H340 M0 96 H340 M84 0 V220 M232 0 V220" stroke="var(--map-road)" stroke-width="9"/>
      <rect x="18" y="24" width="48" height="52" rx="4" fill="var(--map-block)"/>
      <rect x="104" y="16" width="100" height="62" rx="4" fill="var(--map-block)"/>
      <rect x="252" y="22" width="66" height="54" rx="4" fill="var(--map-block)"/>
      <rect x="20" y="120" width="46" height="36" rx="4" fill="var(--map-block)"/>
      <rect x="250" y="118" width="70" height="40" rx="4" fill="var(--map-block)"/>
      <path d="M40 122 Q150 26 286 62" stroke="#38bdf8" stroke-width="4" fill="none" stroke-dasharray="7 7" opacity=".85"/>
      <circle cx="40" cy="122" r="10" fill="#fff" stroke="#10b981" stroke-width="3"/>
      <circle cx="286" cy="62" r="10" fill="#fff" stroke="#38bdf8" stroke-width="3"/>
      <g transform="translate(${x} ${y})">
        <circle r="16" fill="#fff" stroke="#38bdf8" stroke-width="3"/>
        <g transform="translate(-9 -7) scale(0.78)" fill="none" stroke="#0284c7" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/>
          <path d="M5.5 16.5L9 8h6l3.5 8.5"/><path d="M9 8h4"/>
        </g>
      </g>
    </svg>`;
  }

  /* ---------------------------------------------------------------- API CONSOLE */
  RENDERERS.api = async function () {
    S.tab = 'api';
    const r = await API.map();
    const map = (r && r.map) || [];
    const tone = (t) => (t === 'public' ? 'ok' : t === 'blocked' ? 'bad' : 'warn');
    return `<div class="apihead">
      <h1>Endpoint map</h1>
      <p>Every route below was found by probing the app's own network surface, then verified from this box. Run any of them.</p>
    </div>
    <div class="apilist">
      ${map
        .map(
          (e, i) => `<div class="apirow">
        <div class="api-top">
          <span class="method">${e.method}</span>
          <code>${esc(e.path)}</code>
          <span class="tier ${tone(e.tier)}">${e.status}</span>
        </div>
        <div class="api-note">${esc(e.note)}</div>
        <div class="api-q"><b>query</b> ${esc(e.q)}</div>
        <div class="api-h"><b>headers</b> ${esc(e.headers.join(' · ') || 'none')}</div>
        <div class="api-run">
          <button class="mini" data-act="probe" data-path="${esc(e.path.split(',')[0].trim())}">Run live probe</button>
          <span class="probe-out" id="probe-${i}"></span>
        </div>
      </div>`
        )
        .join('')}
    </div>
    <div class="foot-note">Blocked rows are Akamai edge challenges (202, empty body) or the auth tier. Nothing here is scraped from a browser session — it's the same JSON the Android app receives.</div>`;
  };

  /* ---------------------------------------------------------------- INSTAMART / DINEOUT */
  RENDERERS.instamart = async function () {
    S.tab = 'instamart';
    return `<div class="apihead">
      <h1>Instamart</h1>
      <p>Vertical shares the same edge. This route answers <code>202</code> — an Akamai sensor challenge with an empty body — from any client that hasn't cleared it.</p>
    </div>
    <div class="probecard" id="im-probe">
      <code>GET /api/instamart/home?pageType=EXPLORE&amp;lat=${here().lat}&amp;lng=${here().lng}</code>
      <button class="mini" data-act="probe" data-path="/api/instamart/home?pageType=EXPLORE&lat=${here().lat}&lng=${here().lng}" data-target="im">Run probe</button>
      <span class="probe-out" id="probe-im"></span>
    </div>
    <div class="banner">
      <b>What it would take:</b> a browser/WebView session that executes the sensor script and mints valid <code>_abck</code> / <code>bm_sz</code> cookies, or the app's own attested device headers. The food vertical doesn't need it — its routes pass on <code>UA</code> + <code>__fetch_request: 1</code> alone.
    </div>
    <div class="foot-note">Grocery UI is deliberately not faked. The Food tab is real data end-to-end.</div>`;
  };

  RENDERERS.dineout = async function () {
    S.tab = 'dineout';
    return `<div class="apihead">
      <h1>Dineout</h1>
      <p>Dineout lives on a separate path space. Both guesses below returned <code>404</code> from the edge, so the real prefix is still unknown.</p>
    </div>
    <div class="probecard">
      <code>GET /mapi/dineout/v2/home · /dapi/dineout/v2/home</code>
      <button class="mini" data-act="probe" data-path="/dapi/dineout/v2/home?lat=${here().lat}&lng=${here().lng}" data-target="dn">Run probe</button>
      <span class="probe-out" id="probe-dn"></span>
    </div>
    <div class="banner"><b>Next step:</b> pull the Dineout tab out of an APK's JS bundle (React Native ships readable route strings) or catch it with a MITM proxy on a rooted device.</div>`;
  };

  /* ---------------------------------------------------------------- AUTH */
  RENDERERS.auth = async function () {
    const a = S.auth;
    const step = a.step;
    const secsLeft = Math.max(0, Math.ceil((a.resendAt - Date.now()) / 1000));

    const header = `<div class="authbar">
      <button class="iconbtn" data-act="auth-back">${icon('back', 20)}</button>
      <b>${step === 'otp' ? 'Verify number' : 'Sign in'}</b>
    </div>`;

    if (step === 'phone') {
      return `${header}
      <div class="auth-wrap">
        <div class="auth-card">
          <div class="auth-icon">${icon('user', 26)}</div>
          <h1>Sign in with your number</h1>
          <p>We send a 6-digit code to the number you own. No passwords, nothing stored on the device.</p>
          <label class="field-label">Mobile number</label>
          <div class="phone-field">
            <span class="pf-cc">+91</span>
            <input id="phone" type="tel" inputmode="numeric" maxlength="10" placeholder="98765 43210"
              value="${esc(a.phone || '')}" autocomplete="tel-national">
          </div>
          <button class="btn solid wide auth-cta" data-act="otp-send" id="otpSendBtn">Send OTP</button>
          <div class="auth-foot">
            <span class="lockline">${icon('check', 12)} Code hashed at rest · 5 min life · single use</span>
          </div>
        </div>
      </div>`;
    }

    return `${header}
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-icon">${icon('check', 26)}</div>
        <h1>Enter the code</h1>
        <p>Sent to <b>+91 ${esc(a.phone || '')}</b>. It expires in ${Math.ceil((a.expiresAt - Date.now()) / 1000) > 0 ? Math.ceil((a.expiresAt - Date.now()) / 60000) : 0} min.</p>
        ${a.devCode ? `<div class="dev-chip">${icon('bolt', 12)} Dev mode · code <b>${esc(a.devCode)}</b> (no SMS configured)</div>` : ''}
        <div class="otp-row" id="otprow">
          ${[0, 1, 2, 3, 4, 5].map((i) => `<input class="otpbox" data-i="${i}" inputmode="numeric" maxlength="1" autocomplete="${i === 0 ? 'one-time-code' : 'off'}">`).join('')}
        </div>
        <div class="auth-error" id="otpErr"></div>
        <button class="btn solid wide auth-cta" data-act="otp-verify">Verify &amp; sign in</button>
        <div class="auth-foot">
          <button class="linkbtn" data-act="otp-resend" ${secsLeft > 0 ? 'disabled' : ''}>
            ${secsLeft > 0 ? `Resend in ${secsLeft}s` : 'Resend code'}
          </button>
          <button class="linkbtn" data-act="auth-change">Change number</button>
        </div>
      </div>
    </div>`;
  };

  /* ---------------------------------------------------------------- ACCOUNT */
  RENDERERS.account = async function () {
    S.tab = 'orders';
    const u = S.user;
    const profile = u
      ? `<div class="acct-top">
          <div class="av-btn big signed">${icon('user', 24)}</div>
          <div style="flex:1;min-width:0">
            <h2>+91 ${esc(u.masked.replace('+91 ', ''))}</h2>
            <span>Signed in${u.logins ? ` · ${u.logins} login${u.logins > 1 ? 's' : ''}` : ''}</span>
          </div>
          <button class="mini ghost" data-act="sign-out">Sign out</button>
        </div>`
      : `<div class="acct-top">
          <div class="av-btn big">${icon('user', 24)}</div>
          <div style="flex:1;min-width:0">
            <h2>Guest</h2>
            <span>Sign in with your number to keep orders</span>
          </div>
        </div>
        <div class="pad-16" style="padding-top:0">
          <button class="btn solid wide" data-act="go-auth">Sign in with OTP</button>
        </div>`;

    return `${appBar()}
    ${profile}
    ${sectionHead('wallet', 'Account', undefined)}
    <div class="acct-list">
      <div class="arow">${icon('order', 17)}<div><b>Orders</b><span>${S.orders.length} in this session</span></div></div>
      <div class="arow">${icon('pin', 17)}<div><b>Address</b><span>${esc(S.addr)}</span></div></div>
      <div class="arow">${icon('one', 17)}<div><b>Swiggy One</b><span>Not a member</span></div></div>
      <div class="arow">${icon('help', 17)}<div><b>Help</b><span>Support is mocked</span></div></div>
    </div>
    ${
      S.orders.length
        ? `${sectionHead('clock', 'Recent orders', S.orders.length)}
          <div class="acct-list">${S.orders
            .map(
              (o) => `<button class="orow" data-act="open-track" data-id="${o.id}">
          <div><b>${esc(o.restName)}</b><span>#${esc(o.id)} · ${o.items.length} items · ${money(o.total)} · ${timeAgo(o.placedAt)}</span></div>
          <span class="chev">${icon('chev', 16)}</span></button>`
            )
            .join('')}</div>`
        : `<div class="empty"><div class="empty-art">${icon('clock', 30)}</div><h3>No orders yet</h3><p>Place one and it lands here with a live timeline.</p><button class="btn solid" data-act="tab" data-tab="food">Browse restaurants</button></div>`
    }`;
  };

  /* ---------------------------------------------------------------- ACTIONS */
  const A = {
    back: () => back(),
    noop: () => toast('Filters are decorative in this build'),

    tab: (el) => {
      const t = el.dataset.tab;
      const target = { food: 'home', api: 'api', search: 'search', cart: 'cart', orders: 'account', instamart: 'instamart', dineout: 'dineout' }[t];
      reset(target, t === 'search' ? {} : {});
    },
    'toggle-theme': () => {
      S.theme = S.theme === 'dark' ? 'light' : 'dark';
      save();
      C.applyTheme();
      C.render();
    },

    'go-search': () => go('search', {}),
    'quick-search': (el) => {
      const q = el.dataset.q;
      const inp = $('#q');
      if (inp) inp.value = q;
      runSearch(q, 'RESTAURANT');
    },
    'search-chip': (el) => go('search', { str: el.dataset.q }),
    'search-tab': (el) => go('search', { str: el.dataset.q, tab: el.dataset.tab }),

    'open-resto': (el) => go('resto', { id: el.dataset.id }),
    'open-dish': (el) => openDishSheet(el.dataset.dish),
    'open-dish-result': async (el) => {
      const restId = el.dataset.rest;
      if (!MENUS[restId]) {
        const r = await API.menu(restId);
        if (!r.ok) return toast('Menu fetch blocked');
        MENUS[restId] = r;
        Object.values(r.menu || []).forEach((c) => c.items.forEach((d) => (DISHES[d.id] = { ...d, restId, restName: r.restaurant.name })));
      }
      if (!DISHES[el.dataset.dish]) return toast('Dish not in this menu');
      openDishSheet(el.dataset.dish);
    },

    add: (el) => {
      const d = DISHES[el.dataset.dish];
      if (!d) return toast('Item unavailable');
      const m = MENUS[d.restId] || {};
      addToCart(m.restaurant || { id: d.restId, name: d.restName }, d, { unitPrice: d.price });
      C.render();
    },
    inc: (el) => {
      const k = el.dataset.key;
      setQty(k, qtyOf(k) + 1);
      C.render();
    },
    dec: (el) => {
      const k = el.dataset.key;
      setQty(k, qtyOf(k) - 1);
      C.render();
    },

    'toggle-veg': () => {
      S.veg = !S.veg;
      save();
      C.render();
    },

    'go-cart': () => go('cart', {}),
    'go-checkout': () => go('checkout', {}),
    'open-coupons': () => openCouponSheet(),
    'apply-coupon': (el) => {
      const code = el.dataset.code;
      const ok = couponEligible(code);
      if (!ok.ok) return toast(ok.why);
      S.coupon = code;
      save();
      closeSheet();
      toast(code + ' applied');
      C.render();
    },
    'clear-coupon': () => {
      S.coupon = null;
      save();
      closeSheet();
      C.render();
    },
    'set-tip': (el) => {
      S.tip = Number(el.dataset.t);
      C.render();
    },
    'set-pay': (el) => {
      S.pay = el.dataset.p;
      C.render();
    },

    'place-order': () => {
      const b = bill();
      const order = {
        id: 'SW' + Math.floor(100000 + Math.random() * 899999),
        restName: S.cart.restName,
        items: cartItems().map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
        total: b.total,
        pay: S.pay,
        placedAt: Date.now(),
        rider: 'Ravi K.',
      };
      S.orders.unshift(order);
      S.cart = null;
      S.coupon = null;
      S.tip = 0;
      save();
      reset('track', { id: order.id });
      startTicker();
    },
    'open-track': (el) => go('track', { id: el.dataset.id }),
    'go-account': () => go('account', {}),

    /* ---- auth ---- */
    'go-auth': () => {
      S.auth = { step: 'phone', requestId: null, devCode: null, phone: S.auth.phone || '', resendAt: 0 };
      go('auth', {});
    },
    'auth-back': () => back(),
    'auth-change': () => {
      S.auth.step = 'phone';
      C.render();
    },
    'otp-send': async () => {
      const el = $('#phone');
      const phone = (el && el.value ? el.value : '').replace(/\D/g, '');
      if (phone.length !== 10) return toast('Enter a 10-digit mobile number');
      const btn = $('#otpSendBtn');
      if (btn) btn.textContent = 'Sending…';
      const r = await API.requestOtp(phone);
      if (!r.ok) {
        if (btn) btn.textContent = 'Send OTP';
        return toast(r.message || 'Could not send the code');
      }
      S.auth = {
        step: 'otp',
        requestId: r.requestId,
        phone: r.phone,
        devCode: r.devCode || null,
        expiresAt: Date.now() + (r.expiresIn || 300) * 1000,
        resendAt: Date.now() + (r.resendAfter || 30) * 1000,
      };
      C.render();
      setTimeout(() => {
        const first = $('.otpbox');
        if (first) first.focus();
      }, 60);
    },
    'otp-resend': async () => {
      if (S.auth.resendAt > Date.now()) return;
      const r = await API.requestOtp(S.auth.phone);
      if (!r.ok) return toast(r.message || 'Could not resend');
      S.auth.requestId = r.requestId;
      S.auth.devCode = r.devCode || null;
      S.auth.expiresAt = Date.now() + (r.expiresIn || 300) * 1000;
      S.auth.resendAt = Date.now() + (r.resendAfter || 30) * 1000;
      toast('New code sent');
      C.render();
    },
    'otp-verify': async () => {
      const code = $$('.otpbox').map((i) => i.value).join('');
      const err = $('#otpErr');
      if (code.length !== 6) {
        if (err) err.textContent = 'Enter all six digits.';
        return;
      }
      const r = await API.verifyOtp(S.auth.requestId, code);
      if (!r.ok) {
        if (err) err.textContent = r.message || 'That code is not right.';
        $$('.otpbox').forEach((i) => (i.value = ''));
        const first = $('.otpbox');
        if (first) first.focus();
        return;
      }
      S.user = r.user;
      S.auth = { step: 'phone', requestId: null, devCode: null, phone: '', resendAt: 0 };
      toast('Signed in as +91 ' + r.user.phone);
      reset('account');
    },
    'sign-out': async () => {
      await API.logout();
      S.user = null;
      toast('Signed out');
      C.render();
    },

    'pick-loc': () => {
      const keys = Object.keys(C.LOC);
      sheet(`<div class="sheet-head"><h3>Delivery location</h3><button class="iconbtn" data-act="sheet-close">${icon('close', 18)}</button></div>
        ${keys
          .map(
            (k) => `<button class="locrow ${S.loc === k ? 'on' : ''}" data-act="set-loc" data-k="${k}">
          ${icon('pin', 16)}<div><b>${C.LOC[k].label}</b><span>${C.LOC[k].lat.toFixed(4)}, ${C.LOC[k].lng.toFixed(4)}</span></div>
          ${S.loc === k ? icon('check', 16) : ''}</button>`
          )
          .join('')}
        <div class="sheet-note">Changing location re-queries <code>lat/lng</code> against the live listing endpoint.</div>`);
    },
    'set-loc': (el) => {
      S.loc = el.dataset.k;
      S.addr = S.addr.replace(/^[^,]+/, 'B-42');
      save();
      closeSheet();
      toast('Delivering to ' + C.LOC[S.loc].label);
      reset('home');
    },

    'sheet-close': () => closeSheet(),
    toast: (el) => toast(el.dataset.msg || ''),

    probe: async (el) => {
      const target = el.dataset.target;
      const outId = target ? '#probe-' + target : el.parentElement.querySelector('.probe-out');
      const out = typeof outId === 'string' ? $(outId) : outId;
      if (out) out.innerHTML = '<i class="spin"></i>';
      const r = await API.raw(el.dataset.path);
      const cls = r.ok ? 'ok' : 'bad';
      if (out) out.innerHTML = `<span class="pv ${cls}">${r.status} · ${r.bytes || 0} bytes · ${r.ms} ms</span>`;
    },

    'cart-reset-add': (el) => {
      S.cart = null;
      S.coupon = null;
      save();
      closeSheet();
      const d = DISHES[el.dataset.dish];
      const m = MENUS[d.restId] || {};
      addToCart(m.restaurant || { id: d.restId, name: d.restName }, d, { unitPrice: d.price });
      C.render();
    },
  };

  /* ---------------------------------------------------------------- sheets */
  let SHEET = null;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-opt]');
    if (!b || !SHEET) return;
    const { state, paint, native } = SHEET;
    if (b.dataset.opt === 'v') {
      state.variant = native[0].variations.find((v) => v.id === b.dataset.id);
      paint();
    } else if (b.dataset.opt === 'a') {
      const id = b.dataset.id;
      const idx = state.addons.findIndex((a) => a.id === id);
      if (idx >= 0) state.addons.splice(idx, 1);
      else state.addons.push({ id, name: b.dataset.name, price: Number(b.dataset.price) });
      paint();
    }
  });

  function openDishSheet(dishId) {
    const d = DISHES[dishId];
    if (!d) return;
    const m = MENUS[d.restId] || {};
    const rest = m.restaurant || { id: d.restId, name: d.restName };
    const vg = d.variants && d.variants[0];
    const native = vg ? d.variants : [];
    const state = { variant: null, addons: [] };
    if (vg) {
      const def = vg.variations.find((v) => v.isDefault) || vg.variations[0];
      state.variant = def;
      state.variantGroup = vg;
    }
    const unit = () =>
      d.price + (state.variant ? state.variant.delta : 0) + state.addons.reduce((a, c) => a + c.price, 0);

    const paint = () => {
      sheet(`<div class="sheet-head">
        <div>${vegMark(d.veg)}<h3>${esc(d.name)}</h3></div>
        <button class="iconbtn" data-act="sheet-close">${icon('close', 18)}</button>
      </div>
      <div class="sheet-body">
        <div class="sh-price">${money(d.price)}${d.rating ? ` · ${starSolid(9)} ${d.rating}` : ''}</div>
        <p class="sh-desc">${esc(d.desc || '')}</p>
        ${native.length
          ? native
              .map(
                (g) => `<div class="optgroup"><div class="opt-h">${esc(g.name)} <em>select any 1</em></div>
            ${g.variations
              .map(
                (v) => `<button class="opt ${state.variant && state.variant.id === v.id ? 'on' : ''}" data-opt="v" data-id="${v.id}">
              <span class="radio"></span><span>${esc(v.name)}</span>
              <span class="opt-p">${v.delta ? '+ ' + money(v.delta) : 'included'}</span></button>`
              )
              .join('')}</div>`
              )
              .join('')
          : ''}
        ${(d.addons || [])
          .map(
            (g) => `<div class="optgroup"><div class="opt-h">${esc(g.name)} <em>optional</em></div>
          ${g.choices
            .slice(0, 6)
            .map(
              (c) => `<button class="opt ${state.addons.some((a) => a.id === c.id) ? 'on' : ''}" data-opt="a" data-id="${c.id}" data-price="${c.price}" data-name="${esc(c.name)}">
            <span class="radio sq"></span><span>${esc(c.name)}</span><span class="opt-p">+ ${money(c.price)}</span></button>`
            )
            .join('')}</div>`
          )
          .join('')}
      </div>
      <div class="sheet-foot">
        <div class="stepline"><button data-act="noop">−</button><b>1</b><button data-act="noop">+</button></div>
        <button class="btn solid grow" data-act="sheet-add" data-dish="${d.id}">Add · ${money(unit())}</button>
      </div>`);
    };

    SHEET = { state, paint, native };

    A['sheet-add'] = (el) => {
      const dd = DISHES[el.dataset.dish];
      const addonIds = state.addons.map((a) => a.id);
      addToCart(rest, dd, {
        variantId: state.variant ? state.variant.id : '',
        variantName: state.variant ? `${state.variantGroup.name}: ${state.variant.name}` : '',
        addonIds,
        addonNames: state.addons.map((a) => a.name),
        unitPrice: unit(),
      });
      closeSheet();
      SHEET = null;
      toast('Added to cart');
      C.render();
    };

    paint();
  }

  function openCouponSheet() {
    const b = bill();
    sheet(`<div class="sheet-head"><h3>Coupons</h3><button class="iconbtn" data-act="sheet-close">${icon('close', 18)}</button></div>
      <div class="sheet-body">
      ${Object.keys(COUPONS)
        .map((code) => {
          const ok = itemTotal() >= (COUPONS[code].min || 0);
          return `<button class="coupon ${ok ? '' : 'dim'} ${S.coupon === code ? 'on' : ''}" data-act="apply-coupon" data-code="${code}">
          <div class="cpc"><b>${COUPONS[code].label}</b><span>${code} · min order ${money(COUPONS[code].min || 0)}</span></div>
          <span class="cp-act">${S.coupon === code ? 'Applied' : ok ? 'Apply' : 'Add more'}</span>
        </button>`;
        })
        .join('')}
      ${S.coupon ? `<button class="btn ghost wide" data-act="clear-coupon">Remove ${esc(S.coupon)}</button>` : ''}
      </div>`);
  }

  /* ---------------------------------------------------------------- search wiring */
  async function runSearch(str, tab) {
    const box = $('#results');
    if (!box) return;
    box.innerHTML = `<div class="pad-16"><i class="spin big"></i></div>`;
    const r = await API.search(str, tab);
    if (!r.ok) {
      box.innerHTML = `<div class="banner warn">Search failed — ${esc(r.error || 'error')} ${r.status || ''}</div>`;
      return;
    }
    box.innerHTML = renderSearchResults(r, tab, str);
  }

  /* OTP boxes: digits only, auto-advance, backspace walks back, paste fills the row */
  document.addEventListener('input', (e) => {
    const box = e.target.closest('.otpbox');
    if (box) {
      const v = box.value.replace(/\D/g, '').slice(-1);
      box.value = v;
      box.classList.toggle('filled', !!v);
      const boxes = Array.from(document.querySelectorAll('.otpbox'));
      const i = boxes.indexOf(box);
      if (v && i < boxes.length - 1) boxes[i + 1].focus();
      const err = document.getElementById('otpErr');
      if (err) err.textContent = '';
      return;
    }
    const inp = e.target.closest('#q');
    if (!inp) return;
    const v = inp.value.trim();
    clearTimeout(inp._t);
    if (!v) {
      const box = $('#results');
      if (box) box.innerHTML = emptySearch();
      return;
    }
    inp._t = setTimeout(() => runSearch(v, 'RESTAURANT'), 420);
  });

  /* ---------------------------------------------------------------- delegated clicks */
  document.addEventListener('keydown', (e) => {
    const box = e.target.closest && e.target.closest('.otpbox');
    if (!box) return;
    const boxes = Array.from(document.querySelectorAll('.otpbox'));
    const i = boxes.indexOf(box);
    if (e.key === 'Backspace' && !box.value && i > 0) {
      boxes[i - 1].focus();
      boxes[i - 1].value = '';
      boxes[i - 1].classList.remove('filled');
    }
    if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
    if (e.key === 'ArrowRight' && i < boxes.length - 1) boxes[i + 1].focus();
    if (e.key === 'Enter') {
      const btn = document.querySelector('[data-act="otp-verify"]');
      if (btn) btn.click();
    }
  });

  document.addEventListener('paste', (e) => {
    const boxes = Array.from(document.querySelectorAll('.otpbox'));
    if (!boxes.length) return;
    const text = (e.clipboardData || window.clipboardData).getData('text') || '';
    const digits = text.replace(/\D/g, '').slice(0, 6);
    if (!digits) return;
    e.preventDefault();
    boxes.forEach((b, i) => {
      b.value = digits[i] || '';
      b.classList.toggle('filled', !!digits[i]);
    });
    boxes[Math.min(digits.length, 5)].focus();
  });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const fn = A[act];
    if (!fn) return;
    e.preventDefault();
    if (el.tagName === 'BUTTON' || el.dataset.act) el.classList.add('tap');
    setTimeout(() => el.classList.remove('tap'), 220);
    fn(el, e);
  });

  /* ---------------------------------------------------------------- after-render hooks */
  RENDERERS._after = {};

  function afterResto(app) {
    const list = app.querySelector('#menulist');
    const rail = app.querySelector('#catrail');
    if (!list || !rail) return;
    list.scrollTop = window.__menuScroll || 0;
    rail.scrollTop = window.__railScroll || 0;
    rail.addEventListener('click', (e) => {
      const b = e.target.closest('.catb');
      if (!b) return;
      const sec = list.querySelector('#' + b.dataset.cat);
      if (sec) list.scrollTop = sec.offsetTop - list.offsetTop;
      Array.from(rail.children).forEach((c) => c.classList.toggle('on', c === b));
    });
    list.addEventListener('scroll', () => {
      window.__menuScroll = list.scrollTop;
      window.__railScroll = rail.scrollTop;
      const secs = Array.from(list.querySelectorAll('.mcat'));
      const y = list.scrollTop + 40;
      let cur = secs[0];
      secs.forEach((s) => {
        if (s.offsetTop - list.offsetTop <= y) cur = s;
      });
      if (!cur) return;
      const i = cur.id.replace('c', '');
      Array.from(rail.children).forEach((c, j) => c.classList.toggle('on', String(j) === i));
    });
  }

  window.__afterRender = function (app, v) {
    if (v.v === 'resto') afterResto(app);
    if (v.v !== 'resto') { window.__menuScroll = 0; window.__railScroll = 0; }
  };

  function startTicker() {
    clearInterval(window.__tick);
    window.__tick = setInterval(() => {
      if (C.view().v === 'track') C.render();
      else clearInterval(window.__tick);
    }, 3000);
  }

  window.__A = A;
  window.__openDishSheet = openDishSheet;
})();
