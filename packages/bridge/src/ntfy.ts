/**
 * Optional remote wake via ntfy (https://ntfy.sh) — user-owned topic, not Pocket infra.
 */
export async function publishNtfy(opts: {
  topic: string;
  title: string;
  message: string;
  server?: string;
  priority?: number;
  tags?: string[];
}): Promise<void> {
  const base = (opts.server ?? "https://ntfy.sh").replace(/\/$/, "");
  const url = `${base}/${encodeURIComponent(opts.topic)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Title: opts.title,
      Priority: String(opts.priority ?? 3),
      Tags: (opts.tags ?? ["robot"]).join(","),
    },
    body: opts.message,
  });
  if (!res.ok) {
    throw new Error(`ntfy publish failed: ${res.status} ${await res.text()}`);
  }
}
