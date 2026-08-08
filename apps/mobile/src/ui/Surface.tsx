import { Card, Circle, Paragraph, SizableText, styled, XStack } from "tamagui";

/** Card chrome shared by every raised panel. */
export const Surface = styled(Card, {
  name: "Surface",
  bg: "$color1",
  rounded: "$6",
  borderWidth: 1,
  borderColor: "$color3",
  shadowColor: "$shadowColor",
  shadowOpacity: 1,
  shadowRadius: 7,
  shadowOffset: { width: 0, height: 2 },
  elevationAndroid: 1,

  variants: {
    flat: {
      true: { shadowOpacity: 0, elevationAndroid: 0 },
    },
    inset: {
      true: { bg: "$color2", borderColor: "transparent", shadowOpacity: 0 },
    },
  } as const,
});

/** Horizontal list row: icon, text column, trailing affordance. */
export const Row = styled(XStack, {
  name: "Row",
  items: "center",
  gap: 12,
  py: 13,
  transition: "quicker",

  variants: {
    divided: {
      true: {
        borderBottomWidth: 1,
        borderBottomColor: "$color3",
      },
    },
    interactive: {
      true: {
        pressStyle: { opacity: 0.6 },
        hoverStyle: { opacity: 0.85 },
        cursor: "pointer",
      },
    },
    selected: {
      true: {
        bg: "$color2",
        rounded: "$5",
        px: 8,
      },
    },
  } as const,
});

/** Rounded square that holds a leading icon. */
export const IconTile = styled(XStack, {
  name: "IconTile",
  width: 34,
  height: 34,
  rounded: "$5",
  bg: "$color3",
  items: "center",
  justify: "center",

  variants: {
    bare: {
      true: { width: 24, height: 24, rounded: 0, bg: "transparent" },
    },
  } as const,
});

export const SectionLabel = styled(SizableText, {
  name: "SectionLabel",
  fontSize: "$5",
  color: "$color9",
  mb: 7,
});

/** Intro paragraph under a screen title. */
export const Lead = styled(Paragraph, {
  name: "Lead",
  fontSize: "$5",
  lineHeight: 24,
  color: "$color10",
});

export const Meta = styled(SizableText, {
  name: "Meta",
  fontSize: "$3",
  color: "$color9",
});

export const ErrorText = styled(SizableText, {
  name: "ErrorText",
  theme: "danger",
  fontSize: "$3",
  color: "$color10",
});

export const Mono = styled(SizableText, {
  name: "Mono",
  fontFamily: "$mono",
  fontSize: "$2",
  color: "$color9",
});

/** Status pip; colour comes from whichever status theme wraps it. */
export const StatusDot = styled(Circle, {
  name: "StatusDot",
  size: 7,
  bg: "$color9",
});
