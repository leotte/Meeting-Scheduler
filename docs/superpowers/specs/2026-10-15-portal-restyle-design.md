# Meeting Scheduler — Portal Restyle Design

- **Date:** 2026-10-15
- **Owner:** Lopo Rego (lrego@iu.edu)
- **Status:** Design approved section by section; awaiting spec review
- **Reference:** the Kelley "Marketing Department Portal" screenshot (Department Highlights page) supplied on 2026-10-15
- **Base design:** `2026-10-09-meeting-scheduler-design.md` (behavior unchanged)

## 1. Goal and scope

Make the scheduler's three pages (organizer, invitee, organizer-only message)
look like the Marketing Department Portal: its top bar, page-header block,
typography, neutral warm tones, cards, spotlight panel, section headings and
form fields.

In scope: styles, the shared page frame, and per-screen markup where the
portal uses a different pattern. Out of scope: any change to behavior, data,
server code, fixed user-facing strings, or the accessibility layer (live
region, focus handling, keyboard support), which must keep working as is.

## 2. Decisions

| Topic | Decision |
|---|---|
| Approach | Restyle in place: rewrite `styles.css`, add one shared page frame, adjust screen markup only where the portal's pattern differs |
| Page frame | Portal look without the portal's left sidebar |
| Colors | Portal's neutral warm tones for surfaces, lines and text; the original reds for accents |
| Branding | Top bar "Meeting Scheduler"; red caps label "KELLEY MARKETING · MEETING SCHEDULER" above every page title, for organizer and invitees alike |
| Fonts | Georgia for titles, section headings and card titles; the system sans-serif stack for everything else; no web-font downloads |

## 3. Visual tokens

Surfaces and text (sampled from the portal screenshot):

| Token | Value | Use |
|---|---|---|
| page | `#F7F6F0` | Page background |
| bar | `#FEFCFB` | Top bar, sticky footers, dialogs |
| sand | `#F2EDE3` | Spotlight panels, time blocks in names mode, messages |
| line | `#E2E1DB` | Thin separators, top-bar bottom line, grid lines |
| rule-tan | `#B9B4AA` | Section-heading underline |
| field | `#FFFFFF` | Text inputs, date inputs, textareas, selects, grid surface |
| field-border | `#8C887F` | Borders of form fields (3.5:1 on white; the portal's `#CFCEC5` is 1.6:1 and fails WCAG 1.4.11) |
| ink | `#1F1D18` | Body text and titles (15.6:1 on page) |
| muted | `#5E5A52` | Subtitles, labels' secondary text, time labels (6.3:1 on page) |
| meta | `#6D5E4C` | Small bold detail lines under card titles (5.8:1 on page, 5.4:1 on sand) |

Accents (the original palette, unchanged):

| Token | Value | Use |
|---|---|---|
| crimson | `#990000` | Primary buttons, the thick page rule, red caps labels, links, current step, crimson left bars, placed blocks in setup (8.2:1 on page) |
| crimson-dark | `#6D0808` | Hover/pressed states, app-icon shading |
| crimson-light | `#F41C40` | Keyboard focus outline only (3.8:1 on page); never text |

The old tokens `#F8EFE2` (cream), `#F5E3CC` (dark cream), `#EEEEF0`,
`#B9C1C6` and `#072332` are retired. The global constraint list in the
implementation plan is updated to these tokens.

Type: titles in Georgia (page title about 40 px desktop / 30 px phone, regular
weight; section headings about 28 px; card titles about 22 px); body in the
system sans-serif stack at 15–16 px; red caps labels at 11 px, bold, letter
spacing about 0.14em. Caps are applied with CSS `text-transform: uppercase`,
so the underlying text of fixed strings (e.g. "Most available") is unchanged.

## 4. Page frame (all pages)

- **Top bar:** full width, `bar` background, `line` bottom border. Left: a
  36 px crimson rounded-square app icon with a small white calendar drawn in
  inline SVG (no image files), then "Meeting Scheduler" in bold `ink`. No
  right-side links.
- **Content column:** centered, about 1180 px wide, with the portal's generous
  left/right padding (16 px on phones).
- **Page header block:** red caps label "KELLEY MARKETING · MEETING
  SCHEDULER"; the page title in Georgia; a one-line subtitle in `muted`; an
  optional actions row; then a 2 px `crimson` rule across the column.
- **Section heading:** Georgia heading, an optional small count in `muted`
  ("3 polls"), and a 1 px `rule-tan` underline.
- **Buttons:** primary = filled crimson, white text, 4 px radius, compact like
  the portal's "Add a highlight". Secondary (Back, Cancel, dialog cancel) =
  quiet outlined button (`field-border` outline, `ink` text, transparent fill).
  Inline actions (Results, Edit, Copy link, Delete, Rename, Remove, Not you?
  Switch, Try again) = underlined crimson text links. Disabled = `line` fill,
  `muted` text.
- **Form fields:** label above in small bold `ink`; white field, 1 px
  `field-border`, 4 px radius, about 38 px tall. Related fields sit side by
  side in a responsive row (like the portal's filter row) that stacks below
  768 px.
- **Spotlight panel:** `sand` background, 4 px `crimson` left bar, red caps
  label, Georgia headline, `meta` byline, body text.
- **Messages:** `sand` panel with a 4 px left bar: `crimson` for errors,
  `meta` brown for confirmations and info.
- **Sticky footers** (wizard steps, invitee Save bar): `bar` background, `line`
  top border.
- **Dialogs:** `bar` card, `line` border, 4 px `crimson` top rule, Georgia
  title; backdrop unchanged.

## 5. Screen mapping

**My polls (home):** title "My polls"; subtitle "Propose meeting times, share
one link per poll, and see who can attend."; actions: **New poll**. Then a
section heading "Polls" with a count, and the polls as a two-column card grid
(one column on phones): Georgia title; `meta` line "Week of Oct 19–23, 2026 ·
60 minutes"; "n of N responded"; text links Results · Edit · Copy link ·
Delete (existing aria-labels kept). Thin `line` separators between card rows.
The empty state is a spotlight-style panel with the existing text.

**Setup wizard:** title "New poll" / "Edit poll"; subtitle names the step
("Step 2 of 4: Times"). The progress bar becomes a row of crimson text links
like the portal's category links: completed steps are links, the current step
is bold with a 2 px crimson underline and `aria-current="step"`, future steps
are `muted` and disabled. Step 1: Title, Week and Meeting length in one
responsive field row. Step 3: "Paste a list of names" and "Or add one name" in
one responsive row; the invitee list and preview follow under section
headings. Step 4: the summary inside a spotlight-style panel; "What invitees
will see" as a section heading. Footers as in §4.

**Calendar grid:** white surface, `line` grid lines, day headers in small bold
caps, time labels in `muted`. Setup mode: placed blocks stay filled crimson
with white text. Names mode: each block is a `sand` panel with a 4 px crimson
left bar; the count stays at the top right; "Most available" becomes a red
caps label (no pill), and the crimson-light inner ring is removed (the label
carries the meaning). Ticked rows of other people stay bold with the ✓.

**Share screen:** title "Your poll is ready" / "Changes saved" / "Link for
“…”"; the existing sentence as subtitle; the link field and **Copy** inside a
spotlight panel; the status line below it.

**Results:** title = poll title; subtitle "Week of … · N-minute meeting · All
times Eastern (Bloomington)"; actions as text links (Refresh, Edit poll, Copy
link) plus "← My polls". A spotlight panel: label "MOST AVAILABLE", the best
time(s) in Georgia, byline "n of N can attend · n of N responded" (or the
existing "No one has ticked a time yet." when none). Then the grid under a
section heading "All proposed times", and a section heading "Not yet
responded" with its count and list (or "Everyone has responded.").

**Data sheet missing / organizer only:** the frame with their existing titles
and texts; actions as in the recovery design (Try again primary, Create a new
data sheet secondary).

**Invitee page:** frame as above; title = poll title; subtitle "Week of … ·
N-minute meeting"; "All times Eastern (Bloomington)" on its own bold line;
the "Who are you?" picker as a form-field row (select + **Continue**) with the
"Not on the list?" note; "You are Ana. Not you? Switch"; the instruction
sentence; the grid; the sticky Save bar. "Poll not available" and the load
error use the same frame.

**Message page (organizer only):** the frame with "Organizer only" as title
and the message as subtitle.

## 6. Unchanged

Behavior, server API, data, fixed strings, the `#live` region and focus logic,
`data-key` values, aria labels and roles, the phone day tabs (restyled only),
the dialog focus trap, and the scroll padding for sticky footers.

## 7. Testing

- `npm test` stays green (the build test still checks the includes and
  templates).
- Local preview click-through of every screen at 1280×900 and 375×812:
  frame, header block, cards, spotlight panels, grid in both modes, wizard
  rows stacking on phones, sticky footers, dialogs, messages; no horizontal
  overflow on phones; no console errors.
- Side-by-side screenshot of My polls and Results against the portal
  screenshot for a visual check.
- Contrast spot checks with computed styles for the token pairs in §3; the
  light crimson is never a text color.
- After review: `npm run push`, then a new deployment version (or the first
  deployment if it has not happened yet).
