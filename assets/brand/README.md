# Brand assets

SVG files are the masters. PNG files are exported from them.

| File | Content |
|---|---|
| `icon.svg` | Master icon (teal ribbon) |
| `icon-on-dark.svg` | Icon for dark toolbars and backgrounds |
| `icon-16.png` … `icon-128.png` | PNG exports of `icon.svg` |
| `icon-on-dark-16.png`, `icon-on-dark-32.png` | PNG exports of `icon-on-dark.svg` |
| `logo.svg`, `logo-on-dark.svg` | Icon and wordmark (outlined Literata SemiBold) |

To export the PNG files again:

```sh
npm install
npm run icons
```

Usage rules: [docs/BRANDING.md](../../docs/BRANDING.md).
