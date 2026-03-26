# Sports Talk Tools

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

Example output files:

- `data/play-impact/play_by_play_2024_impact_foundation.csv`
- `data/play-impact/play_by_play_2024_impact_foundation.one_score.csv`
- `data/play-impact/play_by_play_2024_impact_foundation.q4_one_score_sacks.csv`
- `data/play-impact/play_by_play_2024_impact_foundation.summary.json`
- `public/play-impact/play_by_play_2024_impact_foundation.q4_one_score_sacks.csv`
- `public/play-impact/play_by_play_2024_impact_foundation.summary.json`

The rest of this repo remains a Vite + React app.

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
