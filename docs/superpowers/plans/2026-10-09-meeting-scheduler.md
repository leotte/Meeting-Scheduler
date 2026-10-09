# Meeting Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Google Apps Script web app where the organizer proposes meeting times on a one-week Mon–Fri grid, lists invitees, and shares one link per poll that anyone can open (no login) to tick the times that work for them.

**Architecture:** Pure rules (`src/shared/logic.js`) and poll operations over an abstract table store (`src/shared/service.js`) run identically on the Apps Script server, in Node tests and in a local browser preview. The server (`src/server/`) adds a Google Sheet store, owner check, locking and routing. The browser pages (`src/client/`) are plain JavaScript using a tiny DOM helper. `build.js` produces `dist/` (what goes into Apps Script) and `preview-dist/` (static pages whose `google.script.run` is replaced by a localStorage-backed shim).

**Tech Stack:** Google Apps Script (V8 runtime, HtmlService, SpreadsheetApp, LockService, PropertiesService); plain ES5-style JavaScript with Promises in the browser; Node 22 built-ins (`node:test`, `node:assert`, `node:vm`) for tests and the build; Python 3 `http.server` for the local preview; `@google/clasp@2.4.2` (optional) for pushing code.

**Spec:** `docs/superpowers/specs/2026-10-09-meeting-scheduler-design.md` (approved 2026-10-09).

## Global Constraints

- Platform: Google Apps Script, `"runtimeVersion": "V8"`, project time zone `America/Indiana/Indianapolis`.
- Deployment: web app, *Execute as: Me*, *Who has access: Anyone*.
- Grid: rows 8:00 AM–6:00 PM in 30-minute steps (20 rows). Meeting lengths 30, 60 or 90 minutes. Blocks may not overlap on the same day; every block ends by 6:00 PM.
- Week: one specific Mon–Fri week per poll; picking a Saturday or Sunday selects the following Monday.
- Time label shown wherever times appear: `All times Eastern (Bloomington)`.
- Colors (exact): Crimson `#990000`, Dark crimson `#6D0808`, Light crimson `#F41C40`, Cream `#F8EFE2`, Dark cream `#F5E3CC`, Light grey `#EEEEF0`, Grey `#B9C1C6`, IU Black `#072332`. `#F41C40` is never a text color and never sits behind small text (borders, badge outlines, focus outlines only). White `#FFFFFF` is used only as the background of text inputs, date inputs, textareas and selects.
- No runtime libraries or CDNs. Node built-ins only for build and tests; `@google/clasp@2.4.2` is the only dev dependency (added in Task 10).
- Files in `src/shared/` and `src/server/` never call Google, DOM or Node APIs at load time; cross-file references (`Logic`, `Service`, `SheetStore`) are resolved inside functions, because Apps Script loads files in an order we do not control.
- All user-entered text reaches the page through `textContent` (via `Dom.h`), never `innerHTML`.
- IDs (poll, block, invitee) are 8 characters from `[A-Za-z0-9]`.
- Fixed user-facing strings (copy exactly):
  - `This page is for the organizer only.`
  - `This poll is no longer available.`
  - `Not on the list? Contact the organizer.`
  - `Saved. You can return to this link and change your answers any time.`
  - `None of these times work for you?`
  - `The organizer updated this poll. Please review your answers.`
  - `Couldn’t save. Check your connection and try again.`
  - `Would end after 6:00 PM`
  - `Most available`
  - `Tentative schedule complete →`
  - `Confirm & create link`
- Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (use a second `-m`).
- All commands run from the repository root: `/Users/lrego/Dropbox/GenAI/Claude Code/Meeting Scheduler`.

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | npm scripts: `test`, `build` (and `push` from Task 10) |
| `.gitignore` | Ignore `node_modules/`, `dist/`, `preview-dist/`, `.DS_Store` |
| `src/appsscript.json` | Apps Script manifest (time zone, V8, web app settings) |
| `src/shared/logic.js` | Pure rules: dates, times, block placement, names, draft validation, tallies, edit impact, ids |
| `src/shared/service.js` | Poll operations over a `{read, write}` table store; `ServiceError`; `envelope` |
| `src/server/sheet_store.js` | Google Sheet implementation of the table store; pure cell codec |
| `src/server/main.js` | `doGet` routing, `include`, owner check, lock, public `api*` functions, `setupAdminKey` |
| `src/client/styles.css` | All styles (wrapped into `styles.html` by the build) |
| `src/client/dom.js` | `Dom`: element builder, confirm dialog, copy-to-clipboard, safe localStorage, focus restore |
| `src/client/api.js` | `Api.call(name, ...args)`: Promise wrapper around `google.script.run` |
| `src/client/grid.js` | `Grid`: Mon–Fri calendar in `edit` or `names` mode, day tabs, narrow-screen detection |
| `src/client/organizer.js` | Organizer page: poll list, 4-step wizard, share screen, results, data-sheet recovery |
| `src/client/invitee.js` | Invitee page: pick name, tick times, save |
| `src/client/organizer.html`, `invitee.html`, `message.html` | Apps Script page templates |
| `preview/preview-shim.js` | Local preview only: fake `google.script.run` backed by the real `Service` and localStorage |
| `build.js` | Produces `dist/` and `preview-dist/` |
| `.claude/launch.json` | Local preview server definition for the browser pane |
| `test/helpers.js` | In-memory store, deterministic ids/clock, sample draft |
| `test/*.test.js` | Node tests |
| `README.md` | Commands, deployment guide, setup checks, fallbacks |

---

### Task 1: Project scaffold and date/time rules

**Files:**
- Create: `package.json`, `.gitignore`, `src/shared/logic.js`
- Test: `test/logic-time.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (on global/exported `Logic`):
  - Constants: `GRID_START` (480), `GRID_END` (1080), `STEP` (30), `LENGTHS` ([30,60,90]), `DAY_NAMES` (['Mon'..'Fri']), `TITLE_MAX` (120), `NAME_MAX` (60)
  - `weekStartFor(iso: string) → string|null`
  - `isMonday(iso: string) → boolean`
  - `weekDates(weekStart: string) → string[5]`
  - `formatDayHeader(iso) → string` e.g. `"Mon, Oct 19"`
  - `formatWeekRange(weekStart) → string` e.g. `"Oct 19–23, 2026"`
  - `todayIso(date: Date) → string` (local calendar date)
  - `isPastWeek(weekStart, todayIso) → boolean`
  - `formatTime(min: number) → string` e.g. `"9:00 AM"`
  - `formatRange(startMin, lengthMin) → string` e.g. `"9:00–10:00 AM"`, `"11:30 AM–12:30 PM"`
  - `rowStarts() → number[20]` (480 … 1050)
- Module pattern used by Tasks 2–3: the IIFE builds an `api` object and ends with the line `  return api;`. Later tasks insert sections immediately above that line.

- [ ] **Step 1: Create `package.json` and `.gitignore`**

`package.json`:
```json
{
  "name": "meeting-scheduler",
  "version": "1.0.0",
  "private": true,
  "description": "Meeting availability polls on Google Apps Script",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test test/*.test.js",
    "build": "node build.js"
  }
}
```

`.gitignore`:
```
node_modules/
dist/
preview-dist/
.DS_Store
```

- [ ] **Step 2: Write the failing test**

`test/logic-time.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const Logic = require('../src/shared/logic.js');

test('constants describe the grid', () => {
  assert.equal(Logic.GRID_START, 480);
  assert.equal(Logic.GRID_END, 1080);
  assert.equal(Logic.STEP, 30);
  assert.deepEqual(Logic.LENGTHS, [30, 60, 90]);
  assert.deepEqual(Logic.DAY_NAMES, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  assert.equal(Logic.TITLE_MAX, 120);
  assert.equal(Logic.NAME_MAX, 60);
});

test('weekStartFor maps weekdays to their Monday', () => {
  assert.equal(Logic.weekStartFor('2026-10-19'), '2026-10-19');
  assert.equal(Logic.weekStartFor('2026-10-21'), '2026-10-19');
  assert.equal(Logic.weekStartFor('2026-10-23'), '2026-10-19');
});

test('weekStartFor maps weekends to the following Monday', () => {
  assert.equal(Logic.weekStartFor('2026-10-24'), '2026-10-26');
  assert.equal(Logic.weekStartFor('2026-10-25'), '2026-10-26');
});

test('weekStartFor crosses month and year boundaries', () => {
  assert.equal(Logic.weekStartFor('2026-12-04'), '2026-11-30');
  assert.equal(Logic.weekStartFor('2026-01-01'), '2025-12-29');
});

test('weekStartFor rejects invalid dates', () => {
  assert.equal(Logic.weekStartFor('2026-02-30'), null);
  assert.equal(Logic.weekStartFor(''), null);
  assert.equal(Logic.weekStartFor(null), null);
  assert.equal(Logic.weekStartFor('10/19/2026'), null);
});

test('isMonday', () => {
  assert.equal(Logic.isMonday('2026-10-19'), true);
  assert.equal(Logic.isMonday('2026-10-20'), false);
  assert.equal(Logic.isMonday('garbage'), false);
  assert.equal(Logic.isMonday(undefined), false);
});

test('weekDates lists Monday to Friday', () => {
  assert.deepEqual(Logic.weekDates('2026-10-19'),
    ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
});

test('formatDayHeader', () => {
  assert.equal(Logic.formatDayHeader('2026-10-19'), 'Mon, Oct 19');
  assert.equal(Logic.formatDayHeader('2026-10-23'), 'Fri, Oct 23');
});

test('formatWeekRange within a month, across months and across years', () => {
  assert.equal(Logic.formatWeekRange('2026-10-19'), 'Oct 19–23, 2026');
  assert.equal(Logic.formatWeekRange('2026-11-30'), 'Nov 30 – Dec 4, 2026');
  assert.equal(Logic.formatWeekRange('2025-12-29'), 'Dec 29, 2025 – Jan 2, 2026');
});

test('todayIso uses the local calendar date', () => {
  assert.equal(Logic.todayIso(new Date(2026, 9, 9, 23, 30)), '2026-10-09');
  assert.equal(Logic.todayIso(new Date(2026, 0, 5)), '2026-01-05');
});

test('isPastWeek is true only once the Friday has passed', () => {
  assert.equal(Logic.isPastWeek('2026-10-05', '2026-10-09'), false);
  assert.equal(Logic.isPastWeek('2026-10-05', '2026-10-10'), true);
  assert.equal(Logic.isPastWeek('2026-09-28', '2026-10-09'), true);
  assert.equal(Logic.isPastWeek('2026-10-19', '2026-10-09'), false);
});

test('formatTime', () => {
  assert.equal(Logic.formatTime(480), '8:00 AM');
  assert.equal(Logic.formatTime(690), '11:30 AM');
  assert.equal(Logic.formatTime(720), '12:00 PM');
  assert.equal(Logic.formatTime(750), '12:30 PM');
  assert.equal(Logic.formatTime(1050), '5:30 PM');
  assert.equal(Logic.formatTime(1080), '6:00 PM');
});

test('formatRange drops a repeated AM/PM', () => {
  assert.equal(Logic.formatRange(540, 60), '9:00–10:00 AM');
  assert.equal(Logic.formatRange(690, 60), '11:30 AM–12:30 PM');
  assert.equal(Logic.formatRange(1020, 60), '5:00–6:00 PM');
  assert.equal(Logic.formatRange(930, 90), '3:30–5:00 PM');
});

test('rowStarts lists 20 half-hour rows', () => {
  const rows = Logic.rowStarts();
  assert.equal(rows.length, 20);
  assert.equal(rows[0], 480);
  assert.equal(rows[1], 510);
  assert.equal(rows[19], 1050);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/logic-time.test.js`
Expected: FAIL with `Cannot find module '../src/shared/logic.js'`

- [ ] **Step 4: Write `src/shared/logic.js`**

```js
/*
 * Meeting Scheduler — rules shared by the Apps Script server and the browser.
 * Pure functions only: no Google Apps Script, DOM or Node APIs.
 * Times are minutes after midnight; dates are ISO strings (YYYY-MM-DD).
 */
var Logic = (function () {
  var api = {};

  var GRID_START = 480; // 8:00 AM
  var GRID_END = 1080; // 6:00 PM
  var STEP = 30;
  var LENGTHS = [30, 60, 90];
  var DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var TITLE_MAX = 120;
  var NAME_MAX = 60;
  var DASH = '–';

  api.GRID_START = GRID_START;
  api.GRID_END = GRID_END;
  api.STEP = STEP;
  api.LENGTHS = LENGTHS;
  api.DAY_NAMES = DAY_NAMES;
  api.TITLE_MAX = TITLE_MAX;
  api.NAME_MAX = NAME_MAX;

  // ---- Dates and times ----------------------------------------------------

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function parseIso(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso == null ? '' : iso));
    if (!m) return null;
    var y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
    var date = new Date(Date.UTC(y, mo, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo || date.getUTCDate() !== d) return null;
    return date;
  }

  function toIso(date) {
    return date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate());
  }

  function addDays(iso, n) {
    var date = parseIso(iso);
    date.setUTCDate(date.getUTCDate() + n);
    return toIso(date);
  }

  function weekStartFor(iso) {
    var date = parseIso(iso);
    if (!date) return null;
    var dow = date.getUTCDay();
    var offset = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
    return addDays(iso, offset);
  }

  function isMonday(iso) {
    var date = parseIso(iso);
    return !!date && date.getUTCDay() === 1;
  }

  function weekDates(weekStart) {
    var out = [];
    for (var i = 0; i < 5; i++) out.push(addDays(weekStart, i));
    return out;
  }

  function formatDayHeader(iso) {
    var date = parseIso(iso);
    return WEEKDAYS[date.getUTCDay()] + ', ' + MONTHS[date.getUTCMonth()] + ' ' + date.getUTCDate();
  }

  function formatWeekRange(weekStart) {
    var a = parseIso(weekStart);
    var b = parseIso(addDays(weekStart, 4));
    var am = MONTHS[a.getUTCMonth()], bm = MONTHS[b.getUTCMonth()];
    var ay = a.getUTCFullYear(), by = b.getUTCFullYear();
    if (ay !== by) {
      return am + ' ' + a.getUTCDate() + ', ' + ay + ' ' + DASH + ' ' + bm + ' ' + b.getUTCDate() + ', ' + by;
    }
    if (am !== bm) return am + ' ' + a.getUTCDate() + ' ' + DASH + ' ' + bm + ' ' + b.getUTCDate() + ', ' + by;
    return am + ' ' + a.getUTCDate() + DASH + b.getUTCDate() + ', ' + by;
  }

  function todayIso(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function isPastWeek(weekStart, today) {
    return addDays(weekStart, 4) < today;
  }

  function formatTime(min) {
    var h = Math.floor(min / 60), m = min % 60;
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + pad2(m) + ' ' + (h >= 12 ? 'PM' : 'AM');
  }

  function formatRange(startMin, lengthMin) {
    var a = formatTime(startMin), b = formatTime(startMin + lengthMin);
    if (a.slice(-2) === b.slice(-2)) return a.slice(0, -3) + DASH + b;
    return a + DASH + b;
  }

  function rowStarts() {
    var out = [];
    for (var t = GRID_START; t < GRID_END; t += STEP) out.push(t);
    return out;
  }

  api.weekStartFor = weekStartFor;
  api.isMonday = isMonday;
  api.weekDates = weekDates;
  api.formatDayHeader = formatDayHeader;
  api.formatWeekRange = formatWeekRange;
  api.todayIso = todayIso;
  api.isPastWeek = isPastWeek;
  api.formatTime = formatTime;
  api.formatRange = formatRange;
  api.rowStarts = rowStarts;

  return api;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, `# pass 14`, `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore src/shared/logic.js test/logic-time.test.js
git commit -m "feat: add project scaffold and date/time rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 2: Block placement, names and draft validation

**Files:**
- Modify: `src/shared/logic.js` (insert a section immediately above `  return api;`)
- Test: `test/logic-blocks.test.js`

**Interfaces:**
- Consumes: Task 1 internals (`formatRange`, `isMonday`, constants).
- Produces (on `Logic`):
  - `sortBlocks(blocks) → Block[]` (new array, by `day` then `startMin`)
  - `checkPlacement(blocks, day, startMin, lengthMin) → {ok: true} | {ok: false, reason: 'invalid'|'past_end'|'overlap', conflict?: Block}`
  - `placementMessage(result, lengthMin) → string`
  - `resizeBlocks(blocks, newLength) → {kept: Block[], removed: Block[]}`
  - `blockLabel(block, lengthMin) → string` e.g. `"Tue 9:00–10:00 AM"`
  - `normalizeName(value) → string`, `nameKey(value) → string`, `parseNameList(text) → string[]`, `findDuplicateNames(names) → string[]`
  - `validateDraft(draft) → string[]` (empty when valid)
- A `Block` is `{blockId: string|null, day: 0..4, startMin: number}`. A `Draft` is `{pollId: string|null, title, weekStart, lengthMin, blocks: Block[], invitees: [{inviteeId: string|null, name}]}`.

- [ ] **Step 1: Write the failing test**

`test/logic-blocks.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const Logic = require('../src/shared/logic.js');

const MON9 = { blockId: null, day: 0, startMin: 540 };
const TUE9 = { blockId: null, day: 1, startMin: 540 };

function draft(overrides) {
  return Object.assign({
    pollId: null,
    title: 'P&T Committee',
    weekStart: '2026-10-19',
    lengthMin: 60,
    blocks: [MON9, TUE9],
    invitees: [{ inviteeId: null, name: 'Ana' }, { inviteeId: null, name: 'Raj' }]
  }, overrides || {});
}

test('sortBlocks orders by day then start without mutating', () => {
  const input = [{ day: 1, startMin: 600 }, { day: 0, startMin: 900 }, { day: 1, startMin: 540 }];
  assert.deepEqual(Logic.sortBlocks(input), [{ day: 0, startMin: 900 }, { day: 1, startMin: 540 }, { day: 1, startMin: 600 }]);
  assert.equal(input[0].startMin, 600);
});

test('checkPlacement accepts free times that end by 6:00 PM', () => {
  assert.deepEqual(Logic.checkPlacement([], 0, 540, 60), { ok: true });
  assert.deepEqual(Logic.checkPlacement([], 0, 1020, 60), { ok: true });
  assert.deepEqual(Logic.checkPlacement([], 0, 990, 90), { ok: true });
  assert.deepEqual(Logic.checkPlacement([], 4, 1050, 30), { ok: true });
});

test('checkPlacement rejects blocks that run past 6:00 PM', () => {
  assert.deepEqual(Logic.checkPlacement([], 0, 1050, 60), { ok: false, reason: 'past_end' });
  assert.deepEqual(Logic.checkPlacement([], 0, 1020, 90), { ok: false, reason: 'past_end' });
});

test('checkPlacement rejects overlaps on the same day only', () => {
  const blocks = [{ blockId: 'b1', day: 1, startMin: 540 }];
  assert.deepEqual(Logic.checkPlacement(blocks, 1, 570, 60), { ok: false, reason: 'overlap', conflict: blocks[0] });
  assert.deepEqual(Logic.checkPlacement(blocks, 1, 510, 60), { ok: false, reason: 'overlap', conflict: blocks[0] });
  assert.deepEqual(Logic.checkPlacement(blocks, 1, 600, 60), { ok: true });
  assert.deepEqual(Logic.checkPlacement(blocks, 1, 480, 60), { ok: true });
  assert.deepEqual(Logic.checkPlacement(blocks, 0, 540, 60), { ok: true });
});

test('checkPlacement rejects invalid days and starts', () => {
  assert.equal(Logic.checkPlacement([], 5, 540, 60).reason, 'invalid');
  assert.equal(Logic.checkPlacement([], -1, 540, 60).reason, 'invalid');
  assert.equal(Logic.checkPlacement([], 1.5, 540, 60).reason, 'invalid');
  assert.equal(Logic.checkPlacement([], 0, 450, 60).reason, 'invalid');
  assert.equal(Logic.checkPlacement([], 0, 545, 60).reason, 'invalid');
  assert.equal(Logic.checkPlacement([], 0, '540', 60).reason, 'invalid');
  assert.equal(Logic.checkPlacement([], '0', 540, 60).reason, 'invalid');
});

test('placementMessage explains a rejected click', () => {
  assert.equal(Logic.placementMessage({ ok: false, reason: 'past_end' }, 60), 'Would end after 6:00 PM');
  assert.equal(
    Logic.placementMessage({ ok: false, reason: 'overlap', conflict: { day: 1, startMin: 540 } }, 60),
    'Overlaps the 9:00–10:00 AM block');
  assert.equal(Logic.placementMessage({ ok: false, reason: 'invalid' }, 60), 'That time is outside the calendar');
  assert.equal(Logic.placementMessage({ ok: true }, 60), '');
});

test('resizeBlocks keeps start times and drops blocks that no longer fit', () => {
  const blocks = [{ day: 1, startMin: 1020 }, { day: 0, startMin: 600 }, { day: 0, startMin: 540 }];
  assert.deepEqual(Logic.resizeBlocks(blocks, 90), {
    kept: [{ day: 0, startMin: 540 }],
    removed: [{ day: 0, startMin: 600 }, { day: 1, startMin: 1020 }]
  });
  assert.deepEqual(Logic.resizeBlocks(blocks, 30).removed, []);
});

test('blockLabel', () => {
  assert.equal(Logic.blockLabel({ day: 1, startMin: 540 }, 60), 'Tue 9:00–10:00 AM');
  assert.equal(Logic.blockLabel({ day: 4, startMin: 690 }, 60), 'Fri 11:30 AM–12:30 PM');
});

test('name helpers trim, collapse spaces and ignore case', () => {
  assert.equal(Logic.normalizeName('  Ana   María '), 'Ana María');
  assert.equal(Logic.normalizeName(null), '');
  assert.equal(Logic.nameKey('  ANA '), 'ana');
  assert.deepEqual(Logic.parseNameList('Ana\n\n  Raj \r\nLee\n'), ['Ana', 'Raj', 'Lee']);
  assert.deepEqual(Logic.parseNameList(''), []);
  assert.deepEqual(Logic.findDuplicateNames(['Ana', 'Raj', 'ana', 'Lee']), ['ana']);
  assert.deepEqual(Logic.findDuplicateNames(['Ana', 'Raj']), []);
});

test('validateDraft accepts a complete draft', () => {
  assert.deepEqual(Logic.validateDraft(draft()), []);
});

test('validateDraft lists every missing piece', () => {
  const expected = [
    'Add a title.',
    'Pick a week.',
    'Pick a meeting length of 30, 60 or 90 minutes.',
    'Add at least one time.',
    'Add at least one invitee.'
  ];
  assert.deepEqual(Logic.validateDraft({}), expected);
  assert.deepEqual(Logic.validateDraft(null), expected);
});

test('validateDraft checks the week, title length and blocks', () => {
  assert.deepEqual(Logic.validateDraft(draft({ weekStart: '2026-10-20' })), ['Pick a week.']);
  assert.deepEqual(Logic.validateDraft(draft({ title: 'x'.repeat(121) })),
    ['The title must be 120 characters or fewer.']);
  assert.deepEqual(Logic.validateDraft(draft({ blocks: [MON9, { blockId: null, day: 0, startMin: 570 }] })),
    ['Times must not overlap and must end by 6:00 PM.']);
  assert.deepEqual(Logic.validateDraft(draft({ lengthMin: 90, blocks: [{ blockId: null, day: 0, startMin: 1020 }] })),
    ['Times must not overlap and must end by 6:00 PM.']);
});

test('validateDraft checks invitee names', () => {
  assert.deepEqual(Logic.validateDraft(draft({ invitees: [{ name: 'Ana' }, { name: ' ana ' }] })),
    ['Duplicate names: ana.']);
  assert.deepEqual(Logic.validateDraft(draft({ invitees: [{ name: 'Ana' }, { name: '  ' }] })),
    ['Invitee names cannot be blank.']);
  assert.deepEqual(Logic.validateDraft(draft({ invitees: [{ name: 'y'.repeat(61) }] })),
    ['Names must be 60 characters or fewer.']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/logic-blocks.test.js`
Expected: FAIL with `TypeError: Logic.sortBlocks is not a function`

- [ ] **Step 3: Insert this section in `src/shared/logic.js` immediately above `  return api;`**

```js
  // ---- Blocks -------------------------------------------------------------

  function sortBlocks(blocks) {
    return blocks.slice().sort(function (a, b) { return a.day - b.day || a.startMin - b.startMin; });
  }

  function overlaps(aStart, bStart, lengthMin) {
    return aStart < bStart + lengthMin && bStart < aStart + lengthMin;
  }

  function checkPlacement(blocks, day, startMin, lengthMin) {
    if (typeof day !== 'number' || typeof startMin !== 'number') return { ok: false, reason: 'invalid' };
    if (!(day >= 0 && day <= 4 && day % 1 === 0)) return { ok: false, reason: 'invalid' };
    if (startMin % STEP !== 0 || startMin < GRID_START) return { ok: false, reason: 'invalid' };
    if (startMin + lengthMin > GRID_END) return { ok: false, reason: 'past_end' };
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.day === day && overlaps(b.startMin, startMin, lengthMin)) {
        return { ok: false, reason: 'overlap', conflict: b };
      }
    }
    return { ok: true };
  }

  function placementMessage(result, lengthMin) {
    if (result.reason === 'past_end') return 'Would end after 6:00 PM';
    if (result.reason === 'overlap') return 'Overlaps the ' + formatRange(result.conflict.startMin, lengthMin) + ' block';
    if (result.reason === 'invalid') return 'That time is outside the calendar';
    return '';
  }

  function resizeBlocks(blocks, newLength) {
    var kept = [], removed = [];
    sortBlocks(blocks).forEach(function (b) {
      if (checkPlacement(kept, b.day, b.startMin, newLength).ok) kept.push(b);
      else removed.push(b);
    });
    return { kept: kept, removed: removed };
  }

  function blockLabel(block, lengthMin) {
    return DAY_NAMES[block.day] + ' ' + formatRange(block.startMin, lengthMin);
  }

  // ---- Names --------------------------------------------------------------

  function normalizeName(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function nameKey(value) {
    return normalizeName(value).toLowerCase();
  }

  function parseNameList(text) {
    return String(text == null ? '' : text).split(/\r?\n/).map(normalizeName)
      .filter(function (n) { return n !== ''; });
  }

  function findDuplicateNames(names) {
    var seen = {}, dups = [];
    names.forEach(function (n) {
      var k = nameKey(n);
      if (seen[k]) dups.push(n);
      seen[k] = true;
    });
    return dups;
  }

  // ---- Draft validation ---------------------------------------------------

  function validateDraft(draft) {
    draft = draft || {};
    var errors = [];
    var title = normalizeName(draft.title);
    if (!title) errors.push('Add a title.');
    else if (title.length > TITLE_MAX) errors.push('The title must be ' + TITLE_MAX + ' characters or fewer.');
    if (!isMonday(draft.weekStart)) errors.push('Pick a week.');
    var lengthOk = LENGTHS.indexOf(draft.lengthMin) !== -1;
    if (!lengthOk) errors.push('Pick a meeting length of 30, 60 or 90 minutes.');
    var blocks = Array.isArray(draft.blocks) ? draft.blocks : [];
    if (blocks.length === 0) errors.push('Add at least one time.');
    if (lengthOk) {
      var placed = [];
      for (var i = 0; i < blocks.length; i++) {
        if (!checkPlacement(placed, blocks[i].day, blocks[i].startMin, draft.lengthMin).ok) {
          errors.push('Times must not overlap and must end by 6:00 PM.');
          break;
        }
        placed.push(blocks[i]);
      }
    }
    var invitees = Array.isArray(draft.invitees) ? draft.invitees : [];
    if (invitees.length === 0) errors.push('Add at least one invitee.');
    var names = invitees.map(function (p) { return normalizeName(p && p.name); });
    if (names.some(function (n) { return n === ''; })) errors.push('Invitee names cannot be blank.');
    if (names.some(function (n) { return n.length > NAME_MAX; })) {
      errors.push('Names must be ' + NAME_MAX + ' characters or fewer.');
    }
    var dups = findDuplicateNames(names.filter(function (n) { return n !== ''; }));
    if (dups.length) errors.push('Duplicate names: ' + dups.join(', ') + '.');
    return errors;
  }

  api.sortBlocks = sortBlocks;
  api.checkPlacement = checkPlacement;
  api.placementMessage = placementMessage;
  api.resizeBlocks = resizeBlocks;
  api.blockLabel = blockLabel;
  api.normalizeName = normalizeName;
  api.nameKey = nameKey;
  api.parseNameList = parseNameList;
  api.findDuplicateNames = findDuplicateNames;
  api.validateDraft = validateDraft;

```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, `# fail 0` (27 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shared/logic.js test/logic-blocks.test.js
git commit -m "feat: add block placement, name and draft validation rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Tallies, edit impact and ids

**Files:**
- Modify: `src/shared/logic.js` (insert a section immediately above `  return api;`)
- Test: `test/logic-results.test.js`

**Interfaces:**
- Consumes: Task 2 (`sortBlocks`, `blockLabel`).
- Produces (on `Logic`):
  - `tally(blocks, invitees, responses) → {ticks: {[blockId]: inviteeId[]}, counts: {[blockId]: number}, best: blockId[], max: number}`. Responses naming unknown blocks or invitees, and repeats, are ignored. `best` lists, in block order, every block whose count equals `max`; it is empty when `max` is 0.
  - `listNames(names) → string` (`"Ana"`, `"Ana and Raj"`, `"Ana, Raj and Lee"`)
  - `editImpact(existingBundle, draft) → {removedBlocks: [{blockId, label, names}], removedInvitees: [{inviteeId, name, responded}], weekChanged, lengthChanged, clearsAll, responders: string[], needsConfirm, bumpsVersion}`
  - `describeImpact(impact) → string[]` (non-empty exactly when `impact.needsConfirm`)
  - `idFromBytes(bytes: number[8]) → string` (8 chars from `A–Z a–z 0–9`)
  - `isValidId(id) → boolean`
  - `draftFromBundle(bundle) → Draft`
- A `Bundle` is `{poll: {pollId, title, weekStart, lengthMin, version, createdAt, updatedAt}, blocks: [{blockId, day, startMin}], invitees: [{inviteeId, name, order, respondedAt}], responses: [{inviteeId, blockId}]}` with invitees sorted by `order`.

- [ ] **Step 1: Write the failing test**

`test/logic-results.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const Logic = require('../src/shared/logic.js');

const DONE = '2026-10-09T12:00:00.000Z';

function existing() {
  return {
    poll: { pollId: 'pollAAAA', title: 'T', weekStart: '2026-10-19', lengthMin: 60, version: 1 },
    blocks: [{ blockId: 'b1', day: 0, startMin: 540 }, { blockId: 'b2', day: 1, startMin: 540 }],
    invitees: [
      { inviteeId: 'i1', name: 'Ana', order: 0, respondedAt: DONE },
      { inviteeId: 'i2', name: 'Raj', order: 1, respondedAt: DONE },
      { inviteeId: 'i3', name: 'Lee', order: 2, respondedAt: '' }
    ],
    responses: [
      { inviteeId: 'i1', blockId: 'b1' },
      { inviteeId: 'i2', blockId: 'b2' },
      { inviteeId: 'i1', blockId: 'b2' }
    ]
  };
}

test('tally counts valid ticks once and finds the best blocks', () => {
  const blocks = [{ blockId: 'b1' }, { blockId: 'b2' }, { blockId: 'b3' }];
  const invitees = [{ inviteeId: 'i1' }, { inviteeId: 'i2' }, { inviteeId: 'i3' }];
  const responses = [
    { inviteeId: 'i1', blockId: 'b1' }, { inviteeId: 'i2', blockId: 'b1' },
    { inviteeId: 'i3', blockId: 'b2' }, { inviteeId: 'i1', blockId: 'b2' },
    { inviteeId: 'ghost', blockId: 'b1' }, { inviteeId: 'i1', blockId: 'bX' },
    { inviteeId: 'i1', blockId: 'b1' }
  ];
  assert.deepEqual(Logic.tally(blocks, invitees, responses), {
    ticks: { b1: ['i1', 'i2'], b2: ['i3', 'i1'], b3: [] },
    counts: { b1: 2, b2: 2, b3: 0 },
    best: ['b1', 'b2'],
    max: 2
  });
});

test('tally has no best block when nobody ticked anything', () => {
  const result = Logic.tally([{ blockId: 'b1' }], [{ inviteeId: 'i1' }], []);
  assert.deepEqual(result.best, []);
  assert.equal(result.max, 0);
});

test('listNames', () => {
  assert.equal(Logic.listNames([]), '');
  assert.equal(Logic.listNames(['Ana']), 'Ana');
  assert.equal(Logic.listNames(['Ana', 'Raj']), 'Ana and Raj');
  assert.equal(Logic.listNames(['Ana', 'Raj', 'Lee']), 'Ana, Raj and Lee');
});

test('draftFromBundle copies the editable fields in display order', () => {
  const bundle = existing();
  bundle.invitees = [bundle.invitees[2], bundle.invitees[0], bundle.invitees[1]];
  assert.deepEqual(Logic.draftFromBundle(bundle), {
    pollId: 'pollAAAA',
    title: 'T',
    weekStart: '2026-10-19',
    lengthMin: 60,
    blocks: [{ blockId: 'b1', day: 0, startMin: 540 }, { blockId: 'b2', day: 1, startMin: 540 }],
    invitees: [{ inviteeId: 'i1', name: 'Ana' }, { inviteeId: 'i2', name: 'Raj' }, { inviteeId: 'i3', name: 'Lee' }]
  });
});

test('editImpact: no change needs nothing', () => {
  const impact = Logic.editImpact(existing(), Logic.draftFromBundle(existing()));
  assert.equal(impact.needsConfirm, false);
  assert.equal(impact.bumpsVersion, false);
  assert.equal(impact.clearsAll, false);
  assert.deepEqual(Logic.describeImpact(impact), []);
});

test('editImpact: additions need nothing', () => {
  const d = Logic.draftFromBundle(existing());
  d.blocks.push({ blockId: null, day: 2, startMin: 600 });
  d.invitees.push({ inviteeId: null, name: 'Kim' });
  const impact = Logic.editImpact(existing(), d);
  assert.equal(impact.needsConfirm, false);
  assert.equal(impact.bumpsVersion, false);
});

test('editImpact: removing a ticked block names who ticked it', () => {
  const d = Logic.draftFromBundle(existing());
  d.blocks = d.blocks.filter((b) => b.blockId !== 'b2');
  const impact = Logic.editImpact(existing(), d);
  assert.deepEqual(impact.removedBlocks, [{ blockId: 'b2', label: 'Tue 9:00–10:00 AM', names: ['Ana', 'Raj'] }]);
  assert.equal(impact.needsConfirm, true);
  assert.equal(impact.bumpsVersion, true);
  assert.deepEqual(Logic.describeImpact(impact),
    ['Ana and Raj ticked Tue 9:00–10:00 AM. Removing this time deletes those answers.']);
});

test('editImpact: removing a block ticked by one person', () => {
  const d = Logic.draftFromBundle(existing());
  d.blocks = d.blocks.filter((b) => b.blockId !== 'b1');
  assert.deepEqual(Logic.describeImpact(Logic.editImpact(existing(), d)),
    ['Ana ticked Mon 9:00–10:00 AM. Removing this time deletes that answer.']);
});

test('editImpact: removing someone who responded needs confirmation', () => {
  const d = Logic.draftFromBundle(existing());
  d.invitees = d.invitees.filter((p) => p.inviteeId !== 'i1');
  const impact = Logic.editImpact(existing(), d);
  assert.deepEqual(impact.removedInvitees, [{ inviteeId: 'i1', name: 'Ana', responded: true }]);
  assert.equal(impact.needsConfirm, true);
  assert.deepEqual(Logic.describeImpact(impact), ['Ana already responded. Removing Ana deletes their answers.']);
});

test('editImpact: removing someone who has not responded only bumps the version', () => {
  const d = Logic.draftFromBundle(existing());
  d.invitees = d.invitees.filter((p) => p.inviteeId !== 'i3');
  const impact = Logic.editImpact(existing(), d);
  assert.equal(impact.needsConfirm, false);
  assert.equal(impact.bumpsVersion, true);
  assert.deepEqual(Logic.describeImpact(impact), []);
});

test('editImpact: changing the length clears every answer', () => {
  const d = Logic.draftFromBundle(existing());
  d.lengthMin = 30;
  const impact = Logic.editImpact(existing(), d);
  assert.equal(impact.clearsAll, true);
  assert.equal(impact.lengthChanged, true);
  assert.deepEqual(impact.responders, ['Ana', 'Raj']);
  assert.equal(impact.needsConfirm, true);
  assert.deepEqual(Logic.describeImpact(impact), [
    'You changed the meeting length. All answers from Ana and Raj will be cleared, and they will need to respond again.'
  ]);
});

test('editImpact: changing the week and the length', () => {
  const d = Logic.draftFromBundle(existing());
  d.lengthMin = 30;
  d.weekStart = '2026-10-26';
  assert.deepEqual(Logic.describeImpact(Logic.editImpact(existing(), d)), [
    'You changed the week and the meeting length. All answers from Ana and Raj will be cleared, and they will need to respond again.'
  ]);
});

test('editImpact: changing the week before anyone responded needs no confirmation', () => {
  const bundle = existing();
  bundle.invitees.forEach((p) => { p.respondedAt = ''; });
  bundle.responses = [];
  const d = Logic.draftFromBundle(bundle);
  d.weekStart = '2026-10-26';
  const impact = Logic.editImpact(bundle, d);
  assert.equal(impact.clearsAll, true);
  assert.equal(impact.weekChanged, true);
  assert.equal(impact.needsConfirm, false);
  assert.equal(impact.bumpsVersion, true);
  assert.deepEqual(Logic.describeImpact(impact), []);
});

test('idFromBytes maps bytes onto 62 characters', () => {
  assert.equal(Logic.idFromBytes([0, 1, 2, 3, 4, 5, 6, 7]), 'ABCDEFGH');
  assert.equal(Logic.idFromBytes([25, 26, 51, 52, 61, 62, 255, 124]), 'Zaz09AHA');
});

test('isValidId', () => {
  assert.equal(Logic.isValidId('ABCDefg9'), true);
  assert.equal(Logic.isValidId('ABC'), false);
  assert.equal(Logic.isValidId('ABCDEFG!'), false);
  assert.equal(Logic.isValidId('ABCDEFGHI'), false);
  assert.equal(Logic.isValidId(12345678), false);
  assert.equal(Logic.isValidId(null), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/logic-results.test.js`
Expected: FAIL with `TypeError: Logic.tally is not a function`

- [ ] **Step 3: Insert this section in `src/shared/logic.js` immediately above `  return api;`**

```js
  // ---- Results ------------------------------------------------------------

  function tally(blocks, invitees, responses) {
    var known = {};
    invitees.forEach(function (p) { known[p.inviteeId] = true; });
    var ticks = {}, counts = {};
    blocks.forEach(function (b) { ticks[b.blockId] = []; });
    responses.forEach(function (r) {
      var list = ticks[r.blockId];
      if (list && known[r.inviteeId] && list.indexOf(r.inviteeId) === -1) list.push(r.inviteeId);
    });
    var max = 0;
    blocks.forEach(function (b) {
      counts[b.blockId] = ticks[b.blockId].length;
      if (counts[b.blockId] > max) max = counts[b.blockId];
    });
    var best = max === 0 ? [] : blocks
      .filter(function (b) { return counts[b.blockId] === max; })
      .map(function (b) { return b.blockId; });
    return { ticks: ticks, counts: counts, best: best, max: max };
  }

  function listNames(names) {
    if (names.length <= 1) return names.join('');
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  // ---- Editing a shared poll ----------------------------------------------

  function editImpact(existing, draft) {
    var poll = existing.poll;
    var keepBlock = {}, keepInvitee = {};
    (draft.blocks || []).forEach(function (b) { if (b.blockId) keepBlock[b.blockId] = true; });
    (draft.invitees || []).forEach(function (p) { if (p.inviteeId) keepInvitee[p.inviteeId] = true; });

    var removedBlocks = existing.blocks.filter(function (b) { return !keepBlock[b.blockId]; }).map(function (b) {
      var names = existing.invitees.filter(function (p) {
        return existing.responses.some(function (r) { return r.blockId === b.blockId && r.inviteeId === p.inviteeId; });
      }).map(function (p) { return p.name; });
      return { blockId: b.blockId, label: blockLabel(b, poll.lengthMin), names: names };
    });
    var removedInvitees = existing.invitees.filter(function (p) { return !keepInvitee[p.inviteeId]; }).map(function (p) {
      return { inviteeId: p.inviteeId, name: p.name, responded: !!p.respondedAt };
    });
    var weekChanged = draft.weekStart !== poll.weekStart;
    var lengthChanged = draft.lengthMin !== poll.lengthMin;
    var clearsAll = weekChanged || lengthChanged;
    var responders = existing.invitees.filter(function (p) { return !!p.respondedAt; }).map(function (p) { return p.name; });
    var needsConfirm = (clearsAll && responders.length > 0) ||
      removedBlocks.some(function (b) { return b.names.length > 0; }) ||
      removedInvitees.some(function (p) { return p.responded; });
    return {
      removedBlocks: removedBlocks,
      removedInvitees: removedInvitees,
      weekChanged: weekChanged,
      lengthChanged: lengthChanged,
      clearsAll: clearsAll,
      responders: responders,
      needsConfirm: needsConfirm,
      bumpsVersion: clearsAll || removedBlocks.length > 0 || removedInvitees.length > 0
    };
  }

  function describeImpact(impact) {
    if (impact.clearsAll) {
      if (!impact.responders.length) return [];
      var what = impact.weekChanged && impact.lengthChanged ? 'the week and the meeting length'
        : impact.weekChanged ? 'the week' : 'the meeting length';
      return ['You changed ' + what + '. All answers from ' + listNames(impact.responders) +
        ' will be cleared, and they will need to respond again.'];
    }
    var lines = [];
    impact.removedBlocks.forEach(function (b) {
      if (!b.names.length) return;
      lines.push(listNames(b.names) + ' ticked ' + b.label + '. Removing this time deletes ' +
        (b.names.length === 1 ? 'that answer.' : 'those answers.'));
    });
    impact.removedInvitees.forEach(function (p) {
      if (p.responded) lines.push(p.name + ' already responded. Removing ' + p.name + ' deletes their answers.');
    });
    return lines;
  }

  // ---- Ids and drafts -----------------------------------------------------

  var ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  function idFromBytes(bytes) {
    var out = '';
    for (var i = 0; i < 8; i++) out += ID_ALPHABET.charAt(bytes[i] % ID_ALPHABET.length);
    return out;
  }

  function isValidId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9]{8}$/.test(id);
  }

  function draftFromBundle(bundle) {
    return {
      pollId: bundle.poll.pollId,
      title: bundle.poll.title,
      weekStart: bundle.poll.weekStart,
      lengthMin: bundle.poll.lengthMin,
      blocks: sortBlocks(bundle.blocks).map(function (b) {
        return { blockId: b.blockId, day: b.day, startMin: b.startMin };
      }),
      invitees: bundle.invitees.slice().sort(function (a, b) { return a.order - b.order; }).map(function (p) {
        return { inviteeId: p.inviteeId, name: p.name };
      })
    };
  }

  api.tally = tally;
  api.listNames = listNames;
  api.editImpact = editImpact;
  api.describeImpact = describeImpact;
  api.idFromBytes = idFromBytes;
  api.isValidId = isValidId;
  api.draftFromBundle = draftFromBundle;

```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, `# fail 0` (42 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shared/logic.js test/logic-results.test.js
git commit -m "feat: add tallies, edit-impact rules and ids" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Poll service over a table store

**Files:**
- Create: `src/shared/service.js`, `test/helpers.js`
- Test: `test/service.test.js`

**Interfaces:**
- Consumes: `Logic` (Tasks 1–3), resolved lazily: the global `Logic` when defined (Apps Script, browser), otherwise `require('./logic.js')` (Node).
- Produces (global/exported `Service`):
  - `Service.ServiceError(code: string, message?: string)`; instances have `code`, `message`, `isServiceError: true`. Codes used: `invalid`, `not_found`, `stale`, `server_error`; later tasks add `not_owner` and `sheet_missing`.
  - `Service.envelope(fn) → {ok: true, data} | {ok: false, code, message}`
  - `Service.create(store, deps)` where `store = {read() → Tables, write(tables)}`, `Tables = {polls, blocks, invitees, responses}` (arrays of row objects that all carry `pollId`), `deps = {newId() → string, now() → ISO string}`. Returns:
    - `listPolls() → [{pollId, title, weekStart, lengthMin, invitedCount, respondedCount, createdAt, updatedAt}]`, newest `createdAt` first
    - `getPoll(pollId) → Bundle` (throws `not_found`)
    - `savePoll(draft) → {pollId, version}` (creates when `draft.pollId` is null, otherwise edits)
    - `deletePoll(pollId) → {pollId}`
    - `getPublicPoll(pollId) → {pollId, title, weekStart, lengthMin, version, blocks: [{blockId, day, startMin}], invitees: [{inviteeId, name, responded}], responses: [{inviteeId, blockId}]}`
    - `saveResponse(pollId, inviteeId, blockIds, version) → {savedAt}`
- Row shapes written to the store:
  - polls: `{pollId, title, weekStart, lengthMin, version, createdAt, updatedAt}`
  - blocks: `{pollId, blockId, day, startMin}`
  - invitees: `{pollId, inviteeId, name, order, respondedAt}` (`respondedAt` is `''` until the first save)
  - responses: `{pollId, inviteeId, blockId}`
- `test/helpers.js` exports `createMemoryStore(initial?)` (adds `peek()`), `fakeDeps()` (ids `id000001`, `id000002`, …; timestamps `2026-10-09T12:00:01.000Z`, `…:02.000Z`, …), `sampleDraft(overrides?)`.

- [ ] **Step 1: Write the test helpers**

`test/helpers.js`:
```js
/* Shared test helpers: an in-memory table store, deterministic ids and clock, a sample draft. */
function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

function createMemoryStore(initial) {
  var tables = clone(initial || { polls: [], blocks: [], invitees: [], responses: [] });
  return {
    read: function () { return clone(tables); },
    write: function (next) { tables = clone(next); },
    peek: function () { return clone(tables); }
  };
}

function fakeDeps() {
  var ids = 0, ticks = 0;
  return {
    newId: function () { ids += 1; return 'id' + String(ids).padStart(6, '0'); },
    now: function () { ticks += 1; return '2026-10-09T12:00:' + String(ticks).padStart(2, '0') + '.000Z'; }
  };
}

function sampleDraft(overrides) {
  return Object.assign({
    pollId: null,
    title: 'P&T Committee',
    weekStart: '2026-10-19',
    lengthMin: 60,
    blocks: [{ blockId: null, day: 1, startMin: 540 }, { blockId: null, day: 0, startMin: 540 }],
    invitees: [{ inviteeId: null, name: 'Ana' }, { inviteeId: null, name: 'Raj' }, { inviteeId: null, name: 'Lee' }]
  }, overrides || {});
}

module.exports = { clone, createMemoryStore, fakeDeps, sampleDraft };
```

With `sampleDraft()` saved into an empty store using `fakeDeps()`, ids are assigned in this order: poll `id000001`; blocks after sorting, Mon 9:00 `id000002`, Tue 9:00 `id000003`; invitees Ana `id000004`, Raj `id000005`, Lee `id000006`.

- [ ] **Step 2: Write the failing test**

`test/service.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const Logic = require('../src/shared/logic.js');
const Service = require('../src/shared/service.js');
const { createMemoryStore, fakeDeps, sampleDraft } = require('./helpers.js');

const ANA = 'id000004', RAJ = 'id000005', LEE = 'id000006';
const MON = 'id000002', TUE = 'id000003';

function setup() {
  const store = createMemoryStore();
  const service = Service.create(store, fakeDeps());
  return { store, service };
}

function withCode(code) {
  return (err) => err && err.isServiceError === true && err.code === code;
}

function sharedPollWithAnswers() {
  const { store, service } = setup();
  const { pollId } = service.savePoll(sampleDraft());
  service.saveResponse(pollId, ANA, [MON, TUE], 1);
  service.saveResponse(pollId, RAJ, [TUE], 1);
  const draft = Logic.draftFromBundle(service.getPoll(pollId));
  return { store, service, pollId, draft };
}

test('savePoll creates a poll with ids, sorted blocks and ordered invitees', () => {
  const { store, service } = setup();
  assert.deepEqual(service.savePoll(sampleDraft({ title: '  P&T   Committee ' })), { pollId: 'id000001', version: 1 });
  const t = store.peek();
  assert.deepEqual(t.polls, [{
    pollId: 'id000001', title: 'P&T Committee', weekStart: '2026-10-19', lengthMin: 60, version: 1,
    createdAt: '2026-10-09T12:00:01.000Z', updatedAt: '2026-10-09T12:00:01.000Z'
  }]);
  assert.deepEqual(t.blocks, [
    { pollId: 'id000001', blockId: MON, day: 0, startMin: 540 },
    { pollId: 'id000001', blockId: TUE, day: 1, startMin: 540 }
  ]);
  assert.deepEqual(t.invitees, [
    { pollId: 'id000001', inviteeId: ANA, name: 'Ana', order: 0, respondedAt: '' },
    { pollId: 'id000001', inviteeId: RAJ, name: 'Raj', order: 1, respondedAt: '' },
    { pollId: 'id000001', inviteeId: LEE, name: 'Lee', order: 2, respondedAt: '' }
  ]);
  assert.deepEqual(t.responses, []);
});

test('savePoll rejects an invalid draft without writing', () => {
  const { store, service } = setup();
  assert.throws(() => service.savePoll(sampleDraft({ title: '', blocks: [] })),
    (err) => withCode('invalid')(err) && err.message === 'Add a title. Add at least one time.');
  assert.deepEqual(store.peek().polls, []);
});

test('listPolls reports counts, newest first', () => {
  const { service } = setup();
  const first = service.savePoll(sampleDraft({ title: 'First' }));
  service.savePoll(sampleDraft({ title: 'Second' }));
  service.saveResponse(first.pollId, ANA, [MON], 1);
  assert.deepEqual(service.listPolls().map((p) => [p.title, p.invitedCount, p.respondedCount]),
    [['Second', 3, 0], ['First', 3, 1]]);
});

test('getPublicPoll returns only what invitees need', () => {
  const { service } = setup();
  const { pollId } = service.savePoll(sampleDraft());
  service.saveResponse(pollId, RAJ, [TUE], 1);
  assert.deepEqual(service.getPublicPoll(pollId), {
    pollId, title: 'P&T Committee', weekStart: '2026-10-19', lengthMin: 60, version: 1,
    blocks: [{ blockId: MON, day: 0, startMin: 540 }, { blockId: TUE, day: 1, startMin: 540 }],
    invitees: [
      { inviteeId: ANA, name: 'Ana', responded: false },
      { inviteeId: RAJ, name: 'Raj', responded: true },
      { inviteeId: LEE, name: 'Lee', responded: false }
    ],
    responses: [{ inviteeId: RAJ, blockId: TUE }]
  });
});

test('unknown or malformed poll ids are not_found', () => {
  const { service } = setup();
  assert.throws(() => service.getPublicPoll('zzzzzzzz'), withCode('not_found'));
  assert.throws(() => service.getPublicPoll('../etc'), withCode('not_found'));
  assert.throws(() => service.getPoll(''), withCode('not_found'));
  assert.throws(() => service.deletePoll(undefined), withCode('not_found'));
});

test('saveResponse replaces the invitee’s ticks, removes repeats and marks them responded', () => {
  const { store, service } = setup();
  const { pollId } = service.savePoll(sampleDraft());
  service.saveResponse(pollId, ANA, [MON, TUE, MON], 1);
  assert.equal(store.peek().responses.length, 2);
  assert.deepEqual(service.saveResponse(pollId, ANA, [TUE], 1), { savedAt: '2026-10-09T12:00:03.000Z' });
  const t = store.peek();
  assert.deepEqual(t.responses, [{ pollId, inviteeId: ANA, blockId: TUE }]);
  assert.equal(t.invitees.find((p) => p.inviteeId === ANA).respondedAt, '2026-10-09T12:00:03.000Z');
});

test('saving no ticks still counts as responded', () => {
  const { store, service } = setup();
  const { pollId } = service.savePoll(sampleDraft());
  service.saveResponse(pollId, LEE, [], 1);
  const t = store.peek();
  assert.deepEqual(t.responses, []);
  assert.ok(t.invitees.find((p) => p.inviteeId === LEE).respondedAt);
});

test('saveResponse rejects stale versions, unknown invitees, unknown blocks and bad input', () => {
  const { service } = setup();
  const { pollId } = service.savePoll(sampleDraft());
  assert.throws(() => service.saveResponse(pollId, ANA, [], 2), withCode('stale'));
  assert.throws(() => service.saveResponse(pollId, 'id999999', [], 1), withCode('stale'));
  assert.throws(() => service.saveResponse(pollId, ANA, ['id999999'], 1), withCode('stale'));
  assert.throws(() => service.saveResponse('id999999', ANA, [], 1), withCode('not_found'));
  assert.throws(() => service.saveResponse(pollId, ANA, MON, 1), withCode('invalid'));
});

test('editing: adding a block and an invitee keeps answers and the version', () => {
  const { store, service, pollId, draft } = sharedPollWithAnswers();
  draft.blocks.push({ blockId: null, day: 2, startMin: 600 });
  draft.invitees.push({ inviteeId: null, name: 'Kim' });
  assert.deepEqual(service.savePoll(draft), { pollId, version: 1 });
  const t = store.peek();
  assert.equal(t.responses.length, 3);
  assert.equal(t.blocks.length, 3);
  assert.deepEqual(t.invitees.map((p) => p.name), ['Ana', 'Raj', 'Lee', 'Kim']);
  assert.equal(t.polls[0].createdAt, '2026-10-09T12:00:01.000Z');
});

test('editing: renaming an invitee keeps their answers', () => {
  const { store, service, draft } = sharedPollWithAnswers();
  draft.invitees[0].name = 'Ana Gómez';
  assert.equal(service.savePoll(draft).version, 1);
  const t = store.peek();
  assert.equal(t.invitees[0].name, 'Ana Gómez');
  assert.equal(t.responses.filter((r) => r.inviteeId === ANA).length, 2);
});

test('editing: removing a block deletes its answers and bumps the version', () => {
  const { store, service, pollId, draft } = sharedPollWithAnswers();
  draft.blocks = draft.blocks.filter((b) => b.blockId !== TUE);
  assert.equal(service.savePoll(draft).version, 2);
  const t = store.peek();
  assert.deepEqual(t.responses, [{ pollId, inviteeId: ANA, blockId: MON }]);
  assert.ok(t.invitees.find((p) => p.inviteeId === RAJ).respondedAt);
  assert.equal(service.getPublicPoll(pollId).version, 2);
});

test('editing: removing an invitee deletes their answers', () => {
  const { store, service, pollId, draft } = sharedPollWithAnswers();
  draft.invitees = draft.invitees.filter((p) => p.inviteeId !== ANA);
  assert.equal(service.savePoll(draft).version, 2);
  const t = store.peek();
  assert.deepEqual(t.responses, [{ pollId, inviteeId: RAJ, blockId: TUE }]);
  assert.deepEqual(t.invitees.map((p) => [p.name, p.order]), [['Raj', 0], ['Lee', 1]]);
});

test('editing: changing the length clears every answer but keeps block ids', () => {
  const { store, service, draft } = sharedPollWithAnswers();
  draft.lengthMin = 30;
  assert.equal(service.savePoll(draft).version, 2);
  const t = store.peek();
  assert.deepEqual(t.responses, []);
  assert.ok(t.invitees.every((p) => p.respondedAt === ''));
  assert.deepEqual(t.blocks.map((b) => b.blockId), [MON, TUE]);
});

test('editing: changing the week clears every answer', () => {
  const { store, service, draft } = sharedPollWithAnswers();
  draft.weekStart = '2026-10-26';
  assert.equal(service.savePoll(draft).version, 2);
  const t = store.peek();
  assert.deepEqual(t.responses, []);
  assert.equal(t.polls[0].weekStart, '2026-10-26');
});

test('editing: unknown or repeated ids in a draft are rejected', () => {
  const a = sharedPollWithAnswers();
  a.draft.blocks[0].blockId = 'id999999';
  assert.throws(() => a.service.savePoll(a.draft), withCode('invalid'));

  const b = sharedPollWithAnswers();
  b.draft.invitees[0].inviteeId = 'id999999';
  assert.throws(() => b.service.savePoll(b.draft), withCode('invalid'));

  const c = sharedPollWithAnswers();
  c.draft.invitees.push({ inviteeId: ANA, name: 'Another Ana' });
  assert.throws(() => c.service.savePoll(c.draft), withCode('invalid'));

  const d = sharedPollWithAnswers();
  d.draft.blocks.push({ blockId: MON, day: 3, startMin: 600 });
  assert.throws(() => d.service.savePoll(d.draft), withCode('invalid'));
});

test('editing a poll that no longer exists is not_found', () => {
  const { service, pollId, draft } = sharedPollWithAnswers();
  service.deletePoll(pollId);
  assert.throws(() => service.savePoll(draft), withCode('not_found'));
});

test('deletePoll removes every row for that poll only', () => {
  const { store, service } = setup();
  const a = service.savePoll(sampleDraft({ title: 'A' }));
  const b = service.savePoll(sampleDraft({ title: 'B' }));
  service.saveResponse(a.pollId, ANA, [MON], 1);
  assert.deepEqual(service.deletePoll(a.pollId), { pollId: a.pollId });
  const t = store.peek();
  assert.deepEqual(t.polls.map((p) => p.pollId), [b.pollId]);
  assert.ok(t.blocks.every((r) => r.pollId === b.pollId));
  assert.ok(t.invitees.every((r) => r.pollId === b.pollId));
  assert.deepEqual(t.responses, []);
  assert.throws(() => service.deletePoll(a.pollId), withCode('not_found'));
});

test('envelope wraps results and errors', () => {
  assert.deepEqual(Service.envelope(() => 42), { ok: true, data: 42 });
  assert.deepEqual(Service.envelope(() => { throw new Service.ServiceError('stale', 'Changed'); }),
    { ok: false, code: 'stale', message: 'Changed' });
  assert.deepEqual(Service.envelope(() => { throw new Service.ServiceError('not_found'); }),
    { ok: false, code: 'not_found', message: 'not_found' });
  assert.deepEqual(Service.envelope(() => { throw new Error('boom'); }),
    { ok: false, code: 'server_error', message: 'boom' });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/service.test.js`
Expected: FAIL with `Cannot find module '../src/shared/service.js'`

- [ ] **Step 4: Write `src/shared/service.js`**

```js
/*
 * Meeting Scheduler — poll operations over a table store. Runs on the Apps
 * Script server, in Node tests and in the local preview.
 *
 * store: { read(): Tables, write(tables) }
 * Tables: { polls: [], blocks: [], invitees: [], responses: [] }
 * deps:  { newId(): 8-character id, now(): ISO timestamp }
 */
var Service = (function () {
  var logicRef = null;

  // Resolved on first use: Apps Script does not guarantee file load order.
  function L() {
    if (!logicRef) logicRef = typeof Logic !== 'undefined' ? Logic : require('./logic.js');
    return logicRef;
  }

  function ServiceError(code, message) {
    this.name = 'ServiceError';
    this.code = code;
    this.message = message || code;
    this.isServiceError = true;
  }
  ServiceError.prototype = Object.create(Error.prototype);
  ServiceError.prototype.constructor = ServiceError;

  function envelope(fn) {
    try {
      return { ok: true, data: fn() };
    } catch (err) {
      if (err && err.isServiceError) return { ok: false, code: err.code, message: err.message };
      return { ok: false, code: 'server_error', message: String((err && err.message) || err) };
    }
  }

  function forPoll(rows, pollId) {
    return rows.filter(function (r) { return r.pollId === pollId; });
  }

  function notForPoll(rows, pollId) {
    return rows.filter(function (r) { return r.pollId !== pollId; });
  }

  function indexBy(rows, key) {
    var out = {};
    rows.forEach(function (r) { out[r[key]] = r; });
    return out;
  }

  function pick(rows, keys) {
    return rows.map(function (r) {
      var o = {};
      keys.forEach(function (k) { o[k] = r[k]; });
      return o;
    });
  }

  function bundleFrom(tables, pollId) {
    if (!L().isValidId(pollId)) return null;
    var poll = forPoll(tables.polls, pollId)[0];
    if (!poll) return null;
    return {
      poll: poll,
      blocks: L().sortBlocks(forPoll(tables.blocks, pollId)),
      invitees: forPoll(tables.invitees, pollId).sort(function (a, b) { return a.order - b.order; }),
      responses: forPoll(tables.responses, pollId)
    };
  }

  function create(store, deps) {
    function requireBundle(tables, pollId) {
      var bundle = bundleFrom(tables, pollId);
      if (!bundle) throw new ServiceError('not_found', 'This poll is no longer available.');
      return bundle;
    }

    function uniqueId(taken) {
      for (var i = 0; i < 20; i++) {
        var id = deps.newId();
        if (!taken[id]) {
          taken[id] = true;
          return id;
        }
      }
      throw new ServiceError('server_error', 'Could not create a unique id.');
    }

    function stale() {
      return new ServiceError('stale', 'The organizer updated this poll.');
    }

    function rejectRepeat(seen, id, what) {
      if (!id) return;
      if (seen[id]) throw new ServiceError('invalid', 'Repeated ' + what + '.');
      seen[id] = true;
    }

    function listPolls() {
      var t = store.read();
      return t.polls.map(function (p) {
        var invitees = forPoll(t.invitees, p.pollId);
        return {
          pollId: p.pollId,
          title: p.title,
          weekStart: p.weekStart,
          lengthMin: p.lengthMin,
          invitedCount: invitees.length,
          respondedCount: invitees.filter(function (x) { return !!x.respondedAt; }).length,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt
        };
      }).sort(function (a, b) {
        return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
      });
    }

    function getPoll(pollId) {
      return requireBundle(store.read(), pollId);
    }

    function savePoll(draft) {
      draft = draft || {};
      var errors = L().validateDraft(draft);
      if (errors.length) throw new ServiceError('invalid', errors.join(' '));
      var t = store.read();
      var now = deps.now();
      var existing = draft.pollId ? requireBundle(t, draft.pollId) : null;
      var impact = existing ? L().editImpact(existing, draft) : null;
      var pollId = existing ? existing.poll.pollId : uniqueId(indexBy(t.polls, 'pollId'));

      var oldBlocks = existing ? indexBy(existing.blocks, 'blockId') : {};
      var takenBlockIds = existing ? indexBy(existing.blocks, 'blockId') : {};
      var seenBlocks = {};
      var blocks = L().sortBlocks(draft.blocks).map(function (b) {
        rejectRepeat(seenBlocks, b.blockId, 'time block');
        if (b.blockId && !oldBlocks[b.blockId]) throw new ServiceError('invalid', 'Unknown time block.');
        return { pollId: pollId, blockId: b.blockId || uniqueId(takenBlockIds), day: b.day, startMin: b.startMin };
      });

      var oldInvitees = existing ? indexBy(existing.invitees, 'inviteeId') : {};
      var takenInviteeIds = existing ? indexBy(existing.invitees, 'inviteeId') : {};
      var seenInvitees = {};
      var invitees = draft.invitees.map(function (p, i) {
        rejectRepeat(seenInvitees, p.inviteeId, 'invitee');
        if (p.inviteeId && !oldInvitees[p.inviteeId]) throw new ServiceError('invalid', 'Unknown invitee.');
        var prev = p.inviteeId ? oldInvitees[p.inviteeId] : null;
        return {
          pollId: pollId,
          inviteeId: p.inviteeId || uniqueId(takenInviteeIds),
          name: L().normalizeName(p.name),
          order: i,
          respondedAt: prev && !impact.clearsAll ? prev.respondedAt : ''
        };
      });

      var responses = [];
      if (existing && !impact.clearsAll) {
        var keepBlocks = indexBy(blocks, 'blockId');
        var keepInvitees = indexBy(invitees, 'inviteeId');
        responses = existing.responses.filter(function (r) {
          return keepBlocks[r.blockId] && keepInvitees[r.inviteeId];
        });
      }

      var version = existing ? existing.poll.version + (impact.bumpsVersion ? 1 : 0) : 1;
      var poll = {
        pollId: pollId,
        title: L().normalizeName(draft.title),
        weekStart: draft.weekStart,
        lengthMin: draft.lengthMin,
        version: version,
        createdAt: existing ? existing.poll.createdAt : now,
        updatedAt: now
      };
      store.write({
        polls: notForPoll(t.polls, pollId).concat([poll]),
        blocks: notForPoll(t.blocks, pollId).concat(blocks),
        invitees: notForPoll(t.invitees, pollId).concat(invitees),
        responses: notForPoll(t.responses, pollId).concat(responses)
      });
      return { pollId: pollId, version: version };
    }

    function deletePoll(pollId) {
      var t = store.read();
      requireBundle(t, pollId);
      store.write({
        polls: notForPoll(t.polls, pollId),
        blocks: notForPoll(t.blocks, pollId),
        invitees: notForPoll(t.invitees, pollId),
        responses: notForPoll(t.responses, pollId)
      });
      return { pollId: pollId };
    }

    function getPublicPoll(pollId) {
      var b = requireBundle(store.read(), pollId);
      return {
        pollId: b.poll.pollId,
        title: b.poll.title,
        weekStart: b.poll.weekStart,
        lengthMin: b.poll.lengthMin,
        version: b.poll.version,
        blocks: pick(b.blocks, ['blockId', 'day', 'startMin']),
        invitees: b.invitees.map(function (p) {
          return { inviteeId: p.inviteeId, name: p.name, responded: !!p.respondedAt };
        }),
        responses: pick(b.responses, ['inviteeId', 'blockId'])
      };
    }

    function saveResponse(pollId, inviteeId, blockIds, version) {
      if (!Array.isArray(blockIds)) throw new ServiceError('invalid', 'Expected a list of times.');
      var t = store.read();
      var bundle = requireBundle(t, pollId);
      if (version !== bundle.poll.version) throw stale();
      if (!bundle.invitees.some(function (p) { return p.inviteeId === inviteeId; })) throw stale();
      var known = indexBy(bundle.blocks, 'blockId');
      var chosen = [];
      blockIds.forEach(function (id) {
        if (!known[id]) throw stale();
        if (chosen.indexOf(id) === -1) chosen.push(id);
      });
      var now = deps.now();
      function mine(row) { return row.pollId === pollId && row.inviteeId === inviteeId; }
      store.write({
        polls: t.polls,
        blocks: t.blocks,
        invitees: t.invitees.map(function (p) { return mine(p) ? Object.assign({}, p, { respondedAt: now }) : p; }),
        responses: t.responses.filter(function (r) { return !mine(r); }).concat(chosen.map(function (id) {
          return { pollId: pollId, inviteeId: inviteeId, blockId: id };
        }))
      });
      return { savedAt: now };
    }

    return {
      listPolls: listPolls,
      getPoll: getPoll,
      savePoll: savePoll,
      deletePoll: deletePoll,
      getPublicPoll: getPublicPoll,
      saveResponse: saveResponse
    };
  }

  return { create: create, envelope: envelope, ServiceError: ServiceError };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Service;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, `# fail 0` (60 tests)

- [ ] **Step 6: Commit**

```bash
git add src/shared/service.js test/helpers.js test/service.test.js
git commit -m "feat: add poll service over a table store" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Sheet store, server entry points and manifest

**Files:**
- Create: `src/appsscript.json`, `src/server/sheet_store.js`, `src/server/main.js`
- Test: `test/sheet-store.test.js`, `test/main.test.js`

**Interfaces:**
- Consumes: `Service.create`, `Service.envelope`, `Service.ServiceError` (Task 4); `Logic.idFromBytes` (Task 3).
- Produces:
  - `SheetStore.open() → {read, write}` (creates "Meeting Scheduler Data" on first use and stores its id in Script Property `DATA_SHEET_ID`; throws `ServiceError('sheet_missing')` when the stored id cannot be opened)
  - `SheetStore.createNew() → {read, write}` (forgets the old id and creates a new sheet)
  - `SheetStore._codec = {TABS, encodeCell, decodeCell, rowToObject, objectToRow}` (pure; tested in Node)
  - Apps Script globals in `main.js`:
    - `doGet(e)`: `?poll=<id>` → template `invitee` with boot `{pollId}`, title `Meeting availability`; otherwise owner → template `organizer` with boot `{baseUrl, adminKey}`, title `Meeting Scheduler`; otherwise template `message` with boot `{title: 'Organizer only', message: 'This page is for the organizer only.'}`
    - `include(name) → string` (used by templates as `<?!= include('name') ?>`)
    - Organizer API (first argument is the admin key, `''` when unused): `apiListPolls(key)`, `apiGetPoll(key, pollId)`, `apiSavePoll(key, draft)`, `apiDeletePoll(key, pollId)`, `apiCreateDataSheet(key)`
    - Invitee API: `apiGetPublicPoll(pollId)`, `apiSaveResponse(pollId, inviteeId, blockIds, version)`
    - Every `api*` function returns `Service.envelope` output: `{ok: true, data}` or `{ok: false, code, message}`. Non-owners get code `not_owner`.
    - `setupAdminKey()` (run by hand from the Apps Script editor)
  - Each page template receives `bootJson` (JSON with every `<` escaped as `\u003c`) and must contain the exact line `<script>window.BOOT = <?!= bootJson ?>;</script>`.
  - Script Properties used: `DATA_SHEET_ID`, `ADMIN_KEY`, `BASE_URL`.

- [ ] **Step 1: Write the failing codec test**

`test/sheet-store.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const SheetStore = require('../src/server/sheet_store.js');

const C = SheetStore._codec;

test('tabs and columns match the data model', () => {
  assert.deepEqual(C.TABS.map((t) => [t.name, t.key, t.cols]), [
    ['Polls', 'polls', ['pollId', 'title', 'weekStart', 'lengthMin', 'version', 'createdAt', 'updatedAt']],
    ['Blocks', 'blocks', ['pollId', 'blockId', 'day', 'startMin']],
    ['Invitees', 'invitees', ['pollId', 'inviteeId', 'name', 'order', 'respondedAt']],
    ['Responses', 'responses', ['pollId', 'inviteeId', 'blockId']]
  ]);
});

test('numbers are stored as text and read back as numbers', () => {
  assert.equal(C.encodeCell('startMin', 540), '540');
  assert.equal(C.decodeCell('startMin', '540'), 540);
  assert.equal(C.decodeCell('version', 3), 3);
});

test('text a spreadsheet would treat as a formula is escaped and restored', () => {
  for (const s of ['=SUM(A1)', '+1', '-2', '@me']) {
    const encoded = C.encodeCell('name', s);
    assert.equal(encoded, "'" + s);
    assert.equal(C.decodeCell('name', encoded), s);
    assert.equal(C.decodeCell('name', s), s);
  }
});

test('ordinary text and apostrophes are untouched', () => {
  assert.equal(C.encodeCell('name', "O'Brien"), "O'Brien");
  assert.equal(C.decodeCell('name', "'Ana"), "'Ana");
  assert.equal(C.encodeCell('respondedAt', ''), '');
  assert.equal(C.encodeCell('respondedAt', null), '');
});

test('rows round-trip for every tab', () => {
  const samples = {
    polls: { pollId: 'abcdEFGH', title: '=Budget', weekStart: '2026-10-19', lengthMin: 60, version: 3,
      createdAt: '2026-10-09T12:00:00.000Z', updatedAt: '2026-10-09T12:05:00.000Z' },
    blocks: { pollId: 'abcdEFGH', blockId: 'blk00001', day: 4, startMin: 1050 },
    invitees: { pollId: 'abcdEFGH', inviteeId: 'inv00001', name: 'Ana G\u00f3mez', order: 2, respondedAt: '' },
    responses: { pollId: 'abcdEFGH', inviteeId: 'inv00001', blockId: 'blk00001' }
  };
  C.TABS.forEach((tab) => {
    const row = C.objectToRow(tab.cols, samples[tab.key]);
    assert.ok(row.every((v) => typeof v === 'string'), tab.name);
    assert.deepEqual(C.rowToObject(tab.cols, row), samples[tab.key]);
  });
});
```

- [ ] **Step 2: Write the failing server test**

`test/main.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Logic = require('../src/shared/logic.js');
const Service = require('../src/shared/service.js');
const { createMemoryStore, sampleDraft } = require('./helpers.js');

const OWNER = 'lrego@iu.edu';
const DEPLOY_URL = 'https://script.google.com/macros/s/DEPLOY/exec';
const MAIN = fs.readFileSync(path.join(__dirname, '..', 'src', 'server', 'main.js'), 'utf8');

function plain(x) {
  return JSON.parse(JSON.stringify(x));
}

function loadMain(opts) {
  const props = Object.assign({}, opts.props);
  const store = createMemoryStore();
  const lockLog = [];
  const pages = [];
  const calls = { createNew: 0 };
  let uuid = 0;
  const sandbox = {
    Logic,
    Service,
    Session: {
      getActiveUser: () => ({ getEmail: () => opts.active }),
      getEffectiveUser: () => ({ getEmail: () => (opts.effective === undefined ? OWNER : opts.effective) })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; }
      })
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => lockLog.push('wait'), releaseLock: () => lockLog.push('release') })
    },
    SheetStore: {
      open: () => store,
      createNew: () => { calls.createNew += 1; return store; }
    },
    Utilities: {
      getUuid: () => {
        uuid += 1;
        return uuid.toString(16).padStart(8, '0') + '-0000-4000-8000-000000000000';
      }
    },
    HtmlService: {
      createTemplateFromFile: (name) => {
        const template = {
          evaluate: () => {
            const page = { name, boot: JSON.parse(template.bootJson), bootJson: template.bootJson, title: null, meta: [] };
            pages.push(page);
            const out = {
              setTitle: (t) => { page.title = t; return out; },
              addMetaTag: (n, c) => { page.meta.push([n, c]); return out; }
            };
            return out;
          }
        };
        return template;
      },
      createHtmlOutputFromFile: (name) => ({ getContent: () => '<!-- ' + name + ' -->' })
    },
    ScriptApp: { getService: () => ({ getUrl: () => DEPLOY_URL }) },
    Logger: { log: () => {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(MAIN, sandbox);
  return { m: sandbox, props, store, lockLog, pages, calls };
}

test('owner check passes for the owner, ignoring case', () => {
  assert.equal(loadMain({ active: OWNER }).m.isOwner_(''), true);
  assert.equal(loadMain({ active: 'LRego@IU.edu' }).m.isOwner_(''), true);
});

test('owner check fails for other people and anonymous visitors', () => {
  assert.equal(loadMain({ active: 'someone@iu.edu' }).m.isOwner_(''), false);
  assert.equal(loadMain({ active: '' }).m.isOwner_(''), false);
  assert.equal(loadMain({ active: '', effective: '' }).m.isOwner_(''), false);
});

test('owner check accepts the admin key fallback', () => {
  const { m } = loadMain({ active: '', props: { ADMIN_KEY: 'secret123' } });
  assert.equal(m.isOwner_('secret123'), true);
  assert.equal(m.isOwner_('wrong'), false);
  assert.equal(m.isOwner_(''), false);
  assert.equal(m.isOwner_(undefined), false);
});

test('doGet serves the invitee page for ?poll=', () => {
  const { m, pages } = loadMain({ active: '' });
  m.doGet({ parameter: { poll: 'abcd1234' } });
  assert.equal(pages[0].name, 'invitee');
  assert.deepEqual(plain(pages[0].boot), { pollId: 'abcd1234' });
  assert.equal(pages[0].title, 'Meeting availability');
  assert.deepEqual(plain(pages[0].meta), [['viewport', 'width=device-width, initial-scale=1']]);
});

test('doGet escapes < in boot data', () => {
  const { m, pages } = loadMain({ active: '' });
  m.doGet({ parameter: { poll: '</script><b>' } });
  assert.equal(pages[0].bootJson.indexOf('</script>'), -1);
  assert.ok(pages[0].bootJson.indexOf('\\u003c/script>') !== -1);
  assert.equal(pages[0].boot.pollId, '</script><b>');
});

test('doGet serves the organizer page to the owner', () => {
  const { m, pages } = loadMain({ active: OWNER });
  m.doGet({ parameter: {} });
  assert.equal(pages[0].name, 'organizer');
  assert.deepEqual(plain(pages[0].boot), { baseUrl: DEPLOY_URL, adminKey: '' });
  assert.equal(pages[0].title, 'Meeting Scheduler');
});

test('doGet prefers the BASE_URL property and passes the admin key through', () => {
  const { m, pages } = loadMain({ active: '', props: { ADMIN_KEY: 'k1', BASE_URL: 'https://example.test/exec' } });
  m.doGet({ parameter: { admin: 'k1' } });
  assert.equal(pages[0].name, 'organizer');
  assert.deepEqual(plain(pages[0].boot), { baseUrl: 'https://example.test/exec', adminKey: 'k1' });
});

test('doGet shows the organizer-only message to everyone else', () => {
  const { m, pages } = loadMain({ active: '' });
  m.doGet(undefined);
  assert.equal(pages[0].name, 'message');
  assert.deepEqual(plain(pages[0].boot), { title: 'Organizer only', message: 'This page is for the organizer only.' });
});

test('include returns the HTML file content', () => {
  assert.equal(loadMain({ active: '' }).m.include('styles'), '<!-- styles -->');
});

test('organizer API refuses non-owners', () => {
  const { m, lockLog } = loadMain({ active: '' });
  const expected = { ok: false, code: 'not_owner', message: 'This page is for the organizer only.' };
  assert.deepEqual(plain(m.apiListPolls('')), expected);
  assert.deepEqual(plain(m.apiSavePoll('', sampleDraft())), expected);
  assert.deepEqual(plain(m.apiDeletePoll('', 'abcd1234')), expected);
  assert.deepEqual(lockLog, []);
});

test('a full round trip locks around writes only', () => {
  const { m, lockLog } = loadMain({ active: OWNER });
  const saved = plain(m.apiSavePoll('', sampleDraft()));
  assert.equal(saved.ok, true);
  assert.ok(Logic.isValidId(saved.data.pollId));
  const poll = plain(m.apiGetPublicPoll(saved.data.pollId));
  assert.equal(poll.ok, true);
  const answer = plain(m.apiSaveResponse(saved.data.pollId, poll.data.invitees[0].inviteeId, [poll.data.blocks[0].blockId], 1));
  assert.equal(answer.ok, true);
  assert.equal(plain(m.apiListPolls('')).data[0].respondedCount, 1);
  assert.equal(plain(m.apiGetPoll('', saved.data.pollId)).data.responses.length, 1);
  assert.deepEqual(lockLog, ['wait', 'release', 'wait', 'release']);
});

test('invitee API works for anonymous visitors and reports errors as data', () => {
  const owner = loadMain({ active: OWNER });
  const saved = plain(owner.m.apiSavePoll('', sampleDraft()));
  const visitor = loadMain({ active: '' });
  assert.deepEqual(plain(visitor.m.apiGetPublicPoll('zzzzzzzz')),
    { ok: false, code: 'not_found', message: 'This poll is no longer available.' });
  assert.equal(saved.ok, true);
});

test('apiCreateDataSheet is owner-only and calls SheetStore.createNew', () => {
  const owner = loadMain({ active: OWNER });
  assert.deepEqual(plain(owner.m.apiCreateDataSheet('')), { ok: true, data: { created: true } });
  assert.equal(owner.calls.createNew, 1);
  const visitor = loadMain({ active: '' });
  assert.equal(plain(visitor.m.apiCreateDataSheet('')).code, 'not_owner');
  assert.equal(visitor.calls.createNew, 0);
});

test('setupAdminKey creates the key once', () => {
  const { m, props } = loadMain({ active: OWNER });
  m.setupAdminKey();
  const first = props.ADMIN_KEY;
  assert.match(first, /^[0-9a-f]{32}$/);
  m.setupAdminKey();
  assert.equal(props.ADMIN_KEY, first);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test test/sheet-store.test.js test/main.test.js`
Expected: FAIL with `Cannot find module '../src/server/sheet_store.js'` and `ENOENT ... src/server/main.js`

- [ ] **Step 4: Write `src/appsscript.json`**

```json
{
  "timeZone": "America/Indiana/Indianapolis",
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

- [ ] **Step 5: Write `src/server/sheet_store.js`**

```js
/*
 * Meeting Scheduler — Google Sheet implementation of the table store
 * (Apps Script only, apart from the pure codec exported for tests).
 * One tab per table; row 1 holds column names; every cell is plain text.
 */
var SheetStore = (function () {
  var SHEET_NAME = 'Meeting Scheduler Data';
  var PROP_ID = 'DATA_SHEET_ID';
  var TABS = [
    { name: 'Polls', key: 'polls', cols: ['pollId', 'title', 'weekStart', 'lengthMin', 'version', 'createdAt', 'updatedAt'] },
    { name: 'Blocks', key: 'blocks', cols: ['pollId', 'blockId', 'day', 'startMin'] },
    { name: 'Invitees', key: 'invitees', cols: ['pollId', 'inviteeId', 'name', 'order', 'respondedAt'] },
    { name: 'Responses', key: 'responses', cols: ['pollId', 'inviteeId', 'blockId'] }
  ];
  var NUMERIC = { lengthMin: true, version: true, day: true, startMin: true, order: true };
  var RISKY = /^[=+\-@]/; // would be read as a formula

  function encodeCell(col, value) {
    if (NUMERIC[col]) return String(Number(value));
    var s = value == null ? '' : String(value);
    return RISKY.test(s) ? "'" + s : s;
  }

  function decodeCell(col, value) {
    if (Object.prototype.toString.call(value) === '[object Date]') value = formatDateCell(col, value);
    if (NUMERIC[col]) return Number(value);
    var s = value == null ? '' : String(value);
    return s.charAt(0) === "'" && RISKY.test(s.slice(1)) ? s.slice(1) : s;
  }

  // Guard: cells are written as plain text, but if Sheets ever hands back a Date, restore the string.
  function formatDateCell(col, date) {
    if (col === 'weekStart') return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    return Utilities.formatDate(date, 'UTC', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  }

  function rowToObject(cols, row) {
    var o = {};
    cols.forEach(function (c, i) { o[c] = decodeCell(c, row[i]); });
    return o;
  }

  function objectToRow(cols, obj) {
    return cols.map(function (c) { return encodeCell(c, obj[c]); });
  }

  function ensureTabs(ss) {
    TABS.forEach(function (tab) {
      if (ss.getSheetByName(tab.name)) return;
      var sheet = ss.insertSheet(tab.name);
      sheet.getRange(1, 1, 1, tab.cols.length).setValues([tab.cols]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    });
    var stray = ss.getSheetByName('Sheet1');
    if (stray && ss.getSheets().length > TABS.length) ss.deleteSheet(stray);
  }

  function readAll(ss) {
    var out = {};
    TABS.forEach(function (tab) {
      var sheet = ss.getSheetByName(tab.name);
      var last = sheet.getLastRow();
      out[tab.key] = last < 2 ? [] : sheet.getRange(2, 1, last - 1, tab.cols.length).getValues()
        .filter(function (row) { return row[0] !== ''; })
        .map(function (row) { return rowToObject(tab.cols, row); });
    });
    return out;
  }

  function writeAll(ss, tables) {
    TABS.forEach(function (tab) {
      var sheet = ss.getSheetByName(tab.name);
      var rows = (tables[tab.key] || []).map(function (o) { return objectToRow(tab.cols, o); });
      var last = sheet.getLastRow();
      if (last > 1) sheet.getRange(2, 1, last - 1, tab.cols.length).clearContent();
      if (rows.length) {
        var range = sheet.getRange(2, 1, rows.length, tab.cols.length);
        range.setNumberFormat('@');
        range.setValues(rows);
      }
    });
  }

  function open() {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty(PROP_ID);
    var ss;
    if (!id) {
      ss = SpreadsheetApp.create(SHEET_NAME);
      props.setProperty(PROP_ID, ss.getId());
    } else {
      try {
        ss = SpreadsheetApp.openById(id);
      } catch (err) {
        throw new Service.ServiceError('sheet_missing', 'The data sheet is missing.');
      }
    }
    ensureTabs(ss);
    return {
      read: function () { return readAll(ss); },
      write: function (tables) { writeAll(ss, tables); }
    };
  }

  function createNew() {
    PropertiesService.getScriptProperties().deleteProperty(PROP_ID);
    return open();
  }

  return {
    open: open,
    createNew: createNew,
    _codec: { TABS: TABS, encodeCell: encodeCell, decodeCell: decodeCell, rowToObject: rowToObject, objectToRow: objectToRow }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SheetStore;
```

- [ ] **Step 6: Write `src/server/main.js`**

```js
/*
 * Meeting Scheduler — web app entry points (Apps Script only).
 * Functions ending in "_" are private: google.script.run cannot call them.
 */

function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.poll) {
    return renderPage_('invitee', { pollId: String(params.poll) }, 'Meeting availability');
  }
  if (!isOwner_(params.admin)) {
    return renderPage_('message', { title: 'Organizer only', message: 'This page is for the organizer only.' }, 'Meeting Scheduler');
  }
  return renderPage_('organizer', { baseUrl: getBaseUrl_(), adminKey: params.admin || '' }, 'Meeting Scheduler');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function renderPage_(name, boot, title) {
  var template = HtmlService.createTemplateFromFile(name);
  template.bootJson = JSON.stringify(boot).replace(/</g, '\\u003c');
  return template.evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function isOwner_(key) {
  var active = '';
  try {
    active = Session.getActiveUser().getEmail() || '';
  } catch (err) {
    active = '';
  }
  var owner = Session.getEffectiveUser().getEmail() || '';
  if (active && owner && active.toLowerCase() === owner.toLowerCase()) return true;
  var stored = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  return !!(stored && key && String(key) === stored);
}

function getBaseUrl_() {
  return PropertiesService.getScriptProperties().getProperty('BASE_URL') || ScriptApp.getService().getUrl();
}

function newId_() {
  var hex = Utilities.getUuid().replace(/-/g, '');
  var positions = [0, 2, 4, 6, 8, 10, 20, 22]; // skip the UUID version and variant digits
  return Logic.idFromBytes(positions.map(function (p) { return parseInt(hex.substr(p, 2), 16); }));
}

function service_() {
  return Service.create(SheetStore.open(), {
    newId: newId_,
    now: function () { return new Date().toISOString(); }
  });
}

function run_(options, fn) {
  return Service.envelope(function () {
    if (options.owner && !isOwner_(options.key)) {
      throw new Service.ServiceError('not_owner', 'This page is for the organizer only.');
    }
    var lock = null;
    if (options.write) {
      lock = LockService.getScriptLock();
      lock.waitLock(20000);
    }
    try {
      return fn();
    } finally {
      if (lock) lock.releaseLock();
    }
  });
}

// ---- Organizer API (owner only) --------------------------------------------

function apiListPolls(key) {
  return run_({ owner: true, key: key }, function () { return service_().listPolls(); });
}

function apiGetPoll(key, pollId) {
  return run_({ owner: true, key: key }, function () { return service_().getPoll(pollId); });
}

function apiSavePoll(key, draft) {
  return run_({ owner: true, key: key, write: true }, function () { return service_().savePoll(draft); });
}

function apiDeletePoll(key, pollId) {
  return run_({ owner: true, key: key, write: true }, function () { return service_().deletePoll(pollId); });
}

function apiCreateDataSheet(key) {
  return run_({ owner: true, key: key, write: true }, function () {
    SheetStore.createNew();
    return { created: true };
  });
}

// ---- Invitee API (anyone with the link) ------------------------------------

function apiGetPublicPoll(pollId) {
  return run_({}, function () { return service_().getPublicPoll(pollId); });
}

function apiSaveResponse(pollId, inviteeId, blockIds, version) {
  return run_({ write: true }, function () {
    return service_().saveResponse(pollId, inviteeId, blockIds, version);
  });
}

// ---- Setup helper: run by hand from the Apps Script editor -----------------

function setupAdminKey() {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ADMIN_KEY');
  if (!key) {
    key = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('ADMIN_KEY', key);
  }
  Logger.log('Organizer link: add ?admin=' + key + ' to the end of your web app URL.');
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, `# fail 0` (79 tests)

- [ ] **Step 8: Commit**

```bash
git add src/appsscript.json src/server/sheet_store.js src/server/main.js test/sheet-store.test.js test/main.test.js
git commit -m "feat: add Google Sheet store, web app routing and server API" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Build pipeline, styles, browser helpers and local preview

**Files:**
- Create: `build.js`, `src/client/styles.css`, `src/client/dom.js`, `src/client/api.js`, `src/client/message.html`, `preview/preview-shim.js`, `.claude/launch.json`
- Test: `test/build.test.js`

**Interfaces:**
- Consumes: `Service` and `Logic` (preview shim only); the `api*` function names and envelope format from Task 5.
- Produces:
  - `build.js`: every `src/client/*.html` is a page template; every `src/client/*.js` becomes include `js_<basename>`; `src/shared/logic.js` becomes include `js_logic`; `src/client/styles.css` becomes include `styles`. `dist/` gets `appsscript.json`, the four server files, every include as `<name>.html`, and every page template unchanged. `preview-dist/` gets each page with includes inlined and the BOOT line replaced by the preview shim, plus `logic.js`, `service.js`, `preview-shim.js` and an `index.html`.
  - `Dom.h(tag, attrs?, children?) → Element`. Attribute rules: `null`/`undefined`/`false` are skipped; `class` sets `className`; `onX` with a function adds an event listener; `style` with an object sets style properties; `true` sets an empty attribute; anything else goes through `setAttribute`. Children may be strings, elements, `null`/`false` (skipped) or nested arrays.
  - `Dom.clear(el) → el`, `Dom.focusByKey(container, key)` (focuses `[data-key="<key>"]` if present)
  - `Dom.btn(label, onClick, kind?, extra?) → HTMLButtonElement` with class `btn btn-<kind>` (`kind` defaults to `secondary`; `extra` is merged into the attributes)
  - `Dom.messageBox(m) → Element|null` for `m = null | {kind: 'error'|'ok'|'info', text, retry?}`; renders a `msg msg-<kind>` box (`role="alert"` for errors, otherwise `status`) with a **Try again** link when `retry` is set
  - `Dom.confirmDialog({title, lines?, okLabel?, cancelLabel?, danger?}) → Promise<boolean>` (renders into `#dialog-root`; Escape cancels)
  - `Dom.copyText(input) → Promise<boolean>`
  - `Dom.storageGet(key) → string|null`, `Dom.storageSet(key, value)`, `Dom.storageRemove(key)` (never throw)
  - `Api.call(name, ...args) → Promise` resolving with `data`, rejecting with `{code, message}`; transport failures reject with code `network`.
  - `window.PreviewShim` in the preview: `boot(page)`, `failNextCall()`, `simulateMissingSheet()`, `reset()`.
  - CSS classes used by later tasks: `btn btn-primary|btn-secondary|btn-danger|btn-link`, `msg msg-error|msg-ok|msg-info`, `msg-slot`, `note`, `tz`, `counter`, `who`, `warn`, `offscreen`, `field`, `radio-row`, `inline-row`, `toolbar`, `toolbar-top`, `toolbar-sticky`, `save-row`, `actions`, `link-row`, `plain-list`, `poll-list`, `poll-row`, `poll-title`, `steps`, `step` (+ `current`, `done`), `summary`, `name-editor`, `name-text`, `day-tabs`, `day-tab`, `grid`, `grid-edit`, `grid-names`, `grid-corner`, `grid-day`, `grid-time` (+ `on-hour`), `cell`, `block`, `block-edit`, `block-time`, `block-hint`, `block-names`, `block-best`, `block-head`, `block-count`, `badge-best`, `name-list`, `name-row`, `name-row-active`, `dialog-backdrop`, `dialog`, `dialog-title`, `dialog-actions`.

- [ ] **Step 1: Write the failing build test**

`test/build.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { cwd: ROOT });

function dist(file) {
  return fs.readFileSync(path.join(ROOT, 'dist', file), 'utf8');
}

function preview(file) {
  return fs.readFileSync(path.join(ROOT, 'preview-dist', file), 'utf8');
}

test('dist holds the manifest and the server files', () => {
  for (const f of ['appsscript.json', 'logic.js', 'service.js', 'sheet_store.js', 'main.js']) {
    assert.ok(fs.existsSync(path.join(ROOT, 'dist', f)), f);
  }
  assert.equal(JSON.parse(dist('appsscript.json')).timeZone, 'America/Indiana/Indianapolis');
});

test('styles and client scripts are wrapped as HTML includes', () => {
  assert.match(dist('styles.html'), /^<style>\n[\s\S]*<\/style>\n$/);
  for (const name of ['js_logic', 'js_dom', 'js_api']) {
    assert.match(dist(name + '.html'), /^<script>\n[\s\S]*<\/script>\n$/, name);
  }
});

test('page templates are copied unchanged into dist', () => {
  assert.equal(dist('message.html'), fs.readFileSync(path.join(ROOT, 'src', 'client', 'message.html'), 'utf8'));
});

test('preview pages have every scriptlet resolved', () => {
  const html = preview('message.html');
  assert.equal(html.indexOf('<?'), -1);
  assert.match(html, /PreviewShim\.boot\("message"\)/);
  assert.match(html, /<script src="preview-shim\.js"><\/script>/);
  assert.ok(fs.existsSync(path.join(ROOT, 'preview-dist', 'index.html')));
  assert.ok(fs.existsSync(path.join(ROOT, 'preview-dist', 'service.js')));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/build.test.js`
Expected: FAIL with `Cannot find module '.../build.js'` (from `execFileSync`)

- [ ] **Step 3: Write `build.js`**

```js
#!/usr/bin/env node
/*
 * Builds two folders from src/:
 *   dist/          pushed (clasp) or pasted into Apps Script
 *   preview-dist/  static pages for a local click-through; google.script.run
 *                  is replaced by preview/preview-shim.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const CLIENT = path.join(SRC, 'client');
const DIST = path.join(ROOT, 'dist');
const PREVIEW = path.join(ROOT, 'preview-dist');
const SERVER_FILES = ['shared/logic.js', 'shared/service.js', 'server/sheet_store.js', 'server/main.js'];
const BOOT_LINE = '<script>window.BOOT = <?!= bootJson ?>;</script>';
const INCLUDE = /<\?!= include\('([a-z_]+)'\) \?>/g;

function read(rel) {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

function reset(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function clientFiles(ext) {
  return fs.readdirSync(CLIENT).filter((f) => f.endsWith(ext)).sort();
}

function wrapScript(code) {
  if (code.indexOf('</script') !== -1) throw new Error('Script source must not contain "</script"');
  return '<script>\n' + code + '</script>\n';
}

function collectIncludes() {
  const includes = {
    styles: '<style>\n' + read('client/styles.css') + '</style>\n',
    js_logic: wrapScript(read('shared/logic.js'))
  };
  clientFiles('.js').forEach((f) => {
    includes['js_' + path.basename(f, '.js')] = wrapScript(read('client/' + f));
  });
  return includes;
}

function buildDist(includes, pages) {
  reset(DIST);
  fs.copyFileSync(path.join(SRC, 'appsscript.json'), path.join(DIST, 'appsscript.json'));
  SERVER_FILES.forEach((rel) => fs.writeFileSync(path.join(DIST, path.basename(rel)), read(rel)));
  Object.keys(includes).forEach((name) => fs.writeFileSync(path.join(DIST, name + '.html'), includes[name]));
  pages.forEach((page) => fs.writeFileSync(path.join(DIST, page), read('client/' + page)));
}

function buildPreview(includes, pages) {
  reset(PREVIEW);
  fs.writeFileSync(path.join(PREVIEW, 'logic.js'), read('shared/logic.js'));
  fs.writeFileSync(path.join(PREVIEW, 'service.js'), read('shared/service.js'));
  fs.copyFileSync(path.join(ROOT, 'preview', 'preview-shim.js'), path.join(PREVIEW, 'preview-shim.js'));
  pages.forEach((page) => {
    const name = path.basename(page, '.html');
    let html = read('client/' + page);
    if (html.indexOf(BOOT_LINE) === -1) throw new Error(page + ' is missing the BOOT line');
    html = html.replace(INCLUDE, (match, inc) => {
      if (!includes[inc]) throw new Error(page + ' includes unknown file ' + inc);
      return includes[inc];
    });
    html = html.replace(BOOT_LINE, () => [
      '<script src="logic.js"></script>',
      '<script src="service.js"></script>',
      '<script src="preview-shim.js"></script>',
      '<script>window.BOOT = PreviewShim.boot(' + JSON.stringify(name) + ');</script>'
    ].join('\n'));
    if (html.indexOf('<?') !== -1) throw new Error(page + ' still has an unprocessed scriptlet');
    html = html.replace('<head>', () => '<head>\n<meta charset="utf-8">\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Preview: ' + name + '</title>');
    fs.writeFileSync(path.join(PREVIEW, page), html);
  });
  const links = pages.map((p) => '<li><a href="' + p + '">' + p + '</a></li>').join('');
  fs.writeFileSync(path.join(PREVIEW, 'index.html'), '<!DOCTYPE html><meta charset="utf-8"><title>Preview</title>' +
    '<h1>Meeting Scheduler preview</h1><ul>' + links + '</ul>');
}

const includes = collectIncludes();
const pages = clientFiles('.html');
buildDist(includes, pages);
buildPreview(includes, pages);
console.log('Built dist/ (' + fs.readdirSync(DIST).length + ' files) and preview-dist/ (' + pages.length + ' pages)');
```

- [ ] **Step 4: Write `src/client/styles.css`**

```css
/* Meeting Scheduler — all styles. Palette from the design spec. */
:root {
  --crimson: #990000;
  --crimson-dark: #6D0808;
  --crimson-light: #F41C40;
  --cream: #F8EFE2;
  --cream-dark: #F5E3CC;
  --grey-light: #EEEEF0;
  --grey: #B9C1C6;
  --ink: #072332;
  --field: #FFFFFF;
  --row-h: 28px;
  --radius: 6px;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  background: var(--cream);
  color: var(--ink);
  font-family: var(--font);
  font-size: 16px;
  line-height: 1.45;
}

.topbar { background: var(--crimson); color: var(--cream); }
.topbar-inner { max-width: 1100px; margin: 0 auto; padding: 14px 16px; font-weight: 700; font-size: 1.1rem; }
.container { max-width: 1100px; margin: 0 auto; padding: 20px 16px 48px; }

h1 { font-size: 1.5rem; margin: 0 0 8px; color: var(--crimson-dark); }
h2 { font-size: 1.15rem; margin: 24px 0 8px; color: var(--crimson-dark); }
p { margin: 0 0 10px; }
.note { font-size: 0.92rem; }
.tz, .counter, .who { font-weight: 700; }
.warn { color: var(--crimson-dark); }
.offscreen { position: absolute; left: -9999px; top: 0; }

:focus-visible { outline: 3px solid var(--crimson-light); outline-offset: 2px; }

/* Buttons */
.btn { font: inherit; font-weight: 600; min-height: 40px; padding: 8px 16px; border: 2px solid transparent; border-radius: var(--radius); cursor: pointer; }
.btn-primary { background: var(--crimson); border-color: var(--crimson); color: var(--cream); }
.btn-primary:hover { background: var(--crimson-dark); border-color: var(--crimson-dark); }
.btn-secondary { background: transparent; border-color: var(--crimson); color: var(--crimson); }
.btn-secondary:hover { background: var(--cream-dark); border-color: var(--crimson-dark); color: var(--crimson-dark); }
.btn-danger { background: var(--crimson-dark); border-color: var(--crimson-dark); color: var(--cream); }
.btn-link { min-height: 0; padding: 2px 4px; background: none; border: 0; color: var(--crimson); text-decoration: underline; }
.btn-link:hover { color: var(--crimson-dark); }
.btn:disabled, .btn:disabled:hover { background: var(--grey); border-color: var(--grey); color: var(--ink); cursor: not-allowed; }

/* Forms */
.field { margin: 0 0 18px; }
.field > label, .field > legend { display: block; margin-bottom: 4px; font-weight: 700; }
fieldset.field { border: 0; padding: 0; }
input[type="text"], input[type="date"], textarea, select {
  width: 100%;
  max-width: 480px;
  padding: 8px 10px;
  font: inherit;
  color: var(--ink);
  background: var(--field);
  border: 1px solid var(--ink);
  border-radius: var(--radius);
}
textarea { display: block; margin-bottom: 8px; resize: vertical; }
input[type="radio"], input[type="checkbox"] { accent-color: var(--crimson); }
.radio-row { display: flex; flex-wrap: wrap; gap: 8px 20px; }
.radio-row label { display: flex; align-items: center; gap: 6px; }
.inline-row { display: flex; gap: 8px; max-width: 480px; }
.inline-row input { flex: 1; }

/* Messages */
.msg { margin: 12px 0; padding: 10px 12px; background: var(--cream-dark); border-left: 4px solid var(--crimson); border-radius: var(--radius); }
.msg-error { border-left-color: var(--crimson-dark); font-weight: 600; }
.msg-ok, .msg-info { border-left-color: var(--ink); }
.msg .btn-link { margin-left: 8px; }
.msg-slot:empty { display: none; }

/* Layout helpers */
.toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: 20px; }
.toolbar-top { margin: 0 0 8px; }
.toolbar-top h1 { margin: 0; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.toolbar-sticky { position: sticky; bottom: 0; margin-top: 16px; padding: 12px 0; background: var(--cream); border-top: 1px solid var(--grey); }
.toolbar-sticky .msg { margin: 0 0 8px; }
.save-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }
.link-row { display: flex; gap: 8px; max-width: 720px; margin-bottom: 8px; }
.link-row input { flex: 1; max-width: none; }
.plain-list { margin: 0 0 10px; padding-left: 20px; }

/* Poll list */
.poll-list { list-style: none; margin: 16px 0; padding: 0; border-top: 1px solid var(--grey); }
.poll-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; padding: 14px 0; border-bottom: 1px solid var(--grey); }
.poll-title { font-size: 1.05rem; font-weight: 700; }

/* Wizard */
.steps { display: flex; flex-wrap: wrap; gap: 4px; list-style: none; margin: 8px 0 20px; padding: 0; }
.step { flex: 1 1 120px; }
.step button { width: 100%; padding: 8px 10px; font: inherit; text-align: left; color: var(--ink); background: transparent; border: 0; border-bottom: 4px solid var(--grey); cursor: pointer; }
.step button:disabled { cursor: default; }
.step.done button { border-bottom-color: var(--crimson-dark); }
.step.current button { border-bottom-color: var(--crimson); font-weight: 700; }
.summary { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0 0 16px; }
.summary dt { font-weight: 700; }
.summary dd { margin: 0; }
.name-editor { list-style: none; max-width: 520px; margin: 8px 0 16px; padding: 0; }
.name-editor li { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--grey); }
.name-editor .name-text, .name-editor input { flex: 1; }

/* Day tabs (narrow screens) */
.day-tabs { display: flex; gap: 4px; margin: 0 0 8px; }
.day-tab { flex: 1; min-height: 40px; font: inherit; font-weight: 600; color: var(--crimson); background: transparent; border: 2px solid var(--crimson); border-radius: var(--radius); }
.day-tab[aria-selected="true"] { color: var(--cream); background: var(--crimson); }

/* Calendar grid */
.grid { display: grid; grid-auto-rows: minmax(var(--row-h), auto); gap: 1px; margin: 8px 0; background: var(--grey); border: 1px solid var(--grey); border-radius: var(--radius); overflow: hidden; }
.grid > * { background: var(--grey-light); }
.grid-corner, .grid-day, .grid-time { background: var(--cream); }
.grid-day { padding: 8px 4px; font-size: 0.9rem; font-weight: 700; text-align: center; }
.grid-time { padding: 2px 6px; font-size: 0.78rem; text-align: right; white-space: nowrap; }
.grid-time.on-hour { font-weight: 700; }
.cell { display: block; width: 100%; height: 100%; min-height: var(--row-h); margin: 0; padding: 0; border: 0; }
button.cell { cursor: pointer; }
button.cell:hover { background: var(--cream-dark); }
.block { width: 100%; height: 100%; margin: 0; padding: 4px 6px; font: inherit; font-size: 0.85rem; text-align: left; border: 0; }
.block-edit { display: flex; flex-direction: column; color: var(--cream); background: var(--crimson); cursor: pointer; }
.block-edit:hover { background: var(--crimson-dark); }
.block-time { font-weight: 700; }
.block-hint { font-size: 0.75rem; }
.block-names { background: var(--cream-dark); border-left: 4px solid var(--crimson); }
.block-best { box-shadow: inset 0 0 0 3px var(--crimson-light); }
.block-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 6px; }
.block-count { font-weight: 700; white-space: nowrap; }
.badge-best { display: inline-block; margin: 4px 0 2px; padding: 0 8px; font-size: 0.75rem; font-weight: 700; color: var(--ink); background: var(--cream); border: 2px solid var(--crimson-light); border-radius: 999px; }
.name-list { list-style: none; margin: 4px 0 0; padding: 0; }
.name-row label { display: flex; align-items: center; gap: 6px; padding: 2px 4px; border-radius: 4px; overflow-wrap: anywhere; }
.name-row input { flex: none; width: 16px; height: 16px; margin: 0; }
.name-row-active label { font-weight: 700; background: var(--cream); outline: 2px solid var(--crimson); cursor: pointer; }
.grid :focus-visible { outline-offset: -3px; }

/* Dialog */
.dialog-backdrop { position: fixed; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(7, 35, 50, 0.45); }
.dialog { width: 100%; max-width: 520px; padding: 20px; background: var(--cream); border-top: 6px solid var(--crimson); border-radius: var(--radius); box-shadow: 0 10px 30px rgba(7, 35, 50, 0.35); }
.dialog-title { margin-top: 0; }
.dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 16px; }

@media (max-width: 767px) {
  :root { --row-h: 34px; }
  .container { padding: 16px 16px 40px; }
  h1 { font-size: 1.3rem; }
  .grid-time { padding: 2px 4px; font-size: 0.72rem; }
  .summary { grid-template-columns: 1fr; }
}
```

- [ ] **Step 5: Write `src/client/dom.js`**

```js
/* Small DOM helpers shared by both pages. Text always goes through textContent. */
var Dom = (function () {
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(function (s) { el.style[s] = v[s]; });
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    });
    append(el, children);
    return el;
  }

  function append(el, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) {
      children.forEach(function (c) { append(el, c); });
      return;
    }
    el.appendChild(typeof children === 'string' ? document.createTextNode(children) : children);
  }

  function btn(label, onClick, kind, extra) {
    return h('button', Object.assign({ type: 'button', class: 'btn btn-' + (kind || 'secondary'), onclick: onClick }, extra || {}), label);
  }

  // m: null or {kind: 'error'|'ok'|'info', text, retry?: function}
  function messageBox(m) {
    if (!m) return null;
    return h('div', { class: 'msg msg-' + m.kind, role: m.kind === 'error' ? 'alert' : 'status' }, [
      h('span', null, m.text),
      m.retry ? btn('Try again', m.retry, 'link') : null
    ]);
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  function focusByKey(container, key) {
    if (!key) return;
    var el = container.querySelector('[data-key="' + key + '"]');
    if (el) el.focus();
  }

  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var root = document.getElementById('dialog-root');
      var previous = document.activeElement;
      function close(result) {
        document.removeEventListener('keydown', onKey);
        clear(root);
        if (previous && previous.focus) previous.focus();
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape') close(false);
      }
      var ok = h('button', { type: 'button', class: 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary'),
        onclick: function () { close(true); } }, opts.okLabel || 'OK');
      var cancel = h('button', { type: 'button', class: 'btn btn-secondary',
        onclick: function () { close(false); } }, opts.cancelLabel || 'Cancel');
      clear(root).appendChild(h('div', { class: 'dialog-backdrop' },
        h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title' }, [
          h('h2', { id: 'dialog-title', class: 'dialog-title' }, opts.title || 'Are you sure?'),
          (opts.lines || []).map(function (line) { return h('p', null, line); }),
          h('div', { class: 'dialog-actions' }, [cancel, ok])
        ])));
      document.addEventListener('keydown', onKey);
      ok.focus();
    });
  }

  function copyText(input) {
    input.select();
    input.setSelectionRange(0, input.value.length);
    var done = false;
    try {
      done = document.execCommand('copy');
    } catch (e) {
      done = false;
    }
    if (!done && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(input.value).then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(done);
  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  function storageRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* storage unavailable */ }
  }

  return {
    h: h,
    btn: btn,
    messageBox: messageBox,
    clear: clear,
    focusByKey: focusByKey,
    confirmDialog: confirmDialog,
    copyText: copyText,
    storageGet: storageGet,
    storageSet: storageSet,
    storageRemove: storageRemove
  };
})();
```

- [ ] **Step 6: Write `src/client/api.js`**

```js
/* Promise wrapper around google.script.run. Resolves with data; rejects with {code, message}. */
var Api = (function () {
  function call(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve, reject) {
      var runner = google.script.run
        .withSuccessHandler(function (res) {
          if (res && res.ok) resolve(res.data);
          else reject({ code: (res && res.code) || 'server_error', message: (res && res.message) || '' });
        })
        .withFailureHandler(function (err) {
          reject({ code: 'network', message: String((err && err.message) || err) });
        });
      runner[name].apply(runner, args);
    });
  }

  return { call: call };
})();
```

- [ ] **Step 7: Write `src/client/message.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <?!= include('styles') ?>
</head>
<body>
  <header class="topbar"><div class="topbar-inner">Meeting Scheduler</div></header>
  <main class="container">
    <h1 id="message-title"></h1>
    <p id="message-text"></p>
  </main>
  <script>window.BOOT = <?!= bootJson ?>;</script>
  <script>
    document.getElementById('message-title').textContent = (window.BOOT && window.BOOT.title) || '';
    document.getElementById('message-text').textContent = (window.BOOT && window.BOOT.message) || '';
  </script>
</body>
</html>
```

- [ ] **Step 8: Write `preview/preview-shim.js`**

```js
/*
 * Local preview only (never deployed). Stands in for google.script.run using
 * the real Service and a localStorage-backed table store.
 * Console helpers: PreviewShim.failNextCall(), PreviewShim.simulateMissingSheet(), PreviewShim.reset().
 */
(function () {
  var KEY = 'ms-preview-db';
  var DELAY_MS = 150;
  var mode = { failNext: false, sheetMissing: false };

  function emptyTables() {
    return { polls: [], blocks: [], invitees: [], responses: [] };
  }

  var store = {
    read: function () {
      try {
        var raw = window.localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) { /* start empty */ }
      return emptyTables();
    },
    write: function (tables) {
      window.localStorage.setItem(KEY, JSON.stringify(tables));
    }
  };

  function newId() {
    var bytes = new Uint8Array(8);
    window.crypto.getRandomValues(bytes);
    return Logic.idFromBytes(Array.prototype.slice.call(bytes));
  }

  function service() {
    if (mode.sheetMissing) throw new Service.ServiceError('sheet_missing', 'The data sheet is missing.');
    return Service.create(store, { newId: newId, now: function () { return new Date().toISOString(); } });
  }

  var handlers = {
    apiListPolls: function () { return service().listPolls(); },
    apiGetPoll: function (key, pollId) { return service().getPoll(pollId); },
    apiSavePoll: function (key, draft) { return service().savePoll(draft); },
    apiDeletePoll: function (key, pollId) { return service().deletePoll(pollId); },
    apiCreateDataSheet: function () {
      mode.sheetMissing = false;
      store.write(emptyTables());
      return { created: true };
    },
    apiGetPublicPoll: function (pollId) { return service().getPublicPoll(pollId); },
    apiSaveResponse: function (pollId, inviteeId, blockIds, version) {
      return service().saveResponse(pollId, inviteeId, blockIds, version);
    }
  };

  function runner(onSuccess, onFailure) {
    var r = {
      withSuccessHandler: function (fn) { return runner(fn, onFailure); },
      withFailureHandler: function (fn) { return runner(onSuccess, fn); }
    };
    Object.keys(handlers).forEach(function (name) {
      r[name] = function () {
        var args = JSON.parse(JSON.stringify(Array.prototype.slice.call(arguments)));
        setTimeout(function () {
          if (mode.failNext) {
            mode.failNext = false;
            if (onFailure) onFailure(new Error('Simulated network failure'));
            return;
          }
          var result = Service.envelope(function () { return handlers[name].apply(null, args); });
          if (onSuccess) onSuccess(JSON.parse(JSON.stringify(result)));
        }, DELAY_MS);
      };
    });
    return r;
  }

  window.google = { script: { run: runner(null, null) } };

  window.PreviewShim = {
    boot: function (page) {
      var params = new URLSearchParams(window.location.search);
      if (page === 'invitee') return { pollId: params.get('poll') || '' };
      if (page === 'message') return { title: 'Organizer only', message: 'This page is for the organizer only.' };
      return { baseUrl: window.location.origin + window.location.pathname.replace(/[^/]*$/, 'invitee.html'), adminKey: '' };
    },
    failNextCall: function () { mode.failNext = true; },
    simulateMissingSheet: function () { mode.sheetMissing = true; },
    reset: function () { window.localStorage.removeItem(KEY); }
  };
})();
```

- [ ] **Step 9: Write `.claude/launch.json`**

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "preview",
      "runtimeExecutable": "python3",
      "runtimeArgs": ["-m", "http.server", "8765", "--directory", "preview-dist"],
      "port": 8765
    }
  ]
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, `# fail 0` (83 tests)

- [ ] **Step 11: Check the message page in the browser**

Run `npm run build`, then start the `preview` server with the browser pane (`preview_start` with name `preview`) and open `http://localhost:8765/message.html`.
Expected: crimson top bar reading "Meeting Scheduler" in cream; cream page background; heading "Organizer only" in dark crimson; text "This page is for the organizer only."; no console errors (`read_console_messages` with `onlyErrors: true` returns nothing).

- [ ] **Step 12: Commit**

```bash
git add build.js src/client/styles.css src/client/dom.js src/client/api.js src/client/message.html preview/preview-shim.js .claude/launch.json test/build.test.js
git commit -m "feat: add build pipeline, styles, browser helpers and local preview" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Calendar grid and organizer page

**Files:**
- Create: `src/client/grid.js`, `src/client/organizer.html`, `src/client/organizer.js`
- Modify: `test/build.test.js` (append tests)

**Interfaces:**
- Consumes: `Logic` (Tasks 1–3), `Dom`, `Api` (Task 6), the organizer API names (Task 5), `window.BOOT = {baseUrl, adminKey}`.
- Produces:
  - `Grid.render(opts) → Element` with `opts = {mode: 'edit'|'names', weekStart, lengthMin, blocks, dayFilter: null|0..4}` plus, for `edit`: `onCellClick(day, startMin)`, `onBlockClick(block)`; for `names`: `invitees: [{inviteeId, name}]`, `ticks: {[blockId]: inviteeId[]}`, `counts: {[blockId]: number}`, `best: blockId[]`, `activeInviteeId: string|null`, `showCounts: boolean`, `onToggle(blockId, checked)`.
  - Focus keys rendered by the grid: `c-<day>-<startMin>` on every edit-mode cell and block; `t-<blockId>` on the active invitee's checkboxes; `tab-<day>` on day tabs.
  - `Grid.dayTabs(weekStart, selectedDay, onSelect) → Element`, `Grid.isNarrow() → boolean` (width ≤ 767 px), `Grid.onNarrowChange(fn)`.
  - The organizer page (`organizer.html` + `organizer.js`), which defines no globals.

- [ ] **Step 1: Append the failing build tests to `test/build.test.js`**

```js
test('organizer page and its scripts are built', () => {
  assert.match(dist('organizer.html'), /<\?!= include\('js_organizer'\) \?>/);
  for (const name of ['js_grid', 'js_organizer']) {
    assert.match(dist(name + '.html'), /^<script>\n[\s\S]*<\/script>\n$/, name);
  }
  const html = preview('organizer.html');
  assert.equal(html.indexOf('<?'), -1);
  assert.match(html, /PreviewShim\.boot\("organizer"\)/);
  assert.match(html, /<div id="dialog-root"><\/div>/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/build.test.js`
Expected: FAIL with `ENOENT: no such file or directory, open '.../dist/organizer.html'`

- [ ] **Step 3: Write `src/client/grid.js`**

```js
/*
 * Mon–Fri calendar grid.
 *   mode 'edit':  empty cells and blocks are buttons (organizer step 2).
 *   mode 'names': each block lists every invitee with a checkbox (previews,
 *                 results and the invitee page).
 */
var Grid = (function () {
  var h = Dom.h;
  var narrowQuery = window.matchMedia ? window.matchMedia('(max-width: 767px)') : null;

  function isNarrow() {
    return !!(narrowQuery && narrowQuery.matches);
  }

  function onNarrowChange(fn) {
    if (!narrowQuery) return;
    if (narrowQuery.addEventListener) narrowQuery.addEventListener('change', fn);
    else if (narrowQuery.addListener) narrowQuery.addListener(fn);
  }

  function dayTabs(weekStart, selected, onSelect) {
    var dates = Logic.weekDates(weekStart);
    return h('div', { class: 'day-tabs', role: 'tablist', 'aria-label': 'Day of the week' }, dates.map(function (iso, i) {
      return h('button', {
        type: 'button',
        class: 'day-tab',
        role: 'tab',
        'aria-selected': i === selected ? 'true' : 'false',
        'aria-label': Logic.formatDayHeader(iso),
        'data-key': 'tab-' + i,
        onclick: function () { onSelect(i); }
      }, Logic.DAY_NAMES[i]);
    }));
  }

  function findStarting(blocks, day, t) {
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].day === day && blocks[i].startMin === t) return blocks[i];
    }
    return null;
  }

  function editCell(day, t, pos, dayLabel, opts) {
    return h('button', {
      type: 'button',
      class: 'cell',
      style: pos,
      'data-key': 'c-' + day + '-' + t,
      'aria-label': dayLabel + ', ' + Logic.formatTime(t) + ': add a time',
      onclick: function () { opts.onCellClick(day, t); }
    });
  }

  function editBlock(block, pos, dayLabel, opts) {
    var range = Logic.formatRange(block.startMin, opts.lengthMin);
    return h('button', {
      type: 'button',
      class: 'block block-edit',
      style: pos,
      title: 'Click to remove',
      'data-key': 'c-' + block.day + '-' + block.startMin,
      'aria-label': dayLabel + ', ' + range + ': remove this time',
      onclick: function () { opts.onBlockClick(block); }
    }, [h('span', { class: 'block-time' }, range), h('span', { class: 'block-hint' }, 'Click to remove')]);
  }

  function namesBlock(block, pos, dayLabel, opts) {
    var range = Logic.formatRange(block.startMin, opts.lengthMin);
    var ticks = (opts.ticks && opts.ticks[block.blockId]) || [];
    var count = (opts.counts && opts.counts[block.blockId]) || 0;
    var best = !!(block.blockId && opts.best && opts.best.indexOf(block.blockId) !== -1);
    var head = [h('span', { class: 'block-time' }, range)];
    if (opts.showCounts) head.push(h('span', { class: 'block-count' }, count + ' of ' + opts.invitees.length));
    return h('div', {
      class: 'block block-names' + (best ? ' block-best' : ''),
      style: pos,
      role: 'group',
      'aria-label': dayLabel + ', ' + range + (best ? ', most available' : '')
    }, [
      h('div', { class: 'block-head' }, head),
      best ? h('span', { class: 'badge-best' }, 'Most available') : null,
      h('ul', { class: 'name-list' }, opts.invitees.map(function (p) {
        var active = !!opts.activeInviteeId && p.inviteeId === opts.activeInviteeId;
        var box = h('input', {
          type: 'checkbox',
          checked: ticks.indexOf(p.inviteeId) !== -1,
          disabled: !active,
          'data-key': active ? 't-' + block.blockId : null,
          onchange: active ? function (e) { opts.onToggle(block.blockId, e.target.checked); } : null
        });
        return h('li', { class: 'name-row' + (active ? ' name-row-active' : '') },
          h('label', null, [box, h('span', null, p.name)]));
      }))
    ]);
  }

  function render(opts) {
    var dates = Logic.weekDates(opts.weekStart);
    var days = opts.dayFilter === null || opts.dayFilter === undefined ? [0, 1, 2, 3, 4] : [opts.dayFilter];
    var rows = Logic.rowStarts();
    var span = opts.lengthMin / Logic.STEP;
    var children = [h('div', { class: 'grid-corner', style: { gridRow: '1', gridColumn: '1' } })];

    days.forEach(function (day, ci) {
      children.push(h('div', { class: 'grid-day', style: { gridRow: '1', gridColumn: String(ci + 2) } },
        Logic.formatDayHeader(dates[day])));
    });
    rows.forEach(function (t, ri) {
      children.push(h('div', { class: 'grid-time' + (t % 60 === 0 ? ' on-hour' : ''),
        style: { gridRow: String(ri + 2), gridColumn: '1' } }, Logic.formatTime(t)));
    });
    days.forEach(function (day, ci) {
      var col = String(ci + 2);
      var dayLabel = Logic.formatDayHeader(dates[day]);
      var ri = 0;
      while (ri < rows.length) {
        var block = findStarting(opts.blocks, day, rows[ri]);
        if (block) {
          var rowSpan = Math.min(span, rows.length - ri);
          var pos = { gridRow: (ri + 2) + ' / span ' + rowSpan, gridColumn: col };
          children.push(opts.mode === 'edit' ? editBlock(block, pos, dayLabel, opts) : namesBlock(block, pos, dayLabel, opts));
          ri += rowSpan;
        } else {
          var cellPos = { gridRow: String(ri + 2), gridColumn: col };
          children.push(opts.mode === 'edit'
            ? editCell(day, rows[ri], cellPos, dayLabel, opts)
            : h('div', { class: 'cell', style: cellPos, 'aria-hidden': 'true' }));
          ri += 1;
        }
      }
    });
    return h('div', {
      class: 'grid grid-' + opts.mode,
      style: { gridTemplateColumns: '4.75rem repeat(' + days.length + ', minmax(0, 1fr))' }
    }, children);
  }

  return { render: render, dayTabs: dayTabs, isNarrow: isNarrow, onNarrowChange: onNarrowChange };
})();
```

- [ ] **Step 4: Write `src/client/organizer.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <?!= include('styles') ?>
</head>
<body>
  <header class="topbar"><div class="topbar-inner">Meeting Scheduler</div></header>
  <main id="app" class="container"></main>
  <div id="dialog-root"></div>
  <script>window.BOOT = <?!= bootJson ?>;</script>
  <?!= include('js_logic') ?>
  <?!= include('js_dom') ?>
  <?!= include('js_api') ?>
  <?!= include('js_grid') ?>
  <?!= include('js_organizer') ?>
</body>
</html>
```

- [ ] **Step 5: Write `src/client/organizer.js`**

```js
/* Organizer page: poll list, four-step setup, share screen, results, data-sheet recovery. */
(function () {
  var h = Dom.h;
  var btn = Dom.btn;
  var L = Logic;
  var app = document.getElementById('app');
  var boot = window.BOOT || {};
  var STEPS = ['Details', 'Times', 'Invitees', 'Review'];

  var state = {
    view: 'loading', // loading | home | wizard | share | results | sheet_missing | denied
    polls: [],
    message: null, // {kind: 'error'|'ok'|'info', text, retry?}
    draft: null,
    original: null, // bundle being edited, for edit-impact warnings
    step: 1,
    maxStep: 1,
    stepMessage: '',
    renaming: null,
    saving: false,
    dirty: false,
    dayFilter: 0,
    share: null, // {mode: 'created'|'edited'|'link', pollId, title}
    results: null,
    focusKey: null
  };

  // ---- Helpers -------------------------------------------------------------

  function call(name) {
    var args = [name, boot.adminKey || ''].concat(Array.prototype.slice.call(arguments, 1));
    return Api.call.apply(null, args);
  }

  function linkFor(pollId) {
    return boot.baseUrl + '?poll=' + encodeURIComponent(pollId);
  }

  function failureText(err) {
    if (err.code === 'network') return 'Couldn’t reach the server. Check your connection and try again.';
    if (err.code === 'not_found') return 'That poll no longer exists.';
    if (err.code === 'invalid') return err.message;
    return 'Something went wrong on the server. Please try again.';
  }

  // Nothing can be saved in these states, so unsaved-change warnings are dropped too.
  function handleSpecial(err) {
    if (err.code !== 'sheet_missing' && err.code !== 'not_owner') return false;
    state.view = err.code === 'sheet_missing' ? 'sheet_missing' : 'denied';
    state.dirty = false;
    state.saving = false;
    render();
    return true;
  }

  function changed() {
    state.dirty = true;
  }

  function weekLine(weekStart) {
    return 'Week of ' + L.formatWeekRange(weekStart) + ' · All times Eastern (Bloomington)';
  }

  function currentDayFilter() {
    return Grid.isNarrow() ? state.dayFilter : null;
  }

  function dayTabsIfNarrow(weekStart) {
    if (!Grid.isNarrow()) return null;
    return Grid.dayTabs(weekStart, state.dayFilter, function (day) {
      state.dayFilter = day;
      state.focusKey = 'tab-' + day;
      render();
    });
  }

  // ---- Rendering -----------------------------------------------------------

  function render() {
    var views = {
      loading: renderLoading, home: renderHome, wizard: renderWizard, share: renderShare,
      results: renderResults, sheet_missing: renderSheetMissing, denied: renderDenied
    };
    Dom.clear(app).appendChild(views[state.view]());
    Dom.focusByKey(app, state.focusKey);
    state.focusKey = null;
  }

  function messageEl() {
    return Dom.messageBox(state.message);
  }

  function stepMessageEl() {
    return h('div', { class: 'msg-slot', role: 'status', 'aria-live': 'polite' },
      state.stepMessage ? h('p', { class: 'msg msg-error' }, state.stepMessage) : null);
  }

  function renderLoading() {
    return h('p', { class: 'note' }, 'Loading…');
  }

  function renderDenied() {
    return h('section', null, [h('h1', null, 'Organizer only'), h('p', null, 'This page is for the organizer only.')]);
  }

  // ---- Home ------------------------------------------------------------------

  function loadPolls() {
    call('apiListPolls').then(function (polls) {
      state.polls = polls;
      state.view = 'home';
      render();
    }, function (err) {
      if (handleSpecial(err)) return;
      state.polls = [];
      state.view = 'home';
      state.message = { kind: 'error', text: failureText(err), retry: goHome };
      render();
    });
  }

  function goHome() {
    state.view = 'loading';
    state.message = null;
    state.draft = null;
    state.original = null;
    state.dirty = false;
    render();
    loadPolls();
  }

  function renderHome() {
    var rows = state.polls.map(function (p) {
      return h('li', { class: 'poll-row' }, [
        h('div', null, [
          h('div', { class: 'poll-title' }, p.title),
          h('div', { class: 'note' }, 'Week of ' + L.formatWeekRange(p.weekStart) + ' · ' + p.lengthMin +
            ' min · ' + p.respondedCount + ' of ' + p.invitedCount + ' responded')
        ]),
        h('div', { class: 'actions' }, [
          btn('Results', function () { openResults(p.pollId); }, 'primary'),
          btn('Edit', function () { startEdit(p.pollId); }),
          btn('Copy link', function () { copyLinkFromHome(p); }),
          btn('Delete', function () { confirmDelete(p); })
        ])
      ]);
    });
    return h('section', null, [
      h('div', { class: 'toolbar toolbar-top' }, [h('h1', null, 'My polls'), btn('New poll', startNew, 'primary')]),
      messageEl(),
      rows.length
        ? h('ul', { class: 'poll-list' }, rows)
        : h('p', { class: 'note' }, 'No polls yet. Click “New poll” to propose meeting times.')
    ]);
  }

  function copyLinkFromHome(p) {
    var tmp = h('input', { type: 'text', value: linkFor(p.pollId), readonly: true, class: 'offscreen',
      'aria-hidden': 'true', tabindex: '-1' });
    document.body.appendChild(tmp);
    Dom.copyText(tmp).then(function (ok) {
      document.body.removeChild(tmp);
      if (ok) {
        state.message = { kind: 'ok', text: 'Link copied for “' + p.title + '”.' };
        render();
      } else {
        openShare({ mode: 'link', pollId: p.pollId, title: p.title });
      }
    });
  }

  function confirmDelete(p) {
    Dom.confirmDialog({
      title: 'Delete “' + p.title + '”?',
      lines: ['This removes the poll and all of its responses. Its link will stop working.'],
      okLabel: 'Delete poll',
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      call('apiDeletePoll', p.pollId).then(function () {
        state.message = { kind: 'ok', text: 'Deleted “' + p.title + '”.' };
        loadPolls();
      }, function (err) {
        if (handleSpecial(err)) return;
        state.message = { kind: 'error', text: failureText(err) };
        render();
      });
    });
  }

  // ---- Wizard ----------------------------------------------------------------

  function startNew() {
    state.draft = { pollId: null, title: '', weekStart: '', lengthMin: 60, blocks: [], invitees: [] };
    state.original = null;
    openWizard(1);
  }

  function startEdit(pollId) {
    state.view = 'loading';
    state.message = null;
    render();
    call('apiGetPoll', pollId).then(function (bundle) {
      state.original = bundle;
      state.draft = L.draftFromBundle(bundle);
      openWizard(4);
    }, function (err) {
      if (handleSpecial(err)) return;
      state.message = { kind: 'error', text: failureText(err) };
      loadPolls();
    });
  }

  function openWizard(maxStep) {
    state.step = 1;
    state.maxStep = maxStep;
    state.stepMessage = '';
    state.renaming = null;
    state.message = null;
    state.saving = false;
    state.dirty = false;
    state.dayFilter = 0;
    state.view = 'wizard';
    render();
  }

  function stepErrors(step) {
    var d = state.draft, errs = [];
    if (step === 1) {
      var title = L.normalizeName(d.title);
      if (!title) errs.push('Add a title.');
      else if (title.length > L.TITLE_MAX) errs.push('The title must be ' + L.TITLE_MAX + ' characters or fewer.');
      if (!L.isMonday(d.weekStart)) errs.push('Pick a week.');
    }
    if (step === 2 && d.blocks.length === 0) errs.push('Add at least one time.');
    if (step === 3 && d.invitees.length === 0) errs.push('Add at least one invitee.');
    return errs;
  }

  function goStep(n) {
    for (var s = state.step; s < n; s++) {
      var errs = stepErrors(s);
      if (errs.length) {
        state.stepMessage = errs.join(' ');
        render();
        return;
      }
    }
    state.step = n;
    state.maxStep = Math.max(state.maxStep, n);
    state.stepMessage = '';
    state.renaming = null;
    render();
    window.scrollTo(0, 0);
  }

  function cancelWizard() {
    if (!state.dirty) {
      goHome();
      return;
    }
    Dom.confirmDialog({ title: 'Discard your changes?', lines: ['Nothing has been saved yet.'], okLabel: 'Discard', danger: true })
      .then(function (yes) { if (yes) goHome(); });
  }

  function renderWizard() {
    var bodies = [renderDetails, renderTimes, renderInvitees, renderReview];
    var steps = h('ol', { class: 'steps' }, STEPS.map(function (label, i) {
      var n = i + 1;
      var cls = 'step' + (n === state.step ? ' current' : n <= state.maxStep ? ' done' : '');
      return h('li', { class: cls }, h('button', {
        type: 'button',
        disabled: n === state.step || n > state.maxStep,
        'aria-current': n === state.step ? 'step' : null,
        onclick: function () { goStep(n); }
      }, n + '. ' + label));
    }));
    return h('section', null, [
      h('h1', null, state.draft.pollId ? 'Edit poll' : 'New poll'),
      steps,
      messageEl(),
      bodies[state.step - 1]()
    ]);
  }

  // Step 1: details

  function renderDetails() {
    var d = state.draft;
    var weekInfo = h('p', { class: 'note' });
    function showWeek() {
      Dom.clear(weekInfo);
      if (!L.isMonday(d.weekStart)) return;
      weekInfo.appendChild(document.createTextNode('Week of ' + L.formatWeekRange(d.weekStart)));
      if (L.isPastWeek(d.weekStart, L.todayIso(new Date()))) {
        weekInfo.appendChild(h('strong', { class: 'warn' }, ' — this week is in the past.'));
      }
    }
    showWeek();
    return h('div', null, [
      h('div', { class: 'field' }, [
        h('label', { for: 'f-title' }, 'Title'),
        h('input', {
          type: 'text', id: 'f-title', value: d.title, maxlength: String(L.TITLE_MAX),
          placeholder: 'e.g., P&T Committee: Fall review',
          oninput: function (e) { d.title = e.target.value; changed(); }
        })
      ]),
      h('div', { class: 'field' }, [
        h('label', { for: 'f-week' }, 'Week'),
        h('p', { class: 'note' }, 'Pick any day. The poll uses that Monday–Friday.'),
        h('input', {
          type: 'date', id: 'f-week', value: d.weekStart,
          onchange: function (e) {
            var monday = L.weekStartFor(e.target.value);
            if (!monday) return;
            d.weekStart = monday;
            e.target.value = monday;
            changed();
            showWeek();
          }
        }),
        weekInfo
      ]),
      h('fieldset', { class: 'field' }, [
        h('legend', null, 'Meeting length'),
        h('div', { class: 'radio-row' }, L.LENGTHS.map(function (len) {
          return h('label', null, [
            h('input', {
              type: 'radio', name: 'f-length', value: String(len), checked: d.lengthMin === len,
              'data-key': 'len-' + len, onchange: function () { changeLength(len); }
            }),
            ' ' + len + ' minutes'
          ]);
        }))
      ]),
      stepMessageEl(),
      h('div', { class: 'toolbar' }, [
        btn('← Back to my polls', cancelWizard),
        btn('Next: Times →', function () { goStep(2); }, 'primary')
      ])
    ]);
  }

  function changeLength(len) {
    var d = state.draft;
    if (len === d.lengthMin) return;
    var result = L.resizeBlocks(d.blocks, len);
    if (result.removed.length === 0) {
      d.lengthMin = len;
      d.blocks = result.kept;
      changed();
      state.focusKey = 'len-' + len;
      render();
      return;
    }
    Dom.confirmDialog({
      title: 'Some times no longer fit',
      lines: ['With ' + len + '-minute meetings, these times would overlap another time or end after 6:00 PM. They will be removed:']
        .concat(result.removed.map(function (b) { return '• ' + L.blockLabel(b, len); })),
      okLabel: 'Change length'
    }).then(function (yes) {
      if (yes) {
        d.lengthMin = len;
        d.blocks = result.kept;
        changed();
      }
      state.focusKey = 'len-' + d.lengthMin;
      render();
    });
  }

  // Step 2: times

  function renderTimes() {
    var d = state.draft;
    var count = d.blocks.length;
    return h('div', null, [
      h('p', null, 'Click a start time to add a ' + d.lengthMin + '-minute block. Click a block to remove it.'),
      h('p', { class: 'note' }, weekLine(d.weekStart)),
      dayTabsIfNarrow(d.weekStart),
      stepMessageEl(),
      Grid.render({
        mode: 'edit', weekStart: d.weekStart, lengthMin: d.lengthMin, blocks: d.blocks,
        dayFilter: currentDayFilter(), onCellClick: addBlock, onBlockClick: removeBlock
      }),
      h('p', { class: 'counter' }, count === 1 ? '1 time proposed' : count + ' times proposed'),
      h('div', { class: 'toolbar' }, [
        btn('← Back', function () { goStep(1); }),
        btn('Tentative schedule complete →', function () { goStep(3); }, 'primary', { disabled: count === 0 })
      ])
    ]);
  }

  function addBlock(day, startMin) {
    var d = state.draft;
    var check = L.checkPlacement(d.blocks, day, startMin, d.lengthMin);
    state.focusKey = 'c-' + day + '-' + startMin;
    if (!check.ok) {
      state.stepMessage = L.placementMessage(check, d.lengthMin);
      render();
      return;
    }
    d.blocks = L.sortBlocks(d.blocks.concat([{ blockId: null, day: day, startMin: startMin }]));
    state.stepMessage = '';
    changed();
    render();
  }

  function removeBlock(block) {
    var d = state.draft;
    d.blocks = d.blocks.filter(function (b) { return !(b.day === block.day && b.startMin === block.startMin); });
    state.focusKey = 'c-' + block.day + '-' + block.startMin;
    state.stepMessage = '';
    changed();
    render();
  }

  // Step 3: invitees

  function renderInvitees() {
    var d = state.draft;
    var paste = h('textarea', { id: 'f-paste', rows: '5', placeholder: 'One name per line', 'data-key': 'paste' });
    var single = h('input', {
      type: 'text', id: 'f-name', maxlength: String(L.NAME_MAX), placeholder: 'Name', 'data-key': 'single',
      onkeydown: function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          addNames(single.value, 'single');
        }
      }
    });
    var list = d.invitees.map(function (p, i) { return state.renaming === i ? renameRow(p, i) : nameRow(p, i); });
    return h('div', null, [
      h('div', { class: 'field' }, [
        h('label', { for: 'f-paste' }, 'Paste a list of names'),
        paste,
        btn('Add names', function () { addNames(paste.value, 'paste'); })
      ]),
      h('div', { class: 'field' }, [
        h('label', { for: 'f-name' }, 'Or add one name'),
        h('div', { class: 'inline-row' }, [single, btn('Add', function () { addNames(single.value, 'single'); })])
      ]),
      stepMessageEl(),
      h('h2', null, 'Invitees (' + d.invitees.length + ')'),
      list.length ? h('ul', { class: 'name-editor' }, list) : h('p', { class: 'note' }, 'No invitees yet.'),
      h('h2', null, 'Preview'),
      h('p', { class: 'note' }, weekLine(d.weekStart)),
      dayTabsIfNarrow(d.weekStart),
      previewGrid(),
      h('div', { class: 'toolbar' }, [
        btn('← Back', function () { goStep(2); }),
        btn('Next: Review →', function () { goStep(4); }, 'primary', { disabled: d.invitees.length === 0 })
      ])
    ]);
  }

  function nameRow(p, i) {
    return h('li', null, [
      h('span', { class: 'name-text' }, p.name),
      btn('Rename', function () {
        state.renaming = i;
        state.focusKey = 'rename-' + i;
        render();
      }, 'link', { 'aria-label': 'Rename ' + p.name }),
      btn('Remove', function () { removeInvitee(i); }, 'link', { 'aria-label': 'Remove ' + p.name })
    ]);
  }

  function renameRow(p, i) {
    var input = h('input', {
      type: 'text', value: p.name, maxlength: String(L.NAME_MAX), 'data-key': 'rename-' + i,
      'aria-label': 'New name for ' + p.name,
      onkeydown: function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitRename(i, input.value);
        }
        if (e.key === 'Escape') {
          state.renaming = null;
          render();
        }
      }
    });
    return h('li', null, [
      input,
      btn('Save', function () { commitRename(i, input.value); }, 'primary'),
      btn('Cancel', function () { state.renaming = null; render(); })
    ]);
  }

  function addNames(text, focusKey) {
    var d = state.draft;
    var names = L.parseNameList(text);
    if (!names.length) return;
    var taken = {};
    d.invitees.forEach(function (p) { taken[L.nameKey(p.name)] = true; });
    var added = [], skipped = [], tooLong = [];
    names.forEach(function (n) {
      if (n.length > L.NAME_MAX) { tooLong.push(n); return; }
      if (taken[L.nameKey(n)]) { skipped.push(n); return; }
      taken[L.nameKey(n)] = true;
      added.push({ inviteeId: null, name: n });
    });
    d.invitees = d.invitees.concat(added);
    var notes = [];
    if (skipped.length) notes.push('Already on the list: ' + skipped.join(', ') + '.');
    if (tooLong.length) notes.push('Names must be ' + L.NAME_MAX + ' characters or fewer: ' + tooLong.join(', ') + '.');
    state.stepMessage = notes.join(' ');
    if (added.length) changed();
    state.focusKey = focusKey;
    render();
  }

  function commitRename(i, value) {
    var d = state.draft;
    var name = L.normalizeName(value);
    var clash = d.invitees.some(function (p, j) { return j !== i && L.nameKey(p.name) === L.nameKey(name); });
    if (!name) state.stepMessage = 'Names cannot be blank.';
    else if (name.length > L.NAME_MAX) state.stepMessage = 'Names must be ' + L.NAME_MAX + ' characters or fewer.';
    else if (clash) state.stepMessage = '“' + name + '” is already on the list.';
    else {
      d.invitees[i] = { inviteeId: d.invitees[i].inviteeId, name: name };
      state.renaming = null;
      state.stepMessage = '';
      changed();
    }
    state.focusKey = state.renaming === null ? null : 'rename-' + i;
    render();
  }

  function removeInvitee(i) {
    state.draft.invitees.splice(i, 1);
    state.renaming = null;
    state.stepMessage = '';
    changed();
    render();
  }

  function previewGrid() {
    var d = state.draft;
    return Grid.render({
      mode: 'names', weekStart: d.weekStart, lengthMin: d.lengthMin, blocks: d.blocks, dayFilter: currentDayFilter(),
      invitees: d.invitees, ticks: {}, counts: {}, best: [], activeInviteeId: null, showCounts: false
    });
  }

  // Step 4: review

  function renderReview() {
    var d = state.draft;
    var errors = L.validateDraft(d);
    var rows = [
      ['Title', L.normalizeName(d.title), 1],
      ['Week', L.formatWeekRange(d.weekStart), 1],
      ['Meeting length', d.lengthMin + ' minutes', 1],
      ['Proposed times', String(d.blocks.length), 2],
      ['Invitees', d.invitees.map(function (p) { return p.name; }).join(', '), 3]
    ];
    var label = state.saving ? 'Saving…' : d.pollId ? 'Save changes' : 'Confirm & create link';
    return h('div', null, [
      h('dl', { class: 'summary' }, rows.map(function (r) {
        return [
          h('dt', null, r[0]),
          h('dd', null, [r[1] + ' ', btn('Edit', function () { goStep(r[2]); }, 'link', { 'aria-label': 'Edit ' + r[0].toLowerCase() })])
        ];
      })),
      errors.length ? h('div', { class: 'msg msg-error', role: 'alert' }, errors.join(' ')) : null,
      stepMessageEl(),
      h('h2', null, 'What invitees will see'),
      h('p', { class: 'note' }, weekLine(d.weekStart)),
      dayTabsIfNarrow(d.weekStart),
      previewGrid(),
      h('div', { class: 'toolbar' }, [
        btn('← Back', function () { goStep(3); }),
        btn(label, confirmSave, 'primary', { disabled: errors.length > 0 || state.saving })
      ])
    ]);
  }

  function toServerDraft(d) {
    return {
      pollId: d.pollId,
      title: d.title,
      weekStart: d.weekStart,
      lengthMin: d.lengthMin,
      blocks: d.blocks.map(function (b) { return { blockId: b.blockId, day: b.day, startMin: b.startMin }; }),
      invitees: d.invitees.map(function (p) { return { inviteeId: p.inviteeId, name: p.name }; })
    };
  }

  function confirmSave() {
    var d = state.draft;
    var lines = state.original ? L.describeImpact(L.editImpact(state.original, d)) : [];
    var proceed = lines.length
      ? Dom.confirmDialog({ title: 'Some answers will be deleted', lines: lines, okLabel: 'Save anyway', danger: true })
      : Promise.resolve(true);
    proceed.then(function (yes) {
      if (!yes) return;
      state.saving = true;
      state.stepMessage = '';
      render();
      call('apiSavePoll', toServerDraft(d)).then(function (res) {
        state.saving = false;
        state.dirty = false;
        openShare({ mode: d.pollId ? 'edited' : 'created', pollId: res.pollId, title: L.normalizeName(d.title) });
      }, function (err) {
        state.saving = false;
        if (handleSpecial(err)) return;
        state.stepMessage = err.code === 'network'
          ? 'Couldn’t save. Check your connection and try again.'
          : failureText(err);
        render();
      });
    });
  }

  // ---- Share -----------------------------------------------------------------

  function openShare(share) {
    state.share = share;
    state.draft = null;
    state.original = null;
    state.view = 'share';
    render();
  }

  function renderShare() {
    var s = state.share;
    var input = h('input', {
      type: 'text', id: 'share-link', readonly: true, value: linkFor(s.pollId), 'aria-label': 'Poll link',
      onfocus: function (e) { e.target.select(); }
    });
    var status = h('p', { class: 'note', role: 'status' });
    var heading = s.mode === 'created' ? 'Your poll is ready'
      : s.mode === 'edited' ? 'Changes saved' : 'Link for “' + s.title + '”';
    var intro = s.mode === 'edited'
      ? 'The link for “' + s.title + '” has not changed.'
      : 'Send this link to your invitees. Anyone with the link can mark their availability.';
    return h('section', null, [
      h('h1', null, heading),
      h('p', null, intro),
      h('div', { class: 'link-row' }, [input, btn('Copy', function () {
        Dom.copyText(input).then(function (ok) {
          status.textContent = ok ? 'Link copied.' : 'Select the link and press ⌘C (Mac) or Ctrl+C (Windows) to copy it.';
        });
      }, 'primary')]),
      status,
      h('div', { class: 'toolbar' }, [
        btn('← My polls', goHome),
        btn('View results', function () { openResults(s.pollId); })
      ])
    ]);
  }

  // ---- Results ---------------------------------------------------------------

  function openResults(pollId) {
    state.view = 'loading';
    state.message = null;
    render();
    call('apiGetPoll', pollId).then(function (bundle) {
      state.results = bundle;
      state.dayFilter = 0;
      state.view = 'results';
      render();
    }, function (err) {
      if (handleSpecial(err)) return;
      state.message = { kind: 'error', text: failureText(err) };
      loadPolls();
    });
  }

  function renderResults() {
    var b = state.results, poll = b.poll;
    var t = L.tally(b.blocks, b.invitees, b.responses);
    var total = b.invitees.length;
    var pending = b.invitees.filter(function (p) { return !p.respondedAt; });
    var bestLabels = b.blocks
      .filter(function (x) { return t.best.indexOf(x.blockId) !== -1; })
      .map(function (x) { return L.blockLabel(x, poll.lengthMin); });
    return h('section', null, [
      h('h1', null, poll.title),
      h('p', { class: 'note' }, 'Week of ' + L.formatWeekRange(poll.weekStart) + ' · ' + poll.lengthMin +
        '-minute meeting · All times Eastern (Bloomington)'),
      h('p', null, (total - pending.length) + ' of ' + total + ' responded.'),
      bestLabels.length
        ? h('p', null, [h('strong', null, 'Most available: '), bestLabels.join('; ') + ' (' + t.max + ' of ' + total + ')'])
        : h('p', { class: 'note' }, 'No one has ticked a time yet.'),
      dayTabsIfNarrow(poll.weekStart),
      Grid.render({
        mode: 'names', weekStart: poll.weekStart, lengthMin: poll.lengthMin, blocks: b.blocks,
        dayFilter: currentDayFilter(), invitees: b.invitees, ticks: t.ticks, counts: t.counts, best: t.best,
        activeInviteeId: null, showCounts: true
      }),
      h('h2', null, 'Not yet responded'),
      pending.length
        ? h('ul', { class: 'plain-list' }, pending.map(function (p) { return h('li', null, p.name); }))
        : h('p', null, 'Everyone has responded.'),
      h('div', { class: 'toolbar' }, [
        btn('← My polls', goHome),
        h('div', { class: 'actions' }, [
          btn('Refresh', function () { openResults(poll.pollId); }),
          btn('Edit poll', function () { startEdit(poll.pollId); }),
          btn('Copy link', function () { openShare({ mode: 'link', pollId: poll.pollId, title: poll.title }); })
        ])
      ])
    ]);
  }

  // ---- Data sheet recovery ---------------------------------------------------

  function renderSheetMissing() {
    return h('section', null, [
      h('h1', null, 'The data sheet is missing'),
      h('p', null, 'The Google Sheet that stores your polls can’t be opened. It may have been deleted. ' +
        'You can start a new, empty data sheet.'),
      messageEl(),
      btn('Create a new data sheet', function () {
        call('apiCreateDataSheet').then(function () {
          state.message = { kind: 'ok', text: 'Created a new data sheet.' };
          loadPolls();
        }, function (err) {
          state.message = { kind: 'error', text: failureText(err) };
          render();
        });
      }, 'primary')
    ]);
  }

  // ---- Start -----------------------------------------------------------------

  window.addEventListener('beforeunload', function (e) {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  Grid.onNarrowChange(function () {
    if (state.view === 'wizard' || state.view === 'results') render();
  });
  goHome();
})();
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, `# fail 0` (84 tests)

- [ ] **Step 7: Click through the organizer page in the preview**

Run `npm run build`. Start (or reuse) the `preview` server and open `http://localhost:8765/organizer.html`. In the page, run `PreviewShim.reset()` with `javascript_tool`, then reload. Check each item and fix any mismatch before moving on:

1. Home shows "My polls", a **New poll** button and "No polls yet. Click “New poll” to propose meeting times."
2. **New poll** → step 1. **Next: Times →** with nothing filled shows "Add a title. Pick a week."
3. Type the title "Test committee". Set the week field to `2026-10-21` (use `form_input`); the field changes to `2026-10-19` and "Week of Oct 19–23, 2026" appears. 60 minutes is preselected. **Next: Times →** opens step 2.
4. Step 2 shows five dated columns ("Mon, Oct 19" … "Fri, Oct 23"), rows 8:00 AM to 5:30 PM, "All times Eastern (Bloomington)", and **Tentative schedule complete →** disabled with "0 times proposed".
5. Click Mon 9:00 AM → a crimson block "9:00–10:00 AM" spanning two rows; "1 time proposed".
6. Click Mon 8:30 AM (free, but 8:30–9:30 would overlap) → no block; message "Overlaps the 9:00–10:00 AM block". Clicking 9:30 itself would hit the existing block and remove it. Click Fri 5:30 PM → "Would end after 6:00 PM".
7. Add Mon 10:00 AM and Tue 2:00 PM. Click the Tue block → it disappears. Add it again; "3 times proposed".
8. Click step "1. Details", choose 90 minutes → dialog "Some times no longer fit" listing "• Mon 10:00–11:30 AM". **Cancel** → 60 minutes still selected. Choose 90 again → **Change length** → step 2 shows two 90-minute blocks.
9. **Tentative schedule complete →** → step 3. Paste `Ana`, `Raj`, `ana`, `Lee` (one per line) and click **Add names** → list shows Ana, Raj, Lee; message "Already on the list: ana.". Rename Lee to "Lee Kim". The preview grid shows each block with three disabled checkboxes and no counts.
10. **Next: Review →** → summary rows (Title, Week "Oct 19–23, 2026", Meeting length "90 minutes", Proposed times "2", Invitees "Ana, Raj, Lee Kim") and the preview grid. Run `PreviewShim.failNextCall()`, then click **Confirm & create link** → "Couldn’t save. Check your connection and try again." Click it again → "Your poll is ready" with a link `http://localhost:8765/invitee.html?poll=XXXXXXXX` (8 characters). **Copy** shows "Link copied." or the select-and-copy hint.
11. **← My polls** → one row: "Test committee", "Week of Oct 19–23, 2026 · 90 min · 0 of 3 responded".
12. **Results** → "0 of 3 responded.", "No one has ticked a time yet.", every block "0 of 3", and "Not yet responded" listing Ana, Raj, Lee Kim.
13. **Edit poll** → wizard at step 1 with every step clickable. Go to step 2, remove one block, go to step 4, **Save changes** → no dialog (nobody responded) → "Changes saved" and the same link.
14. Home → **Delete** → dialog "Delete “Test committee”?" → **Delete poll** → "Deleted “Test committee”." and the empty list.
15. Run `PreviewShim.simulateMissingSheet()`, click **New poll**, fill steps 1–3 quickly and confirm → "The data sheet is missing" page. **Create a new data sheet** → "Created a new data sheet." and the poll list.
16. Resize to the `mobile` preset, start a new poll and reach step 2 → Mon–Fri day tabs above a one-column grid; tapping **Wed** shows Wednesday's column. Reset the size with the `desktop` preset.
17. Keyboard: on step 2, Tab to a grid cell and press Enter → a block is added and focus stays on it; press Enter again → it is removed.
18. `read_console_messages` with `onlyErrors: true` returns nothing. (Chrome's "Blocked attempt to show a 'beforeunload' confirmation panel…" is expected when a scripted click leaves a page with unsaved changes; it is not an app error.)

- [ ] **Step 8: Commit**

```bash
git add src/client/grid.js src/client/organizer.html src/client/organizer.js test/build.test.js
git commit -m "feat: add calendar grid and organizer page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: Invitee page

**Files:**
- Create: `src/client/invitee.html`, `src/client/invitee.js`
- Modify: `test/build.test.js` (append a test)

**Interfaces:**
- Consumes: `Logic`, `Dom`, `Api`, `Grid` (Tasks 1–7); `apiGetPublicPoll(pollId)` and `apiSaveResponse(pollId, inviteeId, blockIds, version)` (Task 5); `window.BOOT = {pollId}`.
- Produces: the invitee page, which defines no globals. It remembers the chosen invitee in localStorage under `ms-invitee-<pollId>`.

- [ ] **Step 1: Append the failing build test to `test/build.test.js`**

```js
test('invitee page and its script are built', () => {
  assert.match(dist('invitee.html'), /<\?!= include\('js_invitee'\) \?>/);
  assert.match(dist('js_invitee.html'), /^<script>\n[\s\S]*<\/script>\n$/);
  const html = preview('invitee.html');
  assert.equal(html.indexOf('<?'), -1);
  assert.match(html, /PreviewShim\.boot\("invitee"\)/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/build.test.js`
Expected: FAIL with `ENOENT: no such file or directory, open '.../dist/invitee.html'`

- [ ] **Step 3: Write `src/client/invitee.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <?!= include('styles') ?>
</head>
<body>
  <header class="topbar"><div class="topbar-inner">Meeting Scheduler</div></header>
  <main id="app" class="container"></main>
  <div id="dialog-root"></div>
  <script>window.BOOT = <?!= bootJson ?>;</script>
  <?!= include('js_logic') ?>
  <?!= include('js_dom') ?>
  <?!= include('js_api') ?>
  <?!= include('js_grid') ?>
  <?!= include('js_invitee') ?>
</body>
</html>
```

- [ ] **Step 4: Write `src/client/invitee.js`**

```js
/* Invitee page: pick your name, tick the times that work, save. */
(function () {
  var h = Dom.h;
  var btn = Dom.btn;
  var L = Logic;
  var app = document.getElementById('app');
  var boot = window.BOOT || {};
  var pollId = String(boot.pollId || '');
  var storageKey = 'ms-invitee-' + pollId;

  var state = {
    view: 'loading', // loading | poll | gone | load_error
    poll: null,
    me: null, // inviteeId of the visitor
    pending: [], // blockIds the visitor has ticked (saved or not)
    dirty: false,
    saving: false,
    message: null, // {kind: 'error'|'ok'|'info', text, retry?}
    dayFilter: 0,
    focusKey: null
  };

  function findInvitee(id) {
    return state.poll.invitees.filter(function (p) { return p.inviteeId === id; })[0] || null;
  }

  function savedTicks(id) {
    return state.poll.responses
      .filter(function (r) { return r.inviteeId === id; })
      .map(function (r) { return r.blockId; });
  }

  // Saved answers from everyone else plus the visitor's current (maybe unsaved) ticks.
  function shownResponses() {
    if (!state.me) return state.poll.responses;
    return state.poll.responses
      .filter(function (r) { return r.inviteeId !== state.me; })
      .concat(state.pending.map(function (id) { return { inviteeId: state.me, blockId: id }; }));
  }

  // ---- Loading ---------------------------------------------------------------

  function load(message) {
    Api.call('apiGetPublicPoll', pollId).then(function (poll) {
      state.poll = poll;
      if (!state.me) state.me = Dom.storageGet(storageKey);
      if (state.me && !findInvitee(state.me)) {
        state.me = null;
        Dom.storageRemove(storageKey);
      }
      state.pending = state.me ? savedTicks(state.me) : [];
      state.dirty = false;
      state.message = message || null;
      state.view = 'poll';
      render();
    }, function (err) {
      state.view = err.code === 'not_found' || err.code === 'sheet_missing' ? 'gone' : 'load_error';
      render();
    });
  }

  // ---- Rendering -------------------------------------------------------------

  function render() {
    var views = { loading: renderLoading, gone: renderGone, load_error: renderLoadError, poll: renderPoll };
    Dom.clear(app).appendChild(views[state.view]());
    Dom.focusByKey(app, state.focusKey);
    state.focusKey = null;
  }

  function renderLoading() {
    return h('p', { class: 'note' }, 'Loading…');
  }

  function renderGone() {
    return h('section', null, [h('h1', null, 'Poll not available'), h('p', null, 'This poll is no longer available.')]);
  }

  function renderLoadError() {
    return h('section', null, [
      h('h1', null, 'Couldn’t load this poll'),
      h('div', { class: 'msg msg-error', role: 'alert' }, [
        h('span', null, 'Check your connection and try again.'),
        btn('Try again', function () {
          state.view = 'loading';
          render();
          load();
        }, 'link')
      ])
    ]);
  }

  function renderPoll() {
    var p = state.poll;
    var t = L.tally(p.blocks, p.invitees, shownResponses());
    var narrow = Grid.isNarrow();
    return h('section', null, [
      h('h1', null, p.title),
      h('p', { class: 'note' }, 'Week of ' + L.formatWeekRange(p.weekStart) + ' · ' + p.lengthMin + '-minute meeting'),
      h('p', { class: 'tz' }, 'All times Eastern (Bloomington)'),
      whoEl(),
      narrow ? Grid.dayTabs(p.weekStart, state.dayFilter, function (day) {
        state.dayFilter = day;
        state.focusKey = 'tab-' + day;
        render();
      }) : null,
      Grid.render({
        mode: 'names', weekStart: p.weekStart, lengthMin: p.lengthMin, blocks: p.blocks,
        dayFilter: narrow ? state.dayFilter : null, invitees: p.invitees, ticks: t.ticks, counts: t.counts,
        best: t.best, activeInviteeId: state.me, showCounts: true, onToggle: toggle
      }),
      saveBar()
    ]);
  }

  function whoEl() {
    if (state.me) {
      return h('div', null, [
        h('p', { class: 'who' }, ['You are ', h('strong', null, findInvitee(state.me).name), '. ',
          btn('Not you? Switch', switchPerson, 'link')]),
        h('p', null, 'Tick every time that works for you, then click “Save my availability.”')
      ]);
    }
    var options = [h('option', { value: '' }, 'Choose your name…')].concat(state.poll.invitees.map(function (x) {
      return h('option', { value: x.inviteeId }, x.name);
    }));
    return h('div', { class: 'field' }, [
      h('label', { for: 'f-who' }, 'Who are you?'),
      h('select', { id: 'f-who', onchange: function (e) { if (e.target.value) choosePerson(e.target.value); } }, options),
      h('p', { class: 'note' }, 'Not on the list? Contact the organizer.')
    ]);
  }

  function saveBar() {
    var msg = Dom.messageBox(state.message);
    if (!state.me) return msg ? h('div', { class: 'toolbar-sticky' }, msg) : null;
    return h('div', { class: 'toolbar-sticky' }, [
      msg,
      h('div', { class: 'save-row' }, [
        h('span', { class: 'note' }, state.dirty ? 'You have unsaved changes.' : ''),
        btn(state.saving ? 'Saving…' : 'Save my availability', save, 'primary', { disabled: state.saving })
      ])
    ]);
  }

  // ---- Actions ---------------------------------------------------------------

  function choosePerson(id) {
    state.me = id;
    Dom.storageSet(storageKey, id);
    state.pending = savedTicks(id);
    state.dirty = false;
    state.message = null;
    render();
  }

  function switchPerson() {
    var go = state.dirty
      ? Dom.confirmDialog({ title: 'Discard your unsaved ticks?', lines: ['Your changes have not been saved.'], okLabel: 'Discard', danger: true })
      : Promise.resolve(true);
    go.then(function (yes) {
      if (!yes) return;
      state.me = null;
      Dom.storageRemove(storageKey);
      state.pending = [];
      state.dirty = false;
      state.message = null;
      render();
    });
  }

  function toggle(blockId, checked) {
    var i = state.pending.indexOf(blockId);
    if (checked && i === -1) state.pending.push(blockId);
    if (!checked && i !== -1) state.pending.splice(i, 1);
    state.dirty = true;
    state.message = null;
    state.focusKey = 't-' + blockId;
    render();
  }

  function save() {
    var go = state.pending.length === 0
      ? Dom.confirmDialog({
          title: 'None of these times work for you?',
          lines: ['Saving with no times ticked tells the organizer that none of these times work.'],
          okLabel: 'Save',
          cancelLabel: 'Go back'
        })
      : Promise.resolve(true);
    go.then(function (yes) {
      if (!yes) return;
      state.saving = true;
      state.message = null;
      render();
      Api.call('apiSaveResponse', pollId, state.me, state.pending.slice(), state.poll.version).then(function () {
        state.saving = false;
        state.dirty = false;
        load({ kind: 'ok', text: 'Saved. You can return to this link and change your answers any time.' });
      }, function (err) {
        state.saving = false;
        if (err.code === 'stale') {
          state.dirty = false;
          load({ kind: 'info', text: 'The organizer updated this poll. Please review your answers.' });
          return;
        }
        if (err.code === 'not_found' || err.code === 'sheet_missing') {
          state.dirty = false;
          state.view = 'gone';
          render();
          return;
        }
        state.message = { kind: 'error', text: 'Couldn’t save. Check your connection and try again.', retry: save };
        render();
      });
    });
  }

  // ---- Start -----------------------------------------------------------------

  window.addEventListener('beforeunload', function (e) {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  Grid.onNarrowChange(function () {
    if (state.view === 'poll') render();
  });
  load();
})();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, `# fail 0` (85 tests)

- [ ] **Step 6: Click through the invitee page in the preview**

Run `npm run build`. Start (or reuse) the `preview` server. On `http://localhost:8765/organizer.html`, run `PreviewShim.reset()`, reload, and create a poll: title "Budget review", week of 2026-10-19, 60 minutes, blocks Mon 9:00 AM, Tue 10:00 AM and Wed 2:00 PM, invitees Ana, Raj and Lee. Copy the link it shows. Check each item and fix any mismatch before moving on:

1. Open the link. The page shows "Budget review", "Week of Oct 19–23, 2026 · 60-minute meeting", "All times Eastern (Bloomington)", a "Who are you?" dropdown, "Not on the list? Contact the organizer.", and a read-only grid where every checkbox is disabled and every block shows "0 of 3". There is no Save button.
2. Choose "Ana" → "You are Ana. Not you? Switch"; Ana's row in each block is bold, outlined and clickable; the others stay disabled; a sticky **Save my availability** bar appears.
3. Tick Mon and Tue → those blocks show "1 of 3", both carry the **Most available** badge and a light-crimson inner border, and the bar says "You have unsaved changes."
4. **Save my availability** → "Saved. You can return to this link and change your answers any time."; the unsaved-changes note disappears.
5. Reload → still "You are Ana" with Mon and Tue ticked.
6. **Not you? Switch** → the dropdown returns. Choose "Raj", tick only Tue, save → Tue shows "2 of 3" and is the only **Most available** block.
7. Switch to "Lee", tick nothing, click save → dialog "None of these times work for you?". **Go back** closes it without saving; save again and confirm with **Save** → "Saved. …".
8. In the organizer page (same browser), open **Results** → "3 of 3 responded.", "Most available: Tue 10:00–11:00 AM (2 of 3)", "Everyone has responded."
9. Stale check: with the invitee page open as Lee, tick Wed (do not save). In the organizer tab, **Edit poll**, remove the Wed block, go to step 4 and **Save changes** (no dialog, because nobody ticked Wed in saved data). Back in the invitee tab click **Save my availability** → the page reloads with "The organizer updated this poll. Please review your answers." and the Wed block is gone.
10. Edit-impact check: in the organizer, **Edit poll**, remove the Tue block, **Save changes** → dialog "Some answers will be deleted" with "Ana and Raj ticked Tue 10:00–11:00 AM. Removing this time deletes those answers." **Cancel** keeps the poll unchanged. Then change the length to 30 minutes and save → dialog "You changed the meeting length. All answers from Ana, Raj and Lee will be cleared, and they will need to respond again." **Save anyway** → Results shows "0 of 3 responded."
11. Reload the invitee tab (the poll changed in step 10). Run `PreviewShim.failNextCall()`, tick a time and save → "Couldn’t save. Check your connection and try again." with **Try again**; click it → "Saved. …".
12. Open `http://localhost:8765/invitee.html?poll=zzzzzzzz` → "Poll not available" / "This poll is no longer available."
13. Resize to the `mobile` preset and open the poll link → Mon–Fri tabs above one column; the Save bar stays visible at the bottom while scrolling. Reset with the `desktop` preset.
14. Keyboard: Tab to the active checkbox and press Space → it toggles and focus stays on it.
15. `read_console_messages` with `onlyErrors: true` returns nothing. (Chrome's "Blocked attempt to show a 'beforeunload' confirmation panel…" is expected when a scripted click leaves a page with unsaved changes; it is not an app error.)

- [ ] **Step 7: Commit**

```bash
git add src/client/invitee.html src/client/invitee.js test/build.test.js
git commit -m "feat: add invitee page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: README and full pre-deployment check

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: every earlier task.
- Produces: `README.md`, which Task 10 follows for deployment.

- [ ] **Step 1: Write `README.md`**

````markdown
# Meeting Scheduler

A scheduling-poll web app on Google Apps Script. The organizer proposes meeting
times on a one-week Monday–Friday grid, lists the invitees and shares one link
per poll. Anyone with the link picks their name and ticks the times that work.
Data lives in a Google Sheet ("Meeting Scheduler Data") in the organizer's Drive.

Design: `docs/superpowers/specs/2026-10-09-meeting-scheduler-design.md`

## Commands

```bash
npm test
```

```bash
npm run build
```

`npm run build` writes `dist/` (what goes into Apps Script) and `preview-dist/`
(a local preview that needs no Google account). To click through locally, serve
`preview-dist/` and open `organizer.html`:

```bash
python3 -m http.server 8765 --directory preview-dist
```

In the preview's browser console: `PreviewShim.reset()` clears the data,
`PreviewShim.failNextCall()` makes the next server call fail like a dropped
connection, and `PreviewShim.simulateMissingSheet()` acts as if the data sheet
was deleted.

## First-time setup (about 10 minutes)

Use the IU Google account first. Steps 6 and 7 check that IU allows outsiders
to open the links.

### A. Get the code into Apps Script

**Option 1 — push from this folder (recommended)**

1. Turn on the Apps Script API at https://script.google.com/home/usersettings.
2. Sign in once (a browser window opens):

   ```bash
   npx clasp login
   ```

3. Create the project and push:

   ```bash
   npx clasp create --type standalone --title "Meeting Scheduler" --rootDir dist
   ```

   ```bash
   npm run push
   ```

If Google blocks the sign-in ("This app is blocked"), use Option 2.

**Option 2 — copy and paste**

1. Run `npm run build`.
2. Go to https://script.google.com, click **New project** and rename it
   "Meeting Scheduler".
3. **Project Settings** (gear icon): tick **Show "appsscript.json" manifest
   file in editor**. Back in the editor, replace the contents of
   `appsscript.json` with `dist/appsscript.json`.
4. Delete the default `Code.gs`. For each `dist/*.js` file add a **Script** file
   with the same name (without `.js`) and paste its contents. For each
   `dist/*.html` file add an **HTML** file with the same name (without `.html`)
   and paste its contents.

### B. Deploy

5. Click **Deploy → New deployment**, choose **Web app**, set
   *Execute as:* **Me** and *Who has access:* **Anyone**, then **Deploy**.
   Authorize when asked (choose the account, then **Advanced → Go to Meeting
   Scheduler → Allow**). Copy the **Web app URL**.
   If **Anyone** is not offered, IU restricts it: repeat the setup with a
   personal Google account.

### C. Check it

6. **Outsider test.** Open the Web app URL (signed in): the organizer page
   loads ("My polls") and creates the data sheet. Create a test poll and copy
   its link. Open that link in a private window while signed out: it must load
   without asking you to sign in. If it asks, switch to a personal Google
   account.
7. **Owner test.** In the same private window, open the bare Web app URL. It
   must say "This page is for the organizer only."
   - If your own signed-in browser *also* sees that message, use the secret
     link instead: in the Apps Script editor select `setupAdminKey`, click
     **Run**, open **Execution log**, and bookmark your Web app URL with
     `?admin=<key>` added to the end.
8. **Link check.** The link shown after creating a poll must start with your
   Web app URL. If it doesn't, open **Project Settings → Script Properties**,
   add `BASE_URL` with the Web app URL as its value, and reload.
9. **Smoke test.** Open the test poll link twice (two private windows), answer
   as two different invitees, then check **Results** ("2 of N responded", the
   counts and "Most available") and the rows in the "Meeting Scheduler Data"
   sheet. Delete the test poll.

## Updating

```bash
npm run push
```

(or paste the changed `dist/` files), then **Deploy → Manage deployments →
Edit (pencil) → Version: New version → Deploy**. The URL stays the same.

## Script Properties

| Property | Set by | Meaning |
|---|---|---|
| `DATA_SHEET_ID` | the app | The data sheet's file id |
| `ADMIN_KEY` | `setupAdminKey` | Secret for the `?admin=` organizer link (fallback only) |
| `BASE_URL` | you, if needed | Overrides the base of the invitee links |
````

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, `# fail 0` (85 tests)

- [ ] **Step 3: Full click-through against the spec**

Run `npm run build`, start the `preview` server, run `PreviewShim.reset()` on `organizer.html` and reload. Repeat Task 7 Step 7 and Task 8 Step 6 end to end. Then also check:

1. Leaving the wizard with unsaved changes: on step 2 with one block added, click step "1. Details" then **← Back to my polls** → dialog "Discard your changes?"; **Cancel** keeps the draft; **Discard** returns to the poll list.
2. Past week: in step 1 pick `2026-09-30` → "Week of Sep 28 – Oct 2, 2026 — this week is in the past." The poll can still be created.
3. Weekend pick: `2026-10-24` (Saturday) → the field shows `2026-10-26`.
4. Back-to-back blocks: Mon 9:00 and Mon 10:00 with 60 minutes are both allowed.
5. 90-minute polls: the last allowed start is 4:30 PM; 5:00 PM shows "Would end after 6:00 PM".
6. A name with a formula-like prefix (`=Dean`) is shown exactly as typed in the organizer list, the preview grid and the invitee page.
7. Contrast spot check with `javascript_tool`: `getComputedStyle(document.querySelector('.btn-primary')).color` is `rgb(248, 239, 226)` and its `backgroundColor` is `rgb(153, 0, 0)`; no element uses `rgb(244, 28, 64)` as `color`:
   ```js
   [...document.querySelectorAll('*')].filter(e => getComputedStyle(e).color === 'rgb(244, 28, 64)').length
   ```
   Expected: `0`.
8. `read_console_messages` with `onlyErrors: true` returns nothing on both pages. (Chrome's "Blocked attempt to show a 'beforeunload' confirmation panel…" is expected when a scripted click leaves a page with unsaved changes; it is not an app error.)

Fix anything that does not match, rerun `npm test`, and include the fixes in this task's commit.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup, checks and updating" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Deploy with the organizer

This task needs the organizer at the keyboard: signing in to Google, authorizing the app and deploying are theirs to do. Never enter their password or approve consent screens for them.

**Files:**
- Modify: `package.json` (add the `push` script and the clasp dev dependency)
- Create (by clasp): `.clasp.json`

**Interfaces:**
- Consumes: `dist/` from `npm run build`; `README.md` setup steps.
- Produces: a deployed web app URL and a confirmed setup (outsider, owner, link and smoke tests).

- [ ] **Step 1: Add clasp and the push script**

Run:
```bash
npm install --save-dev @google/clasp@2.4.2
```

Then edit `package.json` so `scripts` reads:
```json
  "scripts": {
    "test": "node --test test/*.test.js",
    "build": "node build.js",
    "push": "node build.js && clasp push --force"
  },
```

Run: `npm test`
Expected: PASS, `# fail 0` (85 tests)

- [ ] **Step 2: Commit the tooling**

```bash
git add package.json package-lock.json
git commit -m "chore: add clasp for pushing code to Apps Script" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: The organizer turns on the Apps Script API and signs in**

Ask the organizer to open https://script.google.com/home/usersettings with their IU account and turn on **Google Apps Script API**, then run `npx clasp login` in the terminal from the repository root and finish the sign-in in their browser. If Google shows "This app is blocked" or clasp errors, switch to README Option 2 (copy and paste) and continue at Step 6.

- [ ] **Step 4: Create the Apps Script project**

Run:
```bash
npx clasp create --type standalone --title "Meeting Scheduler" --rootDir dist
```
Expected: `Created new standalone script: https://script.google.com/d/<id>/edit` and a new `.clasp.json` containing `"rootDir":"dist"`.

- [ ] **Step 5: Push the code**

Run: `npm run push`
Expected: `Pushed 15 files.` listing `dist/appsscript.json`, the four server `.js` files, `styles.html`, the six `js_*.html` files and the three page templates.

Commit `.clasp.json`:
```bash
git add .clasp.json
git commit -m "chore: link the Apps Script project" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: The organizer deploys and runs the checks**

Walk the organizer through README steps 5–9 (deploy, outsider test, owner test, link check, smoke test). Record the outcome of each:

| Check | Expected | If not |
|---|---|---|
| Deploy dialog offers *Anyone* | Yes | Redo setup with a personal Google account |
| Invitee link in a signed-out private window | Loads without sign-in | Redo setup with a personal Google account |
| Bare URL in a signed-out private window | "This page is for the organizer only." | Stop and investigate before sharing any link |
| Bare URL in the organizer's own browser | "My polls" | Run `setupAdminKey`; use the `?admin=` link |
| Link shown after creating a poll | Starts with the Web app URL | Set Script Property `BASE_URL` |
| Two invitees answer; Results and Sheet | Counts, "Most available" and rows match | Debug with the Apps Script **Executions** log |

- [ ] **Step 7: Record the deployment**

Add a short "Deployment" section to the end of `README.md` with the date, which Google account hosts the app (IU or personal), whether the `?admin=` fallback is in use, and whether `BASE_URL` was set. Do not write the admin key or the Web app URL into the repository. Commit:

```bash
git add README.md
git commit -m "docs: record deployment details" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
