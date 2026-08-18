# MovieTracker web

The same library as the iOS app, in a browser: watchlist, diary, ratings,
stats, discovery and shared lists. It is a static progressive web app talking
to the existing API — there is no second backend, and no TMDB token on this
side of the wire.

```
index.html          the shell
styles.css          one stylesheet, no framework
src/*.ts            TypeScript sources
js/*.js             compiled ES modules, committed, served raw
sw.js               compiled service worker, committed
```

## Build

Sources are TypeScript; the served JavaScript is compiler output and **is
committed**, because GitHub Pages serves files rather than building them.

```bash
cd web && npm install && npm run build
```

Never hand-edit `js/*.js` or `sw.js` — the next build overwrites them. Run
`npm run check` before shipping.

## Run it locally

```bash
cd web && python3 -m http.server 8124
```

Then open <http://localhost:8124>. It talks to production by default. To point
it at a local API, in the browser console:

```js
localStorage.setItem('movietracker.apiBase', 'http://localhost:3000')
```

Clear it with `localStorage.removeItem('movietracker.apiBase')`.

## How it works

**One API client.** `src/api.ts` is the only place that fetches. Access tokens
last fifteen minutes, so every call refreshes once on a 401 and replays itself.
Concurrent 401s share a single refresh: rotation is single use, and two
refreshes racing would burn one token and sign the user out.

Being offline is not being signed out. A refresh that fails because the network
is unreachable leaves the session alone and reports a network error; only a
server that actually answers 401 clears it.

**A small library cache.** The film sheet needs to know whether a title is on
your watchlist, what you rated it and when you watched it — three questions the
API only answers for the whole library at once. `src/library.ts` loads each list
once and drops it when a write says it changed, so opening ten posters does not
mean thirty requests.

**Sessions live in `localStorage`.** The API takes a `Bearer` header rather than
a cookie, so there is no ambient credential for a hostile page to replay, and
the token has to survive a reload.

**The service worker is cache-first for the shell and never touches the API.**
A cached watchlist that quietly lies about what is on it is worse than an error.
Bump `CACHE` in `src/sw.ts` and `APP_VERSION` in `src/version.ts` together on
every deploy, or installed devices keep running the old code.

## Deploying

See [DEPLOY.md](DEPLOY.md).
