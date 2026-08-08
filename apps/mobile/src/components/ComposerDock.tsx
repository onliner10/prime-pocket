import type { ReactNode } from "react";
import { YStack } from "tamagui";
import { composerDockBottom, useKeyboardHeight } from "../useKeyboardHeight";

/**
 * Absolutely positioned bottom dock that rides above the software keyboard
 * on iOS/web so the composer input stays visible while typing.
 */
export function ComposerDock({
  restingBottom,
  children,
}: {
  restingBottom: number;
  children: ReactNode;
}) {
  const keyboardHeight = useKeyboardHeight();

  return (
    <YStack
      position="absolute"
      l={12}
      r={12}
      b={composerDockBottom(restingBottom, keyboardHeight)}
      pointerEvents="box-none"
    >
      {children}
    </YStack>
  );
}
