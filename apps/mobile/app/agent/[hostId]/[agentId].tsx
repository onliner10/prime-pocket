import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import type {
  AgentSnapshot,
  PairedHost,
  StreamServerMessage,
  TranscriptMessage,
} from "@prime-pocket/protocol";
import { PocketHostClient } from "../../../src/api";
import { loadPairedHosts } from "../../../src/storage";
import { colors } from "../../../src/theme";

export default function AgentScreen() {
  const { hostId, agentId } = useLocalSearchParams<{ hostId: string; agentId: string }>();
  const [host, setHost] = useState<PairedHost | null>(null);
  const [snapshot, setSnapshot] = useState<AgentSnapshot | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streamingText, setStreamingText] = useState<Record<string, string>>({});
  const [needsInput, setNeedsInput] = useState<{ requestId: string; prompt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const streamRef = useRef<{ close: () => void } | null>(null);
  const deltasRef = useRef<Record<string, string>>({});

  const client = useMemo(() => (host ? new PocketHostClient(host) : null), [host]);

  const applyServerMessage = useCallback((msg: StreamServerMessage) => {
    if (msg.type === "snapshot") {
      setSnapshot(msg.snapshot);
      setMessages(msg.snapshot.messages);
      deltasRef.current = {};
      setStreamingText({});
      return;
    }
    if (msg.type !== "event") return;
    const ev = msg.event;
    if (ev.type === "resync") {
      setSnapshot(ev.snapshot);
      setMessages(ev.snapshot.messages);
      return;
    }
    if (ev.type === "message_delta") {
      deltasRef.current[ev.messageId] = (deltasRef.current[ev.messageId] ?? "") + ev.text;
      setStreamingText({ ...deltasRef.current });
      return;
    }
    if (ev.type === "message_done") {
      delete deltasRef.current[ev.message.id];
      setStreamingText({ ...deltasRef.current });
      setMessages((prev) => {
        if (prev.some((m) => m.id === ev.message.id)) {
          return prev.map((m) => (m.id === ev.message.id ? ev.message : m));
        }
        return [...prev, ev.message];
      });
      return;
    }
    if (ev.type === "status") {
      setSnapshot((s) =>
        s ? { ...s, agent: { ...s.agent, status: ev.status }, streaming: ev.status === "running" } : s,
      );
      if (ev.status !== "needs_input") setNeedsInput(null);
      return;
    }
    if (ev.type === "needs_input") {
      setNeedsInput({ requestId: ev.requestId, prompt: ev.prompt });
      return;
    }
    if (ev.type === "artifact") {
      setSnapshot((s) => (s ? { ...s, artifacts: [...s.artifacts, ev.artifact] } : s));
      return;
    }
    if (ev.type === "error") {
      setError(ev.message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const hosts = await loadPairedHosts();
      const found = hosts.find((h) => h.hostId === hostId) ?? null;
      if (!cancelled) setHost(found);
      if (!found) setError("Host not paired on this device");
    })();
    return () => {
      cancelled = true;
    };
  }, [hostId]);

  useEffect(() => {
    if (!client || !agentId) return;
    setError(null);
    streamRef.current?.close();
    streamRef.current = client.openAgentStream(agentId, {
      onMessage: applyServerMessage,
      onError: () => setError("Stream error — pull to reconnect by leaving and re-entering"),
      onClose: () => {
        // soft reconnect
        setTimeout(() => {
          if (!client) return;
          streamRef.current = client.openAgentStream(agentId, {
            onMessage: applyServerMessage,
          });
        }, 1500);
      },
    });
    return () => {
      streamRef.current?.close();
      streamRef.current = null;
    };
  }, [client, agentId, applyServerMessage]);

  async function send(mode: "prompt" | "steer" | "followUp") {
    if (!client || !agentId || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const message = draft.trim();
      if (mode === "steer") await client.steer(agentId, { message });
      else if (mode === "followUp") await client.followUp(agentId, { message });
      else {
        await client.prompt(agentId, {
          message,
          streamingBehavior: snapshot?.streaming ? "followUp" : undefined,
        });
      }
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  const liveRows: Array<TranscriptMessage | { id: string; role: "assistant"; text: string; live: true }> = [
    ...messages,
    ...Object.entries(streamingText).map(([id, text]) => ({
      id,
      role: "assistant" as const,
      text,
      live: true as const,
    })),
  ];

  if (!host && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{snapshot?.agent.name ?? agentId}</Text>
        <Text style={styles.meta}>
          {snapshot?.agent.status ?? "…"}
          {snapshot?.agent.model ? ` · ${snapshot.agent.model}` : ""}
        </Text>
      </View>

      {needsInput ? (
        <View style={styles.needs}>
          <Text style={styles.needsTitle}>Needs input</Text>
          <Text style={styles.needsBody}>{needsInput.prompt}</Text>
          <View style={styles.needsRow}>
            <Pressable
              style={styles.smallBtn}
              onPress={() =>
                void client
                  ?.replyNeedsInput(agentId!, { requestId: needsInput.requestId, value: true })
                  .then(() => setNeedsInput(null))
              }
            >
              <Text style={styles.smallBtnText}>Approve</Text>
            </Pressable>
            <Pressable
              style={[styles.smallBtn, styles.danger]}
              onPress={() =>
                void client
                  ?.replyNeedsInput(agentId!, { requestId: needsInput.requestId, value: false })
                  .then(() => setNeedsInput(null))
              }
            >
              <Text style={styles.smallBtnText}>Deny</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {snapshot?.artifacts?.length ? (
        <View style={styles.artifacts}>
          {snapshot.artifacts.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => {
                const url = client?.artifactUrl(agentId!, a.id);
                if (url) void Linking.openURL(`${url}?token=${encodeURIComponent(host!.token)}`);
              }}
            >
              <Text style={styles.artifact}>📎 {a.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <FlatList
        data={liveRows}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === "user" ? styles.user : styles.assistant,
            ]}
          >
            <Text style={styles.role}>{item.role}{"live" in item && item.live ? " · live" : ""}</Text>
            <Text style={styles.bubbleText}>{item.text}</Text>
          </View>
        )}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Follow up…"
          placeholderTextColor={colors.muted}
          multiline
        />
        <View style={styles.composerRow}>
          <Pressable style={styles.smallBtn} onPress={() => void send("prompt")} disabled={sending}>
            <Text style={styles.smallBtnText}>Send</Text>
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={() => void send("steer")} disabled={sending}>
            <Text style={styles.ghostText}>Steer</Text>
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={() => void send("followUp")} disabled={sending}>
            <Text style={styles.ghostText}>Queue</Text>
          </Pressable>
          <Pressable
            style={styles.ghostBtn}
            onPress={() => void client?.cancel(agentId!).catch((e) => setError(String(e)))}
          >
            <Text style={styles.ghostText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { color: colors.ink, fontSize: 20, fontWeight: "700" },
  meta: { color: colors.muted, marginTop: 2 },
  needs: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: "#2A2410",
    borderRadius: 10,
  },
  needsTitle: { color: "#F0C14A", fontWeight: "700" },
  needsBody: { color: colors.ink, marginTop: 4 },
  needsRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  artifacts: { paddingHorizontal: 16, gap: 4 },
  artifact: { color: colors.accent, marginBottom: 4 },
  bubble: { borderRadius: 12, padding: 12, marginBottom: 8 },
  user: { backgroundColor: colors.userBubble, alignSelf: "flex-end", maxWidth: "92%" },
  assistant: { backgroundColor: colors.assistantBubble, alignSelf: "flex-start", maxWidth: "92%" },
  role: { color: colors.muted, fontSize: 11, marginBottom: 4, textTransform: "uppercase" },
  bubbleText: { color: colors.ink, fontSize: 15, lineHeight: 21 },
  error: { color: colors.danger, paddingHorizontal: 16, marginBottom: 4 },
  composer: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    padding: 12,
    backgroundColor: colors.bgElevated,
  },
  input: {
    color: colors.ink,
    minHeight: 40,
    maxHeight: 120,
    marginBottom: 8,
  },
  composerRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  smallBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  smallBtnText: { color: "#042015", fontWeight: "700" },
  danger: { backgroundColor: colors.danger },
  ghostBtn: {
    borderColor: colors.line,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  ghostText: { color: colors.ink, fontWeight: "600" },
});
