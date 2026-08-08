import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";
import { WEB_SHELL_CSS, WEB_SHELL_STYLE_ID } from "../src/webShell";

/**
 * Custom HTML shell so mobile web uses a real phone viewport (Cursor-like
 * screenshots) and a self-hosted variable Geist. Only static export renders
 * this file — the dev server injects the same CSS from app/_layout.tsx.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <style id={WEB_SHELL_STYLE_ID}>{WEB_SHELL_CSS}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
