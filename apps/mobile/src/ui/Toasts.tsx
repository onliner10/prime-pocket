import { Toast, useToastState } from "@tamagui/toast";
import { SizableText, YStack } from "tamagui";

/**
 * Single rendering point for imperative toasts (`useToastController().show`).
 * Replaces the browser `alert()` the hosts screen used to fall back to.
 */
export function Toasts() {
  const toast = useToastState();
  if (!toast || toast.isHandledNatively) return null;

  return (
    <Toast
      key={toast.id}
      duration={toast.duration}
      viewportName={toast.viewportName}
      theme={(toast.customData as { theme?: string } | undefined)?.theme as never}
      bg="$color1"
      borderWidth={1}
      borderColor="$color4"
      rounded="$6"
      px={14}
      py={12}
      shadowColor="$shadowColor"
      shadowOpacity={1}
      shadowRadius={20}
      shadowOffset={{ width: 0, height: 8 }}
      transition="medium"
      enterStyle={{ opacity: 0, y: -16, scale: 0.96 }}
      exitStyle={{ opacity: 0, y: -16, scale: 0.96 }}
      y={0}
      opacity={1}
      scale={1}
    >
      <YStack gap={2}>
        <Toast.Title asChild>
          <SizableText fontSize="$4" fontWeight="600" color="$color">
            {toast.title}
          </SizableText>
        </Toast.Title>
        {toast.message ? (
          <Toast.Description asChild>
            <SizableText fontSize="$3" color="$color10">
              {toast.message}
            </SizableText>
          </Toast.Description>
        ) : null}
      </YStack>
    </Toast>
  );
}
