import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clamp, parseCsv, slugify, toNumber } from "./shared.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const processedRoot = resolve(projectRoot, "data", "softball", "processed");

const [targetSeason = "2026", homeTeamArg = "", awayTeamArg = ""] = process.argv.slice(2);

function usage() {
  return [
    "Usage:",
    '  npm run softball:ml-matchup -- 2026 "Home Team" "Away Team"',
    "",
    "Example:",
    '  npm run softball:ml-matchup -- 2026 "Bash Brothers" "Black Mambas"',
  ].join("\n");
}

function readCsvFile(filePath) {
  return parseCsv(readFileSync(filePath, "utf8"));
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function sigmoid(value) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function logit(probability) {
  const value = clamp(probability, 0.001, 0.999);
  return Math.log(value / (1 - value));
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function findTeam(teamRatings, teamName) {
  const id = slugify(teamName);
  const exact = teamRatings.find((row) => row.team_id === id || slugify(row.team) === id);
  if (exact) {
    return exact;
  }

  const partialMatches = teamRatings.filter((row) => slugify(row.team).includes(id) || id.includes(slugify(row.team)));
  if (partialMatches.length === 1) {
    return partialMatches[0];
  }

  return null;
}

function buildBaselinePrediction(homeTeam, awayTeam) {
  const homeRuns = toNumber(homeTeam.projected_runs) ?? 0;
  const awayRuns = toNumber(awayTeam.projected_runs) ?? 0;
  const homeWinProbability = 1 / (1 + Math.exp(-((homeRuns - awayRuns) * 0.33)));

  return {
    homeProjectedRuns: homeRuns,
    awayProjectedRuns: awayRuns,
    projectedRunDiff: homeRuns - awayRuns,
    homeWinProbability,
    awayWinProbability: 1 - homeWinProbability,
  };
}

function buildFeatureRow(homeTeam, awayTeam, baseline) {
  const homeMatchedPlayers = toNumber(homeTeam.matched_players) ?? 0;
  const awayMatchedPlayers = toNumber(awayTeam.matched_players) ?? 0;
  const homeRosterSize = toNumber(homeTeam.roster_size) ?? 0;
  const awayRosterSize = toNumber(awayTeam.roster_size) ?? 0;

  return {
    projected_run_diff: baseline.projectedRunDiff,
    rating_diff: (toNumber(homeTeam.overall_rating) ?? 0) - (toNumber(awayTeam.overall_rating) ?? 0),
    baseline_logit: logit(baseline.homeWinProbability),
    matched_player_diff: homeMatchedPlayers - awayMatchedPlayers,
    match_rate_diff:
      homeRosterSize && awayRosterSize
        ? homeMatchedPlayers / homeRosterSize - awayMatchedPlayers / awayRosterSize
        : 0,
  };
}

function predictWithModel(model, featureRow) {
  const vector = [
    1,
    ...model.features.map((feature) => {
      const mean = model.scaler.means[feature] ?? 0;
      const scale = model.scaler.scales[feature] || 1;
      return ((featureRow[feature] ?? 0) - mean) / scale;
    }),
  ];
  const score = vector.reduce((sum, value, index) => sum + value * model.weights[index], 0);
  return sigmoid(score);
}

function main() {
  if (!homeTeamArg || !awayTeamArg) {
    throw new Error(usage());
  }

  const modelPath = resolve(processedRoot, `ml_model_${targetSeason}.json`);
  if (!existsSync(modelPath)) {
    throw new Error(`Missing ${modelPath}. Run npm run softball:ml-train -- ${targetSeason} first.`);
  }

  const teamRatings = readCsvFile(resolve(processedRoot, "team_ratings.csv"));
  const model = readJsonFile(modelPath);
  const homeTeam = findTeam(teamRatings, homeTeamArg);
  const awayTeam = findTeam(teamRatings, awayTeamArg);

  if (!homeTeam || !awayTeam) {
    const knownTeams = teamRatings.map((row) => row.team).join(", ");
    throw new Error(`Could not match both teams. Known teams: ${knownTeams}`);
  }

  const baseline = buildBaselinePrediction(homeTeam, awayTeam);
  const featureRow = buildFeatureRow(homeTeam, awayTeam, baseline);
  const mlHomeWinProbability = predictWithModel(model, featureRow);
  const baseFavorite =
    baseline.homeWinProbability >= baseline.awayWinProbability ? homeTeam.team : awayTeam.team;
  const mlFavorite = mlHomeWinProbability >= 0.5 ? homeTeam.team : awayTeam.team;

  console.log(JSON.stringify({
    season: Number(targetSeason),
    home_team: homeTeam.team,
    away_team: awayTeam.team,
    base_prediction: {
      favorite: baseFavorite,
      home_projected_runs: Number(baseline.homeProjectedRuns.toFixed(2)),
      away_projected_runs: Number(baseline.awayProjectedRuns.toFixed(2)),
      home_win_probability: Number(baseline.homeWinProbability.toFixed(4)),
      away_win_probability: Number(baseline.awayWinProbability.toFixed(4)),
      display: `${homeTeam.team} ${formatPercent(baseline.homeWinProbability)} / ${awayTeam.team} ${formatPercent(baseline.awayWinProbability)}`,
    },
    ml_prediction: {
      favorite: mlFavorite,
      home_win_probability: Number(mlHomeWinProbability.toFixed(4)),
      away_win_probability: Number((1 - mlHomeWinProbability).toFixed(4)),
      display: `${homeTeam.team} ${formatPercent(mlHomeWinProbability)} / ${awayTeam.team} ${formatPercent(1 - mlHomeWinProbability)}`,
    },
    model_note:
      model.trainingRows < 30
        ? "Small training sample. Use ML as an experimental calibration, not the source of truth."
        : "Compare this with the base model before acting on the ML probability.",
  }, null, 2));
}

main();
