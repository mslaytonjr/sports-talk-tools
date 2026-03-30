# Softball Agent State

Last updated: 2026-03-29

## Purpose

This file is the persistent handoff for Codex sessions working on the softball prediction pipeline.
Read this first after a restart to recover prior decisions, current constraints, and the intended next
steps before making changes.

## Project Goal

Build a local-only softball prediction pipeline in this repo. No site UI is required. The main outputs
should be reusable data files plus scripts for:

- historical data capture
- dataset normalization
- roster-driven team ratings
- matchup prediction
- player impact analysis

## Agreed Plan

1. Maintain 2025, 2024, and 2023 raw HTML data locally.
2. Normalize raw data into `games.csv`, `teams.csv`, `players.csv`, and `player_stats.csv`.
3. Maintain current rosters in `data/softball/inputs/rosters_2026.csv`.
4. Build a base full-attendance model using historical player/team information.
5. Build player impact outputs.
6. Add lineup/availability adjustments.
7. Generate reusable prediction outputs.

## Current Decisions

- The workflow is local-only and script-driven.
- `data/softball/raw/` is the current source of truth for historical softball data on this machine.
- Some of the raw HTML archive was captured manually by copy/paste when TurboStats fetches failed.
- The current model is intentionally player-driven because historical team-page schedule/results data is
  incomplete in the saved snapshots.
- Stable cross-season IDs matter:
  - `historical_team_id` is derived from normalized team names.
  - `historical_player_id` is derived from canonical player names.
- The roster file is the source of truth for 2026 teams.
- The model now supports either long-form `rosters_2026.csv` or wide tab-delimited `rosters_2026.tsv`.
- Availability adjustments are handled through `data/softball/inputs/availability_2026.csv`.
- Manual alias resolution is handled through `data/softball/inputs/player_name_overrides_2026.csv`.
- Scheduled predictions are handled through `data/softball/inputs/schedule_2026.csv`.
- A sportsbook-style opening day model-odds board now exists for the 2026 opening day schedule.
- That odds board is intentionally hidden from the main site home page and top navigation.
- The direct route still exists at `/SoftballOpeningDayOdds`.
- `games.csv` exists but is not trustworthy yet because team-page schedule extraction is still weak.
- The model currently uses weighted historical batting rates with shrinkage toward league average and a
  light fielding-based defense adjustment.
- The model now applies a capped year-over-year trend adjustment when projecting player offense.
- `build-model` should own ratings and player impact. `predict` should own `predictions.csv`.

## Implemented Commands

- `npm run softball:normalize -- 2025 2024 2023`
- `npm run softball:build-dataset -- 2025 2024 2023`
- `npm run softball:build-model -- 2026`
- `npm run softball:predict -- 2026`

## Files Added Or Changed For This Direction

- `scripts/softball/shared.mjs`
- `scripts/softball/normalize-softball-data.mjs`
- `scripts/softball/build-softball-dataset.mjs`
- `scripts/softball/build-softball-model.mjs`
- `scripts/softball/predict-softball-games.mjs`
- `scripts/softball/publish-softball-opening-day-odds.mjs`
- `docs/softball-prediction-pipeline.md`
- `README.md`
- `package.json`
- `data/softball/inputs/availability_2026.csv`
- `data/softball/inputs/player_name_overrides_2026.csv`
- `data/softball/inputs/schedule_2026.csv`
- `public/softball/opening-day-odds-2026.json`
- `src/lib/softballOdds.ts`
- `src/pages/SoftballOpeningDayOddsPage.tsx`

## Current Known Gaps

- `games.csv` is still basically empty.
- Raw team-page capture exists only partially for some seasons.
- Some normalized player rows come from noisy TurboStats tables, so the model defensively filters and
  shrinks inputs.
- Predictions are only useful once `rosters_2026.csv` contains full teams and `schedule_2026.csv`
  contains actual games.
- The report still exposes some noisy batting-profile fields; `offense_index` and
  `projected_offense_index` are more trustworthy than the raw displayed `avg/obp/slg/ops`.

## Current Data Reality

- 2025 normalization now recognizes 12 teams.
- 2024 normalization now recognizes 12 teams.
- 2023 normalization recognizes 11 teams from fallback player-derived discovery.
- Current 2026 roster input only contains one player on one team, so model output is structurally
  limited and `predictions.csv` is empty.

## Next Recommended Steps

1. Fill out `data/softball/inputs/rosters_2026.csv` with the real 2026 rosters.
2. Fill out `data/softball/inputs/schedule_2026.csv` if scheduled game predictions are wanted.
3. Improve raw schedule/result capture from TurboStats so `games.csv` becomes usable.
4. Revisit the base model once more real roster coverage exists and compare outputs against known team
   strength.
5. Add a manual review mapping file for ambiguous/substitute player names if matching quality becomes a
   problem.
6. Keep a documented manual import/update process for copied TurboStats HTML so future sessions know how
   the raw archive is maintained.
7. Strengthen the model with attendance-aware lineup logic and better rookie defaults.
8. Use `availability_2026.csv` whenever known absences come in before a game.

## Resume Instructions For Future Sessions

When resuming work:

1. Read this file first.
2. Read `docs/softball-prediction-pipeline.md` second.
3. Check `data/softball/inputs/rosters_2026.csv` to see whether the roster source of truth changed.
4. Avoid changing the player-driven modeling direction unless the user explicitly wants to revisit it.
5. Do not assume `games.csv` is ready for strong schedule-based modeling.
6. Treat the local raw files as the only supported ingestion path.
7. Do not put the softball odds board in the main site navigation unless the user explicitly asks for it.
