import { networkInterfaces, hostname } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function getLanAddresses(): string[] {
  const nets = networkInterfaces();
  const addrs: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const e of entries) {
      if (e.internal) continue;
      // Node typings use string "IPv4" | "IPv6"; some runtimes historically used 4/6.
      const family = String(e.family);
      if (family !== "IPv4" && family !== "4") continue;
      addrs.push(e.address);
    }
  }
  return addrs;
}

export async function getTailscaleAddresses(): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("tailscale", ["ip", "-4"], { timeout: 2000 });
    return stdout
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function getTailscaleDnsName(): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("tailscale", ["status", "--json"], { timeout: 3000 });
    const json = JSON.parse(stdout) as { Self?: { DNSName?: string; HostName?: string } };
    const dns = json.Self?.DNSName?.replace(/\.$/, "");
    return dns || json.Self?.HostName;
  } catch {
    return undefined;
  }
}

export function defaultHostName(): string {
  return process.env.PRIME_POCKET_HOST_NAME ?? hostname().split(".")[0] ?? "prime-pocket";
}

export async function collectAdvertisedUrls(port: number): Promise<string[]> {
  const urls = new Set<string>();
  urls.add(`https://127.0.0.1:${port}`);
  for (const ip of getLanAddresses()) {
    urls.add(`https://${ip}:${port}`);
  }
  for (const ip of await getTailscaleAddresses()) {
    urls.add(`https://${ip}:${port}`);
  }
  const dns = await getTailscaleDnsName();
  if (dns) {
    urls.add(`https://${dns}:${port}`);
  }
  return [...urls];
}

export function pickPreferredUrl(urls: string[]): string {
  const tailDns = urls.find((u) => u.includes(".ts.net") || u.includes("tailnet"));
  if (tailDns) return tailDns;
  const nonLoopback = urls.find((u) => !u.includes("127.0.0.1"));
  return nonLoopback ?? urls[0]!;
}
