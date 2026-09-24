const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseHTML } = require('linkedom');
const P = require('../parse.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'annotations.html'), 'utf8');

function load(markup = html) {
  return parseHTML(`<!doctype html><html><body>${markup}</body></html>`).document;
}

function rows(doc) {
  return Array.from(doc.querySelectorAll('#kp-notebook-annotations .a-row.a-spacing-base'));
}

test('parses a page-based highlight', () => {
  const h = P.parseRow(load().getElementById('ROW-PAGE'));
  assert.deepEqual(h, {
    id: 'ROW-PAGE',
    text: 'Placeholder “quoted” text — with Unicode: café, 日本語.',
    note: null,
    location: 'Page 7',
    color: 'yellow',
    createdDate: null
  });
});

test('parses a location-based highlight with a note', () => {
  const h = P.parseRow(load().getElementById('ROW-LOC'));
  assert.equal(h.location, 'Location 1,693');
  assert.equal(h.note, 'Placeholder note.');
  assert.equal(h.color, 'orange');
});

test('falls back to the hidden location input when the header is missing', () => {
  const h = P.parseRow(load().getElementById('ROW-INPUT'));
  assert.equal(h.location, 'Location 31');
  assert.equal(h.color, 'blue');
});

test('skips rows without highlight text', () => {
  const doc = load();
  assert.equal(P.parseRow(doc.getElementById('ROW-NOTE-ONLY')), null);
  assert.equal(P.parseRow(doc.getElementById('ROW-IMAGE')), null);
});

test('makes a stable id for rows without one', () => {
  const doc = load();
  const noId = rows(doc).find(r => !r.id);
  const a = P.parseRow(noId);
  const b = P.parseRow(load().querySelectorAll('#kp-notebook-annotations .a-row.a-spacing-base')[5]);
  assert.match(a.id, /^h[0-9a-z]+$/);
  assert.equal(a.id, b.id);
  assert.equal(a.color, 'pink');
});

test('parses all rows of the fixture', () => {
  const list = rows(load()).map(P.parseRow).filter(Boolean);
  assert.equal(list.length, 4);
  assert.ok(list.every(h => h.text && h.location));
});

test('detects more pages from the last token input', () => {
  const doc = load();
  const container = doc.getElementById('kp-notebook-annotations');
  const sel = P.SEL.annotationsNextToken;
  assert.equal(P.hasMorePages(container, sel), true);

  // Amazon appends a new token with each page; an empty last token means done
  const last = doc.createElement('input');
  last.setAttribute('type', 'hidden');
  last.setAttribute('class', 'kp-notebook-annotations-next-page-start');
  container.appendChild(last);
  assert.equal(P.hasMorePages(container, sel), false);

  assert.equal(P.hasMorePages(null, sel), false);
  assert.equal(P.hasMorePages(doc.body, P.SEL.libraryNextToken), false);
});

test('every file the manifest references exists', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const files = [
    ...m.background.scripts,
    m.browser_action.default_popup,
    ...Object.values(m.browser_action.default_icon),
    ...m.browser_action.theme_icons.flatMap(t => [t.light, t.dark]),
    ...m.content_scripts.flatMap(c => c.js),
    ...Object.values(m.icons)
  ];
  for (const f of files) assert.ok(fs.existsSync(path.join(root, f)), `missing ${f}`);
  assert.ok(!m.permissions.includes('tabs'));
});
