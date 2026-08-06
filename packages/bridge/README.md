# Pocket Bridge

Local HTTPS/WSS API that exposes Prime Agent sessions to the mobile app.

```bash
# from repo root
pnpm --filter @prime-pocket/bridge build
node packages/bridge/dist/cli.js bridge --demo --http
```

State lives in `~/.prime-pocket/` (`bridge.json`, `artifacts/`).
