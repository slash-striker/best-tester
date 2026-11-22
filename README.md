# Novex Learner

Novex Learner is a local-first study and test site. Create subject decks, add key-value pairs, and practice through configurable self-tests or timed tests. Sign-up profiles use a username and a PBKDF2 password hash; each profile's decks, settings, and test history are saved separately in that browser.

Local profiles are not server-backed authentication: study data is not encrypted, profiles do not sync across devices, and passwords cannot be recovered. Data is saved in browser storage for the specific site origin and browser. For example, data created at `localhost` does not automatically appear on the Netlify URL, and clearing browser site data can erase it. The first profile created in a browser imports any previously saved Novex Learner decks.

## Saving, importing, and exporting data

- **Saving:** The current profile's decks, pairs, test history, preferences, and test settings are saved automatically in that browser. Netlify hosts the site files; it does not store or back up this data.
- **CSV export/import:** Open a deck and choose **Export CSV** to download its pairs, or **Import CSV** to add rows from a CSV file. CSV columns are `left,right,stroke_guide`; the stroke guide column is optional. CSV imports warn about duplicate pairs before adding them.
- **Bulk entry:** In a deck, open **Bulk entry / multiline paste**. Put one pair on each line, separated by `=`, a tab, or a comma.
- **Export all decks:** **Settings → Export all decks** downloads a JSON backup containing deck names, pairs, and stroke guides.
- **Backup limitation:** JSON backup import is not implemented. CSV import restores pairs into a deck, but does not restore test history, settings, or account profiles. Downloaded backups stay wherever your browser saves files; keep a copy somewhere safe.

The username/password profile is a local convenience, not secure authentication. Do not reuse a sensitive password here.

## Features

- Independent question types: left-to-right, right-to-left, write, draw, and recognition.
- Randomized tests that spread pair variants throughout the question sequence and never exceed the requested count.
- Self-grading, timed test review, skip tracking, historical results, deck accuracy, and weakest-pair reporting.
- Chinese handwriting canvas with grid, ink and paper colors, adjustable brush and canvas height, eraser, undo/redo, and clear.
- Per-pair manual stroke-order guide, pair editing and deletion, multiline bulk entry, duplicate warnings, CSV import/export, and deck copying.
- Cyberpunk-inspired dark and light themes.

## Run locally

Open `index.html` in a browser or serve the repository root with a static file server.

## Deploy to Netlify

Connect this repository to the Netlify site `novexlearner.netlify.app` and use:

| Netlify setting | Value |
| --- | --- |
| Base directory | Leave blank (repository root) |
| Build command | Leave blank |
| Publish directory | `.` |
| Environment variables | None required |

This is a static HTML, CSS, and JavaScript site, so Netlify does not need a build step or environment variables.
