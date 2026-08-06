## Tailscale setup for Prime Pocket

Pocket does not operate a relay. To use your phone away from home Wi‑Fi:

1. Create a Tailscale account and install the app on **desktop** and **phone**.
2. Sign both devices into the same tailnet.
3. On the desktop, start the bridge (`prime-pocket bridge`).
4. Confirm the printed URLs include a Tailscale IP (`100.x.y.z`) or MagicDNS name (`*.ts.net`).
5. Pair from the phone (same QR). The app tries each advertised URL and keeps the first that responds.

### Tips

- MagicDNS must be enabled in the Tailscale admin console for hostname URLs.
- If pairing fails remotely, open the Hosts screen → **Reconnect** after both devices are online.
- Do not port-forward the bridge on your router; keep it on the tailnet only.

### Optional: user tunnels

If you prefer Cloudflare Tunnel or ngrok instead of Tailscale, start the tunnel to `localhost:7420` and paste that HTTPS URL + the current pair code into the app’s manual pair form.
