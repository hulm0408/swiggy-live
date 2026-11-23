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

    const chips = (r.chips || []).slice(0, 18);
    const rests = r.restaurants || [];

    return `${locBar()}
    ${searchEntry()}

    <div class="banner-card" data-act="tab" data-tab="claim">
      <div class="bc-icon">${icon('tag', 20)}</div>
      <div class="bc-text">
        <div class="bc-title">Breakfast and dinner offers</div>
        <div class="bc-sub">Claim yours for today</div>
      </div>
      <span class="bc-go">Claim ${icon('chev', 13)}</span>
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
    <div class="cards">${rests.map(restoCard).join('')}</div>`;
  };

  function offlineHome(r) {
    const cat = window.CATALOG || { R: [] };
    const why = r && r.error === 'NO_ROUTE' ? 'Check your connection and try again.' : 'Please try again in a moment.';
    return `${locBar()}
    ${searchEntry()}
    <div class="banner warn"><b>Restaurants are unavailable right now.</b> ${esc(why)}</div>
    <h2 class="sec-title">Popular near you</h2>
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
      results = r.ok ? renderSearchResults(r, tab, str) : `<div class="banner warn">No results right now. Try again in a moment.</div>`;
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
      return `${tabs}
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
    return `${tabs}
      <div class="cards">${list.map(restoCard).join('')}</div>`;
  }

  /* ---------------------------------------------------------------- RESTAURANT */
  RENDERERS.resto = async function (params) {
    S.tab = 'food';
    const id = params.id;
    const r = await API.menu(id);
    if (!r.ok) {
      return `<div class="searchhead"><button class="iconbtn" data-act="back">${icon('back', 20)}</button><b>Restaurant</b></div>
        <div class="banner warn">This menu is unavailable right now.</div>`;
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
      <button class="hero-btn share" data-act="copy-page-link">${icon('share', 18)}</button>
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
      ${''}
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
    </div>`;
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

  /* ---------------------------------------------------------------- LOGIN */
  RENDERERS.login = async function (params) {
    const err = (params && params.err) || '';
    return `<div class="authbar"><b>Sign in</b></div>
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-icon">${icon('one', 26)}</div>
        <h1>Enter your key</h1>
        <div class="keyinput">
          <input id="akey" spellcheck="false" autocomplete="off" autocapitalize="characters"
            placeholder="SWG-XXXX-XXXX-XXXX" value="${esc(S.auth.key || '')}">
        </div>
        <div class="auth-error" id="keyErr">${esc(err)}</div>
        <button class="btn solid wide auth-cta" data-act="key-login">Continue</button>
      </div>
    </div>`;
  };

  /* ---------------------------------------------------------------- CLAIM */
  const pad2 = (n) => String(Math.floor(n)).padStart(2, '0');
  const slotWindow = (st) => `${pad2(st.from)}:00 – ${st.to >= 24 ? '00:00' : pad2(st.to) + ':00'} IST`;

  function claimCard(id, c) {
    const st = c.slot;
    const when = slotWindow(st);
    const value = `Flat ₹${st.flat} off · above ₹${st.min}`;

    if (c.claimed && c.claim) {
      return `<article class="claim-card done">
        <div class="cc-head">
          <span class="cc-ic ok">${icon('check', 18)}</span>
          <div><b>${esc(st.label)} offer</b><span>${when}</span></div>
        </div>
        <div class="cc-val">${value}</div>
        <div class="cc-code"><span>${esc(c.claim.code)}</span><button class="mini" data-act="copy-text" data-t="${esc(c.claim.code)}">Copy</button></div>
        <div class="cc-acts">
          <button class="btn solid grow" data-act="use-claim" data-code="${esc(c.claim.code)}">Use on this order</button>
          <button class="btn ghost" data-act="tab" data-tab="food">Order</button>
        </div>
      </article>`;
    }

    if (!st.open) {
      return `<article class="claim-card shut">
        <div class="cc-head">
          <span class="cc-ic">${icon('clock', 18)}</span>
          <div><b>${esc(st.label)} offer</b><span>${when}</span></div>
        </div>
        <div class="cc-val">${value}</div>
        <button class="btn ghost wide" disabled>Opens at ${pad2(st.from)}:00 IST</button>
        <div class="cc-count" data-opens="${st.opensAt}"></div>
      </article>`;
    }

    return `<article class="claim-card">
      <div class="cc-head">
        <span class="cc-ic live">${icon('tag', 18)}</span>
        <div><b>${esc(st.label)} offer</b><span>${when}</span></div>
      </div>
      <div class="cc-val">${value}</div>
      <div class="cc-acts">
        <button class="btn solid grow" data-act="do-claim" data-slot="${esc(id)}">Claim</button>
      </div>
    </article>`;
  }

  function claimGate() {
    return `<div class="authbar"><b>Offers</b></div>
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-icon">${icon('tag', 26)}</div>
        <h1>Sign in to claim</h1>
        <button class="btn solid wide auth-cta" data-act="go-login">Enter your key</button>
      </div>
    </div>`;
  }

  RENDERERS.claim = async function () {
    S.tab = 'claim';
    if (!S.user) return claimGate();
    const r = await API.claims();
    if (!r || !r.ok) return claimGate();
    S.user = r.user;
    S.claims = r.claims;
    Object.values(S.claims || {}).forEach((c) => c.claim && C.registerClaimCoupon(c.claim));

    const slots = ['breakfast', 'dinner'].filter((id) => S.claims[id]);
    const claimedCount = slots.filter((id) => S.claims[id].claimed).length;

    let admin = '';
    if (S.user.admin) {
      const kr = await API.keysAll();
      const keys = (kr && kr.keys) || [];
      admin = `${sectionHead('wallet', 'Keys', keys.length)}
      <div class="acct-list">
        ${keys
          .map(
            (k) => `<div class="keyrow">
            <div class="kr-l"><b>${esc(k.label)}${k.admin ? ' · admin' : ''}</b>
              <span>••••-${esc(k.tail || '')} · used ${k.uses || 0}×</span></div>
            <button class="revoke" data-act="revoke-access" data-id="${esc(k.id)}">Revoke</button>
          </div>`
          )
          .join('') || '<div class="acct-list"></div>'}
      </div>
      <div class="pad-16"><button class="btn ghost wide" data-act="mint-key">New key</button></div>`;
    }

    return `<div class="claimbar">
      <div class="cb-t"><h1>Offers</h1><span>${claimedCount} of ${slots.length} claimed today</span></div>
    </div>
    <div class="claim-list">
      ${slots.map((id) => claimCard(id, S.claims[id])).join('')}
    </div>
    ${admin}`;
  };

  /* ---------------------------------------------------------------- SUCCESS */
  RENDERERS.success = async function () {
    const s = S.success || {};
    const head = s.title || 'Done';
    const sub = s.sub || '';
    const code = s.code || '';
    return `<div class="succ-wrap">
      <div class="succ-ring">${icon('check', 34)}</div>
      <h1>${esc(head)}</h1>
      ${sub ? `<p>${esc(sub)}</p>` : ''}
      ${code ? `<div class="cc-code"><span>${esc(code)}</span><button class="mini" data-act="copy-text" data-t="${esc(code)}">Copy</button></div>` : ''}
      <div class="succ-acts">
        ${s.orderId ? `<button class="btn solid grow" data-act="open-track" data-id="${esc(s.orderId)}">Track order</button>` : ''}
        ${code ? `<button class="btn ${s.orderId ? 'ghost' : 'solid'} grow" data-act="tab" data-tab="food">Order now</button>` : ''}
        <button class="btn ghost wide" data-act="tab" data-tab="claim">Back to offers</button>
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
            <h2>${esc(u.label || u.masked)}</h2>
            <span>${esc(u.masked)}${u.admin ? ' · admin' : ''}</span>
          </div>
          <button class="mini ghost" data-act="sign-out">Sign out</button>
        </div>`
      : `<div class="acct-top">
          <div class="av-btn big">${icon('user', 24)}</div>
          <div style="flex:1;min-width:0">
            <h2>Guest</h2>
            <span>Sign in with your key</span>
          </div>
        </div>
        <div class="pad-16" style="padding-top:0">
          <button class="btn solid wide" data-act="go-login">Enter your key</button>
        </div>`;

    const share = `<div class="acct-list">
      <button class="arow" data-act="copy-addr-link">
        ${icon('pin', 17)}<div><b>Address link</b><span>${esc(S.addr)}</span></div>
        <span class="chev">${icon('share', 16)}</span>
      </button>
      <button class="arow" data-act="copy-cart-link">
        ${icon('cart', 17)}<div><b>Cart link</b><span>${cartCount() ? cartCount() + ' items · ' + money(itemTotal()) : 'Cart is empty'}</span></div>
        <span class="chev">${icon('share', 16)}</span>
      </button>
      <button class="arow" data-act="tab" data-tab="claim">
        ${icon('tag', 17)}<div><b>Offers</b><span>Breakfast and dinner</span></div>
        <span class="chev">${icon('chev', 16)}</span>
      </button>
    </div>`;

    return `${appBar()}
    ${profile}
    ${sectionHead('share', 'Share', undefined)}
    ${share}
    ${sectionHead('order', 'Account', undefined)}
    <div class="acct-list">
      <div class="arow">${icon('order', 17)}<div><b>Orders</b><span>${S.orders.length} in this session</span></div></div>
      <div class="arow">${icon('one', 17)}<div><b>Swiggy One</b><span>Not a member</span></div></div>
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
        : `<div class="empty"><div class="empty-art">${icon('clock', 30)}</div><h3>No orders yet</h3><p>Place one and it lands here.</p><button class="btn solid" data-act="tab" data-tab="food">Browse restaurants</button></div>`
    }`;
  };
  /* ---------------------------------------------------------------- ACTIONS */
  /* clipboard with a textarea fallback — navigator.clipboard needs a secure context */
  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  const A = {
    back: () => back(),
    noop: () => toast('Filters are decorative in this build'),

    tab: (el) => {
      const t = el.dataset.tab;
      const target = { food: 'home', search: 'search', claim: 'claim', cart: 'cart', orders: 'account' }[t];
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
      const used = S.coupon;
      S.cart = null;
      S.coupon = null;
      S.tip = 0;
      save();
      S.success = {
        title: 'Order placed',
        sub: '#' + order.id + ' · ' + order.restName + ' · ' + money(order.total) + (used ? ' · ' + used + ' applied' : ''),
        code: '',
        orderId: order.id,
      };
      reset('track', { id: order.id });
      startTicker();
    },
    'open-track': (el) => go('track', { id: el.dataset.id }),
    'go-account': () => go('account', {}),

    /* ---- auth: one field, JSON in, JSON out ---- */
    'go-login': () => go('login', {}),
    'go-claim': () => reset('claim', {}),

    'key-login': async () => {
      const el = $('#akey');
      const err = $('#keyErr');
      let raw = ((el && el.value) || '').trim();
      if (err) err.textContent = '';
      /* the field takes the bare key or the JSON body itself */
      if (raw.charAt(0) === '{') {
        try {
          raw = String(JSON.parse(raw).key || '').trim();
        } catch (e) {
          if (err) err.textContent = 'That JSON does not parse.';
          return;
        }
      }
      const key = raw.toUpperCase();
      if (!key) {
        if (err) err.textContent = 'Enter your key.';
        return;
      }
      const r = await API.login(key);
      if (!r || !r.ok) {
        if (err) err.textContent = (r && r.message) || 'That key was not accepted.';
        return;
      }
      S.user = r.user;
      S.claims = r.claims || {};
      S.auth.key = key;
      C.store.set('sw.lastkey', key);
      Object.values(S.claims).forEach((c) => c.claim && C.registerClaimCoupon(c.claim));
      toast('Signed in');
      reset('claim');
    },

    /* ---- claims ---- */
    'do-claim': async (el) => {
      const slot = el.dataset.slot;
      el.disabled = true;
      const r = await API.claim(slot);
      if (!r || !r.ok) {
        el.disabled = false;
        toast((r && r.message) || 'Could not claim');
        C.render();
        return;
      }
      C.registerClaimCoupon(r.claim);
      if (r.claims) S.claims = r.claims;
      S.coupon = r.claim.code;
      save();
      S.success = {
        title: r.claim.label + ' offer claimed',
        sub: 'Flat ₹' + r.claim.flat + ' off above ₹' + r.claim.min + ' — applied to your cart.',
        code: r.claim.code,
      };
      reset('success');
    },

    'use-claim': (el) => {
      const code = el.dataset.code;
      if (!COUPONS[code]) return toast('Claim it first');
      S.coupon = code;
      save();
      const ok = couponEligible(code);
      toast(ok.ok ? code + ' applied' : 'Saved — ' + ok.why);
      reset('cart');
    },

    /* ---- share links ---- */
    'copy-addr-link': async () => {
      const ok = await copyText(C.Links.addrUrl());
      toast(ok ? 'Address link copied' : 'Copy blocked');
    },
    'copy-cart-link': async () => {
      const url = C.Links.cartUrl();
      if (!url) return toast('Add something to the cart first');
      const ok = await copyText(url);
      toast(ok ? 'Cart link copied' : 'Copy blocked');
    },
    'copy-text': async (el) => {
      const ok = await copyText(el.dataset.t || '');
      toast(ok ? 'Copied' : 'Copy blocked');
    },

    /* ---- admin: hand keys to other people ---- */
    'mint-key': async () => {
      const r = await API.mintKey('guest');
      if (!r || !r.ok) return toast((r && r.message) || 'Could not mint');
      const shareUrl = location.origin + location.pathname + '#claim&k=' + r.key;
      S.success = { title: 'Key created', sub: shareUrl, code: r.key };
      reset('success');
      copyText(shareUrl);
    },
    'revoke-access': async (el) => {
      const r = await API.revokeAccessKey(el.dataset.id);
      toast(r && r.ok ? 'Key revoked' : 'Could not revoke');
      C.render();
    },

    'sign-out': async () => {
      await API.logout();
      S.user = null;
      S.claims = null;
      toast('Signed out');
      reset('home');
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

    'copy-page-link': async () => {
      const ok = await copyText(location.href);
      toast(ok ? 'Link copied' : 'Copy blocked');
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
      box.innerHTML = `<div class="banner warn">No results right now. Try again in a moment.</div>`;
      return;
    }
    box.innerHTML = renderSearchResults(r, tab, str);
  }

  /* search box: debounced live search */
  document.addEventListener('input', (e) => {
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

  /* claim cards count down to the next window, then re-render once it opens */
  function afterClaim(app) {
    clearInterval(window.__claimTick);
    const nodes = Array.from(app.querySelectorAll('.cc-count[data-opens]'));
    if (!nodes.length) return;
    const paint = () => {
      let live = false;
      for (const n of nodes) {
        const ms = Number(n.dataset.opens) - Date.now();
        if (ms <= 0) {
          clearInterval(window.__claimTick);
          C.render();
          return;
        }
        live = true;
        const h = Math.floor(ms / 3600_000);
        const m = Math.floor((ms % 3600_000) / 60_000);
        const s = Math.floor((ms % 60_000) / 1000);
        n.textContent = `Opens in ${h}h ${pad2(m)}m ${pad2(s)}s`;
      }
      if (!live) clearInterval(window.__claimTick);
    };
    paint();
    window.__claimTick = setInterval(paint, 1000);
  }

  window.__afterRender = function (app, v) {
    if (v.v === 'resto') afterResto(app);
    if (v.v === 'claim') afterClaim(app);
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
