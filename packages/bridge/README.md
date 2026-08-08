# Pocket Bridge

Local HTTPS/WSS API that exposes Prime Agent sessions to the mobile app.

```bash
# from repo root
pnpm --filter @prime-pocket/bridge build
node packages/bridge/dist/cli.js bridge --demo --http
```

State lives in `~/.prime-pocket/` (`bridge.json`, `artifacts/`), or `PRIME_POCKET_HOME` when set.

## GitHub

Live hosts talk to the GitHub REST API with a personal access token held here — `bridge.json`
after the app or `--github-token` supplies one, or `PRIME_POCKET_GITHUB_TOKEN` / `GITHUB_TOKEN`
read straight from the environment. Classic tokens need the `repo` scope; fine-grained tokens need
read access to Contents and Metadata.

```bash
node packages/bridge/dist/cli.js bridge --http --github-token ghp_xxx
```

`--demo` and `PRIME_POCKET_GITHUB_MOCK=1` serve the mock catalog instead, which is what the e2e
suite uses.
