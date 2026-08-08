import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView, styled, YStack, type ScrollViewProps, type YStackProps } from "tamagui";
import { proofSafeArea } from "./insets";

/** Every screen shares one horizontal rhythm. */
export const GUTTER = 20;

export const Gutter = styled(YStack, {
  name: "Gutter",
  px: GUTTER,
});

const ScreenFrame = styled(YStack, {
  name: "Screen",
  flex: 1,
  bg: "$background",
  // Tamagui's web stacks are `position: static`, unlike React Native's default.
  // Screens anchor docks and overlays, so pin the containing block here.
  position: "relative",
});

/**
 * Screen shell: background, safe-area padding, and the web proof insets in one
 * place so no screen has to remember the SafeAreaView edge dance.
 */
export function Screen({
  children,
  bottomEdge = false,
  ...props
}: YStackProps & { children?: ReactNode; bottomEdge?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <ScreenFrame
      pt={insets.top + proofSafeArea.top}
      pl={insets.left}
      pr={insets.right}
      pb={bottomEdge ? insets.bottom + proofSafeArea.bottom : 0}
      {...props}
    >
      {children}
    </ScreenFrame>
  );
}

/** Gutter-padded scroll body, the default content region for a Screen. */
export function ScreenScroll({
  children,
  contentContainerStyle,
  ...props
}: ScrollViewProps & { children?: ReactNode }) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: GUTTER,
        paddingBottom: 40,
        ...(contentContainerStyle as object),
      }}
      {...props}
    >
      {children}
    </ScrollView>
  );
}
