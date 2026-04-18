# DrClawLights — Context for Claude Code

## What this project does

DrClawLights is a web service deployed on Railway that reads a static JSON file of Kindle highlights (produced by the HighlightsGrabber Firefox extension) and sends the user a daily email containing a random highlight from a randomly selected book.

The JSON file is uploaded manually by the user after running the Firefox extension. DrClawLights never writes to or modifies the file.

---

## Input: Kindle Highlights JSON

### Top-level structure

```json
{
  "lastUpdated": "2025-04-18T10:30:00.000Z",
  "totalBooks": 42,
  "totalHighlights": 1250,
  "books": [ ...Book ]
}
```

| Field | Type | Description |
|---|---|---|
| `lastUpdated` | ISO 8601 string | When the extension last ran |
| `totalBooks` | number | Count of books in the array |
| `totalHighlights` | number | Sum of all highlights across all books |
| `books` | Book[] | Array of books with their highlights |

---

### Book object

```json
{
  "asin": "B00ABC1234",
  "title": "The Name of the Wind",
  "author": "Patrick Rothfuss",
  "coverUrl": "https://m.media-amazon.com/images/...",
  "highlightCount": 47,
  "lastSynced": "2025-04-18T10:30:00.000Z",
  "highlights": [ ...Highlight ]
}
```

| Field | Type | Description |
|---|---|---|
| `asin` | string | Amazon ASIN (unique book ID). Reliable for books purchased on Amazon. May be `"book-0"`, `"book-1"` etc. if ASIN couldn't be scraped |
| `title` | string | Book title. Falls back to `"Unknown Title"` if not found |
| `author` | string | Author name. Falls back to `"Unknown Author"` if not found |
| `coverUrl` | string \| null | Absolute URL to cover image from Amazon's CDN. May be null |
| `highlightCount` | number | Count of highlights in the `highlights` array |
| `lastSynced` | ISO 8601 string | When this specific book was last scraped |
| `highlights` | Highlight[] | Array of individual highlights |

---

### Highlight object

```json
{
  "id": "h3f9a2b1",
  "text": "We understand how dangerous a mask can be. We all become what we pretend to be.",
  "note": "This is what I wrote as a note on this highlight",
  "location": "Location 2345",
  "color": "yellow",
  "createdDate": null
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier. Either Amazon's annotation ID, the element's DOM id, or a hash of text+location. Stable across syncs for the same highlight |
| `text` | string | The highlighted passage. Always present and non-empty |
| `note` | string \| null | User's personal note attached to the highlight. `null` if no note was written |
| `location` | string | Amazon location string e.g. `"Location 1234"` or `"Page 42"`. May be empty string if not found |
| `color` | `"yellow"` \| `"pink"` \| `"blue"` \| `"orange"` | Highlight colour. Defaults to `"yellow"` if colour could not be detected |
| `createdDate` | null | Always null — Amazon does not expose highlight timestamps in the notebook UI |

---

## Important caveats

- **`createdDate` is always `null`** — do not rely on it for sorting or filtering.
- **`color` may not be accurate** — it's inferred from CSS class names which Amazon can change. Treat it as best-effort.
- **`coverUrl` can be null or a dead link** — Amazon CDN URLs can expire. Handle gracefully (fallback to no image).
- **`asin` may be a fallback string** — if it looks like `"book-0"`, Amazon's ASIN wasn't available. Still usable as a unique key within the file.
- **Books with zero highlights** — books the user has opened but not highlighted will not appear in the file at all (they would have been skipped during scraping).
- **Incremental syncs** — on subsequent syncs, books whose highlight count hasn't changed are carried forward unchanged. Only books with new highlights are re-scraped. This means the `highlights` array for an unchanged book reflects the state from its `lastSynced` date, not the current sync date.

---

## Deployment: Railway

- Deployed as a web service on [Railway](https://railway.com)
- The JSON file is a static asset — upload it manually via Railway's volume or environment/file mechanism
- No database required
- The service should run a daily scheduled job (cron) to send the email
- Email sending: use a transactional email provider (e.g. Resend, SendGrid, Postmark)
