import type { ComponentType } from "react";
import type { IconProps } from "@tamagui/helpers-icon";
import { ChevronRight, Folder } from "@tamagui/lucide-icons-2";
import { SizableText, styled, YStack } from "tamagui";
import { IconTile, Row } from "../ui";

const Frame = styled(Row, {
  name: "WorkspaceRow",
  justify: "space-between",
  cursor: "pointer",

  variants: {
    card: {
      true: {
        bg: "$color1",
        rounded: "$6",
        py: 15,
        pl: 14,
        pr: 16,
        borderWidth: 1,
        borderColor: "$color3",
        pressStyle: { bg: "$color2" },
      },
      false: {
        pr: 3,
        borderBottomWidth: 1,
        borderBottomColor: "$color3",
        pressStyle: { opacity: 0.6 },
      },
    },
    selected: {
      true: { bg: "$color2", rounded: "$6", px: 8 },
    },
  } as const,
});

/** Repository / host row: icon tile, name over subtitle, chevron. */
export function WorkspaceRow({
  name,
  subtitle,
  onPress,
  variant = "card",
  icon: Icon = Folder,
  selected = false,
}: {
  name: string;
  subtitle?: string;
  onPress?: () => void;
  /** "plain" drops the card chrome for rows nested inside another surface. */
  variant?: "card" | "plain";
  icon?: ComponentType<IconProps>;
  selected?: boolean;
}) {
  const card = variant === "card";
  return (
    <Frame
      card={card}
      selected={selected}
      role={onPress ? "button" : undefined}
      aria-label={subtitle ? `${name}, ${subtitle}` : name}
      aria-selected={selected}
      onPress={onPress}
      cursor={onPress ? "pointer" : "default"}
      gap={10}
    >
      <IconTile bare={!card}>
        <Icon size={18} color="$color10" strokeWidth={1.7} />
      </IconTile>
      <YStack grow={1} shrink={1}>
        <SizableText fontSize="$7" color="$color" numberOfLines={1}>
          {name}
        </SizableText>
        {subtitle ? (
          <SizableText fontSize="$2" color="$color9" numberOfLines={1}>
            {subtitle}
          </SizableText>
        ) : null}
      </YStack>
      {onPress ? <ChevronRight size={16} color="$color8" strokeWidth={2.1} /> : null}
    </Frame>
  );
}
