import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, slugify } from "./shared.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const processedRoot = resolve(projectRoot, "data", "softball", "processed");
const inputRoot = resolve(projectRoot, "data", "softball", "inputs");
const publicRoot = resolve(projectRoot, "public", "softball");

const targetSeason = process.argv[2] ?? "2026";

function readCsvFile(filePath) {
  return parseCsv(readFileSync(filePath, "utf8"));
}

function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

function toAmericanOdds(probability) {
  if (probability <= 0) {
    return "+9999";
  }
  if (probability >= 1) {
    return "-9999";
  }
  if (probability >= 0.5) {
    return `${Math.round((-probability / (1 - probability)) * 100)}`;
  }
  return `+${Math.round(((1 - probability) / probability) * 100)}`;
}

function toSpread(probability) {
  const centered = (probability - 0.5) * 20;
  const rounded = Math.round(centered * 2) / 2;
  return rounded > 0 ? `-${rounded.toFixed(1)}` : `${Math.abs(rounded).toFixed(1)}`;
}

function confidenceTier(probability) {
  const edge = Math.abs(probability - 0.5);
  if (edge >= 0.12) {
    return "Strong";
  }
  if (edge >= 0.07) {
    return "Lean";
  }
  return "Coin Flip";
}

function normalizeDate(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }

  const [month, day, year] = text.split("/");
  if (!month || !day || !year) {
    return text;
  }

  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function main() {
  const predictions = readCsvFile(resolve(processedRoot, "predictions.csv"));
  const scheduleRows = readCsvFile(resolve(inputRoot, `schedule_${targetSeason}.csv`));
  const teamRatings = readCsvFile(resolve(processedRoot, "team_ratings.csv"));
  const ratingMap = new Map(teamRatings.map((row) => [slugify(row.team), row]));

  const games = scheduleRows
    .map((row) => {
      const homeTeam = String(row.home_team ?? "").trim();
      const awayTeam = String(row.away_team ?? "").trim();
      const prediction = predictions.find(
        (item) =>
          String(item.home_team ?? "").trim() === homeTeam &&
          String(item.away_team ?? "").trim() === awayTeam
      );

      if (!prediction) {
        return null;
      }

      const homeWinProbability = Number(prediction.home_win_probability);
      const awayWinProbability = Number(prediction.away_win_probability);
      const homeProjectedRuns = Number(prediction.home_projected_runs);
      const awayProjectedRuns = Number(prediction.away_projected_runs);
      const total = homeProjectedRuns + awayProjectedRuns;
      const favorite = homeWinProbability >= awayWinProbability ? homeTeam : awayTeam;
      const favoriteProbability = Math.max(homeWinProbability, awayWinProbability);

      return {
        game_id: `${slugify(homeTeam)}_vs_${slugify(awayTeam)}`,
        season: Number(targetSeason),
        date: normalizeDate(row.date),
        display_date: String(row.date ?? "").trim(),
        neutral_site: true,
        home_team: homeTeam,
        away_team: awayTeam,
        home_projected_runs: homeProjectedRuns,
        away_projected_runs: awayProjectedRuns,
        total_runs: Number(total.toFixed(1)),
        home_win_probability: homeWinProbability,
        away_win_probability: awayWinProbability,
        home_moneyline: toAmericanOdds(homeWinProbability),
        away_moneyline: toAmericanOdds(awayWinProbability),
        favorite,
        spread_like_line: toSpread(favoriteProbability),
        confidence_tier: confidenceTier(favoriteProbability),
        home_team_rating: ratingMap.get(slugify(homeTeam))?.overall_rating ?? "",
        away_team_rating: ratingMap.get(slugify(awayTeam))?.overall_rating ?? "",
      };
    })
    .filter(Boolean);

  const payload = {
    generated_at: new Date().toISOString(),
    season: Number(targetSeason),
    board_title: "Opening Day Model Odds",
    board_subtitle: "Neutral-site softball projections styled like a sportsbook board.",
    data_source: "Local softball model",
    caveat: "These are model-derived lines, not live sportsbook odds.",
    games,
  };

  ensureDir(publicRoot);
  writeFileSync(
    resolve(publicRoot, `opening-day-odds-${targetSeason}.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );
  writeFileSync(
    resolve(processedRoot, `opening-day-odds-${targetSeason}.json`),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8"
  );

  console.log(`Published ${games.length} opening day softball odds entries for ${targetSeason}.`);
}

main();
