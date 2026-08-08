import { Platform } from "react-native";
import { createFont, createTamagui } from "tamagui";
import { createV5Theme, defaultConfig } from "@tamagui/config/v5";
import { animations } from "@tamagui/config/v5-css";

/**
 * Prime Pocket on Tamagui.
 *
 * Product semantics live in the theme layer, not in a parallel palette module:
 * every inbox status is a real Tamagui child theme, so a card can say
 * `theme="working"` and get background/border/text/accent for free in both
 * schemes. `$working10` and friends stay available inside any theme for the
 * cases that only need the accent (dots, icons, diff counts).
 */

type Hsl = { h: number; s: number; l: number };
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
type Scale<Name extends string> = { [K in `${Name}${Step}`]: string };

const hsl = ({ h, s, l }: Hsl) =>
  `hsl(${h}, ${Math.round(Math.min(100, Math.max(0, s)))}%, ${Math.round(Math.min(100, Math.max(0, l)))}%)`;

/**
 * Radix-shaped 12 step scale grown from one brand colour: 1-2 page tints,
 * 3-5 component fills, 6-8 borders, 9 the brand itself, 10 its pressed state,
 * 11-12 text that still passes contrast on the matching tint.
 */
function accentScale<Name extends string>(name: Name, base: Hsl): { light: Scale<Name>; dark: Scale<Name> } {
  const { h, s, l } = base;
  const light = [
    { h, s: Math.min(s, 60), l: 98 },
    { h, s: Math.min(s, 70), l: 96 },
    { h, s: Math.min(s, 80), l: 92 },
    { h, s, l: 87 },
    { h, s, l: 81 },
    { h, s, l: 74 },
    { h, s, l: 66 },
    { h, s, l: 58 },
    { h, s, l },
    { h, s, l: l - 7 },
    { h, s: s * 1.05, l: Math.max(l - 19, 28) },
    { h, s: s * 0.75, l: 17 },
  ];
  const dark = [
    { h, s: Math.min(s, 55), l: 9 },
    { h, s: Math.min(s, 65), l: 12 },
    { h, s: Math.min(s, 75), l: 17 },
    { h, s, l: 22 },
    { h, s, l: 27 },
    { h, s, l: 33 },
    { h, s, l: 40 },
    { h, s, l: 48 },
    { h, s, l },
    { h, s, l: l + 7 },
    { h, s: s * 0.9, l: Math.min(l + 26, 80) },
    { h, s: s * 0.6, l: 93 },
  ];
  const toScale = (steps: Hsl[]) =>
    Object.fromEntries(steps.map((step, i) => [`${name}${i + 1}`, hsl(step)])) as Scale<Name>;
  return { light: toScale(light), dark: toScale(dark) };
}

/**
 * Neutral ramp tuned to the Cursor-like inbox: 1 is the elevated card, 2 the
 * page, 4 the hairline, 9 muted copy, 12 ink.
 */
const lightPalette = [
  "hsl(0, 0%, 99%)",
  "hsl(0, 0%, 97%)",
  "hsl(0, 0%, 94%)",
  "hsl(0, 0%, 90%)",
  "hsl(0, 0%, 85%)",
  "hsl(0, 0%, 77%)",
  "hsl(0, 0%, 63%)",
  "hsl(0, 0%, 54%)",
  "hsl(0, 0%, 44%)",
  "hsl(0, 0%, 24%)",
  "hsl(0, 0%, 14%)",
  "hsl(0, 0%, 8%)",
];

const darkPalette = [
  "hsl(0, 0%, 4%)",
  "hsl(0, 0%, 7%)",
  "hsl(0, 0%, 10%)",
  "hsl(0, 0%, 14%)",
  "hsl(0, 0%, 18%)",
  "hsl(0, 0%, 24%)",
  "hsl(0, 0%, 32%)",
  "hsl(0, 0%, 43%)",
  "hsl(0, 0%, 55%)",
  "hsl(0, 0%, 66%)",
  "hsl(0, 0%, 82%)",
  "hsl(0, 0%, 98%)",
];

/**
 * One child theme per inbox state, plus success/danger for diffs and
 * destructive rows and violet for attachment/PR affordances. The stock radix
 * children are dropped — every colour the product uses is a named state.
 */
const childrenThemes = {
  agents: accentScale("agents", { h: 14, s: 84, l: 54 }),
  working: accentScale("working", { h: 205, s: 42, l: 49 }),
  attention: accentScale("attention", { h: 35, s: 59, l: 47 }),
  review: accentScale("review", { h: 324, s: 46, l: 49 }),
  success: accentScale("success", { h: 151, s: 39, l: 39 }),
  danger: accentScale("danger", { h: 345, s: 65, l: 49 }),
  violet: accentScale("violet", { h: 253, s: 63, l: 59 }),
};

const themes = createV5Theme({ lightPalette, darkPalette, childrenThemes });

/**
 * Native falls back to the platform UI font (SF on iOS). Web pins the
 * self-hosted variable Geist shipped in public/fonts so screenshots do not
 * depend on whatever sans the host machine happens to have.
 */
const sansFamily =
  Platform.OS === "web"
    ? '"Geist", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable", "Helvetica Neue", Arial, sans-serif'
    : "System";

const monoFamily =
  Platform.OS === "web"
    ? '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    : Platform.OS === "ios"
      ? "Menlo"
      : "monospace";

const fontSizes = {
  1: 11,
  2: 12,
  3: 13,
  4: 15,
  true: 15,
  5: 16,
  6: 17,
  7: 18,
  8: 20,
  9: 22,
  10: 26,
  11: 32,
  12: 40,
  13: 48,
  14: 56,
  15: 64,
  16: 72,
};

/** Body copy breathes at 1.5; headings tighten as they grow. */
const lineHeightFor = (size: number) =>
  size <= 13 ? size + 5 : size <= 18 ? Math.round(size * 1.45) : Math.round(size * 1.22);

/** Optical sizing that variable Geist does not do on its own. */
const trackingFor = (size: number) =>
  size <= 13 ? 0 : size <= 16 ? -0.15 : size <= 18 ? -0.3 : size <= 22 ? -0.4 : -0.6;

const mapSizes = (fn: (size: number) => number) =>
  Object.fromEntries(Object.entries(fontSizes).map(([key, size]) => [key, fn(size)]));

const fontBase = {
  size: fontSizes,
  lineHeight: mapSizes(lineHeightFor),
  letterSpacing: mapSizes(trackingFor),
};

const body = createFont({
  ...fontBase,
  family: sansFamily,
  weight: { 1: "400", 8: "500" },
});

const heading = createFont({
  ...fontBase,
  family: sansFamily,
  weight: { 1: "500", 9: "600" },
});

const mono = createFont({
  ...fontBase,
  family: monoFamily,
  weight: { 1: "400", 8: "500" },
});

export const config = createTamagui({
  ...defaultConfig,
  animations,
  themes,
  fonts: { body, heading, mono },
  settings: {
    ...defaultConfig.settings,
    defaultFont: "body",
    // Longhands stay legal so RN-shaped style objects (FlatList content, RN
    // Modal fallbacks) can be shared with Tamagui props without a rename pass.
    onlyAllowShorthands: false,
    // The scheme comes from useColorScheme in app/_layout.tsx; letting CSS also
    // race the media query makes the Playwright proofs non-deterministic.
    shouldAddPrefersColorThemes: false,
  },
});

export type PocketTamaguiConfig = typeof config;

declare module "tamagui" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends PocketTamaguiConfig {}
}

export default config;
