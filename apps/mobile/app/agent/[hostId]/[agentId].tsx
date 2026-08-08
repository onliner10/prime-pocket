import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown, ChevronLeft, GitBranch, MoreHorizontal } from "@tamagui/lucide-icons-2";
import { SizableText, Spinner, styled, Text, Theme, XStack, YStack } from "tamagui";
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
import { ComposerDock } from "../../../src/components/ComposerDock";
import { PillComposer, type PendingImage } from "../../../src/components/PillComposer";
import { ArtifactImage, MessageImages } from "../../../src/components/MessageImages";
import { pickImages } from "../../../src/pickImages";
import { composerDockBottom, useKeyboardHeight } from "../../../src/useKeyboardHeight";
import {
  AppHeader,
  controlShadow,
  GUTTER,
  HeaderTitle,
  IconButton,
  Screen,
  StatusDot,
  Surface,
  useSafeBottom,
} from "../../../src/ui";

type TimelineItem =
  | { kind: "message"; message: TranscriptMessage }
  | { kind: "changes"; id: string }
  | { kind: "live"; id: string; text: string };

const Body = styled(Text, {
  name: "TranscriptBody",
  fontFamily: "$body",
  fontSize: "$5",
  lineHeight: 24,
  color: "$color",
});

const Strong = styled(Body, { name: "TranscriptStrong", fontWeight: "600" });

const Link = styled(Body, { name: "TranscriptLink", theme: "working", color: "$color11" });

const Code = styled(Body, {
  name: "TranscriptCode",
  fontFamily: "$mono",
  fontSize: "$4",
  bg: "$color3",
  rounded: 3,
  px: 3,
  overflow: "hidden",
});

/** Tabular so the +/- columns line up row to row. */
const Diff = styled(Text, {
  name: "DiffCount",
  fontFamily: "$mono",
  fontSize: "$4",
  lineHeight: 20,
  color: "$color10",
});

/** Markdown-lite: mono chips, bold emphasis, and tappable inline links. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Body>
      {parts.map((part, index) => {
        if (part.startsWith("[") && part.includes("](") && part.endsWith(")")) {
          const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
          if (match) {
            return (
              <Link key={index} role="link" onPress={() => void Linking.openURL(match[2]!)}>
                {match[1]}
              </Link>
            );
          }
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return <Code key={index}>{part.slice(1, -1)}</Code>;
        }
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return <Strong key={index}>{part.slice(2, -2)}</Strong>;
        }
        return <Body key={index}>{part}</Body>;
      })}
    </Body>
  );
}

function MessageText({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/g).filter((paragraph) => paragraph.length > 0);
  return (
    <YStack gap={10}>
      {paragraphs.map((paragraph, index) => (
        <RichText key={`${index}-${paragraph.slice(0, 12)}`} text={paragraph} />
      ))}
    </YStack>
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
function fileBadge(name: string, imageLike: boolean): string {
  if (imageLike) return "IMG";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (name === ".npmrc") return "▥";
  if (ext === "ts" || ext === "tsx") return "TS";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") return "JS";
  if (ext === "css" || ext === "scss") return "CSS";
  if (ext === "json") return "{}";
  if (ext === "md" || ext === "mdx") return "MD";
  return (ext || "txt").slice(0, 3).toUpperCase();
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
    <Surface my={8} overflow="hidden" flat enterStyle={{ opacity: 0, y: 10 }} transition="medium">
      <XStack
        items="center"
        gap={5}
        px={13}
        py={10}
        borderBottomWidth={1}
        borderBottomColor="$color3"
      >
        <SizableText fontSize="$6" color="$color">
          Changes
        </SizableText>
        <SizableText fontSize="$6" color="$color9">
          {artifacts.length}
        </SizableText>
      </XStack>

      {artifacts.map((artifact, index) => {
        const url =
          host && client
            ? `${client.artifactUrl(agentId, artifact.id)}?token=${encodeURIComponent(host.token)}`
            : undefined;
        const imageLike = artifact.kind === "image" || isImageMime(artifact.mimeType);
        return (
          <YStack
            key={artifact.id}
            px={13}
            borderTopWidth={index > 0 ? 1 : 0}
            borderTopColor="$color3"
          >
            <XStack
              role="button"
              aria-label={`Open ${artifact.name}`}
              onPress={() => {
                if (url) void Linking.openURL(url);
              }}
              items="center"
              justify="space-between"
              gap={10}
              minH={46}
              cursor="pointer"
              pressStyle={{ opacity: 0.65 }}
            >
              <XStack items="center" gap={10} flex={1} minW={0}>
                <Diff
                  theme={imageLike ? "violet" : null}
                  width={25}
                  fontSize="$3"
                  lineHeight={18}
                  color={imageLike ? "$color10" : "$color9"}
                >
                  {fileBadge(artifact.name, imageLike)}
                </Diff>
                <SizableText
                  shrink={1}
                  fontSize="$6"
                  color="$color"
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {artifact.name}
                </SizableText>
              </XStack>
              <XStack items="center" gap={4}>
                <Diff theme="success" color="$color10">
                  +{Math.max(1, Math.round(artifact.sizeBytes / 40))}
                </Diff>
                <Diff theme="danger" color="$color10">
                  -0
                </Diff>
              </XStack>
            </XStack>
            {imageLike && url ? (
              <YStack pl={32} pb={8}>
                <ArtifactImage mimeType={artifact.mimeType} url={url} compact />
              </YStack>
            ) : null}
          </YStack>
        );
      })}
    </Surface>
  );
}

export default function AgentScreen() {
  const router = useRouter();
  const bottomInset = useSafeBottom();
  const keyboardHeight = useKeyboardHeight();
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
        if (existing >= 0)
          return previous.map((message) =>
            message.id === event.message.id ? event.message : message,
          );
        return [...previous, event.message];
      });
      return;
    }
    if (event.type === "status") {
      setSnapshot((current) =>
        current
          ? {
              ...current,
              agent: { ...current.agent, status: event.status },
              streaming: event.status === "running",
            }
          : current,
      );
      if (event.status !== "needs_input") setNeedsInput(null);
      return;
    }
    if (event.type === "needs_input") {
      setNeedsInput({ requestId: event.requestId, prompt: event.prompt });
      return;
    }
    if (event.type === "artifact") {
      setSnapshot((current) =>
        current ? { ...current, artifacts: [...current.artifacts, event.artifact] } : current,
      );
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
    void client
      .getHost()
      .then((info) => setImagesEnabled(info.capabilities.images !== false))
      .catch(() => setImagesEnabled(true));
    return () => {
      streamRef.current?.close();
      streamRef.current = null;
    };
  }, [client, agentId, applyServerMessage]);

  const artifacts = useMemo(() => snapshot?.artifacts ?? [], [snapshot]);
  const running = Boolean(snapshot?.streaming || snapshot?.agent.status === "running");
  const timelineItems = useMemo<TimelineItem[]>(() => {
    const visible = messages.filter((message) => message.role !== "system");
    const lastAssistant = visible.reduce(
      (last, message, index) => (message.role === "assistant" ? index : last),
      -1,
    );
    const items: TimelineItem[] = [];
    visible.forEach((message, index) => {
      items.push({ kind: "message", message });
      if (artifacts.length > 0 && index === lastAssistant)
        items.push({ kind: "changes", id: "changes" });
    });
    if (artifacts.length > 0 && lastAssistant < 0) items.unshift({ kind: "changes", id: "changes" });
    Object.entries(streamingText).forEach(([id, text]) => items.push({ kind: "live", id, text }));
    return items;
  }, [messages, artifacts.length, streamingText]);

  useEffect(() => {
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(timer);
  }, [messages.length, artifacts.length, streamingText]);

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
        images: imagesSnapshot.map((image) => ({
          mimeType: image.mimeType,
          dataBase64: image.dataBase64,
          name: image.name,
        })),
      });
      setDraft("");
      setPendingImages((previous) =>
        previous.filter((pending) => !imagesSnapshot.some((image) => image.id === pending.id)),
      );
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

  function scrollToEnd() {
    listRef.current?.scrollToEnd({ animated: true });
    setShowJump(false);
  }

  const showPr = artifacts.length > 0;
  const draftPr = artifacts.length >= 6;
  const restingComposerBottom = 18 + bottomInset;
  const composerBottom = composerDockBottom(restingComposerBottom, keyboardHeight);
  const composerExpanded = composerFocused || pendingImages.length > 0;
  const actionBottom = composerBottom + (composerExpanded ? 168 : 56) + 8;

  if (!host && !error) {
    return (
      <Screen items="center" justify="center">
        <Spinner color="$color9" />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader px={16}>
        <IconButton
          aria-label="Back"
          icon={<ChevronLeft size={21} strokeWidth={2} />}
          onPress={() => router.back()}
        />
        <HeaderTitle fontSize="$7">{snapshot?.agent.name ?? "Agent"}</HeaderTitle>
        <IconButton aria-label="More" icon={<MoreHorizontal size={21} />} />
      </AppHeader>

      <FlatList
        ref={listRef}
        data={timelineItems}
        keyExtractor={(item) => (item.kind === "message" ? item.message.id : item.id)}
        showsVerticalScrollIndicator
        scrollEventThrottle={16}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          setShowJump(contentSize.height - (contentOffset.y + layoutMeasurement.height) > 80);
        }}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: 180 }}
        ListHeaderComponent={
          needsInput ? (
            <Surface
              theme="attention"
              flexDirection="row"
              items="flex-start"
              px={16}
              py={13}
              mt={8}
              mb={14}
              flat
              enterStyle={{ opacity: 0, y: -8 }}
              transition="medium"
            >
              <StatusDot size={10} mt={6} mr={12} />
              <YStack flex={1}>
                <SizableText fontSize="$6" lineHeight={23} color="$color12">
                  {needsInput.prompt}
                </SizableText>
                <SizableText fontSize="$5" lineHeight={22} color="$color11" mt={1}>
                  Waiting for your response
                </SizableText>
              </YStack>
            </Surface>
          ) : null
        }
        ListEmptyComponent={
          !needsInput ? (
            <SizableText fontSize="$5" color="$color9" mt={16}>
              Waiting for the agent to report…
            </SizableText>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.kind === "changes") {
            return (
              <ChangesCard artifacts={artifacts} host={host} client={client} agentId={agentId!} />
            );
          }
          if (item.kind === "live") {
            return (
              <YStack py={8}>
                <MessageText text={item.text} />
              </YStack>
            );
          }
          const message = item.message;
          if (message.role === "tool") {
            return (
              <YStack py={8}>
                <SizableText fontSize="$5" color="$color9" mb={2}>
                  {message.toolName ?? message.text.split("\n")[0] ?? "Explored"}
                </SizableText>
                {message.toolName && message.text ? <MessageText text={message.text} /> : null}
              </YStack>
            );
          }
          if (message.role === "user") {
            return (
              <YStack items="flex-end" py={8}>
                <SizableText self="center" mb={7} fontSize="$4" color="$color9">
                  {formatMessageTime(message.createdAt)}
                </SizableText>
                <YStack
                  maxW="87%"
                  bg="$color4"
                  rounded={22}
                  px={14}
                  py={11}
                  enterStyle={{ opacity: 0, y: 6 }}
                  transition="quick"
                >
                  {message.images?.length ? (
                    <MessageImages
                      images={message.images}
                      host={host}
                      agentId={agentId}
                      compact
                    />
                  ) : null}
                  {message.text ? (
                    <MessageText
                      text={message.text
                        .replace(/^\[follow-up\]\s*/i, "")
                        .replace(/^\[steer\]\s*/i, "")}
                    />
                  ) : null}
                </YStack>
              </YStack>
            );
          }
          return (
            <YStack py={8}>
              {message.text ? <MessageText text={message.text} /> : null}
              <MessageImages images={message.images} host={host} agentId={agentId} wide />
            </YStack>
          );
        }}
      />

      {showPr ? (
        <YStack
          position="absolute"
          l={12}
          r={12}
          b={actionBottom}
          height={44}
          justify="center"
          pointerEvents="box-none"
        >
          <XStack items="center" gap={8}>
            <ActionPill aria-label="View PR" onPress={() => undefined}>
              <Theme name="violet">
                <GitBranch size={17} color="$color10" strokeWidth={1.8} />
              </Theme>
              <SizableText fontSize="$5" color="$color">
                {draftPr ? "View PR Draft" : "View PR"}
              </SizableText>
              {draftPr ? (
                <>
                  <Diff theme="success" color="$color10">
                    +3,965
                  </Diff>
                  <Diff theme="danger" color="$color10">
                    -1
                  </Diff>
                </>
              ) : null}
            </ActionPill>
            {draftPr ? (
              <ActionPill aria-label="Mark ready" onPress={() => undefined}>
                <SizableText fontSize="$5" color="$color">
                  Mark Ready
                </SizableText>
              </ActionPill>
            ) : null}
          </XStack>
          {showJump || messages.length > 2 || running ? (
            <IconButton
              aria-label="Scroll to latest"
              position="absolute"
              r={0}
              t={0}
              width={44}
              height={44}
              icon={<ChevronDown size={21} strokeWidth={2} />}
              onPress={scrollToEnd}
            />
          ) : null}
        </YStack>
      ) : null}

      <ComposerDock restingBottom={restingComposerBottom}>
        <PillComposer
          value={draft}
          onChangeText={setDraft}
          onSubmit={() => void send()}
          onPlus={() => void onAttach()}
          pendingImages={pendingImages}
          onRemoveImage={(id) =>
            setPendingImages((previous) => previous.filter((image) => image.id !== id))
          }
          placeholder="Follow up..."
          sending={sending}
          imagesEnabled={imagesEnabled}
          onFocusChange={setComposerFocused}
        />
      </ComposerDock>
    </Screen>
  );
}

/** Floating transcript action, e.g. "View PR". */
const ActionPill = styled(XStack, {
  name: "ActionPill",
  role: "button",
  items: "center",
  gap: 7,
  px: 15,
  height: 44,
  rounded: 999,
  bg: "$color2",
  borderWidth: 1,
  borderColor: "$color1",
  cursor: "pointer",
  transition: "quicker",
  pressStyle: { opacity: 0.65, scale: 0.97 },
  ...controlShadow,
});
