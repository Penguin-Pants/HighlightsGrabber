# HighlightsGrabber brand

## Product

- **Name:** HighlightsGrabber (one word, capital H and G)
- **Short description:** Save your Kindle highlights to a JSON file.
- **Relationship to Amazon:** none. Do not use Amazon or Kindle logos, colors (for example `#FF9900`) or the word "Kindle" as part of the name.

## Icon concept: Clipping

Each highlight is a passage you keep. The icon is a pair of closing quotation marks on a disc of highlighter pink, one of the Kindle highlight colors. It uses two simple shapes and no text, so it stays clear at 16 px. One file works on light and dark toolbars.

| File | Use |
|---|---|
| `assets/brand/icon.svg` | Master icon, all backgrounds |
| `assets/brand/icon-{16,32,48,96,128}.png` | Exported from `icon.svg` |
| `assets/brand/logo.svg` | Icon and wordmark, light backgrounds |
| `assets/brand/logo-on-dark.svg` | Icon and wordmark, dark backgrounds |

The SVG files are the masters. After you change `icon.svg`, run `npm run icons` to export the PNG files again. The logos contain the same icon shapes, so change them as well.

## Colors

| Name | HEX | Use |
|---|---|---|
| Highlighter pink | `#FF6FA3` | Icon disc, primary button, progress bar |
| Ink | `#1A1423` | Quote marks, wordmark, text on pink |
| Paper | `#FFF7FA` | Wordmark on dark backgrounds |
| Blue | `#3E7CB1` | Focus ring, small accents |
| Blue text | `#2F6496` | Blue text on white (contrast 6.2:1) |

Hover on pink: `#F5528C`. Put Ink text on pink (contrast 6.9:1), never white text. Do not use `#3E7CB1` for text on white (contrast 4.45:1, below 4.5:1).

## Typography

- **Wordmark:** Literata SemiBold Italic (SIL Open Font License), converted to outlines in the logo SVG. You do not need the font installed.
- **Popup UI:** the system font stack in `popup.css`. Do not load web fonts in the extension.

## Spacing and size

- Keep clear space around the logo equal to half the disc's width.
- In the logo, keep the icon and wordmark as they are. Do not move or scale them separately.
- **Minimum icon size:** 16 px.
- **Minimum logo height:** 24 px. At smaller sizes, use the icon alone.

## Light and dark

- The icon is the same on light and dark backgrounds.
- Logo: `logo.svg` on light backgrounds, `logo-on-dark.svg` on dark backgrounds. Only the wordmark color changes.

## Browser-extension usage

| Place | File |
|---|---|
| Toolbar button | `icon-16.png`, `icon-32.png` |
| Add-ons Manager, about:addons | `icon-48.png`, `icon-96.png` |
| Add-on listing | `icon-128.png` |
| Notifications | `icon-96.png` |
| Popup header | `icon.svg` |

## Correct use

- Pink disc with ink quote marks, on any toolbar color.
- Logo at 24 px height or more, with clear space.
- Pink buttons with ink text.

## Incorrect use

- Do not add text, a border, a shadow or a gradient to the icon.
- Do not change the colors, for example to Amazon orange, or make the quote marks white.
- Do not rotate, flip or stretch the icon. Flipped quote marks become opening quotes.
- Do not put the dark wordmark (`logo.svg`) on a dark background.
- Do not type the wordmark in another font. Use the logo file.
