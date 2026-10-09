# Meeting Scheduler — Design

- **Date:** 2026-10-09
- **Owner:** Lopo Rego (lrego@iu.edu)
- **Status:** Design approved section by section; awaiting spec review

## 1. Purpose

A scheduling-poll app for the organizer (Lopo). The organizer proposes meeting
times on a one-week Monday–Friday calendar, lists the invitees, and shares one
link per poll. Each invitee opens the link, picks their name, and ticks the
proposed times that work for them. The organizer sees who can attend each time
and which time suits the most people.

Invitees are a mix of IU colleagues and people outside IU, some without Claude
accounts, so the invitee page must work for anyone with the link and no login.

## 2. Decisions

| Topic | Decision |
|---|---|
| Hosting | Google Apps Script web app in the organizer's IU Google account; data in a Google Sheet. Claude writes and maintains the code; it does not host the app. |
| Google account | IU Google. Setup includes an outsider-access test; if IU blocks anonymous access, the same code moves to a personal Google account. |
| Week | One specific Mon–Fri week per poll, with real dates in the column headers. |
| Grid | Rows 8:00 AM–6:00 PM in 30-minute steps. |
| Meeting length | 30, 60 or 90 minutes; one length per poll. |
| Block rules | No overlapping blocks on the same day; every block ends by 6:00 PM. |
| Who selects times | Invitees, on the shared page. The organizer only enters names. |
| Who ticks what | Visitor picks their name first; only their own checkboxes are active; everyone else's are visible, read-only. Honor system (no login). |
| Results | Per-block count ("4 of 6") and a "Most available" highlight. No finalize step. |
| Polls | Several polls at once, each with its own link. |
| Editing after sharing | Allowed. Additions are silent; deletions that would lose ticks require confirmation. Changing the week or the length clears all ticks after confirmation. |
| Time zone | Everyone sees the organizer's time zone, labeled "All times Eastern (Bloomington)". |

## 3. Architecture

### 3.1 Pieces

- **One Apps Script project** (standalone, owned by the organizer's IU Google
  account). Project time zone: `America/Indiana/Indianapolis`.
- **One Google Sheet**, "Meeting Scheduler Data", created by the app on first
  run. Its ID is stored in Script Properties. The organizer can open it any time.
- **One web app deployment**, configured *Execute as: Me* and *Who has access:
  Anyone* (required so outsiders can open invitee links without signing in).
  The deployment URL stays the same across code updates.

### 3.2 Two pages, one address

`doGet(e)` routes on the query string:

- `…/exec?poll=<pollId>` → **invitee page** for that poll. Open to anyone.
- `…/exec` (no `poll`) → **organizer page**. Owner only.

**Owner check.** The organizer page and every organizer server function run
`isOwner()`: `Session.getActiveUser().getEmail()` must equal
`Session.getEffectiveUser().getEmail()`. Non-owners see "This page is for the
organizer only." The check is enforced on every organizer server call, not only
on page load.

**Fallback.** If the setup test (§9) shows the owner check is unreliable under
an *Anyone* deployment, the organizer page switches to a secret key: a long
random token stored in Script Properties, required as `?admin=<token>`. The
organizer bookmarks that URL.

### 3.3 Code layout (repository `Meeting Scheduler/`)

- `src/shared/logic.js` — pure rules with no Google or DOM calls: week dates,
  valid start times, overlap test, tallies, "most available", edit-impact
  analysis. One source file; a small build script copies it into both a server
  file and a browser `<script>` include, so client and server apply identical
  rules.
- `src/server/` — routing, owner check, Sheet storage, server API.
- `src/client/` — organizer page, invitee page, shared styles and grid
  rendering.
- `test/` — Node unit tests for `logic.js`.
- `preview/` — a local harness that fakes `google.script.run` with in-memory
  data, so both pages can be clicked through in a browser before deployment.
- `build` output goes to `dist/`, which is what gets pushed or pasted into
  Apps Script.

Code reaches Apps Script either by Google's `clasp` command-line tool (after
the organizer signs in once) or by copy-paste into script.google.com.

## 4. Data model (Google Sheet tabs)

All IDs are random, URL-safe, 8 characters (poll IDs are the public link codes,
so they must not be guessable or sequential).

**Polls**: `pollId`, `title`, `weekStart` (ISO date of the Monday),
`lengthMin` (30 | 60 | 90), `version` (integer), `createdAt`, `updatedAt`.

**Blocks**: `pollId`, `blockId`, `day` (0 = Mon … 4 = Fri), `startMin`
(minutes after midnight; multiple of 30).

**Invitees**: `pollId`, `inviteeId`, `name`, `order`, `respondedAt` (blank
until the invitee first saves).

**Responses**: `pollId`, `inviteeId`, `blockId` — one row per tick.

`version` increases whenever an organizer save deletes or invalidates ticks
(block removed, invitee removed, week changed, length changed). Pure additions
do not change it.

## 5. Rules (implemented in `logic.js`)

- **Week.** The organizer picks any date; the poll uses the Mon–Fri week that
  contains it. A Saturday or Sunday maps to the following Monday. A week in the
  past is allowed but shows a warning.
- **Valid starts.** From 8:00 AM up to `18:00 − length`: last start 5:30 PM for
  30 min, 5:00 PM for 60 min, 4:30 PM for 90 min.
- **Overlap.** Blocks are half-open intervals `[start, start + length)`; two
  blocks on the same day may not intersect. Back-to-back blocks (10:00–11:00
  and 11:00–12:00) are allowed.
- **Names.** Trimmed; blank names ignored; duplicates (case-insensitive)
  rejected with a message.
- **Tally.** For each block, the number of invitees who ticked it, shown as
  "n of N" where N is the total number of invitees.
- **Most available.** Every block whose count equals the highest count, shown
  only when that count is at least 1.
- **Responded.** An invitee with a `respondedAt` value. Saving with no ticks
  still counts as responded.

## 6. Organizer page

### 6.1 Home: poll list

- **New poll** button.
- One row per poll: title, week ("Oct 19–23, 2026"), "n of N responded", and
  buttons **Results**, **Edit**, **Copy link**, **Delete** (delete asks for
  confirmation and removes the poll's rows from every tab).

### 6.2 Setup wizard

A progress bar shows *1 Details → 2 Times → 3 Invitees → 4 Review*. Every step
has **Back**; completed steps are clickable to jump back. Nothing is written to
the Sheet until step 4 is confirmed; the draft lives in the page, so closing
the page before confirming discards it (the browser's leave-page warning
appears first).

1. **Details.** Title (required), week (date picker; snaps as in §5), meeting
   length (30 / 60 / 90 radio buttons).
2. **Times.** Mon–Fri grid with dated column headers ("Mon, Oct 19") and
   30-minute rows, 8:00 AM–6:00 PM.
   - Clicking a cell places a block of the chosen length starting there,
     filled crimson and labeled with its time range.
   - Clicking an existing block removes it.
   - A click that would overlap or run past 6:00 PM places nothing and shows a
     short message ("Overlaps the 9:00–10:00 block" / "Would end after
     6:00 PM").
   - A counter shows how many times are proposed.
   - **Tentative schedule complete →** is disabled until at least one block
     exists.
   - Returning to step 1 and changing the length while drafting: blocks keep
     their start times and resize; any that would now overlap or run past
     6:00 PM are listed and removed only after the organizer confirms.
3. **Invitees.** A paste box (one name per line) for bulk entry plus an add
   field; the list shows each name with **rename** and **remove** controls.
   Renaming keeps the invitee's ID, so their ticks survive. A live preview
   shows each block containing "☐ Name" for every invitee.
4. **Review.** Summary (title, week, length, block count, invitee count) and
   the full grid exactly as invitees will see it. Links back to each step.
   **Confirm & create link** saves the poll.

### 6.3 Share screen

The poll link (`…/exec?poll=<pollId>`) with a **Copy** button.

### 6.4 Editing after sharing

**Edit** reopens the wizard on the same poll, pre-filled; the link does not
change. On **Confirm**, the page computes the impact against current
responses and, if anything would be lost, shows one confirmation listing it:

| Change | Effect on ticks | Confirmation |
|---|---|---|
| Add block or invitee | None | None |
| Rename invitee | None (ID kept) | None |
| Remove block | Its ticks deleted | "Ana and Raj ticked Tue 9:00–10:00. Remove it anyway?" |
| Remove invitee | Their ticks and responded status deleted | Shown if they had responded |
| Change week | All ticks and responded statuses cleared | Shown if anyone had responded |
| Change length | All ticks and responded statuses cleared | Shown if anyone had responded |

The server recomputes and applies the same deletions; it does not trust the
page's list.

### 6.5 Results

The invitee-style grid showing every tick (all read-only), the "n of N" count
per block, the "Most available" highlight, and a **Not yet responded** list.

## 7. Invitee page

- **Header:** poll title, "Week of Oct 19–23, 2026", "60-minute meeting",
  "All times Eastern (Bloomington)".
- **Who are you?** A dropdown of invitee names. No self-adding; a note says
  "Not on the list? Contact the organizer." The choice is remembered in the
  browser (`localStorage`, keyed by poll) with a **Not you? Switch** link.
  Until a name is chosen, the grid is shown read-only.
- **Grid:** each block lists every invitee with a checkbox. The visitor's own
  row is highlighted and active; others' checkboxes are disabled but show
  their state. Each block shows "n of N"; top block(s) carry a **Most
  available** badge.
- **Save my availability** writes the visitor's ticks. Confirmation: "Saved.
  You can return to this link and change your answers any time." Saving with
  nothing ticked first asks "None of these times work for you?". Leaving with
  unsaved changes triggers the browser's leave-page warning.
- **Phones:** below 768 px wide the grid shows one day at a time with Mon–Fri
  tabs.
- **Freshness:** after a save, the page reloads the poll so the visitor sees
  everyone's latest ticks.

## 8. Server API (`google.script.run`)

Organizer (each call runs the owner check first):

- `listPolls()` → poll rows with invited and responded counts.
- `getPoll(pollId)` → poll, blocks, invitees, responses.
- `savePoll(draft)` → creates or updates; applies §6.4 deletions; bumps
  `version` when ticks were removed; returns `{pollId, link, version}`.
- `deletePoll(pollId)`.

Invitee (open to anyone):

- `getPublicPoll(pollId)` → title, week, length, blocks, invitees (ID, name,
  responded), ticks per block, `version`.
- `saveResponse(pollId, inviteeId, blockIds, version)` → replaces only that
  invitee's Responses rows and sets `respondedAt`. Rejects with `stale` if
  `version` differs from the poll's current version or any `blockId`/
  `inviteeId` no longer exists; rejects with `not_found` for an unknown poll.

All writes run inside `LockService.getScriptLock()` so simultaneous saves
cannot interleave.

## 9. Setup and deployment (one time, about 10 minutes)

1. Create the Apps Script project under the IU Google account (via `clasp` or
   script.google.com).
2. Push or paste the `dist/` files; confirm the project time zone.
3. Deploy as a web app: *Execute as: Me*, *Who has access: Anyone*; authorize.
   If *Anyone* is not offered, IU restricts it: switch to a personal Google
   account.
4. Open the deployment URL: the organizer page loads and creates the data
   Sheet.
5. **Outsider test:** create a test poll; open its link in a private window
   while signed out. It must load without a Google sign-in prompt. If it asks
   for sign-in or access, switch to a personal Google account.
6. **Owner test:** open the bare deployment URL in the same private window. It
   must show "This page is for the organizer only." If it shows the organizer
   page, or the owner check fails for the organizer, switch to the secret-key
   fallback (§3.2).
7. Smoke test: as two different invitees, save ticks; confirm counts,
   "Most available", "Not yet responded", and the Sheet rows.

Updating later: push or paste the new code, then *Manage deployments → Edit →
New version*. The URL does not change.

## 10. Visual style

| Element | Color |
|---|---|
| Page background | Cream `#F8EFE2` |
| Header bar, primary buttons, placed blocks in step 2 | Crimson `#990000`, cream text |
| Button hover, headings | Dark crimson `#6D0808` |
| Block fill on invitee and results grids | Dark cream `#F5E3CC` |
| "Most available" badge, focus outlines | Light crimson `#F41C40` |
| Empty grid cells | Light grey `#EEEEF0` |
| Grid lines, disabled buttons | Grey `#B9C1C6` |
| Body text | IU Black `#072332` |

`#F41C40` is never used for small text (contrast too low on light
backgrounds); only for borders, badges with bold text, and focus outlines.
Font: the system sans-serif stack. Text and controls meet WCAG AA contrast;
grid cells are keyboard-operable buttons and every checkbox has a label.

## 11. Error handling

| Situation | What the user sees |
|---|---|
| Unknown or deleted poll code | "This poll is no longer available." |
| Non-owner opens the organizer page | "This page is for the organizer only." |
| Network or server failure on save | Ticks stay on screen; "Couldn't save. Check your connection and try again." with **Try again** |
| `stale` on invitee save | Page reloads with "The organizer updated this poll. Please review your answers." |
| Data Sheet missing (e.g., deleted from Drive) | Organizer: "The data sheet is missing" with a button to create a new one. Invitee: "This poll is no longer available." |

## 12. Privacy

Anyone with a poll link sees that poll's title, every invitee's name, and every
invitee's ticks. Poll IDs are random, so links cannot be guessed. Invitee names
are never put anywhere except the Sheet and the poll page.

## 13. Testing

- **Unit tests** (Node, `node --test`) for every rule in §5 and the
  edit-impact table in §6.4.
- **Local click-through** of both pages in the built-in browser, using the
  `preview/` harness, covering every wizard step, Back navigation, edit
  warnings, the invitee flow, the phone layout, and the error messages in §11.
- **Post-deployment checklist**: steps 5–7 of §9.

## 14. Out of scope for version 1

Email invitations or reminders; calendar invites; a finalize/lock step;
per-viewer time zones; polls spanning several weeks; response deadlines;
invitees adding themselves.
