if (window.__highlightsGrabberLoaded) {
  // Already injected — do not register a second listener
} else {
  window.__highlightsGrabberLoaded = true;

(function () {
  const log = (...a) => console.log('[HighlightsGrabber]', ...a);
  const { parseRow, hasMorePages, readHighlightCount, isExportLimited, makeId, readLocation } = HighlightsGrabberParse;
  const PSEL = HighlightsGrabberParse.SEL;

  // ---------------------------------------------------------------------------
  // Stable selectors from read.amazon.com/notebook
  // ---------------------------------------------------------------------------

  const SEL = {
    // Library container — wait for this before anything else
    library:          '#kp-notebook-library',

    // Sidebar book list (each element's id is the book's ASIN)
    bookItem:         '#kp-notebook-library .kp-notebook-library-each-book',

    // Right panel — populated after clicking a book
    panelTitle:       '#kp-notebook-annotations-pane h3.kp-notebook-metadata',
    panelAuthor:      '#kp-notebook-annotations-pane .a-color-secondary.a-size-base',
    panelAsin:        '#kp-notebook-asin',

    // Highlight pagination
    annotationsPane:  '#kp-notebook-annotations-pane',
    annotations:      '#kp-notebook-annotations',
    scroller:         '#annotation-scroller',
    highlightRow:     '#kp-notebook-annotations .a-row.a-spacing-base',
    nextBtn:          '#kp-notebook-annotations-next-btn',
    emptyBook:        '#kp-notebook-empty',

    // Sidebar title — used for the progress label and as a title fallback
    sidebarTitle:     [
      '.kp-notebook-searchable-item-name',
      'h2.a-size-base',
      'h2',
      '.a-text-bold'
    ]
  };

  const ASIN_RE = /^[A-Z0-9]{10}$/i;
  const MAX_PAGES = 200;

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

  // Poll until check() is true. Resolves true on success, false on timeout.
  function waitUntil(check, timeout) {
    return new Promise(resolve => {
      if (check()) return resolve(true);
      const deadline = Date.now() + timeout;
      const poll = () => {
        if (check()) return resolve(true);
        if (Date.now() > deadline) return resolve(false);
        setTimeout(poll, 100);
      };
      setTimeout(poll, 100);
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
  // Book switch detection.
  // Preferred: the right panel's hidden #kp-notebook-asin matches the clicked
  // book's id. Fallback: the URL's asin= param changes (history.pushState
  // doesn't fire DOM mutations, so we poll).
  // ---------------------------------------------------------------------------

  function panelAsin() {
    const input = document.querySelector(SEL.panelAsin);
    return input ? input.value : null;
  }

  function asinFromUrl() {
    return new URLSearchParams(location.search).get('asin');
  }

  // Returns false if neither the panel nor the URL confirms the switch
  async function openBook(el, expectedAsin) {
    const prevSearch  = location.search;
    const prevPanel   = document.querySelector(SEL.panelAsin);
    const alreadyOpen = expectedAsin && panelAsin() === expectedAsin;
    clickBook(el);

    if (!expectedAsin) {
      await waitUntil(() => location.search !== prevSearch, 12000);
      return true;
    }

    if (alreadyOpen) {
      // The click reloads the panel at its first page. If Amazon does not
      // reload it, continue with the panel as it is.
      await waitUntil(() => {
        const input = document.querySelector(SEL.panelAsin);
        return input && input !== prevPanel && input.value === expectedAsin;
      }, 5000);
      return true;
    }

    // If the panel has no asin input at all, fall back to the URL's asin= param
    return waitUntil(() => panelAsin() === expectedAsin ||
                           (panelAsin() === null && asinFromUrl() === expectedAsin), 15000);
  }

  // ---------------------------------------------------------------------------
  // Load every book into the sidebar. Amazon may load the library in pages
  // when you scroll. The next-page token is not always kept on the live page,
  // so scroll once to check even without it.
  // Returns false if Amazon still reports more books when we stop.
  // ---------------------------------------------------------------------------

  async function loadFullLibrary() {
    const library = document.querySelector(SEL.library);
    for (let i = 0; i < MAX_PAGES; i++) {
      const more  = hasMorePages(library, PSEL.libraryNextToken);
      const books = qAll(SEL.bookItem);
      if (!books.length) return !more;
      books[books.length - 1].scrollIntoView({ block: 'end' });
      const grew = await waitUntil(() => qAll(SEL.bookItem).length > books.length, more ? 8000 : 3000);
      if (!grew) return !more;
      await sleep(500);
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Read title and author from the right panel header
  // ---------------------------------------------------------------------------

  function scrapePanelMeta() {
    const titleEl  = document.querySelector(SEL.panelTitle);
    const authorEl = document.querySelector(SEL.panelAuthor);

    return {
      title:  titleEl  ? titleEl.textContent.trim()  : null,
      author: authorEl ? authorEl.textContent.trim() : 'Unknown Author'
    };
  }

  // ---------------------------------------------------------------------------
  // Scrape highlight rows currently visible in #kp-notebook-annotations
  // ---------------------------------------------------------------------------

  // Changes when rows are replaced (next button) or appended (scroll)
  function rowsFingerprint() {
    const rows = qAll(SEL.highlightRow);
    if (!rows.length) return '';
    const last = rows[rows.length - 1];
    return rows.length + ':' + (last.id || last.textContent.trim().slice(0, 80));
  }

  function usableNextBtn() {
    const nextBtn = document.querySelector(SEL.nextBtn);
    if (!nextBtn) return null;

    // Stop if the button is hidden or disabled
    const style    = window.getComputedStyle(nextBtn);
    const hidden   = style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
    const disabled = nextBtn.disabled ||
                     nextBtn.getAttribute('aria-disabled') === 'true' ||
                     nextBtn.classList.contains('a-disabled') ||
                     nextBtn.classList.contains('kp-disabled');

    return hidden || disabled ? null : nextBtn;
  }

  // Scroll the highlights pane to its end so Amazon loads the next page
  function scrollForMore() {
    const rows = qAll(SEL.highlightRow);
    if (rows.length) rows[rows.length - 1].scrollIntoView({ block: 'end' });
    const scroller = document.querySelector(SEL.scroller);
    if (scroller) {
      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new Event('scroll'));
    }
  }

  // ---------------------------------------------------------------------------
  // Scrape all highlights for the current book. Pages load either with the
  // next-page button (rows replaced) or on scroll (rows appended). Rows are
  // de-duplicated by id, so both work.
  // More pages exist if Amazon's next-page token says so, or if fewer
  // highlight rows are loaded than Amazon's own count ("341 Highlights").
  // complete is false if more pages still exist when we stop.
  // ---------------------------------------------------------------------------

  async function scrapeCurrentBook() {
    if (document.querySelector(SEL.emptyBook)) {
      log('  Book has no highlights');
      return { highlights: [], complete: true, expected: null, limited: false };
    }

    // Wait for first batch of highlight rows
    try {
      await waitForEl(SEL.highlightRow, 8000);
    } catch (_) {
      log('  No highlight rows found after waiting');
      return { highlights: [], complete: true, expected: null, limited: false };
    }

    const pane     = document.querySelector(SEL.annotationsPane) || document;
    const expected = readHighlightCount(pane);
    // With an export limit, Amazon counts highlights it does not show
    const limited  = isExportLimited(pane);
    // Without a usable count, check for more pages with one short scroll
    const unsure   = expected === null || limited;

    const byId = new Map();
    const highlightRows = new Set(); // includes rows Amazon cannot display
    let pageLoaded = true;
    const result = complete => ({ highlights: [...byId.values()], complete, expected, limited });

    for (let page = 1; ; page++) {
      const before = byId.size;
      const rowsBefore = highlightRows.size;
      for (const row of qAll(SEL.highlightRow)) {
        const h = parseRow(row);
        if (h && !byId.has(h.id)) byId.set(h.id, h);
        // Same identity as the exported id; rows without text (images) use
        // the full row text and location
        if (row.querySelector(PSEL.highlightBox)) {
          highlightRows.add(h ? h.id : (row.id || makeId(row.textContent.trim(), readLocation(row))));
        }
      }
      log(`  Page ${page}: +${byId.size - before} highlights (${byId.size} total` +
          (expected === null ? ')' : `, Amazon shows ${expected})`));

      const annotations = document.querySelector(SEL.annotations);
      const more = hasMorePages(annotations, PSEL.annotationsNextToken) ||
                   (expected !== null && !limited && highlightRows.size < expected);

      // A load attempt changed no rows and added nothing new: stop.
      // (A page can load but hold only notes or images, so check both.)
      if (page > 1 && !pageLoaded && byId.size === before && highlightRows.size === rowsBefore) {
        return result(!more);
      }

      const nextBtn = usableNextBtn();
      const probe = !nextBtn && !more;
      if (probe && !unsure) break;

      if (page >= MAX_PAGES) {
        log('  Pagination safety limit reached');
        return result(false);
      }

      // Rate-limit between page loads
      await sleep(500);
      const beforeFp = rowsFingerprint();
      if (nextBtn) {
        nextBtn.click();
      } else {
        scrollForMore();
      }
      pageLoaded = await waitUntil(() => { const fp = rowsFingerprint(); return fp !== '' && fp !== beforeFp; }, probe ? 3000 : 8000);
      await sleep(200); // brief settle after the rows change
    }

    return result(true);
  }

  // ---------------------------------------------------------------------------
  // Main entry point
  // ---------------------------------------------------------------------------

  function sendError(message) {
    browser.runtime.sendMessage({ action: 'error', message });
  }

  async function runScrape() {
    log('Starting scrape:', location.href);

    // Wait for library container
    try {
      await waitForEl(SEL.library, 15000);
    } catch (_) {
      sendError('Could not find your Kindle library. Sign in to Amazon in the Kindle tab, then click Sync again.');
      return;
    }

    const libraryComplete = await loadFullLibrary();

    const bookEls = qAll(SEL.bookItem);
    if (!bookEls.length) {
      sendError('No books found. Sign in to Amazon in the Kindle tab, then click Sync again.');
      return;
    }

    log(`Found ${bookEls.length} books`);
    const total = bookEls.length;
    const books = [];
    const warnings = { emptyBooks: 0, incompleteBooks: [], failedBooks: [], limitedBooks: [], libraryIncomplete: !libraryComplete };

    for (let i = 0; i < bookEls.length; i++) {
      const el = bookEls[i];

      // Cover comes from the sidebar thumbnail
      const coverEl  = el.querySelector('img');
      const coverUrl = coverEl ? coverEl.src : null;

      // Sidebar title used for the progress notification (before clicking)
      const sidebarTitleEl = q(SEL.sidebarTitle, el);
      const sidebarTitle   = sidebarTitleEl ? sidebarTitleEl.textContent.trim() : '';
      const progressTitle  = sidebarTitle || `Book ${i + 1}`;

      browser.runtime.sendMessage({ action: 'progress', current: i + 1, total, bookTitle: progressTitle });

      // Click the book and wait for the right panel to show it
      const rowAsin = ASIN_RE.test(el.id) ? el.id : null;
      if (!(await openBook(el, rowAsin))) {
        log(`Skipping "${progressTitle}" — panel did not switch to this book`);
        warnings.failedBooks.push(progressTitle);
        continue;
      }

      // Canonical ASIN from the panel or URL, with fallbacks
      const asin = rowAsin ||
                   asinFromUrl() ||
                   el.getAttribute('data-asin') ||
                   el.getAttribute('data-book-asin') ||
                   `book-${i}`;

      // Read title and author from the right panel now that it has loaded
      const { title, author } = scrapePanelMeta();
      const finalTitle = title || sidebarTitle || 'Unknown Title';

      log(`Scraping "${finalTitle}" by ${author} (ASIN: ${asin})`);

      const { highlights, complete, expected, limited } = await scrapeCurrentBook();
      log(`  → ${highlights.length} highlights total${complete ? '' : ' (may be incomplete)'}`);

      if (!complete) {
        warnings.incompleteBooks.push(expected === null ? finalTitle : `${finalTitle} (${highlights.length} of ${expected})`);
      }
      if (limited) warnings.limitedBooks.push(finalTitle);

      // Books without highlights are left out of the file
      if (!highlights.length) {
        warnings.emptyBooks++;
        continue;
      }

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

    browser.runtime.sendMessage({ action: 'complete', books, warnings });
  }

  // ---------------------------------------------------------------------------
  // Message listener
  // ---------------------------------------------------------------------------

  // Open port lets the background detect a closed or reloaded tab
  let scrapePort = null;

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'scrape') {
      if (scrapePort) scrapePort.disconnect();
      scrapePort = browser.runtime.connect({ name: 'scrape' });
      runScrape().catch(err => sendError('Sync stopped: ' + err.message));
    }
  });

  log('Content script ready:', location.href);
})();

} // end double-injection guard
