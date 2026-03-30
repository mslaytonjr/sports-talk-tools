# Softball Script Guide

This guide explains what each softball script is for, when to use it, what it reads, and what it writes.

The softball tooling in this repo is local-only. It is meant to be run from this project on this machine
against the files under `data/softball/`.

## Core Idea

The scripts fall into four groups:

- normalization and validation
- HTML inspection and debugging
- modeling and publishing

The normal workflow is:

```bash
npm run softball:build-dataset -- 2025 2024 2023
npm run softball:build-model -- 2026
npm run softball:predict -- 2026
```

If you are debugging bad raw HTML or suspicious stats, use the inspection scripts before rebuilding the
dataset.

## Inputs And Output Folders

Main inputs:

- `data/softball/raw/<season>/`
- `data/softball/inputs/rosters_<season>.csv`
- `data/softball/inputs/rosters_<season>.tsv`
- `data/softball/inputs/availability_<season>.csv`
- `data/softball/inputs/player_name_overrides_<season>.csv`
- `data/softball/inputs/historical_player_review.csv`
- `data/softball/inputs/schedule_<season>.csv`

Main outputs:

- `data/softball/processed/`
- `data/softball/processed/formatted_html/`
- `data/softball/processed/team_reports/`
- `public/softball/`

## Recommended Workflows

### 1. Refresh historical data

Use this when local raw HTML files changed and you want to rebuild processed outputs.

```bash
npm run softball:build-dataset -- 2025 2024 2023
```

### 2. Debug suspicious player table data

Use this when `player_stats_review.csv` shows bad rows and you want to inspect the raw source table.

```bash
npm run softball:format-html -- 2025 players_table.html
npm run softball:debug-table -- 2025
```

Then rebuild:

```bash
npm run softball:build-dataset -- 2025
```

### 3. Update current-year team projections

Use this when roster, schedule, or availability inputs changed for the prediction season.

```bash
npm run softball:build-model -- 2026
npm run softball:predict -- 2026
```

### 4. Publish the opening day odds board

Use this when `predictions.csv` and `schedule_2026.csv` are ready and you want the JSON board output used by
the site route.

```bash
npm run softball:publish-opening-day -- 2026
```

## Script Reference

### `npm run softball:normalize -- <season...>`

Script:

- `scripts/softball/normalize-softball-data.mjs`

Why to use it:

- Convert raw HTML into reusable CSV and JSON files.
- Build the first-pass historical tables used by downstream validation and modeling.

When to use it:

- After raw files change.
- After you manually edit or replace raw HTML.
- After you add missing seasons or team pages.

Reads:

- `data/softball/raw/<season>/players_table.html`
- fallback: `data/softball/raw/<season>/leaders_xhr.html`
- `data/softball/raw/<season>/teams/*.html`
- `data/softball/raw/<season>/manifest.json` when present

Writes:

- `data/softball/processed/teams.csv`
- `data/softball/processed/players.csv`
- `data/softball/processed/player_stats.csv`
- `data/softball/processed/games.csv`
- `data/softball/processed/player_review.csv`
- `data/softball/processed/normalization-summary.json`

Notes:

- `games.csv` is still a first-pass extraction and should be treated cautiously.
- `player_review.csv` highlights obvious manual review cases like empty names, missing player links, and
  `SUB` rows.

### `npm run softball:validate -- <season...>`

Script:

- `scripts/softball/validate-softball-stats.mjs`

Why to use it:

- Classify normalized stat rows as `trusted`, `questionable`, or `rejected`.
- Generate the review files used to inspect bad historical player rows.

When to use it:

- After normalization.
- After updating manual review decisions in `historical_player_review.csv`.
- When you want to inspect the health of `player_stats.csv`.

Reads:

- `data/softball/processed/player_stats.csv`
- `data/softball/inputs/historical_player_review.csv`

Writes:

- `data/softball/processed/player_stats_validated.csv`
- `data/softball/processed/player_stats_trusted.csv`
- `data/softball/processed/player_stats_rejected.csv`
- `data/softball/processed/player_stats_review.csv`
- `data/softball/processed/player_stats_validation_summary.json`

Validation checks include:

- missing names
- `SUB` placeholders
- hits greater than at-bats
- hit breakdown totals greater than hits
- out-of-range rate stats
- oversized sample values
- empty stat shells

### `npm run softball:build-dataset -- <season...>`

Script:

- `scripts/softball/build-softball-dataset.mjs`

Why to use it:

- Run normalization and validation together as the standard rebuild step.

When to use it:

- Almost every time raw data changes.
- When you want a fresh processed dataset without running the two lower-level commands separately.

Reads:

- Same inputs as `softball:normalize`
- then the outputs from normalization

Writes:

- Everything written by `softball:normalize`
- everything written by `softball:validate`

Notes:

- This is the default rebuild command for the historical dataset.
- If you are debugging a bad row, it is often easier to run this after inspecting raw HTML so all review
  files stay in sync.

### `npm run softball:debug-table -- <season> [player name filter]`

Script:

- `scripts/softball/debug-softball-table.mjs`

Why to use it:

- Flatten the player table into a readable text file for row-by-row inspection.
- Compare raw cell counts against parsed header mappings.

When to use it:

- Investigating a suspicious player in `player_stats_review.csv`
- Checking whether table cells are shifting left or right
- Confirming the current `players_table.html` shape still matches the parser assumptions

Reads:

- `data/softball/raw/<season>/players_table.html`

Writes:

- `data/softball/processed/players_table_debug_<season>.txt`

Examples:

```bash
npm run softball:debug-table -- 2025
npm run softball:debug-table -- 2025 "Mark Slayton"
```

### `npm run softball:format-html -- <season> [file name]`

Script:

- `scripts/softball/format-softball-html.mjs`

Why to use it:

- Pretty-print raw HTML into nested tag order so the source is human-readable.
- Make large single-line TurboStats HTML inspectable in an editor.

When to use it:

- Before manually inspecting `players_table.html`
- When you want to compare nesting, missing tags, or weird table structure

Reads:

- `data/softball/raw/<season>/<file name>`

Writes:

- `data/softball/processed/formatted_html/<season>/<name>.formatted.html`

Examples:

```bash
npm run softball:format-html -- 2025 players_table.html
npm run softball:format-html -- 2025 leaders_xhr.html
```

Notes:

- This does not modify the raw source file.
- It is purely an inspection helper.

### `npm run softball:build-model -- <season>`

Script:

- `scripts/softball/build-softball-model.mjs`

Why to use it:

- Build current-season team ratings and player impact outputs from historical player performance plus the
  current roster file.

When to use it:

- After historical processed data is refreshed
- After current rosters change
- After availability or player alias override inputs change

Reads:

- `data/softball/processed/player_stats*.csv`
- `data/softball/inputs/rosters_<season>.csv`
- `data/softball/inputs/rosters_<season>.tsv`
- `data/softball/inputs/availability_<season>.csv`
- `data/softball/inputs/player_name_overrides_<season>.csv`

Writes:

- `data/softball/processed/roster_matches.csv`
- `data/softball/processed/team_ratings.csv`
- `data/softball/processed/player_impact.csv`
- `data/softball/processed/model_summary.json`

Notes:

- The roster TSV is preferred when present.
- This script does not write `predictions.csv`; that happens in `softball:predict`.
- If roster matching is poor, check `roster_matches.csv` before changing the model itself.

### `npm run softball:predict -- <season>`

Script:

- `scripts/softball/predict-softball-games.mjs`

Why to use it:

- Generate matchup-level predictions from `team_ratings.csv`.

When to use it:

- After `softball:build-model`
- After schedule changes
- When you want a round-robin set of all team matchups

Reads:

- `data/softball/processed/team_ratings.csv`
- `data/softball/inputs/schedule_<season>.csv` when present

Writes:

- `data/softball/processed/predictions.csv`

Behavior:

- If a schedule file exists and has rows, predictions are generated for that schedule.
- Otherwise the script creates a round-robin of all modeled teams.

### `npm run softball:team-report -- <season> "<team name>"`

Script:

- `scripts/softball/build-softball-team-report.mjs`

Why to use it:

- Build a team-specific JSON report with an estimated batting order and player importance summary.

When to use it:

- Reviewing one team’s projected lineup
- Checking which absences hurt a team most
- Explaining a team’s projection in a simpler package than the raw CSVs

Reads:

- `data/softball/processed/roster_matches.csv`
- `data/softball/processed/player_impact.csv`
- `data/softball/processed/team_ratings.csv`
- `data/softball/processed/player_stats*.csv`

Writes:

- `data/softball/processed/team_reports/<team_slug>_<season>.json`

Example:

```bash
npm run softball:team-report -- 2026 "7th Floor Crew"
```

### `npm run softball:publish-opening-day -- <season>`

Script:

- `scripts/softball/publish-softball-opening-day-odds.mjs`

Why to use it:

- Turn scheduled predictions into a site-consumable opening day odds board JSON.

When to use it:

- After `predictions.csv` is ready
- When the opening day schedule is final enough to publish

Reads:

- `data/softball/processed/predictions.csv`
- `data/softball/processed/team_ratings.csv`
- `data/softball/inputs/schedule_<season>.csv`

Writes:

- `data/softball/processed/opening-day-odds-<season>.json`
- `public/softball/opening-day-odds-<season>.json`

Notes:

- This is a publishing/export step, not a modeling step.
- It formats probabilities into moneyline-style and spread-like display fields for the site board.

## Files That Support The Scripts

### `scripts/softball/shared.mjs`

This is a helper module, not a user-facing command.

It contains utilities used by the other scripts for:

- CSV parsing and writing
- HTML table parsing
- tag stripping
- normalization helpers
- JSON output

You usually do not run this file directly.

## Which Command Should I Use?

If your goal is:

- rebuild processed historical data: `softball:build-dataset`
- inspect raw player table structure: `softball:format-html`
- inspect parsed player rows: `softball:debug-table`
- review bad normalized stat rows: `softball:validate`
- update team ratings from current rosters: `softball:build-model`
- generate game predictions: `softball:predict`
- inspect one team in detail: `softball:team-report`
- export the odds board JSON: `softball:publish-opening-day`

## Practical Advice

- When data looks wrong, inspect the raw HTML before trying to fix the model.
- When the raw HTML looks right but the CSV is wrong, inspect `players_table_debug_<season>.txt`.
- When the CSV looks right but rows are flagged, inspect `player_stats_review.csv`.
- When model output looks wrong, inspect `roster_matches.csv` before changing rating logic.
- When opening day board output looks wrong, inspect `predictions.csv` and `schedule_<season>.csv` before
  touching the publishing script.
