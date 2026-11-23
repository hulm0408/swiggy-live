# POLICY — what this project will and will not build

The useful part of a project like this is the line around it. This file records that line, why it sits where it does, and where the code enforces it instead of merely promising it. It applies to the repository, to its forks, and to anyone helping build it.

## In scope

| | |
|---|---|
| **Public catalogue surface** — restaurant lists, search, menus, suggestions, images | read-only, what an unauthenticated visitor sees, through one proxy with a two-minute cache |
| **Local sign-in** — an access key (`SWG-XXXX-XXXX-XXXX`) minted on this server | the session belongs to this app, not to any third party |
| **Key administration** — an admin key can mint, list and revoke keys | so a demo can have a few guests without each of them needing a phone |
| **Daily offer claims** — one per slot per IST day, per key, kept server-side | a coupon simulation; nothing is claimed upstream |
| **Cart, bill, checkout, tracking, order history** | simulated in the browser; no order is ever placed |

## Out of scope — declined, not deferred

These have been asked for across the life of the project. The answer does not change with the framing.

### Importing a session

Pasting `{mobile, token, sid, tid, deviceId}` and resuming someone's login. **Refused.** Possession of a session string is not proof of owning the account, and a box that accepts one cannot tell an owner from a broker. No route in this repo accepts a session blob: `POST /api/auth/login` takes a key of exactly one shape and answers `BAD_KEY_FORMAT` to anything else.

### Reusing a borrowed upstream credential

A cookie, token or `SWG-` key belonging to someone else's account. **Refused.** The app holds no third-party credential at all — there is nothing to replay.

### Making one account look like another

Account takeover in any framing — "just testing", "it's my friend's", "I have their JSON". Same request, same answer.

### Endpoints behind authentication

The upstream cart, order and payment routes return `401` to this project because they should. They are not brute-forced, not proxied with somebody's token, and not faked to look real in the UI: the app says plainly that checkout is simulated.

### Scale

No scrapers, no crawlers, no bulk collection, no retry storms. One request per user action, one shared two-minute cache.

### Phishing-shaped features

No password forms, no "verify your Swiggy account" flow, no pretending the build is official. [NOTICE.md](NOTICE.md) states the non-affiliation and the trademark position.

## Where the line is enforced

| Boundary | Enforcement |
|---|---|
| No session importer | `/api/auth/login` accepts only `SWG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}`; there is no other credential route |
| Keys are not guessable | 12 chars from a 32-symbol alphabet (no `0/O/1/I`), generated with `crypto.randomInt` |
| Keys are not stored in the clear | `sha256` only; the plaintext exists in exactly one place — the response that hands it to its owner |
| Keys are revocable | per-key revoke; revoked → `BAD_KEY`; sessions are dropped with the key |
| Minting is privileged | `POST /api/auth/keys/mint` requires an admin session |
| **No credential in git** | no key is a constant in source. Keys come from `AUTH_ACCESS_KEYS` or are generated at boot and printed once. Keys that ever appeared in a commit are listed in `BURNED_KEYS` and revoked at startup |
| Brute force is expensive | `12` login attempts per IP per hour; `60` claim calls per hour |
| No silent third-party calls | every browser request goes to this repo's own proxy on a relative URL |
| Session hygiene | opaque server-side id, `HttpOnly`, `SameSite=Lax`, 30-day rolling, cleared on sign-out |

## A note on credentials in source

Commit `f4163c7` shipped a working admin key as a constant. It was removed in the next commit along with every other key constant, and the specific value was added to `BURNED_KEYS` so any deployment that already seeded it revokes it on boot. The rule this leaves behind: **a key in a repository is not a secret, and a secret you cannot rotate is not one either.** Provision keys through the environment, or let the server generate them.

## If you are reviewing this project

The questions worth asking are: does it touch anything but public data; can anyone get in without a credential this server issued; does it scale; does it pretend to be official. The answers are in the table above, and `auth.js` is short enough to check in one sitting — post a session blob to `/api/auth/login` and watch it be rejected.

What this file does **not** claim: that the project is endorsed, licensed, or certainly permitted. Using a company's private endpoints is a decision with a terms-of-service answer only its owner can give. This documents what the code does and refuses to do; it does not argue that running it is wise.
