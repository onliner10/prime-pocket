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

## Image sharing (both ways)

- **Phone → agent:** tap **+** in the composer, pick photos, send with your follow-up. Images are uploaded in the prompt payload and stored as artifacts on the bridge.
- **Agent → phone:** image artifacts and message attachments render inline in the thread (demo returns a PNG when you ask for a screenshot / image).
- Image-only prompts are allowed (empty text → `Shared image(s)`).
- Limits: up to **8** images per prompt, **8 MB** decoded each, **24 MB** HTTP body. Allowlist: `png` / `jpeg` / `webp` / `gif` (no SVG). Filenames are sanitized for `Content-Disposition`.
- Mid-stream follow-ups with images are queued and answered after the current turn (demo). Steer + images is rejected.
- Live Prime daemon mode does not advertise `images` until artifact download is wired.

Authenticated artifact URLs use `?token=` so `<Image>` can load previews without custom headers.


When a Prime daemon socket is present, the bridge prefers it over demo mode:

```bash
prime-pocket bridge
# or
prime-pocket bridge --daemon-socket /path/to/daemon.sock
```

Socket probe paths include `~/.prime/agent/daemon.sock`, `~/.prime-agent/daemon.sock`, and env `PRIME_AGENT_SOCKET`.

> The Prime adapter speaks a thin JSONL probe today. Wire it to `DaemonAgentConnection` from prime-agent once you depend on that package for full session/event fidelity.

## GitHub (host-side)

Repositories and branches come from the bridge, never from a Pocket server. A live host uses a
GitHub **personal access token** that stays on that machine — classic tokens need the `repo` scope,
fine-grained tokens need read access to Contents and Metadata.

Three ways to give the bridge a token, in the order it looks:

```bash
# 1. Paste it in the app: Connect GitHub → Personal access token → Connect GitHub.
#    The bridge validates it against /user and saves it in ~/.prime-pocket/bridge.json.

# 2. Store it from the CLI once
prime-pocket bridge --github-token ghp_xxx

# 3. Read it from the host environment (nothing persisted)
PRIME_POCKET_GITHUB_TOKEN=ghp_xxx prime-pocket bridge
```

`GITHUB_TOKEN` works as a fallback for the env var. Disconnecting from the app deletes the stored
token, and a token GitHub has revoked is dropped the next time the bridge validates it.

`--demo` (or `PRIME_POCKET_GITHUB_MOCK=1`) serves a synthetic catalog instead, so demos and e2e
runs need no credentials. A bridge with no Prime daemon falls back to the demo backend and its mock
catalog too; set `PRIME_POCKET_GITHUB_MOCK=0` to keep live GitHub there. `PRIME_POCKET_GITHUB_API`
points the client at a GitHub Enterprise API base. Browser OAuth is not implemented.

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
- Workspaces = repositories/worktrees on a paired host (not the host itself)
- Add repository from GitHub catalog (live token on the host, mock in `--demo`) or local folder path
- Agent transcript with live WebSocket stream
- Prompt / steer / follow-up / cancel
- Needs-input approve/deny
- Artifact open via authenticated URL

## API surface (bridge)

Auth: `Authorization: Bearer <token>` (or `?token=` for WS/artifact opens).

- `GET /v1/host`
- `POST /v1/pair` — `{ pairCode, deviceLabel }`
- `GET /v1/workspaces` / `POST /v1/workspaces` / `POST /v1/workspaces/from-github` / `DELETE /v1/workspaces/:id`
- `GET /v1/github/status` / `GET /v1/github/repos` / `POST /v1/github/connect` — `{ mode: "mock" | "token", token? }` / `POST /v1/github/disconnect`
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
