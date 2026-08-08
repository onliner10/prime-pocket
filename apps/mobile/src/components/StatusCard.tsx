import type { ComponentType } from "react";
import type { IconProps } from "@tamagui/helpers-icon";
import { SizableText } from "tamagui";
import { Surface } from "../ui";

/**
 * One inbox filter tile. The status theme tints the whole card — surface,
 * border, icon and count all come from `theme`, so a new status needs a theme
 * entry and nothing else.
 */
export function StatusCard({
  title,
  count,
  icon: Icon,
  theme,
  onPress,
}: {
  title: string;
  count?: number | string;
  icon: ComponentType<IconProps>;
  theme: "agents" | "working" | "attention" | "review";
  onPress?: () => void;
}) {
  return (
    <Surface
      theme={theme}
      role="button"
      aria-label={count === undefined ? title : `${title} ${count}`}
      onPress={onPress}
      flex={1}
      minH={108}
      px={12}
      pt={15}
      pb={16}
      justify="space-between"
      borderColor="$color4"
      cursor="pointer"
      transition="quicker"
      hoverStyle={{ borderColor: "$color6" }}
      pressStyle={{ scale: 0.975, bg: "$color2" }}
      enterStyle={{ opacity: 0, y: 10 }}
    >
      <Icon size={25} color="$color9" strokeWidth={2} />
      <SizableText fontSize="$6" color="$color12" numberOfLines={2}>
        {title}
        {count === undefined ? null : <SizableText color="$color9"> {count}</SizableText>}
      </SizableText>
    </Surface>
  );
}
