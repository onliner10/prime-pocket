import type { ComponentType } from "react";
import type { IconProps } from "@tamagui/helpers-icon";
import { H3, Paragraph, YStack } from "tamagui";

/**
 * Centred "nothing here yet" block. One component so the four inbox filters
 * and the worktree list cannot drift apart.
 */
export function EmptyState({
  title,
  body,
  icon: Icon,
  theme,
}: {
  title: string;
  body: string;
  icon?: ComponentType<IconProps>;
  theme?: string;
}) {
  return (
    <YStack
      items="center"
      px={30}
      gap={6}
      theme={theme as never}
      transition="medium"
      enterStyle={{ opacity: 0, y: 8 }}
    >
      {Icon ? (
        <YStack
          mb={10}
          width={56}
          height={56}
          rounded={999}
          bg="$color3"
          items="center"
          justify="center"
        >
          <Icon size={26} color="$color10" strokeWidth={1.8} />
        </YStack>
      ) : null}
      <H3 fontSize="$8" fontWeight="500" color="$color9" text="center">
        {title}
      </H3>
      <Paragraph fontSize="$6" lineHeight={24} color="$color9" text="center">
        {body}
      </Paragraph>
    </YStack>
  );
}
