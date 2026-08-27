# Deploy checklist — MovieTracker web

Two pieces, deployed separately:

1. **The web app** (this folder) → GitHub Pages, repo `Qelik/movietracker-web`,
   live at <https://qelik.github.io/movietracker-web/>.
2. **The API** (`../server`) → Railway, `movietracker-api`. See the root README.

The web app is a *client*. It ships no secrets, and the TMDB token stays on the
server where it always was.

## Why a second repo

`Qelik/MovieTracker` is private and holds the server and the iOS app. GitHub
Pages does not serve private repositories on a free plan, so the built site is
published to a separate public repo. That repo is a **publishing target only**:
`scripts/deploy.sh` wipes and refills it, so anything edited there by hand is
lost on the next deploy.

## Ship it

1. **Build.** Sources are `src/*.ts`; the served `js/*.js` and `sw.js` are
   compiler output and are committed here. After editing any source:

   ```bash
   cd web && npm run build
   ```

2. **Bump the cache.** `CACHE` in `src/sw.ts` (`movietracker-vNN`) and
   `APP_VERSION` in `src/version.ts` move together. Skip this and installed
   devices keep running the old code — the service worker is cache-first, so
   they will never ask for the new files.

3. **Check it compiles clean**, then commit both the sources and the rebuilt
   output in this repo:

   ```bash
   npm run check
   ```

4. **Deploy:**

   ```bash
   ./scripts/deploy.sh
   ```

   It builds, clones the Pages repo, mirrors this folder into it (minus
   `node_modules` and `scripts`), and pushes. Pages rebuilds in about a minute.

5. **Verify:**

   ```bash
   curl -sI https://qelik.github.io/movietracker-web/js/app.js | head -1
   ```

   A `200` and a hard reload of the site should show the new version under
   **Profile → Account**.

> **Service-worker gotcha:** the first reload after a deploy can still serve the
> old file, because the worker answers from cache and refreshes behind the
> scenes. Reload twice, or use **Profile → Account → Refresh app files**, which
> clears every cache and unregisters the worker.

## CORS

The API answers with `Access-Control-Allow-Origin` only for origins on an
allowlist, set by `WEB_ORIGINS` in the server environment (comma separated).
The default covers `https://qelik.github.io` and a local dev server on port
8124. Requests carrying no `Origin` header at all — the iOS app, curl — are
unaffected.

**Moving the site to a new domain means adding that origin to `WEB_ORIGINS` on
the Railway service**, or the browser will refuse every API call. The previous
`origin: true` needed no configuration but reflected whatever origin asked,
which meant any page on the internet could read authenticated responses if it
ever got hold of a token.

## If the Pages build sticks

Do not rerun the stuck build — trigger a fresh one:

```bash
gh api -X POST repos/Qelik/movietracker-web/pages/builds
```

## Rolling back

The Pages repo keeps its own history, so the fastest rollback is there:

```bash
git clone https://github.com/Qelik/movietracker-web.git && cd movietracker-web
git revert --no-edit HEAD && git push
```

Then fix the source in this repo properly and deploy again.
