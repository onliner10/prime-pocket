import { Platform, type TextStyle, type ViewStyle } from "react-native";

export const colors = {
  bg: "#F7F7F7",
  bgElevated: "#FCFCFC",
  bgSunken: "#F2F2F2",
  ink: "#141414",
  ink2: "#3C3C3C",
  muted: "#707070",
  muted2: "#A0A0A0",
  line: "#E5E5E5",
  hairline: "rgba(0,0,0,0.06)",
  cardShadow: "rgba(0,0,0,0.04)",
  // Status accents, tuned to the Cursor mobile inbox
  allAgents: "#FF4B00",
  working: "#2589BD",
  needsAttention: "#D68A00",
  inReview: "#D4318D",
  addGreen: "#34C759",
  danger: "#FF3B30",
  codeBg: "#E9E9E9",
  chip: "#F0F0F0",
  plusGreen: "#22C55E",
  // Diff counts: a slightly desaturated green against a pink-leaning red
  diffAdd: "#3D8A65",
  diffDel: "#CF2C56",
  // File-type badge accents
  tsBlue: "#3C7CAA",
  jsAmber: "#A6790C",
  imgViolet: "#7754D8",
} as const;

export const radii = {
  /** Cards inside a scroll list — Cursor keeps these tighter than full panels. */
  panel: 16,
  row: 16,
  card: 20,
  pill: 999,
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
 * Shared type ramp, matched to Cursor mobile's density.
 *
 * Weight tops out at 600 — the reference never uses 700+, so headings read as
 * confident rather than shouty. Tracking goes negative as size grows (optical
 * sizing that variable Geist does not do on its own) and positive only for the
 * small tracked section labels. Body is 16/24 so paragraphs are not cramped.
 */
export const type = {
  /** Large screen titles: Inbox, All Agents. */
  display: {
    fontFamily: fonts.sans,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "500",
    letterSpacing: -0.6,
    color: colors.ink,
  },
  /** Empty-state and modal titles. */
  title: {
    fontFamily: fonts.sans,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "500",
    letterSpacing: -0.35,
    color: colors.ink,
  },
  /** Top-bar title — medium, not bold, so it sits behind the content. */
  navTitle: {
    fontFamily: fonts.sans,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "500",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  /** Header inside a card, e.g. "Changes". */
  cardTitle: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: -0.25,
    color: colors.ink,
  },
  cardLabel: {
    fontFamily: fonts.sans,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "400",
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
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400",
    letterSpacing: -0.15,
    color: colors.ink,
  },
  /** Emphasis inside body copy — key phrases only. */
  bodyStrong: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
    letterSpacing: -0.15,
    color: colors.ink,
  },
  /** Secondary copy: list previews, helper text. */
  bodySmall: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
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
    lineHeight: 16,
    fontWeight: "600",
    letterSpacing: 0.8,
    color: colors.muted,
  },
  /** Pill button labels. */
  pill: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    letterSpacing: -0.2,
    color: colors.ink,
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "400",
    letterSpacing: -0.2,
    color: colors.ink,
  },
  /** Two/three-letter file-type badges. */
  badge: {
    fontFamily: fonts.mono,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
    color: colors.muted,
  },
  /** Diff counts — tabular so +/- columns line up row to row. */
  diff: {
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    letterSpacing: -0.1,
    fontVariant: ["tabular-nums"],
  },
} satisfies Record<string, TextStyle>;

/** Soft, single-layer elevation — no stacked glows. */
export const shadows = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.025,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  row: {
    shadowColor: "#000",
    shadowOpacity: 0.018,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  control: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  floating: {
    shadowColor: "#000",
    shadowOpacity: 0.09,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} satisfies Record<string, ViewStyle>;
