# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Prime Agent users, primarily developers and technical operators, who need to monitor and direct work from a phone while their agent runs on a desktop or other user-controlled machine.

## Product Purpose

Prime Pocket provides mobile access to Prime Agent without a hosted control plane. It lets people pair a phone with one or more local Pocket Bridges, view agent work, send prompts and follow-ups, respond when an agent needs input, and review artifacts while away from the desktop.

## Positioning

Pocket connects directly to the user's own infrastructure: the phone reaches a user-run Pocket Bridge over LAN or Tailscale, and the bridge connects to the Prime Agent daemon. Pocket does not operate a relay or hosted control plane, and fleet aggregation happens client-side across paired hosts.

## Operating Context

- A Pocket Bridge runs on the user's desktop or other machine and advertises reachable LAN/Tailscale URLs through a pairing QR/deep link.
- The user pairs from the mobile app by scanning or pasting the deep link, or by entering a bridge URL and pair code manually.
- Paired hosts are used across changing networks; the app can retry advertised URLs and reconnect when LAN/Tailscale reachability changes.
- The user can monitor multiple hosts and their agents from one phone, open a live transcript, and send work or decisions from the agent thread.
- Optional remote notifications use an ntfy topic owned and configured by the user; Pocket itself does not run push infrastructure.

## Capabilities and Constraints

- Pair hosts via QR/deep link, pasted payload, or manual URL plus pair code.
- Store paired host credentials on-device; native builds use secure storage, while the web build uses browser storage for test scenarios.
- Aggregate agents across paired hosts and filter them by all, working, needs attention, or in review.
- Open a live WebSocket transcript and send prompts and follow-ups. The bridge protocol also exposes steer, cancellation, and needs-input reply endpoints; visible mobile controls for those actions remain an implementation gap to preserve honestly in future work.
- Display agent-generated artifacts and inline image attachments through authenticated URLs; share images from the phone to an agent.
- Image prompts support up to 8 images, 8 MB decoded per image, and a 24 MB HTTP body. Supported image types are PNG, JPEG, WebP, and GIF; SVG is not supported.
- Demo mode is available without Prime Agent for validation. Live Prime-daemon integration is best-effort through a thin JSONL probe and does not yet provide full event or artifact fidelity.
- The app must support iOS and Android native behavior, permissions, safe areas, system navigation/back behavior, and platform accessibility settings. The web target exists only to exercise Playwright tests.
- Connectivity depends on the user's LAN, Tailscale, or user-provided tunnel. Pocket does not provide hosted relay, APNs, or FCM infrastructure.

## Brand Commitments

- Product name: Prime Pocket.
- It is part of the Prime Agent ecosystem and must preserve the Prime Agent relationship in product terminology.
- The product promise is direct, user-controlled access; do not imply that Pocket hosts, relays, or operates the user's agent infrastructure.
- Pairing and credential handling must make the user-controlled security model legible.

## Evidence on Hand

- Product and architecture documentation: `README.md` and `docs/TAILSCALE.md`.
- Mobile implementation and routes: `apps/mobile/app/` and `apps/mobile/src/`.
- Expo configuration and native permissions: `apps/mobile/app.json`.
- End-to-end proof of pairing, multi-agent workflows, live transcripts, and bidirectional image sharing: `apps/mobile/e2e/`.
- Shared API and pairing contracts: `packages/protocol/` and `packages/bridge/`.
- No customer testimonials, usage metrics, case studies, or other external proof assets are present in the repository; future work must not fabricate them.

## Product Principles

- Keep the user's infrastructure and credentials under the user's control.
- Make remote agent work understandable at a glance and actionable from a phone.
- Treat connectivity, pairing, and recovery as core workflows rather than setup details.
- Preserve parity of core capability across iOS and Android while respecting each platform's native conventions.
- Be honest about what Pocket operates: a mobile client and local bridge, not a hosted automation service.
