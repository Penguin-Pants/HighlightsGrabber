if (window.__highlightsGrabberLoaded) {
  // Already injected — do not register a second listener
} else {
  window.__highlightsGrabberLoaded = true;

(function () {
  const log = (...a) => console.log('[HighlightsGrabber]', ...a);

  // ---------------------------------------------------------------------------
  // Stable selectors from read.amazon.com/notebook
  // ---------------------------------------------------------------------------

  const SEL = {
    // Library container — wait for this before anything else
    library:          '#kp-notebook-library',

    // Sidebar book list
    bookItem:         '#kp-notebook-library .kp-notebook-library-each-book',

    // Right panel — populated after clicking a book
    panelTitle:       '#kp-notebook-annotations-pane h3.kp-notebook-metadata',
    panelAuthor:      '#kp-notebook-annotations-pane .a-color-secondary.a-size-base',

    // Highlight pagination
    annotations:      '#kp-notebook-annotations',
    highlightRow:     '#kp-notebook-annotations .a-row.a-spacing-base',
    nextBtn:          '#kp-notebook-annotations-next-btn',
    emptyBook:        '#kp-notebook-empty',

    // Within each highlight row
    highlightText:    ['#highlight', '.kp-notebook-highlight span'],
    location:         ['#kp-annotation-location', '.kp-notebook-metadata'],
    note:             '#note',

    // Sidebar title — used only for the progress label before clicking
    sidebarTitle:     [
      '.kp-notebook-searchable-item-name',
      'h2.a-size-base',
      'h2',
      '.a-text-bold'
    ]
  };

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------

  function q(selector, parent = document) {
    if (Array.isArray(selector)) {
      for (const s of selector) {
        const el = parent.querySelector(s);
        if (el) return el;
      }
      return null;
    }
    return parent.querySelector(selector);
  }

  function qAll(selector, parent = document) {
    return Array.from(parent.querySelectorAll(selector));
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // Wait for a selector to appear in the DOM
  function waitForEl(selector, timeout = 15000) {
    const primary = Array.isArray(selector) ? selector[0] : selector;
    return new Promise((resolve, reject) => {
      const found = q(selector);
      if (found) return resolve(found);

      const timer = setTimeout(() => {
        obs.disconnect();
        reject(new Error(`Timeout waiting for ${primary}`));
      }, timeout);

      const obs = new MutationObserver(() => {
        const el = q(selector);
        if (el) { clearTimeout(timer); obs.disconnect(); resolve(el); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    });
  }

  // ---------------------------------------------------------------------------
  // Click helper — dispatches on the inner <a> so React's handler fires
  // ---------------------------------------------------------------------------

  function clickBook(el) {
    const link = el.querySelector('a') || el;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }

  // ---------------------------------------------------------------------------
  // Wait for the URL's search string to change (signals a book panel switch)
  // history.pushState doesn't fire DOM mutations, so we poll.
  // ---------------------------------------------------------------------------

  function waitForUrlChange(prevSearch, timeout = 12000) {
    return new Promise(resolve => {
      if (location.search !== prevSearch) return resolve();
      const deadline = Date.now() + timeout;
      const poll = () => {
        if (location.search !== prevSearch) return resolve();
        if (Date.now() > deadline) return resolve();
        setTimeout(poll, 100);
      };
      setTimeout(poll, 100);
    });
  }

  // ---------------------------------------------------------------------------
  // Wait for #kp-notebook-annotations to update its children (pagination)
  // ---------------------------------------------------------------------------

  function waitForAnnotationsUpdate(timeout = 8000) {
    return new Promise(resolve => {
      const container = document.querySelector(SEL.annotations);
      if (!container) return resolve();

      const timer = setTimeout(() => { obs.disconnect(); resolve(); }, timeout);

      const obs = new MutationObserver(() => {
        clearTimeout(timer);
        obs.disconnect();
        resolve();
      });
      obs.observe(container, { childList: true, subtree: true });
    });
  }

  // ---------------------------------------------------------------------------
  // ASIN from current URL (canonical — updated by Amazon when book is clicked)
  // ---------------------------------------------------------------------------

  function asinFromUrl() {
    return new URLSearchParams(location.search).get('asin');
  }

  // ---------------------------------------------------------------------------
  // Read title, author (and best-effort count) from the right panel header
  // ---------------------------------------------------------------------------

  function scrapePanelMeta() {
    const titleEl  = document.querySelector(SEL.panelTitle);
    const authorEl = document.querySelector(SEL.panelAuthor);

    // Best-effort highlight count from panel (not in spec, but useful for
    // incremental skip). Quietly ignored if selector doesn't match.
    const countEl = document.querySelector('#kp-notebook-annotations-pane .kp-notebook-library-book-count') ||
                    document.querySelector('#kp-notebook-annotations-pane .a-badge-count');
    const countRaw = countEl ? countEl.textContent.trim() : '';
    const count    = parseInt(countRaw.replace(/\D/g, ''), 10);

    return {
      title:           titleEl  ? titleEl.textContent.trim()  : null,
      author:          authorEl ? authorEl.textContent.trim() : 'Unknown Author',
      highlightCountUI: isNaN(count) ? -1 : count
    };
  }

  // ---------------------------------------------------------------------------
  // Scrape highlight rows currently visible in #kp-notebook-annotations
  // ---------------------------------------------------------------------------

  function makeId(text, loc) {
    const raw = (text + loc).slice(0, 80);
    let h = 0;
    for (let i = 0; i < raw.length; i++) { h = ((h << 5) - h) + raw.charCodeAt(i); h |= 0; }
    return 'h' + Math.abs(h).toString(36);
  }

  function extractColor(el) {
    const cls = el.className || '';
    for (const c of ['yellow', 'pink', 'blue', 'orange']) {
      if (cls.includes(c)) return c;
    }
    const child = el.querySelector('[class*="yellow"],[class*="pink"],[class*="blue"],[class*="orange"]');
    return child ? extractColor(child) : 'yellow';
  }

  function scrapeVisibleHighlights() {
    const rows = qAll(SEL.highlightRow);
    const highlights = [];

    for (const row of rows) {
      const textEl = q(SEL.highlightText, row);
      const locEl  = q(SEL.location, row);
      const noteEl = row.querySelector(SEL.note);

      const text = textEl ? textEl.textContent.trim() : '';
      if (!text || text.length < 2) continue;

      const location = locEl  ? locEl.textContent.trim()  : '';
      const note     = noteEl ? noteEl.textContent.trim() : null;
      const id       = row.getAttribute('data-annotation-id') || row.id || makeId(text, location);

      highlights.push({
        id,
        text,
        note:        note || null,
        location,
        color:       extractColor(row),
        createdDate: null
      });
    }

    return highlights;
  }

  // ---------------------------------------------------------------------------
  // Scrape all highlights for the current book via the next-page button.
  // Each click replaces the visible rows — accumulate across pages.
  // ---------------------------------------------------------------------------

  async function scrapeCurrentBook() {
    if (document.querySelector(SEL.emptyBook)) {
      log('  Book has no highlights');
      return [];
    }

    // Wait for first batch of highlight rows
    try {
      await waitForEl(SEL.highlightRow, 8000);
    } catch (_) {
      log('  No highlight rows found after waiting');
      return [];
    }

    const allHighlights = [];
    let page = 1;

    while (true) {
      const batch = scrapeVisibleHighlights();
      allHighlights.push(...batch);
      log(`  Page ${page}: +${batch.length} highlights (${allHighlights.length} total)`);

      const nextBtn = document.querySelector(SEL.nextBtn);
      if (!nextBtn) break;

      // Stop if the button is hidden or disabled
      const style    = window.getComputedStyle(nextBtn);
      const hidden   = style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
      const disabled = nextBtn.disabled ||
                       nextBtn.getAttribute('aria-disabled') === 'true' ||
                       nextBtn.classList.contains('a-disabled') ||
                       nextBtn.classList.contains('kp-disabled');

      if (hidden || disabled) break;

      // Rate-limit between pagination clicks (500ms per spec)
      await sleep(500);
      nextBtn.click();
      await waitForAnnotationsUpdate();
      await sleep(200); // brief settle after mutation fires

      page++;
      if (page > 200) { log('  Pagination safety limit reached'); break; }
    }

    return allHighlights;
  }

  // ---------------------------------------------------------------------------
  // Main entry point
  // ---------------------------------------------------------------------------

  async function runScrape(existingData) {
    log('Starting scrape:', location.href);

    // Session expiry guard
    if (/signin|ap\/signin/i.test(location.href)) {
      browser.runtime.sendMessage({ action: 'error', message: 'Amazon session expired. Please log in and try again.' });
      return;
    }

    // Build lookup: asin → stored book
    const stored = {};
    if (existingData && existingData.books) {
      for (const b of existingData.books) stored[b.asin] = b;
    }

    // Wait for library container
    try {
      await waitForEl(SEL.library, 15000);
    } catch (_) {
      browser.runtime.sendMessage({ action: 'error', message: 'Could not find Kindle library. Are you logged in?' });
      return;
    }

    const bookEls = qAll(SEL.bookItem);
    if (!bookEls.length) {
      browser.runtime.sendMessage({ action: 'error', message: 'No books found. Please check you are logged in.' });
      return;
    }

    log(`Found ${bookEls.length} books`);
    const total = bookEls.length;
    const books = [];

    for (let i = 0; i < bookEls.length; i++) {
      const el = bookEls[i];

      // Cover comes from the sidebar thumbnail
      const coverEl  = el.querySelector('img');
      const coverUrl = coverEl ? coverEl.src : null;

      // Sidebar title used only for the progress notification (before clicking)
      const sidebarTitleEl = q(SEL.sidebarTitle, el);
      const progressTitle  = sidebarTitleEl ? sidebarTitleEl.textContent.trim() : `Book ${i + 1}`;

      browser.runtime.sendMessage({ action: 'progress', current: i + 1, total, bookTitle: progressTitle });

      // Click the book — inner <a> fires React's event handler
      const prevSearch = location.search;
      clickBook(el);

      // Wait for URL to update with this book's asin= param
      await waitForUrlChange(prevSearch);

      // Session can expire mid-scrape
      if (/signin|ap\/signin/i.test(location.href)) {
        browser.runtime.sendMessage({ action: 'error', message: 'Amazon session expired mid-scrape. Please log in and try again.' });
        return;
      }

      // Canonical ASIN comes from the URL (reliable), with fallbacks
      const asin = asinFromUrl() ||
                   el.getAttribute('data-asin') ||
                   el.getAttribute('data-book-asin') ||
                   `book-${i}`;

      // Read title and author from the right panel now that it has loaded
      const { title, author, highlightCountUI } = scrapePanelMeta();
      const finalTitle = title || progressTitle;

      // Incremental check: if panel gives us a count and it matches stored, skip
      const prev = stored[asin];
      if (prev && highlightCountUI >= 0 && prev.highlightCount === highlightCountUI) {
        log(`Skipping "${finalTitle}" — highlight count unchanged (${highlightCountUI})`);
        books.push({ ...prev, asin, title: finalTitle, author });
        continue;
      }

      log(`Scraping "${finalTitle}" by ${author} (ASIN: ${asin})`);

      const highlights = await scrapeCurrentBook();
      log(`  → ${highlights.length} highlights total`);

      books.push({
        asin,
        title:          finalTitle,
        author,
        coverUrl,
        highlightCount: highlights.length,
        lastSynced:     new Date().toISOString(),
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
    }
  });

  log('Content script ready:', location.href);
})();

} // end double-injection guard
