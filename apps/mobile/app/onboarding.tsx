import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { GitHubStatus, PairedHost } from "@prime-pocket/protocol";
import { PocketHostClient } from "../src/api";
import {
  loadOnboardingComplete,
  loadPairedHosts,
  saveOnboardingComplete,
} from "../src/storage";
import { colors, proofSafeArea, radii, space, type } from "../src/theme";
import { Icon } from "../src/components/Icon";

type Step = 1 | 2 | 3;

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [hosts, setHosts] = useState<PairedHost[]>([]);
  const [github, setGithub] = useState<GitHubStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const paired = await loadPairedHosts();
    setHosts(paired);
    if (paired.length === 0) {
      setStep(1);
      setGithub(null);
      return;
    }
    try {
      const client = new PocketHostClient(paired[0]!);
      const status = await client.githubStatus();
      setGithub(status);
      if (!status.connected) setStep(2);
      else setStep(3);
    } catch {
      setStep(2);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        if (await loadOnboardingComplete()) {
          router.replace("/");
          return;
        }
        await refresh();
      })();
    }, [refresh, router]),
  );

  async function connectMockGitHub() {
    if (!hosts[0] || busy) return;
    setBusy(true);
    setError(null);
    try {
      const client = new PocketHostClient(hosts[0]);
      const status = await client.connectGitHub({ mode: "mock" });
      setGithub(status);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    await saveOnboardingComplete();
    router.replace("/repos/add");
  }

  const hostReady = hosts.length > 0;
  const githubReady = Boolean(github?.connected);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.body}>
        <Text style={styles.brand}>Prime Pocket</Text>
        <Text style={styles.title}>Get set up</Text>
        <Text style={styles.lead}>
          Connect your desktop bridge, then GitHub. After that you can add a repo and start an
          agent.
        </Text>

        <View style={styles.steps}>
          <StepRow
            index={1}
            title="Pair desktop bridge"
            body={
              hostReady
                ? `Connected to ${hosts[0]!.label}`
                : "Run the bridge on your machine, then enter URL + pair code."
            }
            done={hostReady}
            active={step === 1}
            actionLabel={hostReady ? undefined : "Pair host"}
            onAction={() => router.push("/pair")}
          />
          <StepRow
            index={2}
            title="Connect GitHub"
            body={
              githubReady
                ? `Signed in as ${github?.login ?? "GitHub"}${github?.mock ? " (mock)" : ""}`
                : github?.mockAvailable
                  ? "Use mock GitHub for demos, or connect a real account on a live host."
                  : "Authorize GitHub on the paired host."
            }
            done={githubReady}
            active={step === 2}
            actionLabel={
              !hostReady ? undefined : githubReady ? undefined : github?.mockAvailable ? "Use mock GitHub" : "Connect GitHub"
            }
            onAction={
              !hostReady
                ? undefined
                : githubReady
                  ? undefined
                  : github?.mockAvailable
                    ? () => void connectMockGitHub()
                    : () => router.push("/github")
            }
            busy={busy}
          />
          <StepRow
            index={3}
            title="Add a repository"
            body="Pick a repo, create a worktree, then send your first task."
            done={false}
            active={step === 3}
            actionLabel={hostReady && githubReady ? "Choose repository" : undefined}
            onAction={hostReady && githubReady ? () => void finish() : undefined}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={{ flex: 1 }} />

        {hostReady && githubReady ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Finish setup"
            onPress={() => void finish()}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function StepRow({
  index,
  title,
  body,
  done,
  active,
  actionLabel,
  onAction,
  busy,
}: {
  index: number;
  title: string;
  body: string;
  done: boolean;
  active: boolean;
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
}) {
  return (
    <View
      style={[styles.step, active && styles.stepActive, done && styles.stepDone]}
      accessibilityState={{ selected: active }}
    >
      <View style={[styles.badge, done && styles.badgeDone]}>
        {done ? (
          <Icon name="checkCircle" size={18} color={colors.addGreen} strokeWidth={1.8} />
        ) : (
          <Text style={styles.badgeText}>{index}</Text>
        )}
      </View>
      <View style={styles.stepText}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{body}</Text>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            disabled={busy}
            onPress={onAction}
            style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text style={styles.stepBtnText}>{actionLabel}</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingTop: proofSafeArea.top },
  body: { flex: 1, paddingHorizontal: space.gutter, paddingTop: 28, paddingBottom: 24 },
  brand: { ...type.meta, color: colors.muted, marginBottom: 8, fontWeight: "600" },
  title: { ...type.display, marginBottom: 10 },
  lead: { ...type.body, color: colors.ink2, marginBottom: 28 },
  steps: { gap: 12 },
  step: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.bgElevated,
    borderRadius: radii.row,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  stepActive: { borderColor: colors.ink, borderWidth: 1.5 },
  stepDone: { opacity: 0.95 },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.chip,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeDone: { backgroundColor: "#E8F8EE" },
  badgeText: { ...type.row, fontWeight: "600", fontSize: 15 },
  stepText: { flex: 1, gap: 4 },
  stepTitle: { ...type.row, fontSize: 17, fontWeight: "600" },
  stepBody: { ...type.meta, color: colors.muted, fontSize: 13, lineHeight: 18 },
  stepBtn: {
    alignSelf: "flex-start",
    marginTop: 10,
    backgroundColor: colors.chip,
    borderRadius: radii.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  stepBtnText: { ...type.meta, color: colors.ink, fontWeight: "600", fontSize: 14 },
  error: { ...type.meta, color: colors.danger, marginTop: 14 },
  primary: {
    backgroundColor: colors.ink,
    borderRadius: radii.row,
    paddingVertical: 15,
    alignItems: "center",
  },
  primaryText: { ...type.row, color: "#fff", fontWeight: "600", fontSize: 16 },
  pressed: { opacity: 0.75 },
});
