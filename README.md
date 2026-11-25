# Novex Learner

Novex Learner is a local-first study, budgeting, and games site. Create subject decks, add key-value pairs, practice through configurable tests, plan a budget, or play cards. Sign-up profiles use a username and a PBKDF2 password hash; each profile's decks, budget, settings, and progress are saved separately in that browser.

Local profiles are not server-backed authentication: profile and budget data are not encrypted, profiles do not sync across devices, and passwords cannot be recovered. Data is saved in browser storage for the specific site origin and browser. For example, data created at `localhost` does not automatically appear on the Netlify URL, and clearing browser site data can erase it. The first profile created in a browser imports any previously saved Novex Learner decks.

## Saving, importing, and exporting data

- **Saving:** The current profile's decks, pairs, test history, preferences, and test settings are saved automatically in that browser. Netlify hosts the site files; it does not store or back up this data.
- **CSV export/import:** Open a deck and choose **Export CSV** to download its pairs, or **Import CSV** to add rows from a CSV file. CSV columns are `left,right,stroke_guide`; the stroke guide column is optional. CSV imports warn about duplicate pairs before adding them.
- **Bulk entry:** In a deck, open **Bulk entry / multiline paste**. Put one pair on each line, separated by `=`, a tab, or a comma.
- **Full profile backup:** **Settings → Download full backup (.txt)** saves a portable text file containing decks and pairs, test history (including drawing submissions), progression, budget, game progress, cosmetics, preferences, and test options. **Restore full backup** restores that data to the signed-in local profile after confirmation. It replaces that profile's current data.
- **Credentials:** Backups never include usernames, password hashes, or salts. Import does not sign you in; it restores profile data into the profile you are currently using.
- **Backup safety:** Keep a copy somewhere safe. The site validates imported files and accepts only its supported backup format. CSV remains available when you only need to move pairs.

The username/password profile is a local convenience, not secure authentication. Do not reuse a sensitive password here.

## Features

- Independent question types: left-to-right, right-to-left, write, draw, multiple choice, and recognition.
- Randomized tests that spread pair variants throughout the question sequence and never exceed the requested count. Speed Run and Survival rotate through the pool again only after every variant has appeared once; Speed Run is capped at 60 seconds by default.
- Self-grading, timed test review, skip tracking, historical results, deck accuracy, and weakest-pair reporting.
- Chinese handwriting canvas with grid, ink and paper colors, adjustable brush and canvas height, eraser, undo/redo, and clear.
- Per-pair manual stroke-order guide, pair editing and deletion, multiline bulk entry, duplicate warnings, CSV import/export, and deck copying.
- XP, levels, earned credits, daily challenges, evolving streak visuals, achievements, and an in-app cosmetic shop with card backs, reveal effects, table themes, profile banners, avatars, and collectible card decks.
- Speed Run, Survival, Memory Rush, Perfect Run, and unlockable boss battles.
- A private budgeting lab with a flexible 50/30/20 starter split, manual expenses, savings goals, spending progress, and practical tips. It does not connect to banks, and budget data stays in the current browser profile.
- Klondike Solitaire with drag-and-drop and tap controls, plus FreeCell and Blackjack with 1–6 bots.
- Room-code Go Fish for 2–4 friends with private hands and live turns, plus opt-in casual leaderboards and 24-hour tournaments.
- Customizable operator profile, favorite game/deck, collection showcase, total game and winning-streak stats, a once-daily prize wheel, skill-point tree, unlockable themes, frames, titles, and victory/reveal effects.
- Cyberpunk-inspired dark/light themes, animated UI details, responsive navigation, and reduced-motion support.

The app's study profiles, budgets, and single-player card games are local to each browser. Go Fish, leaderboard scores, and tournaments use Supabase anonymous game identities and database functions. Leaderboard and tournament results are self-reported for friendly competition; they are not cheat-proof rankings. Netlify continues to host the static site; it does not provide the multiplayer database.

## Set up online games

1. Create a Supabase project and enable **Anonymous Sign-Ins** in its Authentication settings.
2. In the Supabase SQL Editor, run [`supabase/setup.sql`](supabase/setup.sql).
3. Copy the Supabase project URL and its **anon/public** key into `supabase-config.js` as `url` and `anonKey`, then deploy the updated files to Netlify.
4. Open **Card games → Go Fish** to create a room, or **Leaderboard** to opt into public scores and create or join a tournament.

The anon/public key is intended for browser use; database policies and functions restrict room access, keep hands private, and control score/tournament writes. Leaderboard participation is opt-in and shares only the chosen display name and card-game totals. Never put a Supabase `service_role` key in this site. Online play requires this setup; budgets and solo games still work without it. Supabase service limits and availability depend on the project plan.

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

This is a static HTML, CSS, and JavaScript site, so Netlify does not need a build step. The Supabase browser settings live in `supabase-config.js`; do not add privileged database keys to Netlify's public frontend configuration.
