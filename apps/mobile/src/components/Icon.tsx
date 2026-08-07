import type { ReactNode } from "react";
import Svg, { Circle, Path } from "react-native-svg";
import { colors } from "../theme";

export type IconName =
  | "search"
  | "folderPlus"
  | "folder"
  | "converge"
  | "crosshair"
  | "bell"
  | "checkCircle"
  | "chevronRight"
  | "chevronLeft"
  | "chevronDown"
  | "plus"
  | "mic"
  | "arrowUp"
  | "close"
  | "filter"
  | "gitBranch"
  | "more";

type Draw = (color: string, sw: number) => ReactNode;

/**
 * 24×24 grid, stroked outlines. Kept as raw path data so icons stay crisp at
 * any size and render identically on native and web.
 */
const ICONS: Record<IconName, Draw> = {
  search: (c, sw) => (
    <>
      <Circle cx={11} cy={11} r={7.25} stroke={c} strokeWidth={sw} />
      <Path d="m16.6 16.6 4.4 4.4" stroke={c} strokeWidth={sw} />
    </>
  ),
  folderPlus: (c, sw) => (
    <>
      <Path
        d="M21.5 18.2a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V5.8a2 2 0 0 1 2-2h4.1a2 2 0 0 1 1.6.8l1.3 1.7a2 2 0 0 0 1.6.8h4.4a2 2 0 0 1 2 2z"
        stroke={c}
        strokeWidth={sw}
      />
      <Path d="M12 11.4v5M9.5 13.9h5" stroke={c} strokeWidth={sw} />
    </>
  ),
  folder: (c, sw) => (
    <Path
      d="M21.5 18.2a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V5.8a2 2 0 0 1 2-2h4.1a2 2 0 0 1 1.6.8l1.3 1.7a2 2 0 0 0 1.6.8h4.4a2 2 0 0 1 2 2z"
      stroke={c}
      strokeWidth={sw}
    />
  ),
  // Four agents converging into one inbox.
  converge: (c, sw) => (
    <>
      <Path d="m4.2 4.2 7.1 2-5.1 5.1zM19.8 4.2l-2 7.1-5.1-5.1zM4.2 19.8l7.1-2-5.1-5.1zM19.8 19.8l-2-7.1-5.1 5.1z" stroke={c} strokeWidth={sw} strokeLinejoin="round" />
    </>
  ),
  // Working agents are shown as five small blue dots, not a target reticle.
  crosshair: (c) => (
    <>
      <Circle cx={12} cy={12} r={2.7} fill={c} />
      <Circle cx={12} cy={4.5} r={2.1} fill={c} />
      <Circle cx={19.5} cy={12} r={2.1} fill={c} />
      <Circle cx={12} cy={19.5} r={2.1} fill={c} />
      <Circle cx={4.5} cy={12} r={2.1} fill={c} />
    </>
  ),
  bell: (c, sw) => (
    <>
      <Path
        d="M18.4 15.9c-1.2-1.3-1.6-2.7-1.6-6.1a4.8 4.8 0 0 0-9.6 0c0 3.4-.4 4.8-1.6 6.1a.9.9 0 0 0 .7 1.5h11.4a.9.9 0 0 0 .7-1.5Z"
        stroke={c}
        strokeWidth={sw}
      />
      <Path d="M10.3 20.4a2 2 0 0 0 3.4 0" stroke={c} strokeWidth={sw} />
    </>
  ),
  checkCircle: (c, sw) => (
    <>
      <Circle cx={12} cy={12} r={8.8} stroke={c} strokeWidth={sw} strokeDasharray="3 2.5" />
      <Path d="m8.4 12.3 2.6 2.6 4.9-5.4" stroke={c} strokeWidth={sw} />
    </>
  ),
  chevronRight: (c, sw) => <Path d="m9.5 5.5 6.5 6.5-6.5 6.5" stroke={c} strokeWidth={sw} />,
  chevronLeft: (c, sw) => <Path d="M14.5 5.5 8 12l6.5 6.5" stroke={c} strokeWidth={sw} />,
  chevronDown: (c, sw) => <Path d="m5.5 9 6.5 6.5L18.5 9" stroke={c} strokeWidth={sw} />,
  plus: (c, sw) => <Path d="M12 4.8v14.4M4.8 12h14.4" stroke={c} strokeWidth={sw} />,
  mic: (c, sw) => (
    <>
      <Path
        d="M12 2.8a3 3 0 0 1 3 3v5.4a3 3 0 0 1-6 0V5.8a3 3 0 0 1 3-3Z"
        stroke={c}
        strokeWidth={sw}
      />
      <Path d="M5.6 10.6v.8a6.4 6.4 0 0 0 12.8 0v-.8M12 17.8v3.4" stroke={c} strokeWidth={sw} />
    </>
  ),
  arrowUp: (c, sw) => <Path d="M12 19.2V5.4M5.8 11.6 12 5.4l6.2 6.2" stroke={c} strokeWidth={sw} />,
  close: (c, sw) => <Path d="M6 6l12 12M18 6 6 18" stroke={c} strokeWidth={sw} />,
  filter: (c, sw) => <Path d="M3.4 6.8h17.2M6.6 12h10.8M10 17.2h4" stroke={c} strokeWidth={sw} />,
  // Two nodes on a trunk with a branch merging back in — the "View PR" glyph.
  gitBranch: (c, sw) => (
    <>
      <Circle cx={7} cy={5.4} r={2.4} stroke={c} strokeWidth={sw} />
      <Circle cx={7} cy={18.6} r={2.4} stroke={c} strokeWidth={sw} />
      <Circle cx={17} cy={8.6} r={2.4} stroke={c} strokeWidth={sw} />
      <Path d="M7 7.8v8.4M17 11v.6a4 4 0 0 1-4 4H9.4" stroke={c} strokeWidth={sw} />
    </>
  ),
  more: (c) => (
    <>
      <Circle cx={5.4} cy={12} r={1.35} fill={c} />
      <Circle cx={12} cy={12} r={1.35} fill={c} />
      <Circle cx={18.6} cy={12} r={1.35} fill={c} />
    </>
  ),
};

export function Icon({
  name,
  size = 22,
  color = colors.ink,
  strokeWidth = 1.85,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ICONS[name](color, strokeWidth)}
    </Svg>
  );
}
