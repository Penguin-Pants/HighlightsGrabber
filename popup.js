(function () {
  // ---------------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------------
  const noData        = document.getElementById('no-data');
  const hasData       = document.getElementById('has-data');
  const bookCount     = document.getElementById('book-count');
  const highlightCount = document.getElementById('highlight-count');
  const lastSynced    = document.getElementById('last-synced');
  const progressSec   = document.getElementById('progress-section');
  const progressFill  = document.getElementById('progress-fill');
  const progressText  = document.getElementById('progress-text');
  const errorSec      = document.getElementById('error-section');
  const errorText     = document.getElementById('error-text');
  const syncBtn       = document.getElementById('sync-btn');
  const downloadBtn   = document.getElementById('download-btn');
  const warningText   = document.getElementById('warning-text');
  const savedText     = document.getElementById('saved-text');

  // ---------------------------------------------------------------------------
  // Long-lived port for push messages from background
  // ---------------------------------------------------------------------------
  const port = browser.runtime.connect({ name: 'popup' });

  port.onMessage.addListener(msg => {
    switch (msg.action) {
      case 'syncProgress':
        showProgress(msg.current, msg.total, msg.bookTitle);
        break;
      case 'syncComplete':
        showSummary(msg.summary);
        showWarning(msg.warning);
        showDownload(msg.download);
        resetSyncButton();
        break;
      case 'syncError':
        showError(msg.message);
        resetSyncButton();
        break;
    }
  });

  // ---------------------------------------------------------------------------
  // Button handlers
  // ---------------------------------------------------------------------------
  syncBtn.addEventListener('click', () => {
    hideError();
    showWarning(null);
    savedText.classList.add('hidden');
    setSyncing(true);
    browser.runtime.sendMessage({ action: 'startSync' })
      .catch(err => {
        showError('Could not start sync: ' + err.message);
        resetSyncButton();
      });
  });

  downloadBtn.addEventListener('click', () => {
    browser.runtime.sendMessage({ action: 'downloadJSON' })
      .then(showDownload)
      .catch(err => showDownload({ ok: false, error: err.message }));
  });

  // ---------------------------------------------------------------------------
  // On open: fetch current state from background
  // ---------------------------------------------------------------------------
  browser.runtime.sendMessage({ action: 'getStatus' }).then(resp => {
    if (!resp) return;
    if (resp.syncing) {
      setSyncing(true);
      const s = resp.syncStatus;
      showProgress(s.current, s.total, s.bookTitle);
      return;
    }
    if (resp.data) {
      showSummary({
        totalBooks:      resp.data.totalBooks,
        totalHighlights: resp.data.totalHighlights,
        lastUpdated:     resp.data.lastUpdated
      });
    }
    const s = resp.syncStatus;
    if (s.lastError) showError(s.lastError);
    showWarning(s.lastWarning);
    if (s.lastFilename && !s.lastError) showDownload({ ok: true, filename: s.lastFilename });
  });

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------
  function setSyncing(on) {
    syncBtn.disabled = on;
    syncBtn.textContent = on ? 'Syncing…' : 'Sync Highlights';
    if (on) {
      progressSec.classList.remove('hidden');
    }
  }

  function resetSyncButton() {
    setSyncing(false);
    progressSec.classList.add('hidden');
  }

  function showProgress(current, total, title) {
    progressSec.classList.remove('hidden');
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    progressFill.style.width = pct + '%';
    progressText.textContent = title
      ? `(${current}/${total}) ${title}`
      : `Processing ${current} of ${total}…`;
  }

  function showSummary(summary) {
    noData.classList.add('hidden');
    hasData.classList.remove('hidden');
    downloadBtn.classList.remove('hidden');

    bookCount.textContent      = summary.totalBooks;
    highlightCount.textContent = summary.totalHighlights;
    lastSynced.textContent     = formatDate(summary.lastUpdated);
  }

  function showError(msg) {
    errorSec.classList.remove('hidden');
    errorText.textContent = msg;
  }

  function showWarning(msg) {
    warningText.textContent = msg || '';
    warningText.classList.toggle('hidden', !msg);
  }

  function showDownload(result) {
    if (!result) return;
    savedText.textContent = result.ok ? `Saved ${result.filename}` : `Download failed: ${result.error}`;
    savedText.classList.toggle('error', !result.ok);
    savedText.classList.remove('hidden');
  }

  function hideError() {
    errorSec.classList.add('hidden');
    errorText.textContent = '';
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short'
      });
    } catch (_) {
      return iso;
    }
  }
})();
