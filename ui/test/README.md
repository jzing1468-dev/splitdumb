# Shared UI browser regressions

These tests render the real React components with in-memory adapters. They do not connect to the application API or open any database.

After installing the existing `client` dependencies, run from the repository root:

```sh
BROWSER_BIN=/path/to/chromium npm run test:ui
```

`BROWSER_BIN` may point to Chrome or Chromium. If omitted, the runner searches `PATH` for common executable names. The runner uses native Node WebSocket/CDP support (Node 22+), starts a loopback-only Vite server and a fresh headless browser profile under `TMPDIR`, runs all three pages, reports individual assertions, exits nonzero on failure, and cleans up.

- `info-regressions.html`: first-create payloads, travel conflicts, editor revision snapshots, section draft preservation, and field limits.
- `notes-regressions.html`: draft revision/content snapshots, conflict recovery, delayed/duplicate/failed saves, discard/reopen, remote deletion, navigation, safe linkification, and deletion tombstones.
- `group-refresh-regressions.html`: real Group page and API adapter with reordered HTTP responses, covering stale note rollback, stale 404 handling, and utility snapshot ordering. Results are exposed as `window.groupRefreshRegressionResults`.

For interactive Notes debugging only:

```sh
node ui/test/notes-regressions-server.mjs
```

Open the loopback URL printed by that command. The pages also expose structured results as `window.__infoRegressionResults` and `window.notesRegressionResults`.

Run `npm test` separately for the isolated-database HTTP/core/persistence regression suite. Client and P2P builds remain separate checks. When verifying without deploying, pass `--outDir` pointing to scratch directories so `client/dist` is not changed.
