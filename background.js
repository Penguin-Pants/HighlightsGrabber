const STORAGE_KEY = 'kindleHighlights';
const NOTEBOOK_URL = 'https://read.amazon.com/notebook';

// ---------------------------------------------------------------------------
// Sync state (persists while background page is alive)
// ---------------------------------------------------------------------------

let syncStatus = {
  syncing:   false,
  current:   0,
  total:     0,
  bookTitle: ''
};

// Long-lived port to the popup (null when popup is closed)
let popupPort = null;

// ---------------------------------------------------------------------------
// Popup port management
// ---------------------------------------------------------------------------

browser.runtime.onConnect.addListener(port => {
  if (port.name !== 'popup') return;
  popupPort = port;
  port.onDisconnect.addListener(() => { popupPort = null; });
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
      downloadJSON();
      return Promise.resolve({ ok: true });

    // --- messages from content.js ---

    case 'progress':
      syncStatus.current   = msg.current;
      syncStatus.total     = msg.total;
      syncStatus.bookTitle = msg.bookTitle;
      pushToPopup({ action: 'syncProgress', current: msg.current, total: msg.total, bookTitle: msg.bookTitle });
      break;

    case 'complete':
      handleComplete(msg.books);
      break;

    case 'error':
      syncStatus.syncing = false;
      pushToPopup({ action: 'syncError', message: msg.message });
      break;
  }
});

// ---------------------------------------------------------------------------
// startSync — find or open the Kindle notebook tab, then trigger content.js
// ---------------------------------------------------------------------------

async function startSync() {
  syncStatus = { syncing: true, current: 0, total: 0, bookTitle: '' };

  const stored = await browser.storage.local.get(STORAGE_KEY);
  const existingData = stored[STORAGE_KEY] || null;

  const tabs = await browser.tabs.query({ url: NOTEBOOK_URL + '*' });

  if (tabs.length > 0) {
    const tab = tabs[0];
    await browser.tabs.update(tab.id, { active: true });
    await sleep(500);
    await sendScrapeMessage(tab.id, existingData);
  } else {
    const tab = await browser.tabs.create({ url: NOTEBOOK_URL });
    await waitForTabLoad(tab.id);
    await sleep(2500); // extra time for React SPA to initialise
    await sendScrapeMessage(tab.id, existingData);
  }
}

// Try sending the scrape message; if content script isn't there yet, inject it
async function sendScrapeMessage(tabId, existingData) {
  try {
    await browser.tabs.sendMessage(tabId, { action: 'scrape', existingData });
  } catch (_) {
    // Content script not loaded (tab was already open before extension install)
    await browser.tabs.executeScript(tabId, { file: 'content.js' });
    await sleep(500);
    try {
      await browser.tabs.sendMessage(tabId, { action: 'scrape', existingData });
    } catch (err) {
      syncStatus.syncing = false;
      pushToPopup({ action: 'syncError', message: 'Could not communicate with the Kindle page: ' + err.message });
    }
  }
}

function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === 'complete') {
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    browser.tabs.onUpdated.addListener(listener);
  });
}

// ---------------------------------------------------------------------------
// handleComplete — store merged data, notify popup, fire notification
// ---------------------------------------------------------------------------

async function handleComplete(books) {
  const now = new Date().toISOString();
  const totalHighlights = books.reduce((n, b) => n + (b.highlights ? b.highlights.length : 0), 0);

  const data = {
    lastUpdated:     now,
    totalBooks:      books.length,
    totalHighlights,
    books
  };

  await browser.storage.local.set({ [STORAGE_KEY]: data });

  syncStatus.syncing = false;

  pushToPopup({
    action:  'syncComplete',
    summary: { totalBooks: books.length, totalHighlights, lastUpdated: now }
  });

  browser.notifications.create('sync-done', {
    type:    'basic',
    iconUrl: browser.runtime.getURL('icons/icon-48.png'),
    title:   'Highlights synced!',
    message: `${totalHighlights} highlights from ${books.length} books saved.`
  });
}

// ---------------------------------------------------------------------------
// downloadJSON — export stored data as a dated JSON file
// ---------------------------------------------------------------------------

async function downloadJSON() {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const data = stored[STORAGE_KEY];
  if (!data) return;

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const date = new Date().toISOString().split('T')[0];

  await browser.downloads.download({
    url,
    filename: `kindle-highlights-${date}.json`,
    saveAs:   false
  });
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
