/**
 * Web font CSS for the self-hosted variable Geist in public/fonts.
 *
 * Two consumers, one source: app/+html.tsx renders this into the document head
 * for static export, and app/_layout.tsx injects it at runtime because the Expo
 * web dev server serves its own HTML shell and ignores +html.tsx. Without the
 * runtime path, dev and Playwright screenshots silently fall back to whatever
 * sans the host machine has.
 */
export const WEB_FONT_STYLE_ID = "pocket-web-fonts";

export const WEB_FONT_CSS = `
@font-face {
  font-family: 'Geist';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('/fonts/Geist-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA,
    U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193,
    U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Geist';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('/fonts/Geist-latin-ext.woff2') format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF,
    U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020,
    U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
  font-family: 'Geist Mono';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('/fonts/GeistMono-latin.woff2') format('woff2');
}
html, body, #root {
  height: 100%;
  margin: 0;
  /* Matches Tamagui's $background so the shell never flashes a wrong page
     colour before the app mounts. */
  background: hsl(0, 0%, 97%);
  color-scheme: light dark;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}
@media (prefers-color-scheme: dark) {
  html, body, #root {
    background: hsl(0, 0%, 7%);
  }
}
body {
  overflow: hidden;
  font-family: 'Geist', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  -webkit-tap-highlight-color: transparent;
  /* Geist is variable across 100-900, so never let the browser fake a weight —
     synthesized bold is what makes headings read heavier than the reference. */
  font-synthesis: none;
  font-optical-sizing: auto;
}
input, textarea, button {
  font-family: inherit;
  font-synthesis: none;
}
`;

/** Idempotent — safe to call on every module evaluation / fast refresh. */
export function injectWebFonts(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(WEB_FONT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = WEB_FONT_STYLE_ID;
  style.textContent = WEB_FONT_CSS;
  document.head.appendChild(style);
}
