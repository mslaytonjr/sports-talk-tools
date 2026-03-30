import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, slugify, writeCsv } from "./shared.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const processedRoot = resolve(projectRoot, "data", "softball", "processed");
const inputRoot = resolve(projectRoot, "data", "softball", "inputs");

const targetSeason = process.argv[2] ?? "2026";

function readCsvFile(filePath) {
  return parseCsv(readFileSync(filePath, "utf8"));
}

function buildPrediction(homeTeam, awayTeam) {
  const homeRuns = Number(homeTeam.projected_runs) * Math.exp(-(Number(awayTeam.defense_rating) || 0));
  const awayRuns = Number(awayTeam.projected_runs) * Math.exp(-(Number(homeTeam.defense_rating) || 0));
  const homeWinProbability = 1 / (1 + Math.exp(-((homeRuns - awayRuns) * 0.33)));

  return {
    season: Number(targetSeason),
    date: "",
    home_team: homeTeam.team,
    away_team: awayTeam.team,
    home_projected_runs: homeRuns.toFixed(2),
    away_projected_runs: awayRuns.toFixed(2),
    home_win_probability: homeWinProbability.toFixed(4),
    away_win_probability: (1 - homeWinProbability).toFixed(4),
  };
}

function main() {
  const teamRatings = readCsvFile(resolve(processedRoot, "team_ratings.csv"));
  const byTeamId = new Map(teamRatings.map((row) => [row.team_id, row]));
  const schedulePath = resolve(inputRoot, `schedule_${targetSeason}.csv`);

  let predictions = [];

  if (existsSync(schedulePath)) {
    const scheduleRows = readCsvFile(schedulePath);
    if (scheduleRows.length > 0) {
      predictions = scheduleRows
        .map((row) => {
          const home = byTeamId.get(slugify(row.home_team));
          const away = byTeamId.get(slugify(row.away_team));
          if (!home || !away) {
            return null;
          }
          return {
            ...buildPrediction(home, away),
            date: row.date ?? "",
          };
        })
        .filter(Boolean);
    }
  }

  if (predictions.length === 0) {
    for (let index = 0; index < teamRatings.length; index += 1) {
      for (let opponentIndex = index + 1; opponentIndex < teamRatings.length; opponentIndex += 1) {
        predictions.push(buildPrediction(teamRatings[index], teamRatings[opponentIndex]));
      }
    }
  }

  writeCsv(resolve(processedRoot, "predictions.csv"), [
    "season",
    "date",
    "home_team",
    "away_team",
    "home_projected_runs",
    "away_projected_runs",
    "home_win_probability",
    "away_win_probability",
  ], predictions);

  console.log(`Generated ${predictions.length} softball predictions for ${targetSeason}.`);
}

main();
