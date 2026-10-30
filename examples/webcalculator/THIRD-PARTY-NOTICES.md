# Design and asset notices

## Kapwa Design System

Source: https://github.com/bettergovph/kapwa
Snapshot: e95ac0de95e4d29943d136a296682c42bfc88a15
License: Creative Commons CC0 1.0, retained in assets/KAPWA-LICENSE.txt.

assets/kapwa-tokens.css reproduces src/styles/kapwa.css from that snapshot, with an attribution comment and the single Tailwind-specific @theme static wrapper changed to :root. Its original primitive and semantic values are preserved. The native interface adapts the button, input, card and table patterns, typography presets and accessibility principles. It does not install or claim to run the React/Tailwind component package.

Reference sources:
- docs/principles/index.md
- docs/principles/token-architecture.md
- src/styles/kapwa.css
- src/styles/index.css
- src/lib/kapwa/button/index.tsx
- src/lib/kapwa/input/index.tsx
- src/lib/kapwa/card/index.tsx
- src/lib/kapwa/table/index.tsx

Body text uses Inter with system fallbacks. Spacing follows Kapwa's rem scale; headings use its 40/32/24/20px hierarchy. Labels and small text are 14/12px. Cards use 8px corners; inputs and buttons use 6px corners. Controls have 48px touch areas. Small links use the darker brand-600 token, and input boundaries use gray-700, to improve contrast over the upstream lighter link/border primitives. Notices, error messages, status text, and keyboard focus use semantic intent and visible text.

## BetterGov.ph logos

Source: https://github.com/bettergovph/logo
Repository snapshot: cd223d72a7339719b8d376b57bbb60c69bba6505
Usage guide: the repository README.

Official CDN originals:
- https://assets.bettergov.ph/logos/webp/horizontal-primary.webp
- https://assets.bettergov.ph/logos/svg/icon-white.svg

The originals are included unchanged in assets/. Display sizing preserves their aspect ratios (1280×320 wordmark, square icon), without recoloring, filters, cropping, shadows or other logo effects. The offline requirement necessitates local copies instead of remote CDN requests. This sample uses the marks as a requested design reference; no endorsement or affiliation with BetterGov.ph or SSS is asserted. The Kapwa CC0 dedication is not presented as a license for the logos.

## Inter

Source: https://github.com/rsms/inter
Font: docs/font-files/InterVariable.woff2
Copyright (c) 2016 The Inter Project Authors.
License: SIL Open Font License 1.1, retained in assets/fonts/OFL.txt.

## Lucide icon

The footer's GitHub icon is the "github" icon from Lucide (https://lucide.dev), inlined as SVG.
Copyright (c) Lucide Contributors. License: ISC (https://github.com/lucide-icons/lucide/blob/main/LICENSE).

Download URLs and SHA-256 hashes for the included logo/font originals are recorded in assets/provenance.json.
