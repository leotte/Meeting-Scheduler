# Portal Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Meeting Scheduler's organizer, invitee and message pages look like the Kelley Marketing Department Portal, with no change to behavior.

**Architecture:** One rewritten stylesheet built on the portal's tokens, one shared page frame (top bar in the three templates plus `Dom.pageHeader`, `Dom.sectionHeading` and `Dom.spotlight` helpers), and targeted markup changes in the organizer and invitee render functions. Server code, data, the grid's JavaScript and the accessibility layer are untouched.

**Tech Stack:** Plain JavaScript and CSS served by Google Apps Script HtmlService; Node 22 `node:test` for the build test; the local preview (`preview-dist/`, Python `http.server`) for visual checks.

**Spec:** `docs/superpowers/specs/2026-10-15-portal-restyle-design.md` (approved 2026-10-15).

## Global Constraints

- Behavior does not change: no edits to `src/shared/`, `src/server/`, `src/client/api.js`, `src/client/grid.js` or `build.js`; no new state, server calls, or event handlers beyond moving existing ones.
- Colors (exact): page `#F7F6F0`, bar `#FEFCFB`, sand `#F2EDE3`, line `#E2E1DB`, rule-tan `#B9B4AA`, field `#FFFFFF`, field-border `#8C887F`, ink `#1F1D18`, muted `#5E5A52`, meta `#6D5E4C`, crimson `#990000`, crimson-dark `#6D0808`, crimson-light `#F41C40`. The retired tokens `#F8EFE2`, `#F5E3CC`, `#EEEEF0`, `#B9C1C6`, `#072332` must not appear in `styles.css`.
- `#F41C40` is used only for the keyboard focus outline; never as a text or fill color.
- `#FFFFFF` is used only for form fields and the calendar grid surface.
- Fonts: titles, section headings and card titles in `Georgia, "Times New Roman", serif`; everything else in the system sans-serif stack. No web-font or CDN requests.
- Red caps labels are uppercased with CSS (`text-transform: uppercase`); the underlying text keeps its original case. The page label text is exactly `Kelley Marketing · Meeting Scheduler`.
- Every fixed user-facing string from the original design stays exactly as written, including: `This page is for the organizer only.`, `This poll is no longer available.`, `Not on the list? Contact the organizer.`, `Saved. You can return to this link and change your answers any time.`, `None of these times work for you?`, `The organizer updated this poll. Please review your answers.`, `Couldn’t save. Check your connection and try again.`, `Would end after 6:00 PM`, `Most available`, `Tentative schedule complete →`, `Confirm & create link`, `All times Eastern (Bloomington)`.
- The accessibility layer stays intact: every existing `data-key`, `aria-*` attribute, `role`, the `#live` region, the `#dialog-root`, the h1-focus-on-new-screen logic, and the sticky-footer scroll padding.
- All user text still reaches the page through `Dom.h` / `textContent`; no `innerHTML`.
- Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (use a second `-m`).
- All commands run from the repository root: `/Users/lrego/Dropbox/GenAI/Claude Code/Meeting Scheduler`.

## File Structure

| File | Change |
|---|---|
| `src/client/styles.css` | Rewritten around the portal tokens and components |
| `src/client/organizer.html`, `invitee.html`, `message.html` | New top bar (app icon + name); message page uses the page-header block |
| `src/client/dom.js` | Adds `Dom.pageHeader`, `Dom.sectionHeading`, `Dom.spotlight` |
| `src/client/organizer.js` | Home cards, wizard header and field rows, review/share/results spotlights and section headings, framed status pages |
| `src/client/invitee.js` | Page header block, picker field row, framed status pages |
| `test/build.test.js` | Asserts the new top bar is in every page template |

---

### Task 1: Stylesheet, page frame and frame helpers

**Files:**
- Modify: `src/client/styles.css` (replace the whole file)
- Modify: `src/client/organizer.html`, `src/client/invitee.html`, `src/client/message.html`
- Modify: `src/client/dom.js` (add three helpers and export them)
- Test: `test/build.test.js` (one assertion added inside an existing test)

**Interfaces:**
- Consumes: `Dom.h` (existing).
- Produces:
  - `Dom.pageHeader(opts) → HTMLElement` (`<header class="page-header">`) with `opts = {title: string, subtitle?: string, lines?: Node[], actions?: Node[]}`. Renders the red caps label `Kelley Marketing · Meeting Scheduler`, an `h1` with the title, an optional `p.page-subtitle`, the optional extra `lines`, and an optional `div.page-actions`. The crimson rule is the header's bottom border.
  - `Dom.sectionHeading(text: string, count?: string) → HTMLElement` (`div.section-head` containing an `h2` and an optional `span.section-count`).
  - `Dom.spotlight(opts) → HTMLElement` (`div.spotlight`) with `opts = {label?: string, headline?: string, byline?: string, body?: Node|Node[]}`; renders `p.eyebrow`, `p.spotlight-headline`, `p.spotlight-byline`, then the body.
  - CSS classes for later tasks (in addition to all existing ones): `app-bar`, `app-bar-inner`, `app-icon`, `app-name`, `page-header`, `eyebrow`, `page-subtitle`, `page-actions`, `section-head`, `section-count`, `spotlight`, `spotlight-headline`, `spotlight-byline`, `card-grid`, `poll-card`, `poll-title`, `poll-meta`, `card-links`, `field-row`, `field-wide`, `picker`.

- [ ] **Step 1: Add the failing assertion**

In `test/build.test.js`, inside the existing test `'page templates are copied unchanged into dist'`, add after its existing assertion:

```js
  for (const page of ['organizer.html', 'invitee.html', 'message.html']) {
    assert.match(dist(page), /<header class="app-bar">/, page);
    assert.match(dist(page), /<span class="app-name">Meeting Scheduler<\/span>/, page);
  }
  assert.match(dist('message.html'), /<header class="page-header">/);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/build.test.js`
Expected: FAIL — `The input did not match the regular expression /<header class="app-bar">/` for `organizer.html`.

- [ ] **Step 3: Replace the top bar in all three templates**

In each of `src/client/organizer.html`, `src/client/invitee.html` and `src/client/message.html`, replace the line

```html
  <header class="topbar"><div class="topbar-inner">Meeting Scheduler</div></header>
```

with

```html
  <header class="app-bar">
    <div class="app-bar-inner">
      <span class="app-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path></svg></span>
      <span class="app-name">Meeting Scheduler</span>
    </div>
  </header>
```

Then, in `src/client/message.html` only, replace

```html
  <main class="container">
    <h1 id="message-title"></h1>
    <p id="message-text"></p>
  </main>
```

with

```html
  <main class="container">
    <header class="page-header">
      <p class="eyebrow">Kelley Marketing &middot; Meeting Scheduler</p>
      <h1 id="message-title"></h1>
      <p class="page-subtitle" id="message-text"></p>
    </header>
  </main>
```

- [ ] **Step 4: Add the frame helpers to `src/client/dom.js`**

Insert this block immediately above the line `  function clear(el) {`:

```js
  var PAGE_LABEL = 'Kelley Marketing · Meeting Scheduler';

  // Portal-style page header: red caps label, serif title, optional subtitle, extra lines and actions.
  // The crimson rule under it is the header's bottom border.
  function pageHeader(opts) {
    return h('header', { class: 'page-header' }, [
      h('p', { class: 'eyebrow' }, PAGE_LABEL),
      h('h1', null, opts.title),
      opts.subtitle ? h('p', { class: 'page-subtitle' }, opts.subtitle) : null,
      opts.lines || null,
      opts.actions && opts.actions.length ? h('div', { class: 'page-actions' }, opts.actions) : null
    ]);
  }

  // Serif section heading with an optional small count, underlined like the portal's "Research · 5 stories".
  function sectionHeading(text, count) {
    return h('div', { class: 'section-head' }, [
      h('h2', null, text),
      count ? h('span', { class: 'section-count' }, count) : null
    ]);
  }

  // Sand panel with a crimson left bar, like the portal's "In the spotlight" box.
  function spotlight(opts) {
    return h('div', { class: 'spotlight' }, [
      opts.label ? h('p', { class: 'eyebrow' }, opts.label) : null,
      opts.headline ? h('p', { class: 'spotlight-headline' }, opts.headline) : null,
      opts.byline ? h('p', { class: 'spotlight-byline' }, opts.byline) : null,
      opts.body || null
    ]);
  }

```

Then add the three names to the returned object, right after `messageBox: messageBox,`:

```js
    pageHeader: pageHeader,
    sectionHeading: sectionHeading,
    spotlight: spotlight,
```

- [ ] **Step 5: Replace `src/client/styles.css` with**

```css
/* Meeting Scheduler — styles modeled on the Kelley Marketing Department Portal. */
:root {
  --page: #F7F6F0;
  --bar: #FEFCFB;
  --sand: #F2EDE3;
  --line: #E2E1DB;
  --rule-tan: #B9B4AA;
  --field: #FFFFFF;
  --field-border: #8C887F;
  --ink: #1F1D18;
  --muted: #5E5A52;
  --meta: #6D5E4C;
  --crimson: #990000;
  --crimson-dark: #6D0808;
  --crimson-light: #F41C40;
  --row-h: 28px;
  --radius: 4px;
  --gutter: 32px;
  --serif: Georgia, "Times New Roman", serif;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

* { box-sizing: border-box; }

html { scroll-padding-bottom: 9rem; } /* keeps a focused control clear of the sticky footers */

html, body {
  margin: 0;
  background: var(--page);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 15px;
  line-height: 1.5;
}

/* Top bar */
.app-bar { background: var(--bar); border-bottom: 1px solid var(--line); }
.app-bar-inner { display: flex; align-items: center; gap: 12px; max-width: calc(1180px + 2 * var(--gutter)); margin: 0 auto; padding: 14px var(--gutter); }
.app-icon { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 36px; height: 36px; color: var(--bar); background: var(--crimson); border-radius: 8px; }
.app-name { font-size: 1.15rem; font-weight: 700; color: var(--ink); }

.container { max-width: calc(1180px + 2 * var(--gutter)); margin: 0 auto; padding: 40px var(--gutter) 64px; }

/* Type */
h1 { margin: 0 0 10px; font-family: var(--serif); font-size: 2.6rem; font-weight: 400; line-height: 1.15; color: var(--ink); }
h2 { margin: 0; font-family: var(--serif); font-size: 1.75rem; font-weight: 400; line-height: 1.2; color: var(--ink); }
h3 { margin: 0; font-family: var(--serif); font-weight: 400; color: var(--ink); }
p { margin: 0 0 10px; }
.note { font-size: 0.88rem; color: var(--muted); }
.tz, .counter, .who { font-weight: 700; }
.warn { color: var(--crimson); }
.offscreen { position: absolute; left: -9999px; top: 0; }

:focus-visible { outline: 3px solid var(--crimson-light); outline-offset: 2px; }

/* Page header (label, serif title, subtitle, actions, crimson rule) */
.page-header { margin: 0 0 28px; padding-bottom: 24px; border-bottom: 2px solid var(--crimson); }
.eyebrow { margin: 0 0 10px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--crimson); }
.page-subtitle { margin: 0 0 12px; font-size: 0.95rem; color: var(--muted); }
.page-header .tz { margin: 0 0 12px; }
.page-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; margin-top: 16px; }

/* Section headings */
.section-head { display: flex; align-items: baseline; gap: 14px; margin: 36px 0 18px; padding-bottom: 10px; border-bottom: 1px solid var(--rule-tan); }
.section-count { font-size: 0.8rem; color: var(--muted); }

/* Spotlight panel */
.spotlight { margin: 0 0 28px; padding: 24px 28px; background: var(--sand); border-left: 4px solid var(--crimson); }
.spotlight .eyebrow { margin-bottom: 8px; }
.spotlight-headline { margin: 0 0 6px; font-family: var(--serif); font-size: 1.75rem; line-height: 1.25; color: var(--ink); }
.spotlight-byline { margin: 0 0 10px; font-size: 0.85rem; font-weight: 700; color: var(--meta); }
.spotlight > :last-child { margin-bottom: 0; }

/* Buttons */
.btn { min-height: 36px; padding: 7px 14px; font: inherit; font-size: 0.9rem; font-weight: 600; border: 1px solid transparent; border-radius: var(--radius); cursor: pointer; }
.btn-primary { color: var(--bar); background: var(--crimson); border-color: var(--crimson); }
.btn-primary:hover { background: var(--crimson-dark); border-color: var(--crimson-dark); }
.btn-secondary { color: var(--ink); background: transparent; border-color: var(--field-border); }
.btn-secondary:hover { background: var(--sand); }
.btn-danger { color: var(--bar); background: var(--crimson-dark); border-color: var(--crimson-dark); }
.btn-link { min-height: 0; padding: 2px 0; font-weight: 500; color: var(--crimson); background: none; border: 0; text-decoration: underline; text-underline-offset: 2px; }
.btn-link:hover { color: var(--crimson-dark); }
.btn:disabled, .btn:disabled:hover { color: var(--muted); background: var(--line); border-color: var(--line); cursor: not-allowed; }
.btn-link:disabled, .btn-link:disabled:hover { background: none; text-decoration: none; }

/* Forms */
.field { margin: 0 0 18px; }
.field > label, .field > legend { display: block; margin-bottom: 6px; font-size: 0.85rem; font-weight: 600; color: var(--ink); }
fieldset.field { min-width: 0; padding: 0; border: 0; }
.field-row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 16px 20px; margin: 0 0 8px; }
.field-row > .field { flex: 1 1 220px; min-width: 0; }
.field-row > .field-wide { flex: 2 1 320px; }
.picker { max-width: 560px; }
input[type="text"], input[type="date"], textarea, select {
  width: 100%;
  min-height: 38px;
  padding: 8px 10px;
  font: inherit;
  color: var(--ink);
  background: var(--field);
  border: 1px solid var(--field-border);
  border-radius: var(--radius);
}
textarea { display: block; margin-bottom: 8px; resize: vertical; }
input[type="radio"], input[type="checkbox"] { accent-color: var(--crimson); }
.radio-row { display: flex; flex-wrap: wrap; gap: 8px 20px; min-height: 38px; align-items: center; }
.radio-row label { display: flex; align-items: center; gap: 6px; }
.inline-row { display: flex; gap: 8px; }
.inline-row input, .inline-row select { flex: 1 1 auto; min-width: 0; }
.field .note { margin: 6px 0 0; }

/* Messages */
.msg { margin: 14px 0; padding: 12px 16px; background: var(--sand); border-left: 4px solid var(--crimson); }
.msg-error { font-weight: 600; }
.msg-ok, .msg-info { border-left-color: var(--meta); }
.msg .btn-link { margin-left: 8px; }

/* Layout helpers */
.toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: 24px; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; }
.toolbar-sticky { position: sticky; bottom: 0; z-index: 2; margin: 24px calc(-1 * var(--gutter)) 0; padding: 14px var(--gutter); background: var(--bar); border-top: 1px solid var(--line); }
.toolbar-sticky .msg { margin: 0 0 10px; }
.save-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }
.link-row { display: flex; gap: 8px; max-width: 760px; }
.link-row input { flex: 1; }
.plain-list { margin: 0; padding-left: 20px; }

/* Poll cards (home) */
.card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 40px; margin: 0; padding: 0; list-style: none; }
.poll-card { padding: 20px 0 22px; border-bottom: 1px solid var(--line); }
.poll-title { margin: 0 0 6px; font-size: 1.45rem; line-height: 1.25; }
.poll-meta { margin: 0 0 8px; font-size: 0.85rem; font-weight: 700; color: var(--meta); }
.card-links { display: flex; flex-wrap: wrap; gap: 4px 18px; margin-top: 10px; font-size: 0.88rem; }

/* Wizard */
.steps { display: flex; flex-wrap: wrap; gap: 6px 24px; margin: 0 0 26px; padding: 0 0 10px; list-style: none; border-bottom: 1px solid var(--line); }
.step button { padding: 4px 0; font: inherit; font-size: 0.92rem; color: var(--crimson); background: none; border: 0; border-bottom: 2px solid transparent; cursor: pointer; }
.step.current button { font-weight: 700; border-bottom-color: var(--crimson); }
.step button:disabled { color: var(--muted); cursor: default; }
.summary { display: grid; grid-template-columns: max-content 1fr; gap: 8px 20px; margin: 0; }
.summary dt { font-size: 0.85rem; font-weight: 700; color: var(--meta); }
.summary dd { margin: 0; }
.name-editor { max-width: 640px; margin: 0 0 8px; padding: 0; list-style: none; }
.name-editor li { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.name-editor .name-text, .name-editor input { flex: 1; }

/* Day tabs (narrow screens) */
.day-tabs { display: flex; gap: 4px; margin: 0 0 10px; }
.day-tab { flex: 1; min-height: 38px; font: inherit; font-size: 0.9rem; font-weight: 600; color: var(--crimson); background: var(--bar); border: 1px solid var(--field-border); border-radius: var(--radius); }
.day-tab[aria-selected="true"] { color: var(--bar); background: var(--crimson); border-color: var(--crimson); }

/* Calendar grid */
.grid { display: grid; grid-auto-rows: minmax(var(--row-h), auto); gap: 1px; margin: 10px 0; background: var(--line); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
.grid > * { background: var(--field); }
.grid-corner, .grid-day, .grid-time { background: var(--bar); }
.grid-day { padding: 10px 4px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-align: center; text-transform: uppercase; color: var(--ink); }
.grid-time { padding: 3px 8px; font-size: 0.75rem; text-align: right; white-space: nowrap; color: var(--muted); }
.grid-time.on-hour { font-weight: 700; color: var(--ink); }
.cell { display: block; width: 100%; height: 100%; min-height: var(--row-h); margin: 0; padding: 0; border: 0; }
button.cell { cursor: pointer; }
button.cell:hover { background: var(--sand); }
.block { width: 100%; height: 100%; margin: 0; padding: 5px 8px; font: inherit; font-size: 0.82rem; text-align: left; border: 0; }
.block-edit { display: flex; flex-direction: column; color: var(--bar); background: var(--crimson); cursor: pointer; }
.block-edit:hover { background: var(--crimson-dark); }
.block-time { font-weight: 700; }
.block-hint { font-size: 0.75rem; }
.block-names { background: var(--sand); border-left: 4px solid var(--crimson); }
.block-best { border-left-width: 6px; }
.block-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 6px; }
.block-count { font-weight: 700; white-space: nowrap; color: var(--meta); }
.badge-best { display: block; margin: 4px 0 2px; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--crimson); }
.name-list { margin: 4px 0 0; padding: 0; list-style: none; }
.name-row label { display: flex; align-items: center; gap: 6px; padding: 2px 4px; border-radius: 3px; overflow-wrap: anywhere; }
.name-row input { flex: none; width: 16px; height: 16px; margin: 0; }
.name-row-active label { font-weight: 700; background: var(--bar); outline: 1px solid var(--crimson); cursor: pointer; }
.name-row-ticked label { font-weight: 700; }
.tick-mark { margin-left: 2px; color: var(--crimson-dark); }
.grid :focus-visible { outline-offset: -3px; }
.block-edit:focus-visible { outline-color: var(--bar); }

/* Dialog */
.dialog-backdrop { position: fixed; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(31, 29, 24, 0.45); }
.dialog { width: 100%; max-width: 520px; padding: 24px; background: var(--bar); border: 1px solid var(--line); border-top: 4px solid var(--crimson); border-radius: var(--radius); box-shadow: 0 12px 32px rgba(31, 29, 24, 0.3); }
.dialog-title { margin: 0 0 12px; font-size: 1.5rem; }
.dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 18px; }

@media (max-width: 767px) {
  :root { --row-h: 34px; --gutter: 16px; }
  html { scroll-padding-bottom: 12rem; }
  .container { padding-top: 24px; }
  h1 { font-size: 1.9rem; }
  h2 { font-size: 1.4rem; }
  .card-grid { grid-template-columns: 1fr; }
  .spotlight { padding: 18px; }
  .spotlight-headline { font-size: 1.4rem; }
  .grid-time { padding: 2px 4px; font-size: 0.7rem; }
  .summary { grid-template-columns: 1fr; }
}
```

- [ ] **Step 6: Run the tests and the build**

Run: `node --check src/client/dom.js && npm test && npm run build`
Expected: `# pass 89`, `# fail 0`; then `Built dist/ (15 files) and preview-dist/ (3 pages)`.

Also confirm the retired colors are gone:
Run: `grep -inE "#F8EFE2|#F5E3CC|#EEEEF0|#B9C1C6|#072332" src/client/styles.css || echo "none"`
Expected: `none`

- [ ] **Step 7: Commit**

```bash
git add src/client/styles.css src/client/organizer.html src/client/invitee.html src/client/message.html src/client/dom.js test/build.test.js
git commit -m "style: portal look — tokens, top bar, page header, sections and spotlight panels" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 2: Organizer screens

**Files:**
- Modify: `src/client/organizer.js` (replace nine render functions; nothing else changes)

**Interfaces:**
- Consumes: `Dom.pageHeader`, `Dom.sectionHeading`, `Dom.spotlight` and the CSS classes from Task 1; the existing `btn`, `h`, `L`, `state`, `messageEl`, `wizardFooter`, `weekLine`, `dayTabsIfNarrow`, `currentDayFilter`, `previewGrid`, `linkFor`, `goHome`, `goStep`, `startNew`, `startEdit`, `openResults`, `openShare`, `copyLinkFromHome`, `confirmDelete`, `cancelWizard`, `changeLength`, `changed`, `addNames`, `nameRow`, `renameRow`, `confirmSave`, `confirmCreateSheet` (all unchanged).
- Produces: no new interfaces. Every `data-key`, `aria-label`, `aria-current` and `disabled` rule in these functions is kept exactly.

Each step below replaces one whole function in `src/client/organizer.js`, from its `function name(...) {` line to its matching closing `}`, with the code shown. Do not change any other function.

- [ ] **Step 1: Replace `renderDenied`**

```js
  function renderDenied() {
    return h('section', null, [Dom.pageHeader({ title: 'Organizer only', subtitle: 'This page is for the organizer only.' })]);
  }
```

- [ ] **Step 2: Replace `renderHome`**

```js
  function renderHome() {
    var count = state.polls.length;
    var cards = state.polls.map(function (p) {
      return h('li', { class: 'poll-card' }, [
        h('h3', { class: 'poll-title' }, p.title),
        h('p', { class: 'poll-meta' }, 'Week of ' + L.formatWeekRange(p.weekStart) + ' · ' + p.lengthMin + ' minutes'),
        h('p', null, p.respondedCount + ' of ' + p.invitedCount + ' responded'),
        h('div', { class: 'card-links' }, [
          btn('Results', function () { openResults(p.pollId); }, 'link', { 'aria-label': 'Results for ' + p.title }),
          btn('Edit', function () { startEdit(p.pollId); }, 'link', { 'aria-label': 'Edit ' + p.title }),
          btn('Copy link', function () { copyLinkFromHome(p); }, 'link', { 'aria-label': 'Copy link for ' + p.title }),
          btn('Delete', function () { confirmDelete(p); }, 'link', { 'aria-label': 'Delete ' + p.title })
        ])
      ]);
    });
    return h('section', null, [
      Dom.pageHeader({
        title: 'My polls',
        subtitle: 'Propose meeting times, share one link per poll, and see who can attend.',
        actions: [btn('New poll', startNew, 'primary', { 'data-key': 'new-poll' })]
      }),
      messageEl(),
      count
        ? [Dom.sectionHeading('Polls', count === 1 ? '1 poll' : count + ' polls'), h('ul', { class: 'card-grid' }, cards)]
        : Dom.spotlight({ body: h('p', null, 'No polls yet. Click “New poll” to propose meeting times.') })
    ]);
  }
```

- [ ] **Step 3: Replace `renderWizard`**

```js
  function renderWizard() {
    var bodies = [renderDetails, renderTimes, renderInvitees, renderReview];
    var steps = h('ol', { class: 'steps' }, STEPS.map(function (label, i) {
      var n = i + 1;
      var cls = 'step' + (n === state.step ? ' current' : n <= state.maxStep ? ' done' : '');
      return h('li', { class: cls }, h('button', {
        type: 'button',
        'data-key': 'step-' + n,
        disabled: n > state.maxStep || state.saving || state.checking, // no navigating away mid-save
        'aria-current': n === state.step ? 'step' : null,
        onclick: function () { if (n !== state.step) goStep(n); }
      }, n + '. ' + label));
    }));
    return h('section', null, [
      Dom.pageHeader({
        title: state.draft.pollId ? 'Edit poll' : 'New poll',
        subtitle: 'Step ' + state.step + ' of ' + STEPS.length + ': ' + STEPS[state.step - 1]
      }),
      steps,
      messageEl(),
      bodies[state.step - 1]()
    ]);
  }
```

- [ ] **Step 4: Replace `renderDetails`**

```js
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
      h('div', { class: 'field-row' }, [
        h('div', { class: 'field field-wide' }, [
          h('label', { for: 'f-title' }, 'Title'),
          h('input', {
            type: 'text', id: 'f-title', value: d.title, maxlength: String(L.TITLE_MAX),
            placeholder: 'e.g., P&T Committee: Fall review',
            oninput: function (e) { d.title = e.target.value; changed(); }
          })
        ]),
        h('div', { class: 'field' }, [
          h('label', { for: 'f-week' }, 'Week'),
          h('input', {
            type: 'date', id: 'f-week', value: d.weekStart,
            onchange: function (e) {
              if (!e.target.value) {
                d.weekStart = '';
                changed();
                showWeek();
                return;
              }
              var monday = L.weekStartFor(e.target.value);
              if (!monday) return;
              d.weekStart = monday;
              e.target.value = monday;
              changed();
              showWeek();
            }
          }),
          h('p', { class: 'note' }, 'Pick any day. The poll uses that Monday–Friday.'),
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
        ])
      ]),
      wizardFooter([
        btn('← Back to my polls', cancelWizard, null, { 'data-key': 'back' }),
        btn('Next: Times →', function () { goStep(2); }, 'primary', { 'data-key': 'next' })
      ])
    ]);
  }
```

- [ ] **Step 5: Replace `renderInvitees`**

```js
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
    var n = d.invitees.length;
    return h('div', null, [
      h('div', { class: 'field-row' }, [
        h('div', { class: 'field' }, [
          h('label', { for: 'f-paste' }, 'Paste a list of names'),
          paste,
          btn('Add names', function () { addNames(paste.value, 'paste'); })
        ]),
        h('div', { class: 'field' }, [
          h('label', { for: 'f-name' }, 'Or add one name'),
          h('div', { class: 'inline-row' }, [single, btn('Add', function () { addNames(single.value, 'single'); })])
        ])
      ]),
      Dom.sectionHeading('Invitees', n === 1 ? '1 person' : n + ' people'),
      list.length ? h('ul', { class: 'name-editor' }, list) : h('p', { class: 'note' }, 'No invitees yet.'),
      Dom.sectionHeading('Preview'),
      h('p', { class: 'note' }, weekLine(d.weekStart)),
      dayTabsIfNarrow(d.weekStart),
      previewGrid(),
      wizardFooter([
        btn('← Back', function () { goStep(2); }, null, { 'data-key': 'back' }),
        btn('Next: Review →', function () { goStep(4); }, 'primary', { disabled: n === 0, 'data-key': 'next' })
      ])
    ]);
  }
```

- [ ] **Step 6: Replace `renderReview`**

```js
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
    var busy = state.saving || state.checking; // locks navigation while the save is in flight
    var label = state.saving ? 'Saving…' : state.checking ? 'Checking…' : d.pollId ? 'Save changes' : 'Confirm & create link';
    return h('div', null, [
      Dom.spotlight({
        label: 'Summary',
        body: h('dl', { class: 'summary' }, rows.map(function (r) {
          return [
            h('dt', null, r[0]),
            h('dd', null, [r[1] + ' ', btn('Edit', function () { goStep(r[2]); }, 'link', { disabled: busy, 'aria-label': 'Edit ' + r[0].toLowerCase() })])
          ];
        }))
      }),
      errors.length ? h('div', { class: 'msg msg-error', role: 'alert' }, errors.join(' ')) : null,
      Dom.sectionHeading('What invitees will see'),
      h('p', { class: 'note' }, weekLine(d.weekStart)),
      dayTabsIfNarrow(d.weekStart),
      previewGrid(),
      wizardFooter([
        btn('← Back', function () { goStep(3); }, null, { disabled: busy, 'data-key': 'back' }),
        btn(label, confirmSave, 'primary', { disabled: errors.length > 0 || busy, 'data-key': 'next' })
      ])
    ]);
  }
```

- [ ] **Step 7: Replace `renderShare`**

```js
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
      Dom.pageHeader({ title: heading, subtitle: intro }),
      Dom.spotlight({
        label: 'Poll link',
        body: [
          h('div', { class: 'link-row' }, [input, btn('Copy', function () {
            Dom.copyText(input).then(function (ok) {
              status.textContent = ok ? 'Link copied.' : 'Select the link and press ⌘C (Mac) or Ctrl+C (Windows) to copy it.';
            });
          }, 'primary')]),
          status
        ]
      }),
      h('div', { class: 'actions' }, [
        btn('← My polls', goHome),
        btn('View results', function () { openResults(s.pollId); }, 'link')
      ])
    ]);
  }
```

- [ ] **Step 8: Replace `renderResults`**

```js
  function renderResults() {
    var b = state.results, poll = b.poll;
    var t = L.tally(b.blocks, b.invitees, b.responses);
    var total = b.invitees.length;
    var pending = b.invitees.filter(function (p) { return !p.respondedAt; });
    var responded = (total - pending.length) + ' of ' + total + ' responded';
    var bestLabels = b.blocks
      .filter(function (x) { return t.best.indexOf(x.blockId) !== -1; })
      .map(function (x) { return L.blockLabel(x, poll.lengthMin); });
    return h('section', null, [
      Dom.pageHeader({
        title: poll.title,
        subtitle: 'Week of ' + L.formatWeekRange(poll.weekStart) + ' · ' + poll.lengthMin +
          '-minute meeting · All times Eastern (Bloomington)',
        actions: [
          btn('← My polls', goHome),
          btn('Refresh', function () { openResults(poll.pollId); }, 'link'),
          btn('Edit poll', function () { startEdit(poll.pollId); }, 'link'),
          btn('Copy link', function () { openShare({ mode: 'link', pollId: poll.pollId, title: poll.title }); }, 'link')
        ]
      }),
      bestLabels.length
        ? Dom.spotlight({
            label: 'Most available',
            headline: bestLabels.join('; '),
            byline: t.max + ' of ' + total + ' can attend · ' + responded
          })
        : Dom.spotlight({
            label: 'Most available',
            byline: responded,
            body: h('p', null, 'No one has ticked a time yet.')
          }),
      Dom.sectionHeading('All proposed times'),
      dayTabsIfNarrow(poll.weekStart),
      Grid.render({
        mode: 'names', weekStart: poll.weekStart, lengthMin: poll.lengthMin, blocks: b.blocks,
        dayFilter: currentDayFilter(), invitees: b.invitees, ticks: t.ticks, counts: t.counts, best: t.best,
        activeInviteeId: null, showCounts: true
      }),
      Dom.sectionHeading('Not yet responded', pending.length ? String(pending.length) : null),
      pending.length
        ? h('ul', { class: 'plain-list' }, pending.map(function (p) { return h('li', null, p.name); }))
        : h('p', null, 'Everyone has responded.')
    ]);
  }
```

- [ ] **Step 9: Replace `renderSheetMissing`**

```js
  function renderSheetMissing() {
    return h('section', null, [
      Dom.pageHeader({
        title: 'The data sheet is missing',
        subtitle: 'The Google Sheet that stores your polls can’t be opened right now. This can be a temporary ' +
          'Google problem, so try again first. If the sheet was deleted, you can start a new, empty one.',
        actions: [
          btn('Try again', goHome, 'primary', { 'data-key': 'retry' }),
          btn(state.creatingSheet ? 'Creating…' : 'Create a new data sheet', confirmCreateSheet, 'secondary',
            { 'data-key': 'create-sheet', disabled: state.creatingSheet })
        ]
      }),
      messageEl()
    ]);
  }
```

- [ ] **Step 10: Check, test and build**

Run: `node --check src/client/organizer.js && npm test && npm run build`
Expected: no syntax errors; `# pass 89`, `# fail 0`; `Built dist/ (15 files) and preview-dist/ (3 pages)`.

Run: `grep -c "Dom.pageHeader" src/client/organizer.js`
Expected: `6`

- [ ] **Step 11: Commit**

```bash
git add src/client/organizer.js
git commit -m "style: organizer screens in the portal layout" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(The controller checks the screens in the browser after this task.)

---
### Task 3: Invitee page

**Files:**
- Modify: `src/client/invitee.js` (replace four render functions; nothing else changes)

**Interfaces:**
- Consumes: `Dom.pageHeader` and the CSS classes from Task 1; the existing `h`, `btn`, `L`, `state`, `GONE_TEXT`, `LOAD_ERROR_TEXT`, `render`, `load`, `findInvitee`, `shownResponses`, `toggle`, `saveBar`, `switchPerson`, `continueWithName` (all unchanged).
- Produces: no new interfaces. The `data-key`s `who`, `continue`, `switch`, `retry` and the `#f-who` id are kept.

Each step replaces one whole function in `src/client/invitee.js`, from its `function name(...) {` line to its matching closing `}`.

- [ ] **Step 1: Replace `renderGone`**

```js
  function renderGone() {
    return h('section', null, [Dom.pageHeader({ title: 'Poll not available', subtitle: GONE_TEXT })]);
  }
```

- [ ] **Step 2: Replace `renderLoadError`**

```js
  function renderLoadError() {
    return h('section', null, [
      Dom.pageHeader({ title: 'Couldn’t load this poll' }),
      h('div', { class: 'msg msg-error' }, [
        h('span', null, LOAD_ERROR_TEXT),
        btn('Try again', function () {
          state.view = 'loading';
          render();
          load();
        }, 'link', { 'data-key': 'retry' })
      ])
    ]);
  }
```

- [ ] **Step 3: Replace `renderPoll`**

```js
  function renderPoll() {
    var p = state.poll;
    var t = L.tally(p.blocks, p.invitees, shownResponses());
    var narrow = Grid.isNarrow();
    return h('section', null, [
      Dom.pageHeader({
        title: p.title,
        subtitle: 'Week of ' + L.formatWeekRange(p.weekStart) + ' · ' + p.lengthMin + '-minute meeting',
        lines: [h('p', { class: 'tz' }, 'All times Eastern (Bloomington)')]
      }),
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
```

- [ ] **Step 4: Replace `whoEl`**

```js
  function whoEl() {
    if (state.me) {
      return h('div', null, [
        h('p', { class: 'who' }, ['You are ', h('strong', null, findInvitee(state.me).name), '. ',
          btn('Not you? Switch', switchPerson, 'link', { 'data-key': 'switch' })]),
        h('p', null, 'Tick every time that works for you, then click “Save my availability.”')
      ]);
    }
    var options = [h('option', { value: '' }, 'Choose your name…')].concat(state.poll.invitees.map(function (x) {
      return h('option', { value: x.inviteeId }, x.name);
    }));
    // The name is only confirmed by Continue (or Enter): committing on `change` would fire for every option
    // a keyboard user arrows through, and remove the list under them.
    return h('div', { class: 'field-row' }, [
      h('div', { class: 'field field-wide picker' }, [
        h('label', { for: 'f-who' }, 'Who are you?'),
        h('div', { class: 'inline-row' }, [
          h('select', {
            id: 'f-who', 'data-key': 'who',
            onkeydown: function (e) {
              if (e.key === 'Enter') {
                e.preventDefault();
                continueWithName();
              }
            }
          }, options),
          btn('Continue', continueWithName, 'primary', { 'data-key': 'continue' })
        ]),
        h('p', { class: 'note' }, 'Not on the list? Contact the organizer.')
      ])
    ]);
  }
```

(The select's inline `style` is dropped; `.inline-row select` in the new stylesheet gives it the same flex sizing.)

- [ ] **Step 5: Check, test and build**

Run: `node --check src/client/invitee.js && npm test && npm run build`
Expected: no syntax errors; `# pass 89`, `# fail 0`; `Built dist/ (15 files) and preview-dist/ (3 pages)`.

- [ ] **Step 6: Commit**

```bash
git add src/client/invitee.js
git commit -m "style: invitee page in the portal layout" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(The controller checks the page in the browser after this task.)

---

### Task 4: Visual verification and push to Apps Script (controller)

This task is run by the controller with the browser pane; it changes no code unless a check fails (then a fix goes back through a fix subagent and review).

**Files:** none (verification only), unless a check fails.

- [ ] **Step 1: Serve the preview**

Run `npm run build`, then serve `preview-dist/` on port 8765 (`python3 -m http.server 8765 --directory preview-dist`, in the background) and open `http://localhost:8765/organizer.html`. Run `PreviewShim.reset()` and reload. Seed data with `Api.call('apiSavePoll', '', draft)` and `Api.call('apiSaveResponse', …)` so that one poll has answers from two of three invitees.

- [ ] **Step 2: Desktop checks (1280×900)**

1. Top bar: crimson rounded icon with a calendar and "Meeting Scheduler"; bar background `rgb(254, 252, 251)`; page background `rgb(247, 246, 240)`.
2. Every screen starts with the red caps label (computed `text-transform: uppercase`, text content `Kelley Marketing · Meeting Scheduler`), a Georgia `h1` (computed `font-family` starts with `Georgia`), a subtitle, and a 2 px crimson bottom border on `.page-header` (`rgb(153, 0, 0)`).
3. My polls: two-column cards with Georgia titles, brown detail lines (`rgb(109, 94, 76)`), and Results · Edit · Copy link · Delete as underlined crimson links; "Polls" section heading with the count and a tan underline.
4. Wizard: subtitle "Step n of 4: …"; step links in crimson with the current one bold and underlined; step 1 fields in one row; step 3 inputs in one row; Review summary in a sand panel with a crimson left bar; sticky footer near-white.
5. Grid: white cells, light lines, uppercase day headers; setup blocks crimson; names-mode blocks sand with a crimson left bar; "Most available" shows as a red caps label with no pill and no light-crimson ring.
6. Share: spotlight panel with "Poll link" label, link field and Copy.
7. Results: spotlight with "Most available", the best time in Georgia, byline "n of N can attend · n of N responded"; "All proposed times" and "Not yet responded" section headings.
8. Data sheet missing (`PreviewShim.simulateMissingSheet()` then Results): framed header with Try again (primary) and Create a new data sheet (secondary).
9. Invitee page: same frame; poll title as the h1; "All times Eastern (Bloomington)" bold in the header; picker row with Continue; ticks, Save bar, and the "Saved…" message in a sand panel.
10. Dialogs (Delete, change length, None of these times): near-white card with a crimson top rule and a Georgia title.
11. Contrast and color rules: no element has computed `color: rgb(244, 28, 64)`; no element uses `rgb(248, 239, 226)` or `rgb(7, 35, 50)`.

- [ ] **Step 3: Phone checks (375×812)**

Cards in one column; field rows stacked; day tabs; sticky footer spans the width; no horizontal overflow (`document.documentElement.scrollWidth <= innerWidth`); focus outline visible on a grid cell.

- [ ] **Step 4: Regression pass**

Repeat the key flows: create a poll end to end, edit with an answer removed (warning dialog), invitee choose name → Continue → tick → Save, stale save message, Delete with focus on New poll. Behavior must be identical to before; `read_console_messages` with `onlyErrors: true` shows nothing except the known scripted-`beforeunload` notice.

- [ ] **Step 5: Side-by-side screenshot**

Take a 1280×900 screenshot of My polls and of Results and compare them with the portal screenshot (top bar, label, title, rule, panels, cards). Note any visible mismatch for a follow-up decision with the organizer.

- [ ] **Step 6: Push to Apps Script**

Run: `npm run push`
Expected: `Pushed 15 files.` (The web app has not been deployed yet; the first deployment in the original plan's Task 10 will publish this version.)
