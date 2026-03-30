# Softball Prediction Pipeline

This workflow is local-only. It is meant to be run from this repo on this machine.

## Scope

The model is player-centric, not team-history-centric.

- Historical team names do not matter.
- Historical player performance does matter.
- Current-year rosters define the teams we actually want to project.

## Pipeline

1. Maintain local raw HTML snapshots for `2025`, `2024`, and `2023`.
2. Normalize those snapshots into reusable CSV/JSON files.
3. Maintain the current roster file in `data/softball/inputs/`.
4. Build the base full-attendance model.
5. Re-run the model with availability or lineup adjustments.
6. Generate pairwise or scheduled game predictions.

## Raw Capture

Important current reality:

- `data/softball/raw/` is the authoritative historical archive for this project.
- Some of the saved TurboStats HTML was copied in manually.
- Raw HTML should be added and maintained locally, not rebuilt from a scrape command.

Season snapshots live under:

- `data/softball/raw/2025/`
- `data/softball/raw/2024/`
- `data/softball/raw/2023/`

Manually saved HTML files in `data/softball/raw/` are valid source input for normalization.

## Normalization

Run:

```bash
npm run softball:normalize -- 2025 2024 2023
npm run softball:build-dataset -- 2025 2024 2023
```

This writes:

- `data/softball/processed/games.csv`
- `data/softball/processed/teams.csv`
- `data/softball/processed/players.csv`
- `data/softball/processed/player_stats.csv`
- `data/softball/processed/normalization-summary.json`
- `data/softball/processed/player_review.csv`
- `data/softball/processed/roster_matches.csv`

Normalization now adds:

- stable `historical_team_id` values derived from team names
- stable `historical_player_id` values derived from canonical player names
- first-pass team record metadata when a team page exists locally

## Current Rosters

Current teams should be entered manually in:

- `data/softball/inputs/rosters_2026.csv`
- or `data/softball/inputs/rosters_2026.tsv` using one team per column
- optional availability overrides can be entered in `data/softball/inputs/availability_2026.csv`
- optional player alias overrides can be entered in `data/softball/inputs/player_name_overrides_2026.csv`
- optional scheduled matchups can be entered in `data/softball/inputs/schedule_2026.csv`

Format:

```csv
season,team,player_name
2026,PURPLE HAZE,MARK SLAYTON
```

Alternate wide format:

```tsv
The Sultans of Swat	Black Mambas
Kevin Marquez	Bob Plishka
Sal DAmbrosia	David Plishka
```

In that format:

- row 1 is the team header row
- each later row is one player slot per team column
- blank cells are allowed

Availability format:

```csv
season,team,player_name,available,expected_start,notes
2026,PURPLE HAZE,MARK SLAYTON,yes,yes,
```

Player override format:

```csv
team,player_name,historical_player_name,notes
Black Mambas,David Plishka,Dave Plishka,User confirmed historical name mapping
```

Schedule format:

```csv
date,home_team,away_team
2026-05-07,PURPLE HAZE,DARK SIDE
```

## Model Build

Run:

```bash
npm run softball:build-model -- 2026
```

This writes:

- `data/softball/processed/team_ratings.csv`
- `data/softball/processed/player_impact.csv`
- `data/softball/processed/predictions.csv`
- `data/softball/processed/model_summary.json`

Current model behavior:

- uses weighted 2025, 2024, and 2023 batting history
- shrinks low-sample players toward the league average
- assumes full-roster availability unless `availability_2026.csv` says otherwise
- estimates offense from runs-created-per-plate-appearance with OPS fallback
- uses fielding rate as a light defense adjustment when available

## Predictions

Run:

```bash
npm run softball:predict -- 2026
```

If `schedule_2026.csv` exists and has rows, predictions are generated for that schedule. Otherwise the
script produces a full round-robin of the currently rostered teams.

## Notes

- The normalization step creates stable IDs for seasons, teams, and players.
- It also flags likely manual-review cases such as `sub`, duplicate aliases, and empty names.
- `games.csv` is still a first-pass placeholder because schedule extraction from team pages is not yet reliable.
- The current model is intentionally player-driven because historical team pages are incomplete in the saved snapshots.
- For now, trust the local raw archive more than the scraper status.
