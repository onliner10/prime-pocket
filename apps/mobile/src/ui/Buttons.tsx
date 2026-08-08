import { Button, styled } from "tamagui";

/**
 * The one filled call-to-action in the app. `theme="accent"` inverts the base
 * palette, so it is ink-on-white in dark mode without a second definition.
 */
export const PrimaryButton = styled(Button, {
  name: "PrimaryButton",
  theme: "accent",
  bg: "$background",
  color: "$color",
  borderWidth: 0,
  rounded: "$6",
  height: 50,
  fontSize: "$5",
  fontWeight: "600",
  transition: "quicker",
  hoverStyle: { bg: "$backgroundHover" },
  pressStyle: { bg: "$backgroundPress", scale: 0.985 },
  disabledStyle: { opacity: 0.35 },

  variants: {
    pill: {
      true: { rounded: 999 },
    },
  } as const,
});

/** Quiet counterpart: same footprint, chrome-only surface. */
export const SecondaryButton = styled(Button, {
  name: "SecondaryButton",
  bg: "$color3",
  color: "$color",
  borderWidth: 0,
  rounded: "$6",
  height: 50,
  fontSize: "$5",
  fontWeight: "600",
  transition: "quicker",
  hoverStyle: { bg: "$color4" },
  pressStyle: { bg: "$color4", scale: 0.985 },
  disabledStyle: { opacity: 0.35 },

  variants: {
    pill: {
      true: { rounded: 999 },
    },
  } as const,
});

/** Inline affordance inside cards and rows. */
export const ChipButton = styled(Button, {
  name: "ChipButton",
  bg: "$color3",
  color: "$color",
  borderWidth: 0,
  rounded: 999,
  height: 36,
  px: 14,
  fontSize: "$3",
  fontWeight: "600",
  transition: "quicker",
  hoverStyle: { bg: "$color4" },
  pressStyle: { bg: "$color4", scale: 0.95 },
  disabledStyle: { opacity: 0.4 },

  variants: {
    tone: {
      plain: { bg: "transparent", color: "$color10" },
      accent: { theme: "accent", bg: "$background", color: "$color" },
    },
  } as const,
});
