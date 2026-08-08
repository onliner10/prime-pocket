import { Avatar as TamaguiAvatar, Button, SizableText, styled, XStack, YStack } from "tamagui";
import { GUTTER } from "./Screen";

/** Soft, single-layer elevation — no stacked glows. */
export const controlShadow = {
  shadowColor: "$shadowColor",
  shadowOpacity: 1,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevationAndroid: 2,
} as const;

export const AppHeader = styled(XStack, {
  name: "AppHeader",
  items: "center",
  justify: "space-between",
  px: GUTTER,
  gap: 10,
  minH: 44,
  mt: 6,
});

export const HeaderTitle = styled(SizableText, {
  name: "HeaderTitle",
  fontSize: "$6",
  fontWeight: "500",
  color: "$color",
  grow: 1,
  text: "center",
  numberOfLines: 1,
  ellipsizeMode: "tail",
});

/** Keeps a centred HeaderTitle optically centred when one side has no button. */
export const HeaderSpacer = styled(YStack, {
  name: "HeaderSpacer",
  width: 40,
});

/** The circular chrome button used across every top bar. */
export const IconButton = styled(Button, {
  name: "IconButton",
  circular: true,
  size: "$4",
  bg: "$color1",
  borderWidth: 1,
  borderColor: "$color2",
  transition: "quicker",
  hoverStyle: { bg: "$color2", borderColor: "$color3" },
  pressStyle: { bg: "$color3", borderColor: "$color3", scale: 0.93 },
  ...controlShadow,

  variants: {
    tone: {
      elevated: {},
      sunken: {
        bg: "$color3",
        borderColor: "transparent",
        shadowOpacity: 0,
        elevationAndroid: 0,
      },
      bare: {
        bg: "transparent",
        borderColor: "transparent",
        shadowOpacity: 0,
        elevationAndroid: 0,
      },
    },
  } as const,

  defaultVariants: {
    tone: "elevated",
  },
});

/** Single-letter identity chip in the inbox top bar. */
export function Avatar({ label }: { label: string }) {
  return (
    <TamaguiAvatar circular size="$4" bg="$color1" borderWidth={1} borderColor="$color3">
      <TamaguiAvatar.Fallback items="center" justify="center" bg="$color1">
        <SizableText fontSize="$5" color="$color10">
          {label}
        </SizableText>
      </TamaguiAvatar.Fallback>
    </TamaguiAvatar>
  );
}
