import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { createServer, type Server, type Socket as NetSocket } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrimeDaemonBackend } from "./prime.js";

const PROTOCOL = { name: "prime-agent.daemon", version: 7 };

/**
 * Minimal protocol-7 daemon stand-in: rejects bare commands the way Prime 0.7
 * does, and answers enveloped list/create/attach/prompt.
 */
function startMockDaemon(socketPath: string): Promise<{
  server: Server;
  close: () => Promise<void>;
}> {
  const sessions = new Map<
    string,
    {
      activeSessionId: string;
      sessionName: string;
      cwd: string;
      created: string;
      modified: string;
      activity: string;
      isStreaming: boolean;
      messageCount: number;
      messages: Array<{ role: string; content: Array<{ type: string; text: string }>; timestamp: number }>;
    }
  >();

  const server = createServer((socket: NetSocket) => {
    socket.write(
      `${JSON.stringify({
        type: "daemon_hello",
        socketPath,
        protocol: PROTOCOL,
        schemaId: "mock",
        schemaRevision: 1,
        appVersion: "0.0-test",
        clientId: "mock-client",
        serverCapabilities: [],
      })}\n`,
    );

    let buf = "";
    socket.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }

        // Bare / legacy commands (what the old Pocket adapter sent)
        if (msg.type !== "command") {
          const id = typeof msg.id === "string" ? msg.id : "unknown";
          socket.write(
            `${JSON.stringify({
              id,
              type: "response",
              command: "parse",
              success: false,
              error: "Daemon commands require protocol 7 or newer",
            })}\n`,
          );
          continue;
        }

        const id = String(msg.id ?? "");
        const protocol = msg.protocol as { name?: string; version?: number } | undefined;
        const command = msg.command as Record<string, unknown> | undefined;
        if (
          protocol?.name !== PROTOCOL.name ||
          typeof protocol.version !== "number" ||
          protocol.version < 7 ||
          !command ||
          typeof command.type !== "string"
        ) {
          socket.write(
            `${JSON.stringify({
              id,
              type: "response",
              command: "parse",
              success: false,
              error: "Daemon commands require protocol 7 or newer",
            })}\n`,
          );
          continue;
        }

        const ok = (data: unknown) => {
          socket.write(
            `${JSON.stringify({ id, type: "response", command: command.type, success: true, data })}\n`,
          );
        };

        if (command.type === "list") {
          ok({ sessions: [...sessions.values()] });
          continue;
        }

        if (command.type === "create") {
          const sessionName = String(command.name ?? "agent");
          if ([...sessions.values()].some((s) => s.sessionName === sessionName)) {
            socket.write(
              `${JSON.stringify({
                id,
                type: "response",
                command: "create",
                success: false,
                error: `Agent name "${sessionName}" is unavailable: an agent of that name already exists at depth 0 under this parent`,
              })}\n`,
            );
            continue;
          }
          const activeSessionId = `sess_${sessions.size + 1}`;
          const now = new Date().toISOString();
          const config = command.config as { cwd?: string } | undefined;
          const row = {
            activeSessionId,
            sessionName,
            cwd: config?.cwd ?? "/tmp",
            created: now,
            modified: now,
            // Match Prime daemon: new sessions are draft + activity working.
            activity: "working",
            lifecycle: "draft",
            isStreaming: false,
            isSessionActive: false,
            messageCount: 0,
            messages: [] as Array<{
              role: string;
              content: Array<{ type: string; text: string }>;
              timestamp: number;
            }>,
            model: { id: "mock-model", name: "Mock Model" },
          };
          sessions.set(activeSessionId, row);
          ok(row);
          continue;
        }

        if (command.type === "attach") {
          const activeSessionId = String(command.activeSessionId ?? "");
          const row = sessions.get(activeSessionId);
          if (!row) {
            socket.write(
              `${JSON.stringify({
                id,
                type: "response",
                command: "attach",
                success: false,
                error: "unknown session",
              })}\n`,
            );
            continue;
          }
          ok({
            protocol: PROTOCOL,
            activeSessionId,
            snapshot: {
              activeSessionId,
              summary: row,
              state: { isStreaming: row.isStreaming },
              messages: row.messages,
              lastEventSequence: row.messageCount,
              lastEventCursor: { generation: "g1", sequence: row.messageCount },
            },
            replay: { status: "complete", toSequence: row.messageCount },
            lastEventSequence: row.messageCount,
            lastEventCursor: { generation: "g1", sequence: row.messageCount },
            client: { id: "mock", capabilities: [] },
          });
          continue;
        }

        if (command.type === "prompt") {
          const activeSessionId = String(command.activeSessionId ?? "");
          const row = sessions.get(activeSessionId);
          if (!row) {
            socket.write(
              `${JSON.stringify({
                id,
                type: "response",
                command: "prompt",
                success: false,
                error: "unknown session",
              })}\n`,
            );
            continue;
          }
          const userMsg = {
            role: "user",
            content: [{ type: "text", text: String(command.message ?? "") }],
            timestamp: Date.now(),
          };
          const assistantMsg = {
            role: "assistant",
            content: [{ type: "text", text: "mock-ok" }],
            timestamp: Date.now() + 1,
          };
          row.messages.push(userMsg, assistantMsg);
          row.messageCount = row.messages.length;
          row.modified = new Date().toISOString();
          ok({ ok: true });

          const emit = (sequence: number, event: unknown) => {
            socket.write(
              `${JSON.stringify({
                type: "session_event",
                activeSessionId,
                event,
                meta: {
                  id: `${activeSessionId}:${sequence}`,
                  protocol: PROTOCOL,
                  sequence,
                  cursor: { generation: "g1", sequence },
                  emittedAt: new Date().toISOString(),
                },
              })}\n`,
            );
          };

          emit(1, { type: "message_start", message: { role: "user", content: [], timestamp: Date.now() } });
          emit(2, { type: "message_end", message: userMsg });
          emit(3, { type: "message_start", message: { role: "assistant", content: [], timestamp: Date.now() } });
          // Real daemon sends full accumulated text on each update — not suffixes.
          for (const partial of ["m", "mo", "mock", "mock-ok"]) {
            emit(10 + partial.length, {
              type: "message_update",
              message: {
                role: "assistant",
                content: [{ type: "text", text: partial }],
                timestamp: Date.now(),
              },
            });
          }
          emit(20, { type: "message_end", message: assistantMsg });
          emit(21, { type: "turn_end", message: assistantMsg });
          continue;
        }

        if (command.type === "abort" || command.type === "steer" || command.type === "follow_up") {
          ok({ ok: true });
          continue;
        }

        socket.write(
          `${JSON.stringify({
            id,
            type: "response",
            command: command.type,
            success: false,
            error: `unhandled ${command.type}`,
          })}\n`,
        );
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(socketPath, () => {
      resolve({
        server,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    server.on("error", reject);
  });
}

describe("PrimeDaemonBackend protocol 7", () => {
  let dir: string;
  let socketPath: string;
  let mock: { server: Server; close: () => Promise<void> };
  let backend: PrimeDaemonBackend;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "pocket-prime-"));
    socketPath = join(dir, "daemon.sock");
    mock = await startMockDaemon(socketPath);
    backend = await PrimeDaemonBackend.connect("host_test", socketPath);
  });

  after(async () => {
    await backend.dispose();
    await mock.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists and launches agents via protocol-7 envelopes (not bare commands)", async () => {
    const before = await backend.listAgents();
    assert.equal(before.length, 0);

    const launched = await backend.launch({
      name: "from-phone",
      cwd: "/tmp/pocket-work",
    });
    assert.equal(launched.name, "from-phone");
    assert.equal(launched.cwd, "/tmp/pocket-work");
    assert.equal(launched.hostId, "host_test");
    assert.ok(launched.id);

    const after = await backend.listAgents();
    assert.equal(after.length, 1);
    assert.equal(after[0]!.id, launched.id);
  });

  it("attaches for snapshots and forwards prompt transcript events", async () => {
    const agents = await backend.listAgents();
    const agentId = agents[0]!.id;

    const events: Array<Record<string, unknown>> = [];
    const off = backend.onEvent((_id, ev) => {
      events.push(ev as unknown as Record<string, unknown>);
    });

    await backend.prompt(agentId, { message: "hello mock" });
    // Allow event flush
    await new Promise((r) => setTimeout(r, 50));

    const snap = await backend.getSnapshot(agentId);
    assert.ok(snap);
    assert.equal(snap!.agent.id, agentId);
    assert.ok(snap!.messages.some((m) => m.role === "user" && m.text.includes("hello mock")));
    assert.ok(snap!.messages.some((m) => m.role === "assistant" && m.text === "mock-ok"));
    assert.ok(events.some((e) => e.type === "message_done"));

    // Mobile appends delta.text — must be incremental suffixes under one id.
    const deltas = events.filter((e) => e.type === "message_delta") as Array<{
      type: string;
      messageId: string;
      text: string;
      role: string;
    }>;
    const assistantDeltas = deltas.filter((d) => d.role === "assistant");
    assert.ok(assistantDeltas.length >= 2);
    const ids = new Set(assistantDeltas.map((d) => d.messageId));
    assert.equal(ids.size, 1, "assistant deltas must share a stable messageId");
    assert.deepEqual(
      assistantDeltas.map((d) => d.text),
      ["m", "o", "ck", "-ok"],
    );
    const joined = assistantDeltas.map((d) => d.text).join("");
    assert.equal(joined, "mock-ok");

    const assistantDone = events.filter(
      (e) => e.type === "message_done" && (e.message as { role?: string })?.role === "assistant",
    );
    assert.equal(assistantDone.length, 1);
    assert.equal(
      (assistantDone[0]!.message as { id: string }).id,
      assistantDeltas[0]!.messageId,
    );
    off();
  });

  it("sends LaunchAgentRequest.prompt after create (inbox composer path)", async () => {
    const launched = await backend.launch({
      name: "inbox-launch",
      cwd: "/tmp/pocket-work",
      prompt: "build hello world",
    });
    await new Promise((r) => setTimeout(r, 50));
    const snap = await backend.getSnapshot(launched.id);
    assert.ok(snap);
    assert.ok(
      snap!.messages.some((m) => m.role === "user" && m.text.includes("build hello world")),
      "initial inbox prompt must reach the new agent",
    );
  });

  it("retries create with a unique name when the display name is taken", async () => {
    const first = await backend.launch({ name: "same-name", cwd: "/tmp/pocket-work" });
    assert.equal(first.name, "same-name");
    const second = await backend.launch({ name: "same-name", cwd: "/tmp/pocket-work" });
    assert.notEqual(second.id, first.id);
    assert.match(second.name, /^same-name · /);
  });

  it("does not mark empty draft sessions as Working", async () => {
    const launched = await backend.launch({ name: "empty-draft", cwd: "/tmp/pocket-work" });
    // Mock create rows are idle; force a draft/working list shape via second create
    // by reading list after patching through a dedicated create that mimics daemon drafts.
    assert.equal(launched.status, "idle");
    const agents = await backend.listAgents();
    const draft = agents.find((a) => a.name === "empty-draft");
    assert.ok(draft);
    assert.equal(draft!.status, "idle");
  });
});
