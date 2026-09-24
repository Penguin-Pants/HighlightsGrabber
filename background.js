const STORAGE_KEY = 'kindleHighlights';
const NOTEBOOK_URL = 'https://read.amazon.com/notebook';
const SIGN_IN_MESSAGE = 'Sign in to Amazon in the Kindle tab, then click Sync again.';

// ---------------------------------------------------------------------------
// Sync state (persists while background page is alive)
// ---------------------------------------------------------------------------

let syncStatus = {
  syncing:      false,
  current:      0,
  total:        0,
  bookTitle:    '',
  lastError:    null,  // shown when the popup opens after a failed sync
  lastWarning:  null,  // e.g. books skipped or possibly incomplete
  lastFilename: null   // name of the last downloaded JSON file
};

// Long-lived port to the popup (null when popup is closed)
let popupPort = null;

// Port opened by content.js while scraping; it disconnects if the tab closes or reloads
let scrapePort = null;

// ---------------------------------------------------------------------------
// Port management
// ---------------------------------------------------------------------------

browser.runtime.onConnect.addListener(port => {
  if (port.name === 'popup') {
    popupPort = port;
    port.onDisconnect.addListener(() => { popupPort = null; });
  } else if (port.name === 'scrape') {
    scrapePort = port;
    port.onDisconnect.addListener(() => {
      if (port !== scrapePort) return;
      scrapePort = null;
      if (syncStatus.syncing) {
        failSync('The Kindle tab was closed or reloaded. Sync stopped. Click Sync again.');
      }
    });
  }
});

function pushToPopup(msg) {
  if (popupPort) {
    try { popupPort.postMessage(msg); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Message handler (from popup and from content script)
// ---------------------------------------------------------------------------

browser.runtime.onMessage.addListener((msg, sender) => {
  switch (msg.action) {

    case 'getStatus':
      return browser.storage.local.get(STORAGE_KEY).then(stored => ({
        data:       stored[STORAGE_KEY] || null,
        syncing:    syncStatus.syncing,
        syncStatus: { ...syncStatus }
      }));

    case 'startSync':
      if (syncStatus.syncing) return Promise.resolve({ error: 'already_syncing' });
      startSync();
      return Promise.resolve({ started: true });

    case 'downloadJSON':
      return downloadJSON();

    // --- messages from content.js ---

    case 'progress':
      if (!syncStatus.syncing) break;
      syncStatus.current   = msg.current;
      syncStatus.total     = msg.total;
      syncStatus.bookTitle = msg.bookTitle;
      pushToPopup({ action: 'syncProgress', current: msg.current, total: msg.total, bookTitle: msg.bookTitle });
      break;

    case 'complete':
      if (!syncStatus.syncing) break;
      handleComplete(msg.books, msg.warnings).catch(err => failSync('Could not save highlights: ' + err.message));
      break;

    case 'error':
      if (!syncStatus.syncing) break;
      failSync(msg.message);
      break;
  }
});

// ---------------------------------------------------------------------------
// failSync — end the sync, keep the error for the popup, notify the user
// ---------------------------------------------------------------------------

function failSync(message) {
  syncStatus.syncing   = false;
  syncStatus.lastError = message;
  pushToPopup({ action: 'syncError', message });

  browser.notifications.create('sync-result', {
    type:    'basic',
    iconUrl: browser.runtime.getURL('assets/brand/icon-96.png'),
    title:   'Sync failed',
    message
  });
}

// ---------------------------------------------------------------------------
// startSync — find or open the Kindle notebook tab, then trigger content.js
// ---------------------------------------------------------------------------

async function startSync() {
  syncStatus = { ...syncStatus, syncing: true, current: 0, total: 0, bookTitle: '', lastError: null, lastWarning: null };
  scrapePort = null;

  try {
    const tabs = await browser.tabs.query({ url: NOTEBOOK_URL + '*' });

    let tab;
    if (tabs.length > 0) {
      tab = tabs[0];
      await browser.tabs.update(tab.id, { active: true });
      await sleep(500);
    } else {
      tab = await browser.tabs.create({ url: NOTEBOOK_URL });
      await waitForTabLoad(tab.id);
      await sleep(2500); // extra time for React SPA to initialise
    }

    // Signed out: Amazon redirects to its sign-in page on another host.
    // tab.url is undefined there because we have no permission for that host.
    const current = await browser.tabs.get(tab.id);
    if (!current.url || !current.url.startsWith(NOTEBOOK_URL)) {
      failSync(SIGN_IN_MESSAGE);
      return;
    }

    await sendScrapeMessage(tab.id);
  } catch (err) {
    failSync('Sync failed: ' + err.message);
  }
}

// Try sending the scrape message; if content script isn't there yet, inject it
async function sendScrapeMessage(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, { action: 'scrape' });
  } catch (_) {
    // Content script not loaded (tab was already open before extension install)
    await browser.tabs.executeScript(tabId, { file: 'parse.js' });
    await browser.tabs.executeScript(tabId, { file: 'content.js' });
    await sleep(500);
    try {
      await browser.tabs.sendMessage(tabId, { action: 'scrape' });
    } catch (err) {
      failSync('Could not communicate with the Kindle page: ' + err.message);
    }
  }
}

function waitForTabLoad(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error('Timed out waiting for Kindle tab to load'));
    }, timeout);

    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    browser.tabs.onUpdated.addListener(listener);
  });
}

// ---------------------------------------------------------------------------
// handleComplete — store data, download the JSON, notify popup and user
// ---------------------------------------------------------------------------

async function handleComplete(books, warnings) {
  syncStatus.syncing = false;

  const now = new Date().toISOString();
  const totalHighlights = books.reduce((n, b) => n + (b.highlights ? b.highlights.length : 0), 0);

  const data = {
    lastUpdated:     now,
    totalBooks:      books.length,
    totalHighlights,
    books
  };

  await browser.storage.local.set({ [STORAGE_KEY]: data });

  syncStatus.lastWarning = describeWarnings(warnings);

  const download = await downloadJSON();
  const saved = download.ok ? ` Saved ${download.filename}.` : ` Download failed: ${download.error}`;

  pushToPopup({
    action:  'syncComplete',
    summary: { totalBooks: books.length, totalHighlights, lastUpdated: now },
    warning: syncStatus.lastWarning,
    download
  });

  browser.notifications.create('sync-result', {
    type:    'basic',
    iconUrl: browser.runtime.getURL('assets/brand/icon-96.png'),
    title:   'Highlights synced',
    message: `${totalHighlights} highlights from ${books.length} books.${saved}` +
             (syncStatus.lastWarning ? ` ${syncStatus.lastWarning}` : '')
  });
}

// Short text for anything the user should know about a finished sync
function describeWarnings(w) {
  if (!w) return null;
  const parts = [];
  if (w.libraryIncomplete) parts.push('Some books may be missing from the library list.');
  if (w.incompleteBooks.length) parts.push(`${w.incompleteBooks.length} book(s) may be incomplete: ${w.incompleteBooks.join(', ')}.`);
  if (w.failedBooks.length) parts.push(`${w.failedBooks.length} book(s) did not load: ${w.failedBooks.join(', ')}.`);
  if (w.limitedBooks && w.limitedBooks.length) parts.push(`Amazon's export limit hides some highlights in ${w.limitedBooks.length} book(s): ${w.limitedBooks.join(', ')}.`);
  if (w.emptyBooks) parts.push(`${w.emptyBooks} book(s) without highlights left out.`);
  return parts.length ? parts.join(' ') : null;
}

// ---------------------------------------------------------------------------
// downloadJSON — export stored data as a dated JSON file
// Resolves to { ok: true, filename } or { ok: false, error }.
// ---------------------------------------------------------------------------

async function downloadJSON() {
  // Cleared first, so a failed download never shows an older file as saved
  syncStatus.lastFilename = null;
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    const data = stored[STORAGE_KEY];
    if (!data) return { ok: false, error: 'No highlights synced yet.' };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const filename = `kindle-highlights-${localDate()}.json`;

    try {
      await browser.downloads.download({ url, filename, saveAs: false });
    } finally {
      // Revoke the object URL shortly after triggering the download
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    syncStatus.lastFilename = filename;
    return { ok: true, filename };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

// YYYY-MM-DD in the user's time zone
function localDate(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
