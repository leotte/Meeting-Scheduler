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
`preview-dist/`:

```bash
python3 -m http.server 8765 --directory preview-dist
```

Then open http://localhost:8765/organizer.html in a browser.

In the preview's browser console: `PreviewShim.reset()` clears the data (reload
the page afterwards for it to take effect), `PreviewShim.failNextCall()` makes
the next server call fail like a dropped connection, and
`PreviewShim.simulateMissingSheet()` acts as if the data sheet was deleted.

## First-time setup (about 10 minutes)

Use the IU Google account first. Step 7 checks that the organizer page stays
private, and step 9 checks that IU lets outsiders open the invitee links.

### A. Get the code into Apps Script

**Option 1 — push from this folder (recommended)**

This option uses `clasp`, Google's command-line tool for Apps Script, pinned to
version 2.4.2. The `clasp` dev dependency and the `npm run push` command are
added to `package.json` in the deployment step of the build plan, so they exist
only after that step has run.

- **A1.** Turn on the Apps Script API at https://script.google.com/home/usersettings.
- **A2.** Install the project's tools once (this includes the pinned clasp):

  ```bash
  npm install
  ```

- **A3.** Sign in once (a browser window opens):

  ```bash
  npx clasp login
  ```

- **A4.** Build the files that get pushed (clasp needs the `dist/` folder to
  exist):

  ```bash
  npm run build
  ```

- **A5.** Create the Apps Script project, pointing it at `dist/`:

  ```bash
  npx clasp create --type standalone --title "Meeting Scheduler" --rootDir dist
  ```

- **A6.** Push the code:

  ```bash
  npm run push
  ```

- **A7.** Open the project in the Apps Script editor, where you deploy it:

  ```bash
  npx clasp open
  ```

If Google blocks the sign-in ("This app is blocked"), use Option 2.

**Option 2 — copy and paste**

- **A1.** Run `npm run build`.
- **A2.** Go to https://script.google.com, click **New project** and rename it
  "Meeting Scheduler".
- **A3.** **Project Settings** (gear icon): tick **Show "appsscript.json" manifest
  file in editor**. Back in the editor, replace the contents of
  `appsscript.json` with `dist/appsscript.json`.
- **A4.** Delete the default `Code.gs`. For each `dist/*.js` file add a **Script**
  file with the same name (without `.js`) and paste its contents. For each
  `dist/*.html` file add an **HTML** file with the same name (without `.html`)
  and paste its contents.

### B. Deploy

5. In the Apps Script editor click **Deploy → New deployment**, choose **Web
   app**, set *Execute as:* **Me** and *Who has access:* **Anyone**, then
   **Deploy**. Authorize when asked: choose the account, and if Google warns
   that the app isn't verified, click **Advanced**, then **Go to Meeting
   Scheduler (unsafe)**, then **Allow**. Copy the **Web app URL**.
   If **Anyone** is not offered, IU restricts it: repeat the setup with a
   personal Google account.

### C. Check it

Do these in order. The first one gets you into the organizer page, which the
later ones need.

6. **Organizer page.** Open the Web app URL in your normal browser, signed in.
   You should see "My polls" (the first visit also creates the data sheet).
   If it says "This page is for the organizer only." instead, use the secret
   link: in the Apps Script editor select `setupAdminKey` in the function
   list, click **Run**, open **Execution log**, and bookmark your Web app URL
   with `?admin=<key>` added to the end. Use that link for the rest of these
   checks. Being signed in to several Google accounts at once can cause this
   message; a browser profile signed in to only the IU account may avoid it.
7. **Owner test.** Open the bare Web app URL in a private window where you are
   signed out. It must say "This page is for the organizer only." If it shows
   "My polls" instead, stop and share no links until this is understood.
8. **Link check.** On the organizer page create a test poll and look at the
   link shown at the end. It must start with your Web app URL. If it doesn't,
   open **Project Settings → Script Properties**, add `BASE_URL` with the Web
   app URL as its value, reload the organizer page and check again.
9. **Outsider test.** Open the test poll's link in a private window where you
   are signed out. It must load without asking you to sign in. If it asks you
   to sign in and the link contains `/a/macros/iu.edu/`, try the same link
   without that part, i.e. change
   `https://script.google.com/a/macros/iu.edu/s/<id>/exec?poll=<pollId>` into
   `https://script.google.com/macros/s/<id>/exec?poll=<pollId>`. If that loads
   while signed out, set the Script Property `BASE_URL` to
   `https://script.google.com/macros/s/<id>/exec` and check the link again
   (step 8). Only if neither form loads, redo the setup with a personal
   Google account.
10. **Smoke test.** In a private window open the test poll's link, choose a
    name, press **Continue**, tick a few times and press **Save my
    availability**. Then click **Not you? Switch**, choose a second name, press
    **Continue**, tick times and save. Check **Results** on the organizer page
    ("2 of N responded", the counts and "Most available") and the rows in the
    "Meeting Scheduler Data" sheet. Delete the test poll.

## Updating

```bash
npm run push
```

(or paste the changed `dist/` files), then **Deploy → Manage deployments →
Edit (pencil) → Version: New version → Deploy**. The URL stays the same.

## If the data sheet seems missing

If the organizer page says "The data sheet is missing", click **Try again**
first: it is often a temporary Google problem. Use **Create a new data sheet**
only if the sheet was really deleted; existing polls stop appearing and their
links stop working.

If a new sheet was created by mistake, the old sheet's id was saved in the
Script Property `DATA_SHEET_ID_PREVIOUS`. Open **Project Settings → Script
Properties**, copy that value into `DATA_SHEET_ID`, and reload the organizer
page.

## Script Properties

| Property | Set by | Meaning |
|---|---|---|
| `DATA_SHEET_ID` | the app | The data sheet's file id. Replaced when a new data sheet is created |
| `DATA_SHEET_ID_PREVIOUS` | the app | The id of the sheet that "Create a new data sheet" replaced; copy it back into `DATA_SHEET_ID` to restore that sheet |
| `ADMIN_KEY` | `setupAdminKey` | Secret for the `?admin=` organizer link (fallback only) |
| `BASE_URL` | you, if needed | Overrides the base of the invitee links. Anything after a `?` or `#` and any trailing `/` is ignored |
