# Pocket Bridge

Local HTTPS/WSS API that exposes Prime Agent sessions to the mobile app.

```bash
# from repo root
pnpm --filter @prime-pocket/bridge build
node packages/bridge/dist/cli.js bridge --demo --http
```

State lives in `~/.prime-pocket/` (`bridge.json`, `artifacts/`), or `PRIME_POCKET_HOME` when set.

## GitHub

Live hosts prefer **browser login** via GitHub’s device flow. A public OAuth App client id is
shipped in the bridge, so you do not need to pass `--github-client-id` for the default app.

```bash
node packages/bridge/dist/cli.js bridge --http
# optional override:
# node packages/bridge/dist/cli.js bridge --http --github-client-id Ov23li…
```

The phone starts the flow; you enter a one-time code on github.com; the bridge polls and stores
the access token in `bridge.json`. A personal access token remains available as a fallback
(`--github-token` / `PRIME_POCKET_GITHUB_TOKEN` / paste in the app).

`--demo` and `PRIME_POCKET_GITHUB_MOCK=1` serve the mock catalog instead, which is what the e2e
suite uses.
