import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Custom HTML shell so mobile web uses a real phone viewport (Cursor-like screenshots).
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
        <style>{`
          html, body, #root {
            height: 100%;
            margin: 0;
            background: #F2F2F2;
            -webkit-text-size-adjust: 100%;
            text-size-adjust: 100%;
          }
          body {
            overflow: hidden;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
