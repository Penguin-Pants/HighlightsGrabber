# HighlightsGrabber brand

## Product

- **Name:** HighlightsGrabber (one word, capital H and G)
- **Short description:** Save your Kindle highlights to a JSON file.
- **Relationship to Amazon:** none. Do not use Amazon or Kindle logos, colors (for example `#FF9900`) or the word "Kindle" as part of the name.

## Icon concept: Keepsake

A book's ribbon bookmark with a download arrow cut into it. The ribbon says "reading". The arrow says "take it out of the book". The icon uses one silhouette and no text, so it stays clear at 16 px.

| File | Use |
|---|---|
| `assets/brand/icon.svg` | Master icon. Light backgrounds and light toolbars |
| `assets/brand/icon-on-dark.svg` | Dark toolbars and dark backgrounds |
| `assets/brand/icon-{16,32,48,96,128}.png` | Exported from `icon.svg` |
| `assets/brand/icon-on-dark-{16,32}.png` | Exported from `icon-on-dark.svg` |
| `assets/brand/logo.svg` | Icon and wordmark, light backgrounds |
| `assets/brand/logo-on-dark.svg` | Icon and wordmark, dark backgrounds |

The SVG files are the masters. After you change an SVG, run `npm run icons` to export the PNG files again.

## Colors

| Name | HEX | Use |
|---|---|---|
| Ribbon teal | `#0E5A57` | Icon, primary button, links |
| Page | `#F4EFE4` | Arrow, icon on dark backgrounds |
| Amber | `#E9A23B` | Progress bar, focus ring |
| Ink | `#1C2321` | Wordmark, body text |

Hover on teal: `#0A4744`. Use Amber for small marks only, not for text on white.

## Typography

- **Wordmark:** Literata SemiBold (SIL Open Font License), converted to outlines in the logo SVG. You do not need the font installed.
- **Popup UI:** the system font stack in `popup.css`. Do not load web fonts in the extension.

## Spacing and size

- Keep clear space around the logo equal to the ribbon's width.
- In the logo, keep the icon and wordmark as they are. Do not move or scale them separately.
- **Minimum icon size:** 16 px.
- **Minimum logo height:** 24 px. At smaller sizes, use the icon alone.

## Light and dark

- Light toolbar or background: `icon.svg`, `logo.svg`.
- Dark toolbar or background: `icon-on-dark.svg`, `logo-on-dark.svg`.
- Firefox selects the toolbar icon through `browser_action.theme_icons` in `manifest.json`.

## Browser-extension usage

| Place | File |
|---|---|
| Toolbar button | `icon-16.png`, `icon-32.png` (+ `icon-on-dark-*` via `theme_icons`) |
| Add-ons Manager, about:addons | `icon-48.png`, `icon-96.png` |
| Add-on listing | `icon-128.png` |
| Notifications | `icon-96.png` |
| Popup header | `icon.svg` |

## Correct use

- Teal ribbon on white or on a light surface.
- Page-colored ribbon (`icon-on-dark`) on a dark toolbar.
- Logo at 24 px height or more, with clear space.

## Incorrect use

- Do not add text, a border, a shadow or a gradient to the icon.
- Do not change the colors, for example to Amazon orange.
- Do not rotate or stretch the icon.
- Do not put the teal icon on a dark background. Use `icon-on-dark` instead.
- Do not type the wordmark in another font. Use the logo file.
