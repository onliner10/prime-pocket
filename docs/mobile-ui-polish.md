# Prime Pocket mobile polish

## Cursor-derived system
- Surface: `#F7F7F7` canvas, `#FCFCFC` elevated surfaces, `#F2F2F2` composer/control fill; one-pixel white edge and broad soft shadow for floating controls.
- Layout: 20px content gutter, 12px grid/list rhythm, 44px circular controls, 16px card radius, 54px composer, bottom dock above the safe area.
- Type: one SF/Geist-like sans; 26/32 medium screen titles, 17/22 nav titles and body controls, 16/24 body, quiet 13px metadata; mono only for code, files, and diffs.
- Color: ink `#141414`, muted `#707070`, tertiary `#A0A0A0`; accents are state-only (orange `#EC5728`, blue `#4886B2`, gold `#C08532`, magenta `#B8448A`).
- Composition: sparse top-bar circles, large title, restrained surfaces, plain workspace rows, one floating composer, no decorative gradients or nested cards.

## Priority map
1. Inbox: fleet scan and launch entry point.
2. Agent transcript: primary monitoring/follow-up loop and closest Cursor analogue.
3. Filtered agent lists: triage and empty states.
4. Pair / Workspaces: first-run and recovery paths.

## Iterations
- 0 — Baseline: existing implementation already followed Cursor broadly, but status accents were over-saturated, cards were over-rounded, `Needs Attention 0` wrapped, composer was too white, and mobile docks did not account for safe-bottom insets.
- 1 — Updated shared tokens/primitives, tightened card geometry, matched state colors, made composer sunken like Cursor, prevented status wrapping, added safe-area-aware docks, and surfaced unavailable-workspace recovery inline. Result: closer to Cursor and safer on iPhone/Android.
- 2 — Added deterministic web proof insets (status-bar/home-indicator breathing room) so Playwright’s iPhone viewport compares honestly to native Cursor captures. Re-rendered the complete screenshot flow successfully.

### Evidence
- Before: `/tmp/inbox-before2.png`, `/tmp/agents-before.png`; refs: `~/tmp/cursor-reference/IMG_8567.PNG`, `IMG_8566.PNG`, `IMG_8570.PNG`.
- After: `/tmp/pocket-validation-proof/01-inbox-empty.png`, `04-all-agents.png`, `05-agent-follow-up.png`; mobile viewport 390×844.
