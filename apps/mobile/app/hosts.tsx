import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, Github, Plus } from "@tamagui/lucide-icons-2";
import { useToastController } from "@tamagui/toast";
import { ScrollView, SizableText, XStack, YStack } from "tamagui";
import type { PairedHost } from "@prime-pocket/protocol";
import { loadPairedHosts, removePairedHost, upsertPairedHost } from "../src/storage";
import { reconnectPairedHost } from "../src/api";
import { WorkspaceRow } from "../src/components/WorkspaceRow";
import {
  AppHeader,
  ChipButton,
  GUTTER,
  Gutter,
  HeaderTitle,
  IconButton,
  Lead,
  Mono,
  Screen,
  Surface,
} from "../src/ui";

export default function HostsScreen() {
  const router = useRouter();
  const toast = useToastController();
  const [hosts, setHosts] = useState<PairedHost[]>([]);

  useFocusEffect(
    useCallback(() => {
      void loadPairedHosts().then(setHosts);
    }, []),
  );

  async function reconnect(host: PairedHost) {
    try {
      const next = await reconnectPairedHost(host);
      await upsertPairedHost(next);
      setHosts(await loadPairedHosts());
      toast.show("Reconnected", { message: next.label, customData: { theme: "success" } });
    } catch (e) {
      toast.show("Could not reconnect", {
        message: e instanceof Error ? e.message : String(e),
        customData: { theme: "danger" },
      });
    }
  }

  return (
    <Screen>
      <AppHeader>
        <IconButton
          aria-label="Back"
          icon={<ChevronLeft size={19} strokeWidth={2} />}
          onPress={() => router.back()}
        />
        <HeaderTitle>Hosts</HeaderTitle>
        <IconButton
          aria-label="Pair host"
          icon={<Plus size={19} strokeWidth={1.75} />}
          onPress={() => router.push("/pair")}
        />
      </AppHeader>

      <Gutter pt={14}>
        <Lead color="$color9">
          Paired bridges are stored on-device. Each host can expose many GitHub/local repositories
          as workspaces. Remote access uses Tailscale or LAN — Pocket does not run a relay.
        </Lead>

        <Surface
          mt={14}
          role="button"
          aria-label="Connect GitHub"
          onPress={() => router.push("/github")}
          flexDirection="row"
          items="center"
          gap={10}
          px={14}
          py={13}
          cursor="pointer"
          transition="quicker"
          pressStyle={{ bg: "$color2" }}
        >
          <Github size={18} color="$color" strokeWidth={1.7} />
          <SizableText grow={1} fontSize="$5" fontWeight="500" color="$color">
            Connect GitHub
          </SizableText>
          <ChevronRight size={16} color="$color7" strokeWidth={2.1} />
        </Surface>
      </Gutter>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 40 }}
      >
        {hosts.length === 0 ? (
          <SizableText mt={40} text="center" fontSize="$5" color="$color9">
            No paired hosts.
          </SizableText>
        ) : (
          hosts.map((host) => (
            <Surface key={host.hostId} p={14} mt={12} enterStyle={{ opacity: 0, y: 8 }}>
              <WorkspaceRow name={host.label} variant="plain" />
              <YStack px={4} pt={3} gap={3}>
                <Mono fontSize="$1">{host.baseUrl}</Mono>
                <Mono fontSize="$1" numberOfLines={1}>
                  fp {host.fingerprint.slice(0, 16)}…
                </Mono>
              </YStack>
              <XStack gap={8} mt={14}>
                <ChipButton
                  role="button"
                  aria-label={`Reconnect ${host.label}`}
                  onPress={() => void reconnect(host)}
                >
                  Reconnect
                </ChipButton>
                <ChipButton
                  theme="danger"
                  bg="$color3"
                  color="$color11"
                  role="button"
                  aria-label={`Remove ${host.label}`}
                  onPress={() => void removePairedHost(host.hostId).then(setHosts)}
                >
                  Remove
                </ChipButton>
              </XStack>
            </Surface>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
