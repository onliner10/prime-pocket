import { ChevronRight } from "@tamagui/lucide-icons-2";
import { SizableText, XStack } from "tamagui";
import { StatusDot } from "./Surface";

/** "N hosts unavailable" banner — amber because it is a state, not an error. */
export function ConnectionNotice({ message, onPress }: { message: string; onPress: () => void }) {
  return (
    <XStack
      theme="attention"
      role="button"
      aria-label="Open hosts to reconnect"
      onPress={onPress}
      items="center"
      gap={9}
      py={10}
      px={12}
      rounded="$6"
      bg="$color2"
      cursor="pointer"
      transition="medium"
      enterStyle={{ opacity: 0, y: -6 }}
      pressStyle={{ opacity: 0.7 }}
    >
      <StatusDot bg="$color9" />
      <SizableText grow={1} shrink={1} fontSize="$3" color="$color11">
        {message}. Tap to reconnect.
      </SizableText>
      <ChevronRight size={16} color="$color9" strokeWidth={2.1} />
    </XStack>
  );
}
