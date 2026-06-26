# Sports Talk Tools

## Session Resume Note

For future Codex sessions working on the softball pipeline, start by reading:

- `docs/softball-agent-state.md`
- `docs/softball-prediction-pipeline.md`

## Softball Prediction Pipeline

The softball pipeline is local-only and script-based. It is designed to build reusable historical
player/team/game data for a beer-league prediction model.

Project notes live in:

- `docs/softball-prediction-pipeline.md`
- `docs/softball-script-guide.md`

Current commands:

```bash
npm run softball:normalize -- 2025 2024 2023
npm run softball:build-dataset -- 2025 2024 2023
npm run softball:build-model -- 2026
npm run softball:predict -- 2026
npm run softball:ml-dataset -- 2026
npm run softball:ml-train -- 2026
npm run softball:ml-matchup -- 2026 "Bash Brothers" "Black Mambas"
```

This workflow currently:

- relies on locally saved raw HTML snapshots for the selected seasons
- saves them under `data/softball/raw/<season>/`
- normalizes the all-player table into reusable CSV files
- writes `teams.csv`, `players.csv`, `player_stats.csv`, `games.csv`, and review outputs
- provides a current-roster input template at `data/softball/inputs/rosters_2026.csv`
- provides optional `availability_2026.csv` and `schedule_2026.csv` templates
- builds `team_ratings.csv`, `player_impact.csv`, `predictions.csv`, and `model_summary.json`
- can build a local ML training dataset from completed scores and train a lightweight logistic
  regression calibrator

Important note:

- the player/all-player normalization is the strongest part of the current foundation
- `games.csv` is still a first-pass extraction from team-page tables and is intended to be hardened next
- the current prediction model is player-driven because team-page capture is incomplete for several seasons

## Play Impact Model Data Workflow

The reusable V1 metric definition lives in:

- `docs/play-impact-v1.md`

To build a reproducible one-season play-by-play dataset for the play impact work:

```bash
npm run build:play-impact-season -- 2024
```

That script:

- downloads one full nflverse play-by-play season
- keeps the first-pass fields needed for the impact model
- writes a trimmed CSV to `data/play-impact/`
- writes a one-score filtered CSV to `data/play-impact/`
- writes a JSON validation summary alongside it
- publishes the summary JSON and qualifying sack CSV to `public/play-impact/` for site use

The output includes:

- `game_id`
- `play_id`
- `qtr`
- `score_differential`
- `is_sack`
- `win_probability_before`
- `win_probability_after`

`win_probability_after` is derived as offensive `wp + wpa`, clipped to `[0, 1]`.

For the initial sack impact analysis, the one-score filter is defined at the play level as:

```text
abs(score_differential) <= 8
```

This filter is applied in code and the script writes a reusable filtered dataset for downstream
steps.

For the initial sack impact analysis, qualifying plays are:

- 4th quarter
- one-score by the definition above
- sack plays

The offensive win probability delta is defined as:

```text
wp_delta_offense = win_probability_after - win_probability_before
```

Offense perspective is canonical:

- `posteam` is treated as the offense
- `win_probability_before` is the offense's pre-play win probability
- `win_probability_after` remains in that same offense frame

The script also writes a reusable qualifying-play dataset:

- `data/play-impact/play_by_play_2024_impact_foundation.q4_one_score_sacks.csv`

The summary JSON also records the first aggregate readout for that filtered sack sample:

- `qualifyingPlayCount`
- `averageWpDeltaOffense`
- `medianWpDeltaOffense`
- `topImpactSacks`
- `topSackLeaders`

Example output files:

- `data/play-impact/play_by_play_2024_impact_foundation.csv`
- `data/play-impact/play_by_play_2024_impact_foundation.one_score.csv`
- `data/play-impact/play_by_play_2024_impact_foundation.q4_one_score_sacks.csv`
- `data/play-impact/play_by_play_2024_impact_foundation.summary.json`
- `public/play-impact/play_by_play_2024_impact_foundation.q4_one_score_sacks.csv`
- `public/play-impact/play_by_play_2024_impact_foundation.summary.json`

The rest of this repo remains a Vite + React app.

## Sabres Line Optimizer Lambda

The Sabres line optimizer can run as a daily EventBridge-triggered Lambda:

```bash
npm run deploy:sabres-line-optimizer-lambda -- `
  -FunctionName <lambda-name> `
  -ScheduleName sabres-line-optimizer-daily `
  -Region us-east-1
```

The default schedule is `cron(15 10 * * ? *)`, which runs once per day at 10:15 UTC.

Optional Lambda environment variables:

- `OUTPUT_BUCKET`: S3 bucket where the latest optimizer output is written
- `OUTPUT_KEY`: S3 key for the latest output, defaults to `sabres/line-optimizer/latest.json`
- `HISTORY_PREFIX`: S3 prefix for changed-lineup snapshots, defaults to `sabres/line-optimizer/history`
- `PLAYER_POOL_URL`: optional JSON source for `{ forwards, defensemen }`; when omitted, the Lambda uses its bundled player pool

If `OUTPUT_BUCKET` is set, the Lambda role needs `s3:GetObject` and `s3:PutObject` permissions for the configured output key and history prefix.

The Lambda:

- excludes unrestricted free agents from the eligible pool
- ignores IR status for end-of-season planning
- generates every eligible three-forward combo with at least one center
- scores each combo against Line 1-4 role weights
- selects the best non-overlapping four-line set
- compares the new lineup signature against the previous S3 output and writes a history snapshot when it changes

## Softball Daily Report Update

The softball reports can be refreshed by one command:

```bash
npm run softball:daily-update -- --force
```

This command:

- scrapes current Sportstrack data, including box-score fallback rows
- preserves restored historical seasons when raw historical snapshots are missing
- rebuilds normalized stats, model output, team reports, and league overview
- publishes updated static files under `public/softball`
- optionally syncs `public/softball` to S3 when `SOFTBALL_REPORTS_BUCKET` is set

Useful environment variables:

- `SOFTBALL_SEASON`: target season, defaults to `2026`
- `SOFTBALL_FORCE_SCRAPE`: set to `true` to re-scrape all completed games
- `SOFTBALL_REPORTS_BUCKET`: optional S3 bucket for published static reports
- `SOFTBALL_REPORTS_PREFIX`: optional S3 prefix, defaults to `softball`

For AWS scheduling, use CodeBuild with `buildspec-softball-daily.yml`, then attach an EventBridge rule to the CodeBuild project:

```powershell
npm run deploy:softball-daily-codebuild-schedule -- `
  -ProjectName <codebuild-project-name> `
  -ScheduleName softball-daily-update `
  -EventRoleArn <eventbridge-codebuild-role-arn> `
  -Region us-east-1
```

The default schedule is `cron(30 10 * * ? *)`, which runs once per day at 10:30 UTC. The CodeBuild service role needs normal source checkout permissions and `s3:PutObject`, `s3:DeleteObject`, and `s3:ListBucket` for the configured reports bucket if S3 publishing is enabled.

## Softball Lineup Endpoint

The softball lineup endpoint is a Lambda Function URL backed by the latest team report JSON in S3.

Deploy or update it with:

```powershell
npm run deploy:softball-lineup-lambda -- `
  -FunctionName <lambda-name> `
  -RoleArn <lambda-execution-role-arn> `
  -ReportsBucket <reports-bucket> `
  -ReportsPrefix softball `
  -Region us-east-1
```

`-RoleArn` is only required the first time, when the Lambda does not already exist. The Lambda execution role needs `s3:GetObject` for:

```text
s3://<reports-bucket>/softball/team_reports/*
```

Example request:

```bash
curl -X POST "<function-url>" \
  -H "content-type: application/json" \
  -d '{"team":"7th Floor Crew","unavailable":["Brad Hartung","Kevin DeJong","Alexander Sweetwood"]}'
```

The response includes structured lineup rows and a copyable `text` field:

```json
{
  "team": "7th Floor Crew",
  "season": "2026",
  "unavailable": ["Brad Hartung", "Kevin DeJong", "Alexander Sweetwood"],
  "lineup": [{ "spot": 1, "player_name": "Ryan Goodrich" }],
  "text": "7th Floor Crew Batting Order\n..."
}
```

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
