import type { ReactNode } from "react";
import { Check } from "@tamagui/lucide-icons-2";
import { H4, Sheet, SizableText, XStack, YStack } from "tamagui";

/**
 * The app's one bottom-sheet picker. Replaces the hand-rolled RN Modal
 * backdrops: drag-to-dismiss, overlay press, and enter/exit motion all come
 * from Tamagui's Sheet.
 */
export function PickerSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Sheet
      modal
      open={open}
      onOpenChange={onOpenChange}
      snapPointsMode="fit"
      dismissOnSnapToBottom
      dismissOnOverlayPress
      transition="medium"
      zIndex={200_000}
    >
      <Sheet.Overlay
        bg="$shadow6"
        transition="quick"
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
      />
      <Sheet.Frame bg="$color1" borderTopLeftRadius="$9" borderTopRightRadius="$9" px={14} pt={10}>
        {/* Inside the frame, not above it, so the grabber reads as part of the
            sheet rather than floating over the scrim. */}
        <Sheet.Handle self="center" width={40} height={4} rounded={2} bg="$color6" mb={10} />
        <H4 fontSize="$6" fontWeight="600" color="$color" mb={6} ml={4}>
          {title}
        </H4>
        <Sheet.ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <YStack pb={20}>{children}</YStack>
        </Sheet.ScrollView>
      </Sheet.Frame>
    </Sheet>
  );
}

/** Selectable line inside a PickerSheet. */
export function PickerRow({
  label,
  ariaLabel,
  selected,
  onPress,
  icon,
  trailing,
}: {
  label: string;
  ariaLabel: string;
  selected?: boolean;
  onPress: () => void;
  icon?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <XStack
      role="button"
      aria-label={ariaLabel}
      aria-selected={selected}
      onPress={onPress}
      items="center"
      gap={10}
      py={12}
      px={8}
      rounded="$5"
      cursor="pointer"
      bg={selected ? "$color2" : "transparent"}
      hoverStyle={{ bg: "$color2" }}
      pressStyle={{ bg: "$color3" }}
    >
      {icon}
      <SizableText grow={1} shrink={1} fontSize="$5" color="$color" numberOfLines={1}>
        {label}
      </SizableText>
      {trailing}
      {selected ? <Check size={18} color="$color" strokeWidth={2} /> : null}
    </XStack>
  );
}
