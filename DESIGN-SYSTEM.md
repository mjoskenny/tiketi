# QPassa Design System

## Direction

A polished, mobile-first ticketing product with simple event discovery and clear operational interfaces. Mookh was used only as broad inspiration for editorial hierarchy, generous spacing, and clear event presentation; QPassa retains its own cobalt-and-orange identity.

## Typography

- **Primary family:** Satoshi via the official Fontshare CSS API, with Avenir Next/Avenir/system sans-serif fallbacks.
- **Requested faces:** 300 Light, 400 Regular, 500 Medium, 700 Bold, 900 Black. Satoshi does not publish a 600 face; `font-synthesis: none` is set so unsupported intermediate weights use the browser's available-face matching rather than synthetic strokes. Monospaced ticket identifiers intentionally retain a system monospace stack.
- **Responsive scale:** display 36–64px desktop / 36–44px compact screens; H1 30–40px desktop / 28–32px mobile; H2 24–32px; H3 20–24px; card title 18–22px; body 16px (secondary 14px); captions 12px. Display line-height 1.02, heading 1.12, body 1.55. Headings use a restrained negative tracking value of -0.035em.
- **License/hosting:** Satoshi is served by Fontshare's official API; the Fontshare ITF Free Font License permits commercial website use and allows self-hosting official, unmodified assets. API delivery avoids copying font files into this repository. The license restricts offering font files as a selectable resource to third parties; confirm the current license terms if the product later offers user-controlled typography or font selection.

## Brand colors

| Token | Hex / value | Role |
|---|---|---|
| `--brand-blue` | `#2563EB` | Core brand, links, active states, chart data |
| `--brand-blue-hover` | `#1D4ED8` | Hover |
| `--brand-blue-pressed` | `#1E40AF` | Pressed |
| `--brand-blue-focus` | `#60A5FA` | Focus ring on dark surfaces |
| `--brand-blue-soft` | `rgba(37,99,235,.16)` | Selected/soft brand fill |
| `--brand-orange` | `#FF6A00` | Small promotional/category highlights |
| `--brand-orange-highlight` | `#FF8533` | Decorative highlight only |
| `--brand-orange-ink` | `#B83B00` | Accessible orange text on light backgrounds |
| `--brand-orange-soft` | `rgba(255,106,0,.14)` | Accent tint |

Orange is not used for default full-size action buttons. Default primary buttons use a restrained charcoal surface; blue remains for links and selected/active interaction, with orange reserved for limited moments.

## Theme surfaces

### Dark (default)

- Page: `#0D1016`; secondary page: `#121722`
- Card: `#151B26`; elevated: `#1B2330`; input: `#101620`
- Primary text: `#F5F7FB`; secondary: `#C2CAD7`; muted: `#A3ADBD`
- Border: `#2A3443`; disabled surface: `#394352`; disabled text: `#8993A2`
- Navigation: `rgba(13,16,22,.92)`; modal: `#151B26`

### Light

- Page: `#F6F8FC`; secondary page: `#EEF2F8`
- Card/elevated: `#FFFFFF`; input: `#FFFFFF`
- Primary text: `#111827`; secondary: `#374151`; muted: `#526071`
- Border: `#D8E0EC`; disabled surface: `#E5EAF1`; disabled text: `#667085`
- Navigation: `rgba(255,255,255,.94)`; modal: `#FFFFFF`

Theme selection persists in local storage as `qpassa-theme` and is toggled from the desktop/mobile navigation.

## Semantic and ticketing tokens

- Success / paid / valid / available / live: `#4ADE80`
- Warning / pending: `#FBBF24`
- Error / failed / invalid / cancelled: `#FB7185`
- Information / used: `#60A5FA`
- Sold out: `#A3ADBD`; VIP tier: `#A78BFA`; discount: brand orange
- QR ticket surface/ink: `#FFFFFF` / `#101318`

Status presentation must include text or an icon in addition to color. QR surfaces remain white with dark ink for scan contrast.

## Component usage

- Primary, secondary, and tertiary actions use charcoal, outlined, and text treatments respectively; destructive actions use semantic error tokens.
- Links and selected navigation use cobalt; focus uses a visible 3px ring with offset.
- Inputs and dropdowns use `--control-bg`, `--border`, and `--ring`; disabled controls use the disabled pair.
- Cards, dialogs, navigation, tabs, filters, and dashboard surfaces consume the shared theme variables.
- Keep orange limited to promotional/category details and small visual accents; avoid gradients/glows on core controls.

## Implementation and limitations

Tokens, responsive type variables, theme definitions, global Satoshi family, focus behavior, and most shared page/component surfaces are centralized in `src/index.css`. Navigation theme state is in `src/components/Nav.tsx`; initialization is in `src/main.tsx`. The existing app had many inline colors and large bespoke page styles; centralized late overrides were used to avoid business-logic changes. Some highly bespoke visuals may still retain local colors, especially artwork and status charts. No WCAG compliance claim is made without a full contrast audit across all routes and states.
