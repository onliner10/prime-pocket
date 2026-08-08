import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { TamaguiProvider, useTheme } from "tamagui";
import { ToastProvider, ToastViewport } from "@tamagui/toast";
import { config } from "../tamagui.config";
import { injectWebShellCss } from "../src/webShell";
import { proofSafeArea } from "../src/ui/insets";
import { Toasts } from "../src/ui/Toasts";

if (Platform.OS === "web") injectWebShellCss();

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = scheme === "dark" ? "dark" : "light";

  return (
    <TamaguiProvider config={config} defaultTheme={theme}>
      <SafeAreaProvider>
        <ToastProvider swipeDirection="up" duration={4500}>
          <StatusBar style={theme === "dark" ? "light" : "dark"} />
          <RootStack />
          <Toasts />
          <ToastViewport t={proofSafeArea.top + 8} l={12} r={12} />
        </ToastProvider>
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}

/** Split out so the navigator can read the resolved Tamagui theme. */
function RootStack() {
  const tamagui = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tamagui.background.val },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" options={{ animation: "fade" }} />
      <Stack.Screen name="github" options={{ presentation: "modal" }} />
      <Stack.Screen name="agents/index" />
      <Stack.Screen name="agents/[filter]" />
      <Stack.Screen name="pair" options={{ presentation: "modal" }} />
      <Stack.Screen name="scan" options={{ presentation: "modal" }} />
      <Stack.Screen name="agent/[hostId]/[agentId]" />
      <Stack.Screen name="hosts" />
      <Stack.Screen name="repos/add" options={{ presentation: "modal" }} />
    </Stack>
  );
}
