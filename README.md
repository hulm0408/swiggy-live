# swiggy-live

**The Swiggy Android app, rebuilt as a web app on the app's own endpoints** — reverse-engineered by probing its network surface, not from docs, not from a wrapper, not scraped out of a browser session.

Real restaurants, real menus, real prices, real images, real ETAs. Lucknow by default; anywhere you point `lat/lng`.

| Home | Menu | Item sheet |
|---|---|---|
| ![home](docs/home.png) | ![menu](docs/menu.png) | ![item sheet](docs/item-sheet.png) |

| Search | Cart | Checkout |
|---|---|---|
| ![search](docs/search.png) | ![cart](docs/cart.png) | ![checkout](docs/checkout.png) |

| Tracking | Orders | Dark |
|---|---|---|
| ![tracking](docs/tracking.png) | ![orders](docs/orders.png) | ![dark](docs/dark.png) |

> The `docs/auth-*.png` and `docs/api-console.png` shots in this folder predate the
> access-key login and the removal of the in-app endpoint console. They are stale;
> nothing in the app looks like them any more.

```bash
git clone <this repo> && cd swiggy-live
node server.js          # http://localhost:3000
```

No runtime dependencies. Node 18+. `npm test` runs the end-to-end harness (jsdom, dev-only).

**Scope in one line:** public catalogue data, read-only, plus a local access key that this server issued. No session importing, no borrowed credentials, no scraping, no real orders. The line and where the code enforces it: [POLICY.md](POLICY.md). Non-affiliation, trademarks, before-you-run-it: [NOTICE.md](NOTICE.md).

---

## 0. Design

The interface follows the **Swiggy PRO** language from the reference build at `storelex.store/swiggy_web` — re-implemented from its tokens, not copied:

| Token | Value |
|---|---|
| ground / card | `#fafbfd` / `#ffffff` |
| accent | `linear-gradient(135deg, #38bdf8, #7dd3fc)` |
| text / muted | `#0f172a` / `#64748b` |
| status | mint `#d1fae5`, amber `#fef3c7`, red `#fee2e2` |
| radii | 10 / 14 / 20 / 999 |
| type | Outfit (headings) · Inter (body) |

Light and dark both ship; the toggle sits in the app bar and persists. Everything else — the data, the proxy, the screens' behaviour — is this repo's own.

## 1. What you're looking at

| Piece | What it does |
|---|---|
| `server.js` | Static host + edge proxy to `www.swiggy.com` + normalizers + `/api/map` |
| `auth.js` | Access-key login, the claim ledger, key minting. JSON in, JSON out |
| `public/js/core.js` | State, hash router, cart engine, link codec, fetch layer |
| `public/js/views.js` | Every screen: home, search, menu, cart, checkout, tracking, login, offers |
| `public/js/art.js` | Procedural SVG art — image fallbacks and all UI icons. No icon font, no CDN |
| `public/js/data.js` | Offline demo catalog, used only when the proxy can't reach the edge |
| `harness/smoke.js` | `npm test` — boots the real server and the real scripts in a DOM and clicks through |
| `tools/probe.sh` | Re-runs the discovery. Same numbers, every box |

The browser never talks to Swiggy. It talks to `/api/*` on this box; this box talks to `www.swiggy.com` and slims the protobuf-JSON down to view models (132 KB listing → ~20 KB; 134 KB menu → structured sections).

---

## 1b. Auth — one key, JSON in, JSON out

There is no phone number, no OTP, no password. `auth.js` holds a table of access
keys; the app has exactly one field and posts one JSON body.

```
POST /api/auth/login      { key: "SWG-XXXX-XXXX-XXXX" }
     → { ok, signedIn: true, user, claims } + Set-Cookie: swg_sid=…; HttpOnly; SameSite=Lax

GET  /api/auth/me         → { ok, signedIn, user, claims }
POST /api/auth/logout     → clears the cookie, drops the session

POST /api/auth/keys/mint    { label }        → { ok, key }        (admin keys only)
GET  /api/auth/keys/all                        → every live key    (admin keys only)
POST /api/auth/keys/revoke  { id } or { key }  → kill one, and every session it holds
```

The login field takes the bare key **or** the JSON body itself — paste
`{"key":"SWG-XXXX-XXXX-XXXX"}` and it parses.

### Keys

No key ships in the repository. With nothing configured, the server generates one
admin key at boot and prints it once:

```
  ── ACCESS KEY (dev) ────────────────────────────────
   SWG-X6AK-XENW-3B6E
   sign in with this · it is regenerated whenever the
   container restarts, so set AUTH_ACCESS_KEYS for a
   key that survives a deploy
  ────────────────────────────────────────────────────
```

A key that has appeared in a commit is treated as public: those values are listed
in `BURNED_KEYS` in `auth.js` and revoked at startup, so a deployment that ever
seeded one loses it on the next boot.

Format is `SWG-` + three groups of four from a 32-char alphabet with `0/O/1/I`
removed, so a key can be read off a screen without ambiguity. Keys are stored as
`sha256` — the plaintext never touches disk — are use-counted, and are revocable.
Revoking one kills every session minted from it on the next request.

Provision more of them without touching code:

```bash
AUTH_ACCESS_KEYS="SWG-AAAA-BBBB-CCCC=Table 4,SWG-DDDD-EEEE-FFFF=Front desk:admin" node server.js
```

Or sign in with the admin key and hit **New key** on the Offers screen — that
mints one and copies a sign-in link straight to the clipboard.

**Posture**

| | |
|---|---|
| Key at rest | `sha256`, never plaintext |
| Rate limits | 12 login attempts/hour/IP · 60 claims/hour/IP |
| Session | opaque 32-byte id held server-side, delivered as an **HttpOnly** cookie — no token in JS |
| Lifetime | 30 days, rolling when used |
| Storage | `data/auth.json` (or `$DATA_DIR/auth.json`), git-ignored, atomic writes |

---

## 1c. Offers — the claim page

`#claim`. Two slots, one claim each per **IST calendar day**, enforced server-side
so clearing browser storage does not reset anything.

| Slot | Window (IST) | Reward | Coupon |
|---|---|---|---|
| Breakfast | 05:00 – 11:00 | flat ₹60 off above ₹149 | `BREAKFAST60` |
| Dinner | 18:00 – 00:00 | flat ₹100 off above ₹249 | `DINNER100` |

```
GET  /api/auth/claims          → { ok, user, claims, slots }
POST /api/auth/claim  { slot } → { ok, claim, slot, claims }
                               → 409 OUTSIDE_WINDOW   outside the window
                               → 409 ALREADY_CLAIMED  twice in one IST day
```

A claim returns a coupon code that the client registers into the existing bill
engine and applies to the cart automatically, then lands on `#success`.
Closed slots show a live countdown to the next window.

Edit the slots in `CLAIM_SLOTS` at the top of `auth.js` — label, code, discount,
minimum and window hours are all there.

---

## 1d. Address and cart by link

Three optional fragments, any combination, read once at boot. Everything is
base64url JSON, so a link is opaque and survives being pasted into chat.

| Fragment | Carries | Example |
|---|---|---|
| `#a=<b64url>` | `{ a: address, y: lat, g: lng, l: label }` | `#a=eyJhIjoiRmxhdCA3…` |
| `#c=<b64url>` | `{ r, n, e, g, i: [{ k, id, nm, p, v, q, va, an }] }` | `#cart&c=eyJyIjoiUjQy…` |
| `#k=<key>` | an access key — signs the visitor in | `#claim&k=SWG-XXXX-XXXX-XXXX` |

The bare screen name always works too: `#home`, `#claim`, `#cart`, `#orders`,
`#success`, `#login`.

`Core.Links.addrUrl()` and `Core.Links.cartUrl()` build them; **Account →
Address link** and **Cart link** copy them. Opening a cart link restores the
restaurant, every line, quantity, variant and add-on, and the bill total — and
opens the cart view even for a signed-out visitor, since browsing never needed a
key. Parsed payloads are length- and type-clamped before they touch state.

## 2. The endpoint map

Everything below was found by probing, and every row is verified — run `tools/probe.sh`.

```
route                      code bytes    secs
------------------------------------------------------------------
list/v5 (dapi)             200 132403 1.195275
search/v3 RESTAURANT       200 235507 1.556490
search/v3 DISH             200 329398 2.019816
menu/pl (dapi)             202 0      0.051300     <- challenged
menu/pl (mapi)             200 134621 0.788840     <- same route, mobile prefix
search/suggest             200 14146  0.328543
instamart/home             202 0      0.029862     <- challenged
dineout/v2/home            404 4082   0.263609

control — same route with a non-browser UA:
list/v5 (curl UA)          403 4063   0.753081
```

### The gate

Two headers are the whole difference between `200` and a `202` with an empty body:

```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36
__fetch_request: 1
```

A bare `curl` UA gets `403`. A browser UA without `__fetch_request` gets `202`. Both together and the food vertical falls open. This is why the proxy sets an explicit header set instead of forwarding whatever the browser sent.

### Routes that carry the app

**Home feed**
```
GET /dapi/restaurants/list/v5
    ?lat=<f>&lng=<f>&is-seo-homepage-enabled=true&page_type=DESKTOP_WEB_LISTING
```
12 cards: `GridWidget` category chips ("What's on your mind?"), "Top restaurant chains", the restaurant grid, `BrandsContent` SEO blocks, footer. Restaurant objects sit under `card.card.gridElements` with `@type …food.v2.Restaurant`.

**Search — two different result shapes on one route**
```
GET /dapi/restaurants/search/v3
    ?lat&lng&str=<query>&trackingId=undefined&submitAction=ENTER
    &queryUniqueId=<uuid4>&selectedPLTab=RESTAURANT|DISH
```
`RESTAURANT` → flat list of `Restaurant` objects (~73–101 per query).
`DISH` → 50ish `DishGroup` cards, each carrying `restaurant.info` plus `dishes[].info`. That nesting is the only way a dish result knows which kitchen sells it.

**Menu**
```
GET /mapi/menu/pl
    ?page-type=REGULAR_MENU&complete-menu=true&lat&lng&restaurantId&submitAction=ENTER
```
The `/dapi/menu/pl` variant of the *same* route answers `202`. Only `/mapi/` passes. Menu body hangs off `data.cards[n].groupedCard.cardGroupMap.REGULAR.cards` — note that node carries **no** `@type`, so a type-based walk misses it entirely.

Inside: `ItemCategory` (title + `itemCards`) and `NestedItemCategory` (sub-categories, e.g. "Tea & Coffee" → "Tea" / "Coffee"). Each dish has `price` in **paise**, `variants.variantGroups` (portion sizes with price deltas), and `addons` groups (`maxAddons`, per-choice prices).

**Autosuggest**
```
GET /dapi/restaurants/search/suggest?lat&lng&str
```

**Images**
```
GET https://media-assets.swiggy.com/swiggy/image/upload/fl_lossy,f_auto,q_auto,w_508,h_320,c_fill/<cloudinaryImageId>
```
`cloudinaryImageId` comes straight off any card, restaurant, or dish object.

### Routes that don't open

| Route | Status | Why |
|---|---|---|
| `POST /dapi/restaurants/list/update` | 202 | Pagination. Akamai sensor challenge. Worked around by paging through `/search`, which returns ~100 rows per call. |
| `GET /api/instamart/home` | 202 | Instamart storefront needs valid `_abck` / `bm_sz` cookies minted by the sensor script, or attested device headers. |
| `GET /dapi/instamart/search/v2` | 403 | Same gate. |
| `/dapi/dineout/v2/home`, `/mapi/dineout/v2/home` | 404 | Prefix unknown. Not a challenge — the path simply doesn't exist there. Would need the Dineout tab's actual route out of an APK bundle. |
| `POST /dapi/cart/add`, `/dapi/order/place` | 401 | Transactional tier: `Authorization: Bearer <jwt>` from OTP login + `_device_id` + cart token cookies. |

---

## 3. What is real and what is modelled

**Real, straight off the API:** restaurant list, categories, names, cuisines, ratings, rating counts, ETAs, distances, cost-for-two, offers, open/closed state, menus, categories, dish names, descriptions, prices, portion variants with price deltas, add-on groups, veg/non-veg flags, bestseller ribbons, per-dish ratings, dish and restaurant imagery, and search across both.

**Modelled locally, on purpose:**

- **Auth.** Access-key issue, hashing, sessions and cookies are real code — see §1b. What is *not* here, by design: importing or replaying someone else's Swiggy session. There is no session-JSON box and no key importer.
- **Offers.** The claim ledger is real: one per slot per IST day, held in the same store as the keys. The *reward* is a local coupon — it discounts the local bill, it is not a Swiggy promotion and no coupon is sent anywhere.
- **Cart, bill, checkout, tracking.** The cart endpoints sit behind Swiggy's authed tier. The cart is local and priced off live menu data, with a `199` free-delivery threshold and modelled delivery/platform/GST lines.
- **Order placement.** No order is sent anywhere. Placing one creates a local order object with a simulated rider timeline.
- **Instamart and Dineout.** Not built. Neither tab ships — see §5 for what opening them would take.

Nothing here logs into an account, places an order, or touches payment. It reads public catalog data and renders it.

---

## 4. Screens

Bottom nav everywhere: **Food · Offers · Cart · Orders**.

- **Login** — one field, one button. Takes the bare key or its JSON body. No OTP, no phone, no explanatory copy.
- **Home** — app bar with brand + location pill + theme toggle, offers banner, category chips, restaurant cards with offer pills and rating chips, veg filter.
- **Search** — debounced live query, Restaurants/Dishes tabs, dish cards carrying their restaurant.
- **Menu** — hero, rating/ETA/cost badges, category rail with scroll-spy, veg mode, `ADD` vs `customisable` (variants/addons open the sheet), item sheet with portion radios, add-on checkboxes, live unit price.
- **Offers** — breakfast and dinner cards: claim when the window is open, live countdown when it is not, code + **Use on this order** once claimed. Admin keys also get **Keys** — mint, list, revoke.
- **Cart** — single-restaurant rule enforced with the real "start a new cart" prompt, quantity steppers, coupons (`WELCOME50`, `TRYNEW`, `SWIGGYIT`, `FREEDEL`, plus any claimed offer) with min-order checks, itemised bill.
- **Checkout** — address, instructions, tip, payment method, bill summary.
- **Tracking** — animated map, step timeline on real elapsed time, rider card, order summary.
- **Success** — `#success`. Lands here after a claim or a key mint.
- **Account** — who you are, the address and cart share links, recent orders.

The in-app endpoint console is gone. §2 below is the record of how the routes were
found; it lives in the README and in `tools/probe.sh`, not in the product.

---

## 5. Notes for the next pass

- `/dapi/restaurants/list/update` would unlock true infinite scroll. It needs the sensor challenge cleared, which means a real browser context (Playwright with the site's own JS) or the app's attested headers.
- Dineout/Instamart prefixes: pull the React Native bundle out of the APK (`assets/index.android.bundle`) and grep for `/dapi/` and `/api/` strings. Route strings ship readable in RN builds.
- Money helper: `price` and `defaultPrice` are paise; everything above `normDish` is rupees.
- Cache TTL is 120s. `CACHE_TTL=0` disables it.
