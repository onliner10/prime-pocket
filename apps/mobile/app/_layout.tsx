import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "../src/theme";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Fleet" }} />
        <Stack.Screen name="pair" options={{ title: "Pair host", presentation: "modal" }} />
        <Stack.Screen name="scan" options={{ title: "Scan QR", presentation: "modal" }} />
        <Stack.Screen name="agent/[hostId]/[agentId]" options={{ title: "Agent" }} />
        <Stack.Screen name="hosts" options={{ title: "Hosts" }} />
      </Stack>
    </>
  );
}
