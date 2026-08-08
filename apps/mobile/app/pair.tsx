import { useState } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { X } from "@tamagui/lucide-icons-2";
import { Paragraph, Spinner } from "tamagui";
import { decodePairingQr, type PairedHost } from "@prime-pocket/protocol";
import { pairWithHost, resolveReachableBaseUrl } from "../src/api";
import { loadOnboardingComplete, upsertPairedHost } from "../src/storage";
import {
  AppHeader,
  ErrorText,
  Field,
  FieldArea,
  FieldLabel,
  Gutter,
  HeaderSpacer,
  HeaderTitle,
  IconButton,
  Mono,
  PrimaryButton,
  Screen,
  SecondaryButton,
} from "../src/ui";

export default function PairScreen() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [deviceLabel, setDeviceLabel] = useState(Platform.OS === "ios" ? "iPhone" : "Phone");
  const [manualUrl, setManualUrl] = useState("http://127.0.0.1:17420");
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pairFromPayload(
    urls: string[],
    pairCode: string,
    fingerprint: string,
    hostName: string,
  ) {
    setBusy(true);
    setError(null);
    try {
      const baseUrl = await resolveReachableBaseUrl(urls);
      const res = await pairWithHost(
        baseUrl,
        { pairCode, deviceLabel: deviceLabel || "Phone" },
        fingerprint ? { fingerprint } : undefined,
      );
      const paired: PairedHost = {
        hostId: res.host.id,
        baseUrl,
        urls: res.host.urls.length ? res.host.urls : urls,
        token: res.token,
        label: res.host.name || hostName,
        fingerprint: res.host.fingerprint,
        pairedAt: new Date().toISOString(),
      };
      await upsertPairedHost(paired);
      const onboarded = await loadOnboardingComplete();
      router.replace(onboarded ? "/" : "/onboarding");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/invalid or expired pair code/i.test(msg) || /pair_invalid/i.test(msg)) {
        setError(
          "Invalid or expired pair code. On the desktop run `prime-pocket pair-code` (or restart the bridge) and paste the new QR/deep link.",
        );
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onScanOrPaste() {
    try {
      const payload = decodePairingQr(raw.trim());
      await pairFromPayload(
        payload.urls?.length ? payload.urls : [payload.url],
        payload.pairCode,
        payload.fingerprint,
        payload.hostName,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onManual() {
    if (!manualUrl || !manualCode) {
      setError("URL and pair code required");
      return;
    }
    await pairFromPayload([manualUrl], manualCode.trim(), "", "host");
  }

  return (
    <Screen>
      <AppHeader>
        <IconButton
          aria-label="Close"
          icon={<X size={16} strokeWidth={2.1} />}
          onPress={() => router.back()}
        />
        <HeaderTitle>Pair host</HeaderTitle>
        <HeaderSpacer />
      </AppHeader>

      <Gutter p={20}>
        <Paragraph fontSize="$5" color="$color9" mb={18}>
          Run <Mono bg="$color3">prime-pocket bridge --demo --http</Mono> on your machine, then
          paste the deep link or enter URL + pair code.
        </Paragraph>

        <FieldLabel htmlFor="device-label">Device label</FieldLabel>
        <Field
          id="device-label"
          value={deviceLabel}
          onChangeText={setDeviceLabel}
          placeholder="My phone"
        />

        <FieldLabel htmlFor="pair-payload">Paste QR deep link / JSON</FieldLabel>
        <FieldArea
          id="pair-payload"
          value={raw}
          onChangeText={setRaw}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="prime-pocket://pair?data=..."
        />

        <PrimaryButton
          pill
          mt={10}
          role="button"
          aria-label="Pair from paste"
          disabled={busy}
          onPress={() => void onScanOrPaste()}
          icon={busy ? <Spinner size="small" color="$color" /> : undefined}
        >
          Pair from paste
        </PrimaryButton>

        <SecondaryButton
          pill
          mt={10}
          bg="$color1"
          role="button"
          aria-label="Open camera scanner"
          onPress={() => router.push("/scan")}
        >
          Open camera scanner
        </SecondaryButton>

        <FieldLabel mt={22} htmlFor="manual-url">
          Or manual
        </FieldLabel>
        <Field
          id="manual-url"
          value={manualUrl}
          onChangeText={setManualUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="http://127.0.0.1:17420"
        />
        <Field
          mt={10}
          value={manualCode}
          onChangeText={setManualCode}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="pair code"
        />
        <SecondaryButton
          pill
          mt={10}
          bg="$color1"
          role="button"
          aria-label="Pair manually"
          disabled={busy}
          onPress={() => void onManual()}
        >
          Pair manually
        </SecondaryButton>

        {error ? (
          <ErrorText mt={14} fontSize="$5" enterStyle={{ opacity: 0, y: -4 }} transition="quick">
            {error}
          </ErrorText>
        ) : null}
      </Gutter>
    </Screen>
  );
}
