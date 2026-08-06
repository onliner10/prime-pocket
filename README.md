# Prime Pocket

Mobile access to [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent) **without a hosted control plane**.

```
Phone  --LAN/Tailscale-->  Pocket Bridge (on your machine)  -->  Prime Agent daemon
```

Each desktop runs a local HTTPS/WSS bridge. The phone stores paired host URLs + tokens and aggregates the fleet client-side.

## Packages

| Path | Role |
|------|------|
| [`packages/protocol`](packages/protocol) | Shared DTOs, routes, pairing QR encoding |
| [`packages/bridge`](packages/bridge) | `prime-pocket` CLI — local API server |
| [`apps/mobile`](apps/mobile) | Expo (iOS/Android/web) client |

## Quick start (demo mode)

Demo mode does not need Prime Agent installed — useful to validate pairing and the mobile UX.

```bash
pnpm install
pnpm --filter @prime-pocket/protocol build
pnpm --filter @prime-pocket/bridge build

# HTTP is fine for LAN/Tailscale testing with self-signed avoided:
pnpm --filter @prime-pocket/bridge exec node dist/cli.js bridge --demo --http
```

Scan/paste the printed `prime-pocket://pair?data=...` deep link into the app (Pair host).

### With TLS (default)

```bash
pnpm start:bridge -- --demo
```

The bridge generates a self-signed cert under `~/.prime-pocket/`. The phone pins the cert fingerprint from the QR payload at pair time. React Native must allow local networking (already set in `app.json`).

## Remote access (no Pocket servers)

1. Install [Tailscale](https://tailscale.com/) on your phone and desktop.
2. Start the bridge; it advertises MagicDNS / Tailscale IP URLs in the QR.
3. Pair while both devices are online on the tailnet.

LAN works without Tailscale when phone and desktop share Wi‑Fi.

Optional user tunnel (Cloudflare Tunnel, ngrok): put that public URL into the app’s manual pair fields — still your infra, not Pocket’s.

## Live Prime Agent

When a Prime daemon socket is present, the bridge prefers it over demo mode:

```bash
prime-pocket bridge
# or
prime-pocket bridge --daemon-socket /path/to/daemon.sock
```

Socket probe paths include `~/.prime/agent/daemon.sock`, `~/.prime-agent/daemon.sock`, and env `PRIME_AGENT_SOCKET`.

> The Prime adapter speaks a thin JSONL probe today. Wire it to `DaemonAgentConnection` from prime-agent once you depend on that package for full session/event fidelity.

## Notifications (optional)

Pocket does not run APNs/FCM. For remote “needs attention” alerts, point the bridge at a [ntfy](https://ntfy.sh) topic you own:

```bash
prime-pocket bridge --demo --ntfy-topic my-prime-pocket
```

Subscribe to that topic in the ntfy app on your phone.

## Mobile app

```bash
pnpm --filter @prime-pocket/mobile start
```

Features in v1:

- Pair host (deep link / manual URL + code)
- Multi-host fleet list
- Agent transcript with live WebSocket stream
- Prompt / steer / follow-up / cancel
- Needs-input approve/deny
- Artifact open via authenticated URL

## API surface (bridge)

Auth: `Authorization: Bearer <token>` (or `?token=` for WS/artifact opens).

- `GET /v1/host`
- `POST /v1/pair` — `{ pairCode, deviceLabel }`
- `GET /v1/agents` / `POST /v1/agents`
- `GET /v1/agents/:id`
- `POST /v1/agents/:id/prompt|steer|follow-up|cancel|needs-input`
- `GET /v1/agents/:id/artifacts/:artifactId`
- `WSS /v1/agents/:id/stream`

## Development

```bash
pnpm -r typecheck
pnpm -r test
```
