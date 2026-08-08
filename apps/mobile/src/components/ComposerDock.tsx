import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { composerDockBottom, useKeyboardHeight } from "../useKeyboardHeight";

/**
 * Absolutely positioned bottom dock that rides above the software keyboard
 * on iOS/web so the composer input stays visible while typing.
 */
export function ComposerDock({
  restingBottom,
  children,
  style,
}: {
  restingBottom: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const keyboardHeight = useKeyboardHeight();
  const bottom = composerDockBottom(restingBottom, keyboardHeight);

  return (
    <View style={[styles.dock, { bottom }, style]} pointerEvents="box-none">
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    left: 12,
    right: 12,
  },
});
