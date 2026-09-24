// Pure helpers that read one highlight row or the pagination state from the
// Kindle notebook DOM. Loaded before content.js; also required by the tests.

var HighlightsGrabberParse = HighlightsGrabberParse || (function () {
  const SEL = {
    highlightText:  ['#highlight', '.kp-notebook-highlight span'],
    note:           '#note',
    // "Yellow highlight | Page: 7" or "Orange highlight | Location: 1,693"
    header:         '#annotationHighlightHeader',
    // Hidden <input> whose value is the start location number
    locationInput:  '#kp-annotation-location',
    // Hidden <input>; non-empty value means Amazon has more pages to load
    annotationsNextToken: '.kp-notebook-annotations-next-page-start',
    libraryNextToken:     '.kp-notebook-library-next-page-start',
    // "341 Highlights | 0 Notes" in the book panel header
    annotationCount:      '#kp-notebook-annotation-count',
    // "Some highlights have been hidden or truncated due to export limits."
    // Amazon hides it with the aok-hidden class when it does not apply.
    exportLimitNotice:    '#kp-notebook-hidden-annotations-summary',
    // Present in every highlight row, also when Amazon cannot display the text
    highlightBox:         '.kp-notebook-highlight'
  };

  const COLORS = ['yellow', 'pink', 'blue', 'orange'];

  function q(selector, parent) {
    const list = Array.isArray(selector) ? selector : [selector];
    for (const s of list) {
      const el = parent.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  // Hash of the full text and location, so long highlights with the same
  // opening words get different ids
  function makeId(text, loc) {
    const raw = text + '\u0000' + loc;
    let h = 0;
    for (let i = 0; i < raw.length; i++) { h = ((h << 5) - h) + raw.charCodeAt(i); h |= 0; }
    return 'h' + Math.abs(h).toString(36);
  }

  function extractColor(el) {
    const cls = typeof el.className === 'string' ? el.className : '';
    for (const c of COLORS) {
      if (cls.includes(c)) return c;
    }
    const child = el.querySelector('[class*="yellow"],[class*="pink"],[class*="blue"],[class*="orange"]');
    return child ? extractColor(child) : 'yellow';
  }

  // Returns "Page 7", "Location 1,693" or "" if the row has no location.
  function readLocation(row) {
    const header = row.querySelector(SEL.header);
    const text = header ? header.textContent : '';
    if (text.includes('|')) {
      const loc = text.split('|').pop().replace(':', '').replace(/\s+/g, ' ').trim();
      if (loc) return loc;
    }
    const input = row.querySelector(SEL.locationInput);
    const value = input ? (input.value || input.getAttribute('value') || '').trim() : '';
    return value ? `Location ${value}` : '';
  }

  // Returns a Highlight object, or null for rows without highlight text
  // (freestanding notes, images Amazon cannot display).
  function parseRow(row) {
    const textEl = q(SEL.highlightText, row);
    const text = textEl ? textEl.textContent.trim() : '';
    if (!text || text.length < 2) return null;

    const noteEl   = row.querySelector(SEL.note);
    const note     = noteEl ? noteEl.textContent.trim() : '';
    const location = readLocation(row);
    const id       = row.getAttribute('data-annotation-id') || row.id || makeId(text, location);

    return {
      id,
      text,
      note:        note || null,
      location,
      color:       extractColor(row),
      createdDate: null
    };
  }

  // Amazon appends a new token input with each loaded page; the last one is current.
  function hasMorePages(container, tokenSelector) {
    if (!container) return false;
    const inputs = container.querySelectorAll(tokenSelector);
    if (!inputs.length) return false;
    const last = inputs[inputs.length - 1];
    return Boolean((last.value || last.getAttribute('value') || '').trim());
  }

  // Amazon's own highlight count for the open book, or null if not shown
  function readHighlightCount(root) {
    const el = root.querySelector(SEL.annotationCount);
    const m = el ? el.textContent.match(/([\d.,]+)\s*Highlight/i) : null;
    if (!m) return null;
    const n = parseInt(m[1].replace(/\D/g, ''), 10);
    return Number.isNaN(n) ? null : n;
  }

  function isExportLimited(root) {
    const el = root.querySelector(SEL.exportLimitNotice);
    return Boolean(el && !el.classList.contains('aok-hidden'));
  }

  return { SEL, makeId, extractColor, readLocation, parseRow, hasMorePages, readHighlightCount, isExportLimited };
})();

if (typeof module !== 'undefined') module.exports = HighlightsGrabberParse;
