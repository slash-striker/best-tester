# Novex Learner

Novex Learner is a local-first study and test site. Create subject decks, add key-value pairs, and practice through configurable self-tests or timed tests. Sign-up profiles use a username and a PBKDF2 password hash; each profile's decks, settings, and test history are saved separately in that browser.

Local profiles are not server-backed authentication: study data is not encrypted, profiles do not sync across devices, and passwords cannot be recovered. Data is saved in browser storage for the specific site origin and browser. For example, data created at `localhost` does not automatically appear on the Netlify URL, and clearing browser site data can erase it. The first profile created in a browser imports any previously saved Novex Learner decks.

## Saving, importing, and exporting data

- **Saving:** The current profile's decks, pairs, test history, preferences, and test settings are saved automatically in that browser. Netlify hosts the site files; it does not store or back up this data.
- **CSV export/import:** Open a deck and choose **Export CSV** to download its pairs, or **Import CSV** to add rows from a CSV file. CSV columns are `left,right,stroke_guide`; the stroke guide column is optional. CSV imports warn about duplicate pairs before adding them.
- **Bulk entry:** In a deck, open **Bulk entry / multiline paste**. Put one pair on each line, separated by `=`, a tab, or a comma.
- **Full profile backup:** **Settings → Download full backup (.txt)** saves a portable text file containing decks and pairs, test history (including drawing submissions), progression, cosmetics, preferences, and test options. **Restore full backup** restores that data to the signed-in local profile after confirmation. It replaces that profile's current data.
- **Credentials:** Backups never include usernames, password hashes, or salts. Import does not sign you in; it restores learning data into the profile you are currently using.
- **Backup safety:** Keep a copy somewhere safe. The site validates imported files and accepts only its supported backup format. CSV remains available when you only need to move pairs.

The username/password profile is a local convenience, not secure authentication. Do not reuse a sensitive password here.

## Features

- Independent question types: left-to-right, right-to-left, write, draw, multiple choice, and recognition.
- Randomized tests that spread pair variants throughout the question sequence and never exceed the requested count. Speed Run and Survival rotate through the pool again only after every variant has appeared once; Speed Run is capped at 60 seconds by default.
- Self-grading, timed test review, skip tracking, historical results, deck accuracy, and weakest-pair reporting.
- Chinese handwriting canvas with grid, ink and paper colors, adjustable brush and canvas height, eraser, undo/redo, and clear.
- Per-pair manual stroke-order guide, pair editing and deletion, multiline bulk entry, duplicate warnings, CSV import/export, and deck copying.
- XP, levels, earned credits, daily challenges, evolving streak visuals, achievements, and an in-app cosmetic shop.
- Speed Run, Survival, Memory Rush, Perfect Run, and unlockable boss battles.
- Customizable operator profile, skill-point tree (Memory, Focus, Speed, and Intelligence bonuses), unlockable themes, profile frames, and titles.
- Cyberpunk-inspired dark/light themes, animated UI details, responsive navigation, and reduced-motion support.

The app is static and local-first. Friends, global leaderboards, multiplayer study parties, cloud backup, and AI coaching require a trusted backend and are not simulated by this build.

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
