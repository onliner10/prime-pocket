import { Platform, type TextStyle, type ViewStyle } from "react-native";

export const colors = {
  bg: "#F2F2F2",
  bgElevated: "#FFFFFF",
  bgSunken: "#EBEBEB",
  ink: "#0B0B0C",
  ink2: "#3A3A3C",
  muted: "#8A8A8E",
  muted2: "#B0B0B5",
  line: "#E6E6E9",
  hairline: "rgba(0,0,0,0.06)",
  cardShadow: "rgba(0,0,0,0.06)",
  // Status accents, tuned to the Cursor mobile inbox
  allAgents: "#FF7A1A",
  working: "#0A84FF",
  needsAttention: "#FF9F0A",
  inReview: "#8B5CF6",
  addGreen: "#34C759",
  danger: "#FF3B30",
  codeBg: "#F0F0F2",
  chip: "#F2F2F4",
  plusGreen: "#22C55E",
  diffAdd: "#34C759",
  diffDel: "#FF453A",
} as const;

export const radii = {
  row: 16,
  card: 20,
  pill: 28,
  circle: 999,
} as const;

export const space = {
  gutter: 20,
  gap: 12,
} as const;

/**
 * Native falls back to the platform UI font (SF on iOS) so the app feels native.
 * Web pins a self-hosted variable Geist (see app/+html.tsx) so screenshots are
 * not at the mercy of whatever sans the host machine happens to have.
 */
const webSans =
  '"Geist", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable", "Helvetica Neue", Arial, sans-serif';
const webMono = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export const fonts = {
  sans: Platform.OS === "web" ? webSans : undefined,
  mono: Platform.OS === "web" ? webMono : Platform.OS === "ios" ? "Menlo" : "monospace",
} as const;

/**
 * Shared type ramp. Tracking is negative at display sizes and slightly positive
 * for small caps labels, which is what makes system-ish sans read as considered.
 */
export const type = {
  display: {
    fontFamily: fonts.sans,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "700",
    letterSpacing: -1.1,
    color: colors.ink,
  },
  title: {
    fontFamily: fonts.sans,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "600",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  navTitle: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600",
    letterSpacing: -0.2,
    color: colors.ink,
  },
  cardLabel: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: -0.25,
    color: colors.ink,
  },
  row: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "500",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
    letterSpacing: -0.1,
    color: colors.ink,
  },
  meta: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    letterSpacing: -0.05,
    color: colors.muted,
  },
  sectionLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
    letterSpacing: 0.9,
    color: colors.muted,
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: 16,
    fontWeight: "400",
    letterSpacing: -0.2,
    color: colors.ink,
  },
} satisfies Record<string, TextStyle>;

/** Soft, single-layer elevation — no stacked glows. */
export const shadows = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  row: {
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  control: {
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  floating: {
    shadowColor: "#000",
    shadowOpacity: 0.13,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} satisfies Record<string, ViewStyle>;
