import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  isImageMime,
  type AgentSnapshot,
  type ArtifactMeta,
  type PairedHost,
  type StreamServerMessage,
  type TranscriptMessage,
} from "@prime-pocket/protocol";
import { PocketHostClient } from "../../../src/api";
import { loadPairedHosts } from "../../../src/storage";
import { colors, fonts, radii, shadows, space, type } from "../../../src/theme";
import { CircleButton } from "../../../src/components/CircleButton";
import { Icon } from "../../../src/components/Icon";
import { PillComposer, type PendingImage } from "../../../src/components/PillComposer";
import { ArtifactImage, MessageImages } from "../../../src/components/MessageImages";
import { pickImages } from "../../../src/pickImages";

/** Bold only for `**key phrases**`, mono chips for `` `code` `` — as in the reference. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text style={styles.bodyText}>
      {parts.map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <Text key={i} style={styles.code}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <Text key={i} style={styles.bodyStrong}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

/** Small type badge in the Changes card: TS / JS / MD / IMG, tinted per language. */
function fileBadge(name: string, imageLike: boolean): { label: string; accent: string } {
  if (imageLike) return { label: "IMG", accent: colors.imgViolet };
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "ts" || ext === "tsx") return { label: "TS", accent: colors.tsBlue };
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs")
    return { label: "JS", accent: colors.jsAmber };
  if (ext === "css" || ext === "scss") return { label: "CSS", accent: colors.tsBlue };
  if (ext === "json") return { label: "{}", accent: colors.muted };
  if (ext === "md" || ext === "mdx") return { label: "MD", accent: colors.muted };
  return { label: (ext || "txt").slice(0, 3).toUpperCase(), accent: colors.muted };
}

/** Collapsed Changes card shows a handful of rows; the rest sit behind View details. */
const COLLAPSED_FILES = 4;
const COLLAPSED_SUMMARY = 600;

export default function AgentScreen() {
  const router = useRouter();
  const { hostId, agentId } = useLocalSearchParams<{ hostId: string; agentId: string }>();
  const [host, setHost] = useState<PairedHost | null>(null);
  const [snapshot, setSnapshot] = useState<AgentSnapshot | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [streamingText, setStreamingText] = useState<Record<string, string>>({});
  const [needsInput, setNeedsInput] = useState<{ requestId: string; prompt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [imagesEnabled, setImagesEnabled] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const streamRef = useRef<{ close: () => void } | null>(null);
  const deltasRef = useRef<Record<string, string>>({});
  const sendingRef = useRef(false);

  // Web e2e / Playwright hook to seed composer image previews without a native picker.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      __pocketSetPendingImages?: (imgs: PendingImage[]) => void;
    };
    w.__pocketSetPendingImages = setPendingImages;
    return () => {
      delete w.__pocketSetPendingImages;
    };
  }, []);

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
    if (ev.type === "error") setError(ev.message);
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
      onError: () => setError("Stream disconnected — reopen to reconnect"),
    });
    void client
      .getHost()
      .then((info) => setImagesEnabled(info.capabilities.images !== false))
      .catch(() => setImagesEnabled(true));
    return () => {
      streamRef.current?.close();
      streamRef.current = null;
    };
  }, [client, agentId, applyServerMessage]);

  async function send() {
    if (!client || !agentId) return;
    if (sendingRef.current) return;
    if (!draft.trim() && pendingImages.length === 0) return;
    const imagesSnapshot = pendingImages.slice();
    const textSnapshot = draft.trim() || (imagesSnapshot.length ? "Shared image(s)" : "");
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      await client.prompt(agentId, {
        message: textSnapshot,
        streamingBehavior: snapshot?.streaming ? "followUp" : undefined,
        images: imagesSnapshot.map((img) => ({
          mimeType: img.mimeType,
          dataBase64: img.dataBase64,
          name: img.name,
        })),
      });
      setDraft("");
      setPendingImages((prev) => prev.filter((p) => !imagesSnapshot.some((s) => s.id === p.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function onAttach() {
    if (!imagesEnabled || sendingRef.current) return;
    try {
      const picked = await pickImages();
      if (picked.length) setPendingImages((prev) => [...prev, ...picked].slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const assistantSummary = [...messages].reverse().find((m) => m.role === "assistant")?.text;
  const artifacts: ArtifactMeta[] = snapshot?.artifacts ?? [];
  const visibleArtifacts = expanded ? artifacts : artifacts.slice(0, COLLAPSED_FILES);
  const hiddenArtifacts = artifacts.length - visibleArtifacts.length;
  const running = snapshot?.streaming || snapshot?.agent.status === "running";

  if (!host && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <CircleButton accessibilityLabel="Back" onPress={() => router.back()}>
          <Icon name="chevronLeft" size={19} color={colors.ink} strokeWidth={2} />
        </CircleButton>
        <Text style={styles.navTitle} numberOfLines={1}>
          {snapshot?.agent.name ?? "Agent"}
        </Text>
        <CircleButton accessibilityLabel="More">
          <Icon name="more" size={19} color={colors.ink} />
        </CircleButton>
      </View>

      <FlatList
        data={messages.filter((m) => m.role !== "system")}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            {assistantSummary ? (
              <View style={styles.summary}>
                <RichText
                  text={expanded ? assistantSummary : assistantSummary.slice(0, COLLAPSED_SUMMARY)}
                />
              </View>
            ) : (
              <Text style={styles.placeholderSummary}>Waiting for the agent to report…</Text>
            )}

            {needsInput ? (
              <View style={styles.needsCard}>
                <Text style={styles.needsTitle}>Needs Attention</Text>
                <Text style={styles.needsBody}>{needsInput.prompt}</Text>
                <View style={styles.needsRow}>
                  <Pressable
                    style={[styles.replyPill, styles.replyPrimary]}
                    onPress={() =>
                      void client
                        ?.replyNeedsInput(agentId!, { requestId: needsInput.requestId, value: true })
                        .then(() => setNeedsInput(null))
                    }
                  >
                    <Text style={[styles.actionPillText, styles.replyPrimaryText]}>Approve</Text>
                  </Pressable>
                  <Pressable
                    style={styles.replyPill}
                    onPress={() =>
                      void client
                        ?.replyNeedsInput(agentId!, { requestId: needsInput.requestId, value: false })
                        .then(() => setNeedsInput(null))
                    }
                  >
                    <Text style={styles.actionPillText}>Deny</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {artifacts.length > 0 ? (
              <>
                <View style={styles.changesCard}>
                  <View style={styles.changesHead}>
                    <Text style={styles.changesTitle}>Changes</Text>
                    <Text style={styles.changesCount}>{artifacts.length}</Text>
                  </View>
                  {visibleArtifacts.map((a) => {
                    const url = host
                      ? `${client?.artifactUrl(agentId!, a.id)}?token=${encodeURIComponent(host.token)}`
                      : undefined;
                    const imageLike = a.kind === "image" || isImageMime(a.mimeType);
                    const badge = fileBadge(a.name, imageLike);
                    return (
                      <View key={a.id}>
                        <Pressable
                          style={styles.fileRow}
                          onPress={() => {
                            if (url) void Linking.openURL(url);
                          }}
                        >
                          <View style={styles.fileLeft}>
                            <View style={[styles.fileIcon, { backgroundColor: badge.accent + "14" }]}>
                              <Text style={[styles.fileIconText, { color: badge.accent }]}>
                                {badge.label}
                              </Text>
                            </View>
                            <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">
                              {a.name}
                            </Text>
                          </View>
                          <View style={styles.diffGroup}>
                            <Text style={[styles.diff, styles.diffAdd]}>
                              +{Math.max(1, Math.round(a.sizeBytes / 40))}
                            </Text>
                            <Text style={[styles.diff, styles.diffDel]}>-0</Text>
                          </View>
                        </Pressable>
                        {imageLike && url ? (
                          <View style={styles.filePreview}>
                            <ArtifactImage mimeType={a.mimeType} url={url} compact />
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                  {hiddenArtifacts > 0 ? (
                    <Text style={styles.moreFiles}>
                      +{hiddenArtifacts} more {hiddenArtifacts === 1 ? "file" : "files"}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.actionRow}>
                  <Pressable
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.actionPill, pressed && styles.pressed]}
                    onPress={() => setExpanded((v) => !v)}
                  >
                    <Icon name="gitBranch" size={15} color={colors.ink} strokeWidth={1.8} />
                    <Text style={styles.actionPillText}>
                      {expanded ? "Hide details" : "View details"}
                    </Text>
                  </Pressable>
                  {running ? (
                    <Pressable
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.actionPill, pressed && styles.pressed]}
                      onPress={() => void client?.cancel(agentId!).catch((e) => setError(String(e)))}
                      disabled={sending}
                    >
                      <Text style={styles.actionPillText}>Cancel</Text>
                    </Pressable>
                  ) : null}
                </View>
              </>
            ) : null}

            {Object.entries(streamingText).map(([id, text]) => (
              <View key={id} style={styles.liveBubble}>
                <Text style={styles.liveLabel}>Live</Text>
                <Text style={styles.bodyText}>{text}</Text>
              </View>
            ))}

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.threadLabel}>Thread</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.msg, item.role === "user" ? styles.msgUser : styles.msgAssistant]}>
            <Text style={styles.msgRole}>{item.role === "user" ? "You" : "Agent"}</Text>
            {item.text ? <Text style={styles.bodyText}>{item.text}</Text> : null}
            <MessageImages images={item.images} host={host} agentId={agentId} />
          </View>
        )}
      />

      <View style={styles.bottomDock} pointerEvents="box-none">
        <PillComposer
          value={draft}
          onChangeText={setDraft}
          onSubmit={() => void send()}
          onPlus={() => void onAttach()}
          pendingImages={pendingImages}
          onRemoveImage={(id) => setPendingImages((prev) => prev.filter((p) => p.id !== id))}
          placeholder="Follow up..."
          sending={sending}
          imagesEnabled={imagesEnabled}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.gutter,
    marginTop: 6,
    gap: 10,
  },
  navTitle: { ...type.navTitle, flex: 1, textAlign: "center" },
  content: { paddingHorizontal: space.gutter, paddingTop: 14, paddingBottom: 190 },
  summary: { marginBottom: 20 },
  placeholderSummary: { ...type.body, color: colors.muted, marginBottom: 20 },
  bodyText: type.body,
  bodyStrong: type.bodyStrong,
  code: {
    fontFamily: fonts.mono,
    backgroundColor: colors.codeBg,
    overflow: "hidden",
    borderRadius: 5,
    paddingHorizontal: 4,
    fontSize: 14,
  },
  needsCard: {
    backgroundColor: "#FFF6EA",
    borderRadius: radii.panel,
    padding: 16,
    marginBottom: 14,
  },
  needsTitle: {
    ...type.sectionLabel,
    color: colors.needsAttention,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  needsBody: type.body,
  needsRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  replyPill: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.pill,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  replyPrimary: { backgroundColor: colors.ink },
  replyPrimaryText: { color: "#fff" },
  changesCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.panel,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 11,
    ...shadows.row,
  },
  changesHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  changesTitle: type.cardTitle,
  changesCount: { ...type.cardTitle, color: colors.muted, fontWeight: "500" },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 7,
  },
  fileLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  fileIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: colors.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  fileIconText: type.badge,
  fileName: { ...type.bodySmall, fontWeight: "500", flexShrink: 1 },
  filePreview: { paddingLeft: 36, paddingTop: 2, paddingBottom: 6 },
  diffGroup: { flexDirection: "row", alignItems: "center", gap: 9 },
  diff: type.diff,
  diffAdd: { color: colors.diffAdd },
  diffDel: { color: colors.diffDel },
  moreFiles: { ...type.meta, fontSize: 12, marginTop: 4, marginLeft: 36 },
  liveBubble: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.row,
    padding: 14,
    marginBottom: 10,
    ...shadows.row,
  },
  liveLabel: { ...type.sectionLabel, color: colors.working, letterSpacing: 0.6, marginBottom: 5 },
  threadLabel: { ...type.sectionLabel, marginTop: 22, marginBottom: 10, marginLeft: 3 },
  msg: { borderRadius: radii.row, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8 },
  msgUser: { backgroundColor: "#E7F0FF", alignSelf: "flex-end", maxWidth: "92%" },
  msgAssistant: {
    backgroundColor: colors.bgElevated,
    alignSelf: "flex-start",
    maxWidth: "92%",
    ...shadows.row,
  },
  msgRole: { ...type.sectionLabel, fontSize: 11, letterSpacing: 0.5, marginBottom: 4 },
  error: { ...type.meta, color: colors.danger, marginBottom: 8 },
  bottomDock: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
  },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12, paddingHorizontal: 2 },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.pill,
    paddingHorizontal: 15,
    paddingVertical: 10,
    ...shadows.control,
  },
  actionPillText: type.pill,
  pressed: { opacity: 0.7 },
});
