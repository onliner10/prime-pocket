import type { ComponentType } from "react";
import type { IconProps } from "@tamagui/helpers-icon";
import { H3, Paragraph, Theme, YStack } from "tamagui";

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
  /** Status accent for the medallion. Copy stays neutral either way. */
  theme?: string;
}) {
  return (
    <YStack items="center" px={30} gap={6} transition="medium" enterStyle={{ opacity: 0, y: 8 }}>
      {Icon ? (
        // Only the medallion takes the status accent — running the whole block
        // through it turns the copy into coloured text and kills the hierarchy.
        <Theme name={theme as never}>
          <YStack
            mb={10}
            width={56}
            height={56}
            rounded={999}
            bg="$color3"
            items="center"
            justify="center"
            enterStyle={{ opacity: 0, scale: 0.8 }}
            transition="bouncy"
          >
            <Icon size={26} color="$color10" strokeWidth={1.8} />
          </YStack>
        </Theme>
      ) : null}
      <H3 fontSize="$8" fontWeight="500" color="$color11" text="center">
        {title}
      </H3>
      <Paragraph fontSize="$6" lineHeight={24} color="$color9" text="center">
        {body}
      </Paragraph>
    </YStack>
  );
}
