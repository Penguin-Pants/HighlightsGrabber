if (window.__highlightsGrabberLoaded) {
  // Already injected — do not register a second listener
} else {
  window.__highlightsGrabberLoaded = true;

(function () {
  const log = (...a) => console.log('[HighlightsGrabber]', ...a);

  // ---------------------------------------------------------------------------
  // Selector helpers — try each candidate in order, return first match
  // ---------------------------------------------------------------------------

  const SEL = {
    // Left sidebar containers
    bookList: [
      '#kp-notebook-annotations-pane',
      '#library'
    ],
    bookItem: [
      '.kp-notebook-library-each-book',
      '#kp-notebook-annotations-pane li[data-asin]',
      '#kp-notebook-annotations-pane li'
    ],
    bookTitle: [
      '.kp-notebook-searchable-item-name',
      'h2.a-size-base',
      'h2',
      '.a-text-bold'
    ],
    bookAuthor: [
      '.kp-notebook-searchable-item-author',
      '.a-size-small.a-color-secondary',
      '.a-size-small'
    ],
    highlightCount: [
      '.kp-notebook-library-book-count',
      '.a-badge-count',
      '.a-size-small.a-color-secondary.kp-notebook-library-book-count'
    ],
    // Right-hand highlights panel
    highlightsPane: [
      '#kp-notebook-highlights-pane',
      '.kp-notebook-annotations-pane-right',
      '#annotations'
    ],
    // Individual highlight containers in the right panel
    highlightCard: [
      '#kp-notebook-highlights-pane .a-spacing-base',
      '#annotations .a-spacing-base',
      '.kp-notebook-highlight-marker'
    ],
    // Within each card
    highlightText: [
      '#highlight',
      'span.highlight',
      '.kp-notebook-highlight span'
    ],
    noteText: [
      '#note',
      '.kp-notebook-note span',
      'span.note'
    ],
    metadata: [
      '.kp-notebook-metadata',
      '#annotationHighlightHeader',
      '.a-size-small.a-color-secondary'
    ]
  };

  function q(selList, parent = document) {
    for (const s of selList) {
      const el = parent.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  function qAll(selList, parent = document) {
    for (const s of selList) {
      const els = parent.querySelectorAll(s);
      if (els.length) return Array.from(els);
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function waitFor(selList, timeout = 10000, parent = document) {
    return new Promise((resolve, reject) => {
      const found = q(selList, parent);
      if (found) return resolve(found);

      const timer = setTimeout(() => {
        obs.disconnect();
        reject(new Error(`Timeout waiting for ${selList[0]}`));
      }, timeout);

      const obs = new MutationObserver(() => {
        const el = q(selList, parent);
        if (el) {
          clearTimeout(timer);
          obs.disconnect();
          resolve(el);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    });
  }

  function extractColor(el) {
    const cls = el.className || '';
    if (cls.includes('yellow')) return 'yellow';
    if (cls.includes('pink'))   return 'pink';
    if (cls.includes('blue'))   return 'blue';
    if (cls.includes('orange')) return 'orange';
    // Check child elements too
    const colorEl = el.querySelector('[class*="yellow"],[class*="pink"],[class*="blue"],[class*="orange"]');
    if (colorEl) return extractColor(colorEl);
    return 'yellow';
  }

  function makeId(text, location) {
    const raw = (text + location).substring(0, 80);
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    return 'h' + Math.abs(hash).toString(36);
  }

  // ---------------------------------------------------------------------------
  // Scrape highlight cards currently visible in the right panel
  // ---------------------------------------------------------------------------

  function scrapeVisibleHighlights() {
    const cards = qAll(SEL.highlightCard);
    const highlights = [];

    for (const card of cards) {
      const textEl  = q(SEL.highlightText, card);
      const noteEl  = q(SEL.noteText, card);
      const metaEl  = q(SEL.metadata, card);

      const text = textEl ? textEl.textContent.trim() : card.textContent.trim();
      if (!text || text.length < 2) continue;

      const note     = noteEl ? noteEl.textContent.trim() : null;
      const location = metaEl ? metaEl.textContent.trim() : '';
      const id       = card.getAttribute('data-annotation-id') ||
                       card.id ||
                       makeId(text, location);

      highlights.push({
        id,
        text,
        note:     note || null,
        location,
        color:    extractColor(card),
        createdDate: null
      });
    }

    return highlights;
  }

  // ---------------------------------------------------------------------------
  // Scrape all highlights for the currently selected book
  // (handles lazy / infinite-scroll loading)
  // ---------------------------------------------------------------------------

  // Returns a short string fingerprinting the first visible highlight card,
  // used to detect when the panel has switched to a different book.
  function panelFingerprint() {
    const cards = qAll(SEL.highlightCard);
    if (!cards.length) return null;
    const textEl = q(SEL.highlightText, cards[0]);
    return (textEl ? textEl.textContent : cards[0].textContent).trim().slice(0, 80);
  }

  // Waits until the highlights panel shows content that differs from
  // prevFingerprint, meaning the panel has actually switched to the new book.
  function waitForPanelChange(prevFingerprint, timeout = 12000) {
    return new Promise(resolve => {
      // No previous content — just wait for first card to appear
      if (prevFingerprint === null) {
        waitFor(SEL.highlightCard, timeout).then(resolve).catch(resolve);
        return;
      }

      const timer = setTimeout(() => {
        obs.disconnect();
        resolve();
      }, timeout);

      const check = () => {
        const cards = qAll(SEL.highlightCard);
        if (!cards.length) return; // panel cleared but new content not yet present — keep waiting
        const fp = (q(SEL.highlightText, cards[0]) || cards[0]).textContent.trim().slice(0, 80);
        if (fp !== prevFingerprint) {
          clearTimeout(timer);
          obs.disconnect();
          resolve();
        }
      };

      const obs = new MutationObserver(check);
      obs.observe(document.body, { childList: true, subtree: true });
      check(); // handle case where panel already changed during the click
    });
  }

  async function scrapeCurrentBook() {
    // Scroll to trigger lazy loading, stopping when no new cards appear
    const pane = q(SEL.highlightsPane);
    if (pane) {
      let prev = 0;
      for (let attempts = 0; attempts < 30; attempts++) {
        pane.scrollTop = pane.scrollHeight;
        await sleep(600);
        const count = qAll(SEL.highlightCard).length;
        if (count === prev) break;
        prev = count;
      }
    } else {
      await sleep(800);
    }

    await sleep(300);
    return scrapeVisibleHighlights();
  }

  // ---------------------------------------------------------------------------
  // Main scrape entry point — called when background sends {action:'scrape'}
  // ---------------------------------------------------------------------------

  async function runScrape(existingData) {
    log('Starting scrape');

    // Build lookup: asin → stored book data
    const stored = {};
    if (existingData && existingData.books) {
      for (const b of existingData.books) stored[b.asin] = b;
    }

    // Wait for the book list to appear
    try {
      await waitFor(SEL.bookItem, 15000);
    } catch (_) {
      browser.runtime.sendMessage({
        action: 'error',
        message: 'Could not find book list. Are you logged in to Amazon Kindle?'
      });
      return;
    }

    const bookEls = qAll(SEL.bookItem);
    if (!bookEls.length) {
      browser.runtime.sendMessage({
        action: 'error',
        message: 'No books found. Please check you are logged in.'
      });
      return;
    }

    log(`Found ${bookEls.length} books`);
    const total = bookEls.length;
    const books = [];

    for (let i = 0; i < bookEls.length; i++) {
      const el = bookEls[i];

      const titleEl  = q(SEL.bookTitle, el);
      const authorEl = q(SEL.bookAuthor, el);
      const coverEl  = el.querySelector('img');
      const countEl  = q(SEL.highlightCount, el);

      const title    = titleEl  ? titleEl.textContent.trim()  : 'Unknown Title';
      const author   = authorEl ? authorEl.textContent.trim() : 'Unknown Author';
      const coverUrl = coverEl  ? coverEl.src                 : null;
      const asin     = el.getAttribute('data-asin') ||
                       el.getAttribute('data-book-asin') ||
                       el.id ||
                       `book-${i}`;

      const countText       = countEl ? countEl.textContent.trim() : '';
      const highlightCountUI = parseInt(countText.replace(/\D/g, ''), 10);

      browser.runtime.sendMessage({
        action: 'progress',
        current: i + 1,
        total,
        bookTitle: title
      });

      // Incremental check: skip if highlight count unchanged
      const prev = stored[asin];
      if (prev && !isNaN(highlightCountUI) && prev.highlightCount === highlightCountUI) {
        log(`Skipping "${title}" — count unchanged (${highlightCountUI})`);
        books.push(prev);
        continue;
      }

      log(`Scraping "${title}" (${isNaN(highlightCountUI) ? '?' : highlightCountUI} highlights)`);

      // Capture current panel state BEFORE clicking so we can detect when
      // the panel actually switches to the new book's highlights
      const fp = panelFingerprint();
      el.click();
      await waitForPanelChange(fp);

      const highlights = await scrapeCurrentBook();
      log(`  → ${highlights.length} highlights`);

      books.push({
        asin,
        title,
        author,
        coverUrl,
        highlightCount: highlights.length,
        lastSynced: new Date().toISOString(),
        highlights
      });
    }

    browser.runtime.sendMessage({ action: 'complete', books });
  }

  // ---------------------------------------------------------------------------
  // Message listener
  // ---------------------------------------------------------------------------

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'scrape') {
      runScrape(msg.existingData);
      // Return false — response comes later via separate sendMessage calls
    }
  });

  log('Content script loaded on', location.href);
})();

} // end double-injection guard
