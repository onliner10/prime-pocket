import { useCallback, useState } from "react";
import { RefreshControl } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import type { AgentSummary, PairedHost, Workspace, Worktree } from "@prime-pocket/protocol";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Folder,
  FolderPlus,
  Github,
  Radio,
  Search,
  Sparkles,
} from "@tamagui/lucide-icons-2";
import { H1, ScrollView, SizableText, Spinner, useTheme, XStack, YStack } from "tamagui";
import { listFleetAgents, listFleetWorkspaces, PocketHostClient } from "../src/api";
import {
  loadOnboardingComplete,
  loadPairedHosts,
  loadSelectedWorktreeId,
  loadSelectedWorkspaceId,
  saveSelectedWorktreeId,
  saveSelectedWorkspaceId,
} from "../src/storage";
import { countByFilter } from "../src/inbox";
import { StatusCard } from "../src/components/StatusCard";
import { WorkspaceRow } from "../src/components/WorkspaceRow";
import { ComposerDock } from "../src/components/ComposerDock";
import { PillComposer } from "../src/components/PillComposer";
import {
  AppHeader,
  Avatar,
  ConnectionNotice,
  GUTTER,
  IconButton,
  IconTile,
  PickerRow,
  PickerSheet,
  Row,
  Screen,
  SectionLabel,
  Surface,
  useSafeBottom,
} from "../src/ui";

type FleetWorkspace = Workspace & { hostId: string };

export default function InboxScreen() {
  const router = useRouter();
  const theme = useTheme();
  const bottomInset = useSafeBottom();
  const [hosts, setHosts] = useState<PairedHost[]>([]);
  const [workspaces, setWorkspaces] = useState<FleetWorkspace[]>([]);
  const [worktreesByWorkspace, setWorktreesByWorkspace] = useState<Record<string, Worktree[]>>({});
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedWorktreeId, setSelectedWorktreeId] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [launching, setLaunching] = useState(false);
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setConnectionError(null);
    const paired = await loadPairedHosts();
    setHosts(paired);
    if (paired.length === 0) {
      setAgents([]);
      setWorkspaces([]);
      setWorktreesByWorkspace({});
      setSelectedWorkspaceId(null);
      setSelectedWorktreeId(null);
      setLoading(false);
      return;
    }
    const [agentResult, workspaceResult] = await Promise.all([
      listFleetAgents(paired),
      listFleetWorkspaces(paired),
    ]);
    setAgents(agentResult.agents);
    setWorkspaces(workspaceResult.workspaces);

    const host = paired[0]!;
    const client = new PocketHostClient(host);
    const treeMap: Record<string, Worktree[]> = {};
    await Promise.all(
      workspaceResult.workspaces.map(async (w) => {
        try {
          treeMap[w.id] = await client.listWorktrees(w.id);
        } catch {
          treeMap[w.id] = [];
        }
      }),
    );
    setWorktreesByWorkspace(treeMap);

    const savedWs = await loadSelectedWorkspaceId(host.hostId);
    const savedWt = await loadSelectedWorktreeId(host.hostId);
    const wsStillThere = workspaceResult.workspaces.some((w) => w.id === savedWs);
    const activeWsId = wsStillThere ? savedWs : workspaceResult.workspaces[0]?.id ?? null;
    setSelectedWorkspaceId(activeWsId);
    const trees = activeWsId ? treeMap[activeWsId] ?? [] : [];
    const wtStillThere = trees.some((t) => t.id === savedWt);
    setSelectedWorktreeId(wtStillThere ? savedWt : trees[0]?.id ?? null);

    const hostErrors = [...agentResult.errors, ...workspaceResult.errors];
    setConnectionError(
      hostErrors.length
        ? `${hostErrors.length} host${hostErrors.length === 1 ? "" : "s"} unavailable`
        : null,
    );
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        if (!(await loadOnboardingComplete())) {
          router.replace("/onboarding");
          return;
        }
        await refresh();
      })();
    }, [refresh, router]),
  );

  const counts = countByFilter(agents);
  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId) ?? workspaces[0];
  const selectedWorktree =
    selectedWorkspace && selectedWorktreeId
      ? (worktreesByWorkspace[selectedWorkspace.id] ?? []).find((t) => t.id === selectedWorktreeId)
      : selectedWorkspace
        ? (worktreesByWorkspace[selectedWorkspace.id] ?? [])[0]
        : undefined;
  const workspaceLabel = selectedWorkspace
    ? selectedWorkspace.fullName ?? selectedWorkspace.name
    : hosts.length === 0
      ? "Pair a host"
      : "Add repository";
  const branchLabel = selectedWorktree
    ? selectedWorktree.branch
    : selectedWorkspace
      ? "Select branch"
      : null;

  function goAddRepository() {
    if (hosts.length === 0) {
      router.push("/pair");
      return;
    }
    router.push("/repos/add");
  }

  async function openWorkspace(ws: FleetWorkspace) {
    setSelectedWorkspaceId(ws.id);
    await saveSelectedWorkspaceId(ws.hostId, ws.id);
    const trees = worktreesByWorkspace[ws.id] ?? [];
    if (trees.length === 0) {
      router.push({
        pathname: "/repos/[workspaceId]/worktree",
        params: { workspaceId: ws.id },
      });
      return;
    }
    router.push({
      pathname: "/repos/[workspaceId]",
      params: { workspaceId: ws.id },
    });
  }

  async function submitComposer() {
    const prompt = draft.trim();
    if (!prompt) return;
    if (hosts.length === 0) {
      router.push("/pair");
      return;
    }
    if (workspaces.length === 0) {
      router.push("/repos/add");
      return;
    }
    const workspace = workspaces.find((w) => w.id === selectedWorkspaceId) ?? workspaces[0]!;
    const trees = worktreesByWorkspace[workspace.id] ?? [];
    if (trees.length === 0) {
      router.push({
        pathname: "/repos/[workspaceId]/worktree",
        params: { workspaceId: workspace.id },
      });
      return;
    }
    const worktree = trees.find((t) => t.id === selectedWorktreeId) ?? trees[0]!;
    if (launching) return;
    setLaunching(true);
    try {
      const host = hosts[0]!;
      const client = new PocketHostClient(host);
      const short = prompt.length > 28 ? `${prompt.slice(0, 28).trim()}…` : prompt;
      const agent = await client.launch({
        name: short,
        prompt,
        worktreeId: worktree.id,
        workspaceId: workspace.id,
        cwd: worktree.cwd,
      });
      await saveSelectedWorkspaceId(host.hostId, workspace.id);
      await saveSelectedWorktreeId(host.hostId, worktree.id);
      setDraft("");
      router.push({
        pathname: "/agent/[hostId]/[agentId]",
        params: { hostId: agent.hostId || host.hostId, agentId: agent.id },
      });
    } catch (e) {
      console.warn("launch failed", e);
      router.push({
        pathname: "/agents/all",
        params: { seedPrompt: prompt },
      });
      setDraft("");
    } finally {
      setLaunching(false);
    }
  }

  const emptyBody =
    hosts.length === 0
      ? "Pair a desktop bridge, then add a repository."
      : "Add a GitHub repository, create a worktree, then send a task.";

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refresh()}
            tintColor={theme.color9.val}
          />
        }
      >
        <AppHeader px={0}>
          <IconButton tone="bare" p={0} aria-label="Hosts" onPress={() => router.push("/hosts")}>
            <Avatar label="M" />
          </IconButton>
          <XStack gap={10}>
            <IconButton
              aria-label="Search"
              icon={<Search size={19} strokeWidth={1.9} />}
              onPress={() => router.push("/agents/all")}
            />
            <IconButton
              aria-label="Add repository"
              icon={<FolderPlus size={19} strokeWidth={1.75} />}
              onPress={goAddRepository}
            />
          </XStack>
        </AppHeader>

        <H1 fontSize="$10" fontWeight="500" color="$color" mt={22} mb={22}>
          Inbox
        </H1>

        <YStack gap={12} mb={22} mx={-4}>
          <XStack gap={12}>
            <StatusCard
              title="All Agents"
              icon={Sparkles}
              theme="agents"
              onPress={() => router.push("/agents/all")}
            />
            <StatusCard
              title="Working"
              count={counts.working}
              icon={Radio}
              theme="working"
              onPress={() => router.push("/agents/working")}
            />
          </XStack>
          <XStack gap={12}>
            <StatusCard
              title="Needs Attention"
              count={counts.needs_attention}
              icon={Bell}
              theme="attention"
              onPress={() => router.push("/agents/needs_attention")}
            />
            <StatusCard
              title="In Review"
              count={counts.in_review}
              icon={CheckCircle2}
              theme="review"
              onPress={() => router.push("/agents/in_review")}
            />
          </XStack>
        </YStack>

        {connectionError ? (
          <YStack mb={18}>
            <ConnectionNotice message={connectionError} onPress={() => router.push("/hosts")} />
          </YStack>
        ) : null}

        <SectionLabel>Workspaces</SectionLabel>

        {loading && workspaces.length === 0 && hosts.length > 0 ? (
          <Surface py={24} items="center">
            <Spinner color="$color8" />
          </Surface>
        ) : workspaces.length === 0 ? (
          <Surface
            role="button"
            aria-label="Add a repository"
            onPress={goAddRepository}
            flexDirection="row"
            items="center"
            gap={13}
            py={13}
            pl={14}
            pr={16}
            cursor="pointer"
            pressStyle={{ bg: "$color2" }}
          >
            <IconTile>
              <FolderPlus size={19} color="$color9" strokeWidth={1.75} />
            </IconTile>
            <YStack grow={1} shrink={1}>
              <SizableText fontSize="$5" color="$color">
                No repositories yet
              </SizableText>
              <SizableText fontSize="$2" color="$color9">
                {emptyBody}
              </SizableText>
            </YStack>
            <ChevronRight size={17} color="$color8" strokeWidth={2} />
          </Surface>
        ) : (
          <YStack>
            {workspaces.map((w) => {
              const trees = worktreesByWorkspace[w.id] ?? [];
              const n = trees.length;
              const subtitle =
                n === 0
                  ? "No worktrees — tap to create one"
                  : n === 1
                    ? `1 worktree · default ${w.defaultBranch ?? "main"}`
                    : `${n} worktrees · default ${w.defaultBranch ?? "main"}`;
              return (
                <WorkspaceRow
                  key={w.id}
                  name={w.fullName ?? w.name}
                  subtitle={subtitle}
                  variant="plain"
                  icon={w.source === "github" ? Github : Folder}
                  selected={w.id === selectedWorkspaceId}
                  onPress={() => void openWorkspace(w)}
                />
              );
            })}
            <Row
              interactive
              role="button"
              aria-label="Add another repository"
              onPress={goAddRepository}
              gap={8}
              py={14}
            >
              <FolderPlus size={16} color="$color10" strokeWidth={2} />
              <SizableText fontSize="$4" fontWeight="500" color="$color10">
                Add repository
              </SizableText>
            </Row>
          </YStack>
        )}

        <YStack height={148 + bottomInset} />
      </ScrollView>

      <ComposerDock restingBottom={Math.max(14, bottomInset + 10)}>
        <PillComposer
          value={draft}
          onChangeText={setDraft}
          onPlus={goAddRepository}
          onSubmit={() => void submitComposer()}
          sending={launching}
          placeholder="Plan, ask, build..."
          workspaceLabel={workspaceLabel}
          branchLabel={branchLabel}
          workspaceIcon={selectedWorkspace?.source === "github" ? Github : Folder}
          onWorkspacePress={() => {
            if (hosts.length === 0) {
              router.push("/pair");
              return;
            }
            if (workspaces.length === 0) {
              goAddRepository();
              return;
            }
            setWorkspacePickerOpen(true);
          }}
          onBranchPress={() => {
            if (!selectedWorkspace) {
              if (hosts.length === 0) router.push("/pair");
              else goAddRepository();
              return;
            }
            void openWorkspace(selectedWorkspace);
          }}
        />
      </ComposerDock>

      <PickerSheet
        open={workspacePickerOpen}
        onOpenChange={setWorkspacePickerOpen}
        title="Workspace"
      >
        {workspaces.map((w) => (
          <PickerRow
            key={w.id}
            label={w.fullName ?? w.name}
            ariaLabel={`Select workspace ${w.fullName ?? w.name}`}
            selected={w.id === selectedWorkspace?.id}
            icon={
              w.source === "github" ? (
                <Github size={18} color="$color10" strokeWidth={1.7} />
              ) : (
                <Folder size={18} color="$color10" strokeWidth={1.7} />
              )
            }
            onPress={() => {
              void (async () => {
                setSelectedWorkspaceId(w.id);
                await saveSelectedWorkspaceId(w.hostId, w.id);
                const trees = worktreesByWorkspace[w.id] ?? [];
                const nextTree = trees.find((t) => t.id === selectedWorktreeId) ?? trees[0];
                setSelectedWorktreeId(nextTree?.id ?? null);
                if (nextTree) await saveSelectedWorktreeId(w.hostId, nextTree.id);
                setWorkspacePickerOpen(false);
              })();
            }}
          />
        ))}
        <Row
          interactive
          role="button"
          aria-label="Add repository"
          onPress={() => {
            setWorkspacePickerOpen(false);
            goAddRepository();
          }}
          gap={8}
          px={8}
          mt={4}
          borderTopWidth={1}
          borderTopColor="$color3"
        >
          <FolderPlus size={16} color="$color10" strokeWidth={2} />
          <SizableText fontSize="$4" fontWeight="500" color="$color10">
            Add repository
          </SizableText>
        </Row>
      </PickerSheet>
    </Screen>
  );
}
