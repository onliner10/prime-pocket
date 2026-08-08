#!/usr/bin/env node
import { Command } from "commander";
import qrcode from "qrcode-terminal";
import { DEFAULT_BRIDGE_PORT } from "@prime-pocket/protocol";
import { BridgeStore } from "./store.js";
import { BridgeServer } from "./server.js";
import { createBackend } from "./backend/prime.js";
import { defaultHostName } from "./network.js";
import { join } from "node:path";

const program = new Command();

program
  .name("prime-pocket")
  .description("Mobile bridge for Prime Agent (no hosted control plane)")
  .version("0.1.0");

program
  .command("bridge")
  .description("Start the local Pocket bridge API")
  .option("-p, --port <port>", "Listen port", String(DEFAULT_BRIDGE_PORT))
  .option("--demo", "Force demo backend (ignore Prime daemon)", false)
  .option("--http", "Use plain HTTP (dev/tests only)", false)
  .option("--data-dir <dir>", "State directory", undefined)
  .option("--host-name <name>", "Host display name", defaultHostName())
  .option("--ntfy-topic <topic>", "Optional ntfy topic for remote alerts")
  .option("--ntfy-server <url>", "ntfy server base URL", "https://ntfy.sh")
  .option("--daemon-socket <path>", "Prime daemon socket path")
  .option(
    "--github-token <token>",
    "GitHub personal access token to store on this host (or set PRIME_POCKET_GITHUB_TOKEN)",
  )
  .option(
    "--github-client-id <id>",
    "Override GitHub OAuth App client id (default: shipped Prime Pocket app)",
  )
  .action(async (opts: {
    port: string;
    demo?: boolean;
    http?: boolean;
    dataDir?: string;
    hostName: string;
    ntfyTopic?: string;
    ntfyServer?: string;
    daemonSocket?: string;
    githubToken?: string;
    githubClientId?: string;
  }) => {
    const store = new BridgeStore(opts.dataDir, opts.hostName);
    if (opts.ntfyTopic) {
      store.setNtfy(opts.ntfyTopic, opts.ntfyServer);
    }
    if (opts.githubToken?.trim()) {
      store.setGitHubAuth({ token: opts.githubToken.trim(), mode: "token" });
    }
    if (opts.githubClientId?.trim()) {
      process.env.PRIME_POCKET_GITHUB_CLIENT_ID = opts.githubClientId.trim();
    }

    const { backend, mode } = await createBackend({
      hostId: store.data.identity.hostId,
      artifactRoot: join(store.dataDir, "artifacts"),
      forceDemo: Boolean(opts.demo) || process.env.PRIME_POCKET_DEMO === "1",
      daemonSocket: opts.daemonSocket,
    });

    const port = Number(opts.port);
    const server = new BridgeServer({
      store,
      backend,
      port,
      tls: !opts.http,
    });

    const started = await server.start();
    console.log(`Prime Pocket bridge listening`);
    console.log(`  mode:     ${mode}`);
    console.log(`  host:     ${store.data.identity.hostName} (${store.data.identity.hostId})`);
    console.log(`  urls:`);
    for (const u of started.urls) console.log(`    ${u}`);
    console.log(`  fingerprint: ${store.data.identity.fingerprint}`);
    console.log(`  pair code:   ${started.pairing.pairCode} (expires ${store.data.pairCodeExpiresAt})`);
    const github = server.github.status();
    console.log(
      `  github:      ${
        github.mock
          ? "mock catalog (demo)"
          : github.connected
            ? `${github.mode}${github.login ? ` (${github.login})` : ""}`
            : github.oauthAvailable
              ? "not connected — Continue with GitHub in the app"
              : "not connected — set --github-client-id for browser login, or paste a PAT"
      }`,
    );
    if (store.data.ntfyTopic) {
      console.log(`  ntfy:        ${store.data.ntfyServer ?? "https://ntfy.sh"}/${store.data.ntfyTopic}`);
    }
    console.log("");
    console.log("Scan this QR with the Prime Pocket app (or open the deep link):");
    console.log(started.pairingDeepLink);
    console.log("");
    qrcode.generate(started.pairingDeepLink, { small: true });

    const shutdown = async () => {
      console.log("\nShutting down…");
      await server.stop();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  });

program
  .command("pair-code")
  .description("Rotate and print a fresh pairing code / QR")
  .option("--data-dir <dir>", "State directory")
  .option("-p, --port <port>", "Port used in QR URLs", String(DEFAULT_BRIDGE_PORT))
  .option("--http", "Advertise http URLs", false)
  .action(async (opts: { dataDir?: string; port: string; http?: boolean }) => {
    const store = new BridgeStore(opts.dataDir, defaultHostName());
    store.rotatePairCode();
    const backendStub = {
      capabilities: {
        prompt: true,
        steer: true,
        followUp: true,
        cancel: true,
        artifacts: true,
        launch: true,
        images: true,
        demoMode: true,
        workspaces: true,
        github: true,
      },
    };
    // Build pairing via a short-lived server helper without listening
    const { collectAdvertisedUrls, pickPreferredUrl } = await import("./network.js");
    let urls = await collectAdvertisedUrls(Number(opts.port));
    if (opts.http) urls = urls.map((u) => u.replace(/^https:/, "http:"));
    const { encodePairingQr } = await import("@prime-pocket/protocol");
    const payload = {
      v: 1 as const,
      url: pickPreferredUrl(urls),
      urls,
      pairCode: store.data.pairCode,
      fingerprint: store.data.identity.fingerprint,
      hostId: store.data.identity.hostId,
      hostName: store.data.identity.hostName,
    };
    void backendStub;
    const link = encodePairingQr(payload);
    console.log(link);
    qrcode.generate(link, { small: true });
    console.log(`pair code: ${payload.pairCode}`);
  });

program
  .command("revoke")
  .description("Revoke a paired device token")
  .argument("<token>", "Bearer token to revoke")
  .option("--data-dir <dir>", "State directory")
  .action((token: string, opts: { dataDir?: string }) => {
    const store = new BridgeStore(opts.dataDir, defaultHostName());
    const ok = store.revokeToken(token);
    console.log(ok ? "Revoked." : "Token not found.");
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
