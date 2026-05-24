import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, slugify, toNumber, writeCsv, writeJson } from "./shared.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const processedRoot = resolve(projectRoot, "data", "softball", "processed");
const inputRoot = resolve(projectRoot, "data", "softball", "inputs");

const targetSeason = process.argv[2] ?? "2026";

function readCsvFile(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }
  return parseCsv(readFileSync(filePath, "utf8"));
}

function numberOrBlank(value) {
  const numeric = toNumber(value);
  return numeric == null ? "" : numeric;
}

function findPrediction(predictions, game) {
  const gameDate = String(game.date ?? "");
  const homeId = slugify(game.home_team);
  const awayId = slugify(game.away_team);

  return predictions.find(
    (row) =>
      String(row.date ?? "") === gameDate &&
      slugify(row.home_team) === homeId &&
      slugify(row.away_team) === awayId
  );
}

function main() {
  const scheduleRows = readCsvFile(resolve(inputRoot, `schedule_${targetSeason}.csv`));
  const predictions = readCsvFile(resolve(processedRoot, "predictions.csv"));
  const teamRatings = readCsvFile(resolve(processedRoot, "team_ratings.csv"));
  const ratingsById = new Map(teamRatings.map((row) => [row.team_id, row]));

  const rows = [];
  const skipped = [];

  for (const game of scheduleRows) {
    const homeScore = toNumber(game.home_score);
    const awayScore = toNumber(game.away_score);
    if (homeScore == null || awayScore == null || homeScore === awayScore) {
      continue;
    }

    const prediction = findPrediction(predictions, game);
    const homeRating = ratingsById.get(slugify(game.home_team));
    const awayRating = ratingsById.get(slugify(game.away_team));

    if (!prediction || !homeRating || !awayRating) {
      skipped.push({
        date: game.date,
        home_team: game.home_team,
        away_team: game.away_team,
        reason: !prediction ? "missing_prediction" : "missing_team_rating",
      });
      continue;
    }

    const homeProjectedRuns = toNumber(prediction.home_projected_runs);
    const awayProjectedRuns = toNumber(prediction.away_projected_runs);
    const homeWinProbability = toNumber(prediction.home_win_probability);
    const awayWinProbability = toNumber(prediction.away_win_probability);
    const homeOverallRating = toNumber(homeRating.overall_rating);
    const awayOverallRating = toNumber(awayRating.overall_rating);
    const homeMatchedPlayers = toNumber(homeRating.matched_players);
    const awayMatchedPlayers = toNumber(awayRating.matched_players);
    const homeRosterSize = toNumber(homeRating.roster_size);
    const awayRosterSize = toNumber(awayRating.roster_size);

    rows.push({
      season: Number(targetSeason),
      date: game.date,
      game_id: game.game_id ?? "",
      home_team: game.home_team,
      away_team: game.away_team,
      home_score: homeScore,
      away_score: awayScore,
      home_win: homeScore > awayScore ? 1 : 0,
      run_differential: homeScore - awayScore,
      total_runs: homeScore + awayScore,
      home_projected_runs: numberOrBlank(homeProjectedRuns),
      away_projected_runs: numberOrBlank(awayProjectedRuns),
      projected_run_diff: homeProjectedRuns != null && awayProjectedRuns != null ? homeProjectedRuns - awayProjectedRuns : "",
      baseline_home_win_probability: numberOrBlank(homeWinProbability),
      baseline_away_win_probability: numberOrBlank(awayWinProbability),
      home_overall_rating: numberOrBlank(homeOverallRating),
      away_overall_rating: numberOrBlank(awayOverallRating),
      rating_diff: homeOverallRating != null && awayOverallRating != null ? homeOverallRating - awayOverallRating : "",
      home_roster_size: numberOrBlank(homeRosterSize),
      away_roster_size: numberOrBlank(awayRosterSize),
      home_matched_players: numberOrBlank(homeMatchedPlayers),
      away_matched_players: numberOrBlank(awayMatchedPlayers),
      matched_player_diff:
        homeMatchedPlayers != null && awayMatchedPlayers != null ? homeMatchedPlayers - awayMatchedPlayers : "",
      home_match_rate:
        homeMatchedPlayers != null && homeRosterSize ? homeMatchedPlayers / homeRosterSize : "",
      away_match_rate:
        awayMatchedPlayers != null && awayRosterSize ? awayMatchedPlayers / awayRosterSize : "",
      match_rate_diff:
        homeMatchedPlayers != null && awayMatchedPlayers != null && homeRosterSize && awayRosterSize
          ? homeMatchedPlayers / homeRosterSize - awayMatchedPlayers / awayRosterSize
          : "",
    });
  }

  writeCsv(resolve(processedRoot, `ml_training_dataset_${targetSeason}.csv`), [
    "season",
    "date",
    "game_id",
    "home_team",
    "away_team",
    "home_score",
    "away_score",
    "home_win",
    "run_differential",
    "total_runs",
    "home_projected_runs",
    "away_projected_runs",
    "projected_run_diff",
    "baseline_home_win_probability",
    "baseline_away_win_probability",
    "home_overall_rating",
    "away_overall_rating",
    "rating_diff",
    "home_roster_size",
    "away_roster_size",
    "home_matched_players",
    "away_matched_players",
    "matched_player_diff",
    "home_match_rate",
    "away_match_rate",
    "match_rate_diff",
  ], rows);

  writeJson(resolve(processedRoot, `ml_training_summary_${targetSeason}.json`), {
    generatedAt: new Date().toISOString(),
    season: Number(targetSeason),
    completedGames: rows.length,
    skippedGames: skipped,
  });

  console.log(`Built ML training dataset with ${rows.length} completed games for ${targetSeason}.`);
}

main();
