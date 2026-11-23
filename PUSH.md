# Pushing this to GitHub

The repo is committed and ready — one clean commit on `main`, 19 files, screenshots included. There is no credential in this sandbox and the GitHub connector isn't available here, so the push itself has to carry an identity it doesn't have yet. Two ways, both one command away.

---

## Option A — from your own machine (no token leaves your hands)

Take the bundle, `git clone` it locally, point it at your repo, push.

```bash
# 1. fetch the bundle from this sandbox (or download swiggy-live.bundle from the workspace)
#    path: /home/user/swiggy-live.bundle

# 2. clone it
git clone swiggy-live.bundle swiggy-live
cd swiggy-live

# 3. create an EMPTY repo on GitHub first (no README, no .gitignore — this tree already has them)
#    then:
git remote set-url origin https://github.com/<your-user>/<repo>.git
git push -u origin main
```

## Option B — from this sandbox, if you hand it a token

Make a fine-grained PAT with **Contents: Read and write** on the target repo, then:

```bash
cd /home/user/swiggy-live
git remote add origin https://<PAT>@github.com/<your-user>/<repo>.git
git push -u origin main
```

Say the word and I'll run it — that's a public, permanent push, so I'll take your go-ahead as the confirm.

---

## What's in the commit

```
server.js              zero-dep static host + edge proxy + normalizers + /api/map
public/index.html      phone shell, status bar, tab bar
public/css/app.css     the whole surface
public/js/core.js      state, router, cart engine, fetch layer
public/js/views.js     every screen incl. the in-app endpoint console
public/js/art.js       procedural SVG art + icons (no CDN, no icon font)
public/js/data.js      offline demo catalog (fallback only)
tools/probe.sh         re-runs the discovery, prints the status table
docs/*.png             screenshots used in the README
```

No `node_modules`, no lockfile, no secrets, no `.env`. `npm start` runs it; there is nothing to install.

---

## Repo metadata suggestions

**Description**
> The Swiggy Android app rebuilt as a web app on its own reverse-engineered endpoints. Zero-dependency Node proxy, vanilla JS front end.

**Topics**
`reverse-engineering` `api` `swiggy` `nodejs` `vanilla-js` `proxy` `android` `webapp`

---

## Caveat worth knowing

Sandbox snapshots skip `.git/config` (it's treated as credential-adjacent), so a `remote` you add here may not survive to the next turn. The commit objects and refs persist. If the remote goes missing, re-add it with `git remote add origin …` — nothing else is lost.
