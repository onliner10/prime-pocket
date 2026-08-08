import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, GitBranch, Plus } from "@tamagui/lucide-icons-2";
import { SizableText, Spinner, YStack } from "tamagui";
import type { PairedHost, Workspace, Worktree } from "@prime-pocket/protocol";
import { PocketHostClient } from "../../../src/api";
import {
  loadPairedHosts,
  saveSelectedWorktreeId,
  saveSelectedWorkspaceId,
} from "../../../src/storage";
import {
  AppHeader,
  ErrorText,
  HeaderSpacer,
  HeaderTitle,
  IconButton,
  IconTile,
  Lead,
  Meta,
  PrimaryButton,
  Row,
  Screen,
  ScreenScroll,
  SectionLabel,
  Surface,
} from "../../../src/ui";

export default function WorkspaceDetailScreen() {
  const router = useRouter();
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const [host, setHost] = useState<PairedHost | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const hosts = await loadPairedHosts();
      const paired = hosts[0] ?? null;
      setHost(paired);
      if (!paired || !workspaceId) {
        setError("Pair a host first.");
        return;
      }
      const client = new PocketHostClient(paired);
      const detail = await client.getWorkspace(workspaceId);
      setWorkspace(detail.workspace);
      setWorktrees(detail.worktrees);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  async function selectWorktree(wt: Worktree) {
    if (!host || !workspaceId) return;
    await saveSelectedWorkspaceId(host.hostId, workspaceId);
    await saveSelectedWorktreeId(host.hostId, wt.id);
    router.dismissTo("/");
  }

  return (
    <Screen>
      <AppHeader mb={8}>
        <IconButton
          aria-label="Back"
          icon={<ChevronLeft size={19} strokeWidth={2} />}
          onPress={() => router.back()}
        />
        <HeaderTitle fontWeight="600">
          {workspace?.fullName ?? workspace?.name ?? "Workspace"}
        </HeaderTitle>
        <HeaderSpacer />
      </AppHeader>

      <ScreenScroll>
        <Lead mb={16}>
          Worktrees are branch checkouts on the host. Pick one, then send a task from Inbox.
        </Lead>

        {error ? <ErrorText mb={10}>{error}</ErrorText> : null}
        {loading ? <Spinner my={20} color="$color8" /> : null}

        <SectionLabel fontSize="$5" mb={8}>
          Worktrees
        </SectionLabel>

        {worktrees.length === 0 && !loading ? (
          <Surface p={16} mb={12} flat>
            <SizableText fontSize="$5" fontWeight="500" color="$color">
              No worktrees yet
            </SizableText>
            <Meta mt={4}>Create a branch worktree to run agents in this repo.</Meta>
          </Surface>
        ) : (
          worktrees.map((wt) => (
            <Row
              key={wt.id}
              divided
              interactive
              role="button"
              aria-label={`Select worktree ${wt.branch}`}
              onPress={() => void selectWorktree(wt)}
            >
              <IconTile>
                <GitBranch size={18} color="$color10" strokeWidth={1.7} />
              </IconTile>
              <YStack flex={1} gap={2}>
                <SizableText fontSize="$5" fontWeight="500" color="$color">
                  {wt.branch}
                </SizableText>
                <Meta fontSize="$2" numberOfLines={1}>
                  {wt.cwd}
                </Meta>
              </YStack>
              <ChevronRight size={16} color="$color7" strokeWidth={2.1} />
            </Row>
          ))
        )}

        <PrimaryButton
          mt={22}
          role="button"
          aria-label="Create worktree"
          icon={<Plus size={18} strokeWidth={2} />}
          onPress={() =>
            router.push({
              pathname: "/repos/[workspaceId]/worktree",
              params: { workspaceId: workspaceId! },
            })
          }
        >
          Create worktree
        </PrimaryButton>
      </ScreenScroll>
    </Screen>
  );
}
