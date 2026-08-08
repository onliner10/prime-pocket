# Vendored web fonts

Geist and Geist Mono, variable (weight 100–900), latin + latin-ext subsets as
served by Google Fonts. Licensed under the SIL Open Font License 1.1 — see
`OFL.txt`.

These are web-only: `src/webShell.ts` holds the `@font-face` rules (rendered by
`app/+html.tsx` for static export, injected at runtime by `app/_layout.tsx` in
dev) and `tamagui.config.ts` points the `$body` / `$mono` families at them when
`Platform.OS === "web"`. Native builds deliberately fall through to the
platform UI font (SF on iOS) so the app feels native there.

They are vendored rather than loaded from a CDN so Playwright screenshots are
reproducible and do not depend on the host machine's font fallbacks.

To refresh, take the `src` URLs from
`https://fonts.googleapis.com/css2?family=Geist:wght@100..900` (and
`Geist+Mono`) and re-download the woff2 files under the same names.
