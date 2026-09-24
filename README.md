<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/logo-on-dark.svg">
    <img src="assets/brand/logo.svg" alt="HighlightsGrabber" height="48">
  </picture>
</h1>

- Firefox extension which grabs your Kindle Highlights and stores them in a JSON file.
- Must be logged into your Amazon account.
- Runs locally in your browser and fetches read.amazon.com/notebook and scrapes all books and highlights
- User can then export them into a structured JSON file.

- The JSON file is designed to be upload to DrClawLights (https://github.com/Penguin-Pants/DrClawlights), deployed on railway.com
- Using Resend, it will send user a daily email with highlights from several books.

Not affiliated with Amazon. Kindle is a trademark of Amazon.com, Inc.

## Install

- **For testing:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and select `manifest.json`. Firefox removes it when it restarts.
- **Permanent:** Firefox needs a signed `.xpi`. Build it with `npm run build`, then sign it as an unlisted add-on on addons.mozilla.org.

## Use

1. Sign in to Amazon in Firefox.
2. Click the HighlightsGrabber icon, then click **Sync Highlights**.
3. The extension opens `read.amazon.com/notebook` and reads each book. Do not close or reload that tab during the sync.
4. When the sync is done, the file `kindle-highlights-YYYY-MM-DD.json` downloads automatically and a notification shows the counts. If you sync twice on one day, Firefox adds a number to the second filename.
5. To download the same data again, click **Download JSON**.

The JSON format is documented in [CLAUDE.md](CLAUDE.md).

## Permissions

| Permission | Why |
|---|---|
| `https://read.amazon.com/*` | Read the Kindle notebook page |
| `storage` | Keep the last sync, so **Download JSON** works later |
| `downloads` | Save the JSON file |
| `notifications` | Tell you when a sync ends or fails |

## Privacy

- All processing occurs in your browser. The extension sends no data anywhere.
- The last sync is kept in Firefox's extension storage until the next sync or until you remove the extension.
- The JSON file is plain text in your Downloads folder.

## Troubleshooting

| Message | Action |
|---|---|
| "Sign in to Amazon in the Kindle tab…" | Sign in, then click **Sync Highlights** again |
| "The Kindle tab was closed or reloaded" | Click **Sync Highlights** again and leave the tab open |
| "…may be incomplete: Title (120 of 150)" | Fewer highlights loaded than the count Amazon shows in the notebook. Sync again. If the numbers stay, Amazon may have changed its page |
| "…did not load" | Sync again. If the message stays, Amazon may have changed its page |
| "Amazon's export limit hides some highlights…" | Normal. The publisher limits exports, so the notebook shows only part of the highlights |
| "…without highlights left out" | Normal for books with only notes or images |

## Development

No build step. The extension runs from the repository files as they are.

```sh
npm install      # dev tools only
npm test         # parser tests against tests/fixtures
npm run lint     # Mozilla's web-ext lint
npm run icons    # export PNG icons from assets/brand/*.svg
npm run build    # package the extension into web-ext-artifacts/
```

Brand rules: [docs/BRANDING.md](docs/BRANDING.md).
