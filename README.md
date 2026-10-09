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
