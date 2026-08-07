import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "../src/theme";
import { injectWebFonts } from "../src/webFonts";

if (Platform.OS === "web") injectWebFonts();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="agents/index" />
        <Stack.Screen name="agents/[filter]" />
        <Stack.Screen name="pair" options={{ presentation: "modal" }} />
        <Stack.Screen name="scan" options={{ presentation: "modal" }} />
        <Stack.Screen name="agent/[hostId]/[agentId]" />
        <Stack.Screen name="hosts" />
      </Stack>
    </SafeAreaProvider>
  );
}
