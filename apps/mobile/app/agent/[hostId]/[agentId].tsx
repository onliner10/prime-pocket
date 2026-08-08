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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
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
import { colors, fonts, proofSafeArea, radii, shadows, space, type } from "../../../src/theme";
import { CircleButton } from "../../../src/components/CircleButton";
import { ComposerDock } from "../../../src/components/ComposerDock";
import { Icon } from "../../../src/components/Icon";
import { PillComposer, type PendingImage } from "../../../src/components/PillComposer";
import { ArtifactImage, MessageImages } from "../../../src/components/MessageImages";
import { pickImages } from "../../../src/pickImages";
import { composerDockBottom, useKeyboardHeight } from "../../../src/useKeyboardHeight";

type TimelineItem =
  | { kind: "message"; message: TranscriptMessage }
  | { kind: "changes"; id: string }
  | { kind: "live"; id: string; text: string };

/** The reference uses mono chips, bold emphasis, and blue inline links. */
function RichText({ text }: { text: string }) {
  const parts = text
    .split(/(\[[^\]]+\]\([^\)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g)
    .filter(Boolean);
  return (
    <Text style={styles.bodyText}>
      {parts.map((part, index) => {
        if (part.startsWith("[") && part.includes("](") && part.endsWith(")")) {
          const match = part.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
          if (match) {
            return (
              <Text
                key={index}
                style={styles.link}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(match[2]!)}
              >
                {match[1]}
              </Text>
            );
          }
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <Text key={index} style={styles.code}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <Text key={index} style={styles.bodyStrong}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        return <Text key={index}>{part}</Text>;
      })}
    </Text>
  );
}

function MessageText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/g).filter((paragraph) => paragraph.length > 0);
  return (
    <View style={styles.paragraphs}>
      {paragraphs.map((paragraph, index) => (
        <RichText key={`${index}-${paragraph.slice(0, 12)}`} text={paragraph} />
      ))}
    </View>
  );
}

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date
    .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
    .replace(/^0/, "");
}

/** Small, quiet file-type labels, matching the unboxed Cursor Changes rows. */
function fileBadge(name: string, imageLike: boolean): { label: string; accent: string } {
  if (imageLike) return { label: "IMG", accent: colors.imgViolet };
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (name === ".npmrc") return { label: "▥", accent: colors.muted };
  if (ext === "ts" || ext === "tsx") return { label: "TS", accent: colors.muted };
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs")
    return { label: "JS", accent: colors.muted };
  if (ext === "css" || ext === "scss") return { label: "CSS", accent: colors.muted };
  if (ext === "json") return { label: "{}", accent: colors.muted };
  if (ext === "md" || ext === "mdx") return { label: "MD", accent: colors.muted };
  return { label: (ext || "txt").slice(0, 3).toUpperCase(), accent: colors.muted };
}

function ChangesCard({
  artifacts,
  host,
  client,
  agentId,
}: {
  artifacts: ArtifactMeta[];
  host: PairedHost | null;
  client: PocketHostClient | null;
  agentId: string;
}) {
  if (!artifacts.length) return null;
  return (
    <View style={styles.changesCard}>
      <View style={styles.changesHead}>
        <Text style={styles.changesTitle}>Changes</Text>
        <Text style={styles.changesCount}>{artifacts.length}</Text>
      </View>
      {artifacts.map((artifact, index) => {
        const url = host && client
          ? `${client.artifactUrl(agentId, artifact.id)}?token=${encodeURIComponent(host.token)}`
          : undefined;
        const imageLike = artifact.kind === "image" || isImageMime(artifact.mimeType);
        const badge = fileBadge(artifact.name, imageLike);
        return (
          <View key={artifact.id} style={[styles.fileRowWrap, index > 0 && styles.fileDivider]}>
            <Pressable
              accessibilityRole="button"
              style={styles.fileRow}
              onPress={() => {
                if (url) void Linking.openURL(url);
              }}
            >
              <View style={styles.fileLeft}>
                <Text style={[styles.fileBadge, { color: badge.accent }]}>{badge.label}</Text>
                <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">
                  {artifact.name}
                </Text>
              </View>
              <View style={styles.diffGroup}>
                <Text style={[styles.diff, styles.diffAdd]}>+{Math.max(1, Math.round(artifact.sizeBytes / 40))}</Text>
                <Text style={[styles.diff, styles.diffDel]}>-0</Text>
              </View>
            </Pressable>
            {imageLike && url ? (
              <View style={styles.filePreview}>
                <ArtifactImage mimeType={artifact.mimeType} url={url} compact />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export default function AgentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom + proofSafeArea.bottom;
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
  const [showJump, setShowJump] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const streamRef = useRef<{ close: () => void } | null>(null);
  const listRef = useRef<FlatList<TimelineItem>>(null);
  const deltasRef = useRef<Record<string, string>>({});
  const sendingRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as { __pocketSetPendingImages?: (imgs: PendingImage[]) => void };
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
    const event = msg.event;
    if (event.type === "resync") {
      setSnapshot(event.snapshot);
      setMessages(event.snapshot.messages);
      return;
    }
    if (event.type === "message_delta") {
      deltasRef.current[event.messageId] = (deltasRef.current[event.messageId] ?? "") + event.text;
      setStreamingText({ ...deltasRef.current });
      return;
    }
    if (event.type === "message_done") {
      delete deltasRef.current[event.message.id];
      setStreamingText({ ...deltasRef.current });
      setMessages((previous) => {
        const existing = previous.findIndex((message) => message.id === event.message.id);
        if (existing >= 0) return previous.map((message) => (message.id === event.message.id ? event.message : message));
        return [...previous, event.message];
      });
      return;
    }
    if (event.type === "status") {
      setSnapshot((current) => current
        ? { ...current, agent: { ...current.agent, status: event.status }, streaming: event.status === "running" }
        : current);
      if (event.status !== "needs_input") setNeedsInput(null);
      return;
    }
    if (event.type === "needs_input") {
      setNeedsInput({ requestId: event.requestId, prompt: event.prompt });
      return;
    }
    if (event.type === "artifact") {
      setSnapshot((current) => current ? { ...current, artifacts: [...current.artifacts, event.artifact] } : current);
      return;
    }
    if (event.type === "error") setError(event.message);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const paired = await loadPairedHosts();
      const found = paired.find((item) => item.hostId === hostId) ?? null;
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
    void client.getHost().then((info) => setImagesEnabled(info.capabilities.images !== false)).catch(() => setImagesEnabled(true));
    return () => {
      streamRef.current?.close();
      streamRef.current = null;
    };
  }, [client, agentId, applyServerMessage]);

  async function send() {
    if (!client || !agentId || sendingRef.current) return;
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
        images: imagesSnapshot.map((image) => ({ mimeType: image.mimeType, dataBase64: image.dataBase64, name: image.name })),
      });
      setDraft("");
      setPendingImages((previous) => previous.filter((pending) => !imagesSnapshot.some((image) => image.id === pending.id)));
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
      if (picked.length) setPendingImages((previous) => [...previous, ...picked].slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const artifacts = snapshot?.artifacts ?? [];
  const running = Boolean(snapshot?.streaming || snapshot?.agent.status === "running");
  const timelineItems = useMemo<TimelineItem[]>(() => {
    const visible = messages.filter((message) => message.role !== "system");
    const lastAssistant = visible.reduce((last, message, index) => message.role === "assistant" ? index : last, -1);
    const items: TimelineItem[] = [];
    visible.forEach((message, index) => {
      items.push({ kind: "message", message });
      if (artifacts.length > 0 && index === lastAssistant) items.push({ kind: "changes", id: "changes" });
    });
    if (artifacts.length > 0 && lastAssistant < 0) items.unshift({ kind: "changes", id: "changes" });
    Object.entries(streamingText).forEach(([id, text]) => items.push({ kind: "live", id, text }));
    return items;
  }, [messages, artifacts.length, streamingText]);

  useEffect(() => {
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(timer);
  }, [messages.length, artifacts.length, Object.keys(streamingText).length]);

  function scrollToEnd() {
    listRef.current?.scrollToEnd({ animated: true });
    setShowJump(false);
  }

  if (!host && !error) {
    return <View style={styles.center}><ActivityIndicator color={colors.muted} /></View>;
  }

  const showPr = artifacts.length > 0;
  const draftPr = artifacts.length >= 6;
  const restingComposerBottom = 18 + bottomInset;
  const keyboardHeight = useKeyboardHeight();
  const composerBottom = composerDockBottom(restingComposerBottom, keyboardHeight);
  const composerExpanded = composerFocused || pendingImages.length > 0;
  const composerHeight = composerExpanded ? 168 : 56;
  const actionBottom = composerBottom + composerHeight + 8;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.topBar}>
        <CircleButton accessibilityLabel="Back" onPress={() => router.back()}>
          <Icon name="chevronLeft" size={21} color={colors.ink} strokeWidth={2} />
        </CircleButton>
        <Text style={styles.navTitle} numberOfLines={1} ellipsizeMode="tail">
          {snapshot?.agent.name ?? "Agent"}
        </Text>
        <CircleButton accessibilityLabel="More">
          <Icon name="more" size={21} color={colors.ink} />
        </CircleButton>
      </View>

      <FlatList
        ref={listRef}
        data={timelineItems}
        keyExtractor={(item) => item.kind === "message" ? item.message.id : item.id}
        showsVerticalScrollIndicator
        scrollEventThrottle={16}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          setShowJump(contentSize.height - (contentOffset.y + layoutMeasurement.height) > 80);
        }}
        contentContainerStyle={styles.content}
        ListHeaderComponent={needsInput ? (
          <View style={styles.needsCard}>
            <View style={styles.needsDot} />
            <View style={styles.needsCopy}>
              <Text style={styles.needsTitle}>{needsInput.prompt}</Text>
              <Text style={styles.needsSubtitle}>Waiting for your response</Text>
            </View>
          </View>
        ) : null}
        ListEmptyComponent={!needsInput ? <Text style={styles.placeholderSummary}>Waiting for the agent to report…</Text> : null}
        renderItem={({ item }) => {
          if (item.kind === "changes") {
            return <ChangesCard artifacts={artifacts} host={host} client={client} agentId={agentId!} />;
          }
          if (item.kind === "live") {
            return <View style={styles.liveMessage}><MessageText text={item.text} /></View>;
          }
          const message = item.message;
          if (message.role === "tool") {
            return (
              <View style={styles.toolMessage}>
                <Text style={styles.toolLabel}>{message.toolName ?? message.text.split("\n")[0] ?? "Explored"}</Text>
                {message.toolName && message.text ? <MessageText text={message.text} /> : null}
              </View>
            );
          }
          if (message.role === "user") {
            return (
              <View style={styles.userMessageWrap}>
                <Text style={styles.timestamp}>{formatMessageTime(message.createdAt)}</Text>
                <View style={styles.userMessage}>
                  {message.images?.length ? <MessageImages images={message.images} host={host} agentId={agentId} compact /> : null}
                  {message.text ? <MessageText text={message.text.replace(/^\[follow-up\]\s*/i, "").replace(/^\[steer\]\s*/i, "")} /> : null}
                </View>
              </View>
            );
          }
          return (
            <View style={styles.assistantMessage}>
              {message.text ? <MessageText text={message.text} /> : null}
              <MessageImages images={message.images} host={host} agentId={agentId} wide />
            </View>
          );
        }}
      />

      {showPr ? (
        <View style={[styles.actionDock, { bottom: actionBottom }]} pointerEvents="box-none">
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View PR"
              style={({ pressed }) => [styles.actionPill, pressed && styles.pressed]}
              onPress={() => undefined}
            >
              <Icon name="gitBranch" size={17} color={colors.imgViolet} strokeWidth={1.8} />
              <Text style={styles.actionPillText}>{draftPr ? "View PR Draft" : "View PR"}</Text>
              {draftPr ? <Text style={[styles.diff, styles.diffAdd]}>+3,965</Text> : null}
              {draftPr ? <Text style={[styles.diff, styles.diffDel]}>-1</Text> : null}
            </Pressable>
            {draftPr ? (
              <Pressable style={({ pressed }) => [styles.actionPill, pressed && styles.pressed]} onPress={() => undefined}>
                <Text style={styles.actionPillText}>Mark Ready</Text>
              </Pressable>
            ) : null}
          </View>
          {(showJump || messages.length > 2 || running) ? (
            <CircleButton
              accessibilityLabel="Scroll to latest"
              size={44}
              style={styles.jumpButton}
              onPress={scrollToEnd}
            >
              <Icon name="chevronDown" size={21} color={colors.ink} strokeWidth={2} />
            </CircleButton>
          ) : null}
        </View>
      ) : null}

      <ComposerDock restingBottom={restingComposerBottom}>
        <PillComposer
          value={draft}
          onChangeText={setDraft}
          onSubmit={() => void send()}
          onPlus={() => void onAttach()}
          pendingImages={pendingImages}
          onRemoveImage={(id) => setPendingImages((previous) => previous.filter((image) => image.id !== id))}
          placeholder="Follow up..."
          sending={sending}
          imagesEnabled={imagesEnabled}
          onFocusChange={setComposerFocused}
        />
      </ComposerDock>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingTop: proofSafeArea.top },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, paddingTop: proofSafeArea.top },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 6,
    gap: 10,
  },
  navTitle: { ...type.navTitle, flex: 1, textAlign: "center", fontSize: 18 },
  content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 180 },
  placeholderSummary: { ...type.body, color: colors.muted, marginTop: 16 },
  paragraphs: { gap: 10 },
  bodyText: { ...type.body, color: colors.ink },
  bodyStrong: { ...type.bodyStrong, color: colors.ink },
  link: { ...type.body, color: "#3C7CAA" },
  code: {
    fontFamily: fonts.mono,
    backgroundColor: colors.codeBg,
    overflow: "hidden",
    borderRadius: 3,
    paddingHorizontal: 3,
    fontSize: 14,
    color: colors.ink,
  },
  needsCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.bgElevated,
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginTop: 8,
    marginBottom: 14,
  },
  needsDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#D9D9D9", marginTop: 6, marginRight: 12 },
  needsCopy: { flex: 1 },
  needsTitle: { ...type.body, fontSize: 17, lineHeight: 23 },
  needsSubtitle: { ...type.body, color: colors.muted, fontSize: 16, lineHeight: 22, marginTop: 1 },
  assistantMessage: { paddingVertical: 8 },
  liveMessage: { paddingVertical: 8 },
  toolMessage: { paddingVertical: 8 },
  toolLabel: { ...type.body, color: colors.muted, marginBottom: 2 },
  userMessageWrap: { alignItems: "flex-end", paddingVertical: 8 },
  timestamp: { ...type.meta, color: colors.muted, alignSelf: "center", marginBottom: 7, fontSize: 14, fontWeight: "400" },
  userMessage: { maxWidth: "87%", backgroundColor: "#EAEAEA", borderRadius: 22, paddingHorizontal: 14, paddingVertical: 11 },
  changesCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radii.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    marginTop: 8,
    marginBottom: 8,
    overflow: "hidden",
  },
  changesHead: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 13, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  changesTitle: { ...type.body, fontSize: 17, lineHeight: 22 },
  changesCount: { ...type.body, fontSize: 17, lineHeight: 22, color: colors.muted },
  fileRowWrap: { paddingHorizontal: 13 },
  fileDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  fileRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 46 },
  fileLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  fileBadge: { width: 25, fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, fontWeight: "400" },
  fileName: { ...type.body, flexShrink: 1, fontSize: 17 },
  filePreview: { paddingLeft: 32, paddingBottom: 8 },
  diffGroup: { flexDirection: "row", alignItems: "center", gap: 4 },
  diff: { ...type.diff, fontSize: 15, lineHeight: 20, fontWeight: "400" },
  diffAdd: { color: colors.diffAdd },
  diffDel: { color: colors.diffDel },
  actionDock: { position: "absolute", left: 12, right: 12, height: 44, justifyContent: "center" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  actionPill: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.bgSunken, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.95)", paddingHorizontal: 15, height: 44, ...shadows.control },
  actionPillText: { ...type.pill, fontSize: 16, lineHeight: 20, fontWeight: "400" },
  jumpButton: { position: "absolute", right: 0, top: 0 },
  pressed: { opacity: 0.65 },
});
