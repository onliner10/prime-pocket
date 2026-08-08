import type { ComponentType } from "react";
import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import type { IconProps } from "@tamagui/helpers-icon";
import {
  Bell,
  CheckCircle2,
  ChevronLeft,
  Radio,
  Search,
  SlidersHorizontal,
  Sparkles,
} from "@tamagui/lucide-icons-2";
import { H1, SizableText, useTheme, XStack } from "tamagui";
import type { AgentSummary, PairedHost } from "@prime-pocket/protocol";
import { listFleetAgents } from "../../src/api";
import { loadPairedHosts } from "../../src/storage";
import { filterAgents, statusLabel, statusTheme, type InboxFilter } from "../../src/inbox";
import { ComposerDock } from "../../src/components/ComposerDock";
import { PillComposer } from "../../src/components/PillComposer";
import {
  AppHeader,
  ConnectionNotice,
  EmptyState,
  GUTTER,
  Gutter,
  IconButton,
  Meta,
  Screen,
  StatusDot,
  Surface,
  useSafeBottom,
} from "../../src/ui";

const TITLES: Record<InboxFilter, string> = {
  all: "All Agents",
  working: "Working",
  needs_attention: "Needs Attention",
  in_review: "In Review",
};

const EMPTY: Record<
  InboxFilter,
  { title: string; body: string; icon: ComponentType<IconProps>; theme: string }
> = {
  all: {
    title: "No Agents Yet",
    body: "Pair a host, add a repository, and launch an agent to see it here.",
    icon: Sparkles,
    theme: "agents",
  },
  working: {
    title: "Nothing Working",
    body: "Agents currently running appear here.",
    icon: Radio,
    theme: "working",
  },
  needs_attention: {
    title: "Nothing Needs Attention",
    body: "Agents waiting on your response or review appear here.",
    icon: Bell,
    theme: "attention",
  },
  in_review: {
    title: "Nothing In Review",
    body: "Idle agents ready for you to review appear here.",
    icon: CheckCircle2,
    theme: "review",
  },
};

export default function AgentsFilterScreen() {
  const router = useRouter();
  const theme = useTheme();
  const bottomInset = useSafeBottom();
  const params = useLocalSearchParams<{ filter?: string }>();
  const raw = (params.filter ?? "all") as InboxFilter;
  const filter: InboxFilter = raw in TITLES ? raw : "all";
  const title = TITLES[filter];

  const [hosts, setHosts] = useState<PairedHost[]>([]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setConnectionError(null);
    const paired = await loadPairedHosts();
    setHosts(paired);
    if (!paired.length) {
      setAgents([]);
      setLoading(false);
      return;
    }
    const result = await listFleetAgents(paired);
    setAgents(result.agents);
    setConnectionError(
      result.errors.length
        ? `${result.errors.length} workspace${result.errors.length === 1 ? "" : "s"} unavailable`
        : null,
    );
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const filtered = useMemo(() => filterAgents(agents, filter), [agents, filter]);
  const empty = EMPTY[filter];

  return (
    <Screen>
      <AppHeader>
        <IconButton
          aria-label="Back"
          icon={<ChevronLeft size={19} strokeWidth={2} />}
          onPress={() => router.back()}
        />
        <XStack gap={10}>
          <IconButton aria-label="Search" icon={<Search size={19} strokeWidth={1.9} />} />
          <IconButton
            aria-label="Filter"
            icon={<SlidersHorizontal size={19} strokeWidth={1.9} />}
          />
        </XStack>
      </AppHeader>

      <Gutter mt={22} mb={16}>
        <H1 fontSize="$10" fontWeight="500" color="$color">
          {title}
        </H1>
        {filtered.length > 0 ? (
          <Meta mt={3}>
            {filtered.length} {filtered.length === 1 ? "agent" : "agents"}
          </Meta>
        ) : null}
      </Gutter>

      {connectionError ? (
        <Gutter mb={10}>
          <ConnectionNotice message={connectionError} onPress={() => router.push("/hosts")} />
        </Gutter>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(a) => `${a.hostId}:${a.id}`}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refresh()}
            tintColor={theme.color9.val}
          />
        }
        contentContainerStyle={
          filtered.length === 0
            ? { flexGrow: 1, justifyContent: "center", paddingBottom: 115 + bottomInset }
            : { paddingHorizontal: GUTTER, gap: 10, paddingBottom: 130 + bottomInset }
        }
        ListEmptyComponent={
          <EmptyState
            title={empty.title}
            body={empty.body}
            icon={empty.icon}
            theme={empty.theme}
          />
        }
        renderItem={({ item }) => (
          <AgentRow
            agent={item}
            hostLabel={hosts.find((h) => h.hostId === item.hostId)?.label ?? "Workspace"}
            onPress={() =>
              router.push({
                pathname: "/agent/[hostId]/[agentId]",
                params: { hostId: item.hostId, agentId: item.id },
              })
            }
          />
        )}
      />

      <ComposerDock restingBottom={Math.max(14, bottomInset + 10)}>
        <PillComposer
          value={draft}
          onChangeText={setDraft}
          onPlus={() => router.push("/pair")}
          onSubmit={() => {
            if (draft.trim()) setDraft("");
          }}
          placeholder="Plan, ask, build..."
        />
      </ComposerDock>
    </Screen>
  );
}

/** Agent card: name + status pip, host, and the latest transcript line. */
function AgentRow({
  agent,
  hostLabel,
  onPress,
}: {
  agent: AgentSummary;
  hostLabel: string;
  onPress: () => void;
}) {
  return (
    <Surface
      role="button"
      aria-label={`${agent.name}, ${statusLabel(agent.status)}`}
      onPress={onPress}
      px={16}
      py={15}
      cursor="pointer"
      transition="quicker"
      pressStyle={{ opacity: 0.7, scale: 0.995 }}
      enterStyle={{ opacity: 0, y: 8 }}
    >
      <XStack items="center" justify="space-between" gap={10}>
        <SizableText flex={1} fontSize="$5" color="$color" numberOfLines={1}>
          {agent.name}
        </SizableText>
        <XStack items="center" gap={6}>
          <StatusDot theme={statusTheme(agent.status) ?? null} />
          <Meta fontSize="$2">{statusLabel(agent.status)}</Meta>
        </XStack>
      </XStack>
      <Meta fontSize="$2" fontWeight="400" mt={3}>
        {hostLabel}
      </Meta>
      {agent.preview ? (
        <SizableText fontSize="$4" color="$color10" mt={8} numberOfLines={2}>
          {agent.preview}
        </SizableText>
      ) : null}
    </Surface>
  );
}
