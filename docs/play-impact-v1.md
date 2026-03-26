# Play Impact V1 Metric Definition

## Purpose

Play Impact V1 defines the first measurement standard for the NFL play impact analysis work in this
repo. The goal is to measure how much a qualifying play changed the offense's chance to win.

For the initial analysis pass, the qualifying play set is intentionally narrow:

- 4th quarter
- one-score game
- sack plays

This creates a stable first slice of the model before expanding to additional play types or broader
game states.

## What Is Being Measured

The v1 metric measures the change in offensive win probability caused by a single qualifying play.

In plain terms:

- before the play, the offense has some chance to win
- after the play, that chance changes
- the metric captures that change from the offense's perspective

## Metric Definition

`wp_delta_offense = win_probability_after - win_probability_before`

Where:

- `win_probability_before` is the offense-side win probability before the play
- `win_probability_after` is the offense-side win probability after the play

For the current workflow:

- `win_probability_before` is sourced from nflverse `wp`
- `win_probability_after` is derived as `wp + wpa`
- the derived value is clipped to `[0, 1]`

Equivalent expression in the current implementation:

`wp_delta_offense = (wp + wpa) - wp`

That simplifies to:

`wp_delta_offense = wpa`

The code keeps the full before/after framing anyway so the model definition remains readable and can
evolve later if the source representation changes.

## Perspective

The canonical perspective for V1 is the offense.

That means:

- `posteam` is treated as the offense for the play
- positive `wp_delta_offense` means the play helped the offense
- negative `wp_delta_offense` means the play hurt the offense

For sacks, this usually means negative values, because sacks usually reduce the offense's chance to
win.

## Why This Metric Was Chosen For V1

This metric was chosen for V1 because it is:

- directly tied to game outcome leverage
- easier to interpret than a custom contextual score
- already supported by the available play-by-play source data
- reusable across future play types after sacks

It also keeps the first analysis narrow enough to validate quickly:

- one data source
- one play family
- one game-state filter
- one clearly interpretable outcome metric

## Scope For The Initial Story

The current qualifying-play filter is:

- `qtr === 4`
- `abs(score_differential) <= 8`
- `is_sack === true`

This is the exact play set used for the first sack impact summary.

## Known Limitations And Caveats

- `win_probability_after` is currently derived from `wp + wpa`, not loaded as a separate native
  source column.
- The model uses offense perspective only. Defensive framing is not stored as the canonical metric
  in V1.
- The initial analysis only covers 4th-quarter one-score sack plays, so it should not be treated as
  a universal measure of all sacks.
- Win probability models can vary by source methodology, so the metric inherits nflverse's WP/WPA
  assumptions.
- Sacks can include edge cases such as null win probability rows or unusual play descriptions; those
  rows are excluded if the metric cannot be calculated.

## Reusable Implementation Locations

The V1 logic is implemented in:

- `src/lib/playImpact.ts`
- `scripts/build-play-impact-season.mjs`

The current script output that uses this metric is:

- `data/play-impact/play_by_play_<season>_impact_foundation.q4_one_score_sacks.csv`
- `data/play-impact/play_by_play_<season>_impact_foundation.summary.json`

These artifacts are intended to be reused by future stories.
