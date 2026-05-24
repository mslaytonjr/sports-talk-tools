import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, slugify } from "./shared.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const processedRoot = resolve(projectRoot, "data", "softball", "processed");
const inputRoot = resolve(projectRoot, "data", "softball", "inputs");
const rawRoot = resolve(projectRoot, "data", "softball", "raw");
const publicRoot = resolve(projectRoot, "public", "softball");

const targetSeason = process.argv[2] ?? "2026";

function readCsvFile(filePath) {
  return parseCsv(readFileSync(filePath, "utf8"));
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
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

function toNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function main() {
  const predictions = readCsvFile(resolve(processedRoot, "predictions.csv"));
  const mlPredictions = readJsonIfExists(resolve(processedRoot, `ml_model_${targetSeason}.json`))
    ? readCsvFile(resolve(processedRoot, `ml_predictions_${targetSeason}.csv`))
    : [];
  const scheduleRows = readCsvFile(resolve(inputRoot, `schedule_${targetSeason}.csv`));
  const teamRatings = readCsvFile(resolve(processedRoot, "team_ratings.csv"));
  const scrapeState = readJsonIfExists(resolve(rawRoot, targetSeason, "sportstrack-state.json"));
  const ratingMap = new Map(teamRatings.map((row) => [slugify(row.team), row]));

  const games = scheduleRows
    .map((row) => {
      const homeTeam = String(row.home_team ?? "").trim();
      const awayTeam = String(row.away_team ?? "").trim();
      const gameDate = normalizeDate(row.date);
      const prediction = predictions.find(
        (item) =>
          normalizeDate(item.date) === gameDate &&
          slugify(item.home_team) === slugify(homeTeam) &&
          slugify(item.away_team) === slugify(awayTeam)
      );

      if (!prediction) {
        return null;
      }

      const mlPrediction = mlPredictions.find(
        (item) =>
          normalizeDate(item.date) === gameDate &&
          slugify(item.home_team) === slugify(homeTeam) &&
          slugify(item.away_team) === slugify(awayTeam)
      );

      const homeWinProbability = Number(prediction.home_win_probability);
      const awayWinProbability = Number(prediction.away_win_probability);
      const homeProjectedRuns = Number(prediction.home_projected_runs);
      const awayProjectedRuns = Number(prediction.away_projected_runs);
      const total = homeProjectedRuns + awayProjectedRuns;
      const projectedMargin = homeProjectedRuns - awayProjectedRuns;
      const favorite = homeWinProbability >= awayWinProbability ? homeTeam : awayTeam;
      const favoriteProbability = Math.max(homeWinProbability, awayWinProbability);
      const mlHomeWinProbability = toNumber(mlPrediction?.ml_home_win_probability);
      const mlAwayWinProbability = toNumber(mlPrediction?.ml_away_win_probability);
      const mlFavorite =
        mlHomeWinProbability != null && mlAwayWinProbability != null
          ? mlHomeWinProbability >= mlAwayWinProbability
            ? homeTeam
            : awayTeam
          : "";
      const homeScore = toNumber(row.home_score);
      const awayScore = toNumber(row.away_score);
      const isFinal = homeScore != null && awayScore != null;
      const actualWinner = isFinal
        ? homeScore > awayScore
          ? homeTeam
          : awayScore > homeScore
            ? awayTeam
            : "Tie"
        : "";
      const predictedWinner = favorite;
      const actualMargin = isFinal ? homeScore - awayScore : null;
      const actualTotal = isFinal ? homeScore + awayScore : null;

      return {
        game_id: row.game_id || `${slugify(homeTeam)}_vs_${slugify(awayTeam)}`,
        season: Number(targetSeason),
        date: gameDate,
        display_date: String(row.date ?? "").trim(),
        neutral_site: true,
        home_team: homeTeam,
        away_team: awayTeam,
        home_projected_runs: homeProjectedRuns,
        away_projected_runs: awayProjectedRuns,
        total_runs: Number(total.toFixed(1)),
        projected_margin: Number(projectedMargin.toFixed(2)),
        home_win_probability: homeWinProbability,
        away_win_probability: awayWinProbability,
        ml_home_win_probability: mlHomeWinProbability,
        ml_away_win_probability: mlAwayWinProbability,
        ml_favorite: mlFavorite,
        ml_prediction_delta:
          mlHomeWinProbability != null
            ? Number((mlHomeWinProbability - homeWinProbability).toFixed(4))
            : null,
        home_moneyline: toAmericanOdds(homeWinProbability),
        away_moneyline: toAmericanOdds(awayWinProbability),
        favorite,
        spread_like_line: toSpread(favoriteProbability),
        confidence_tier: confidenceTier(favoriteProbability),
        home_team_rating: ratingMap.get(slugify(homeTeam))?.overall_rating ?? "",
        away_team_rating: ratingMap.get(slugify(awayTeam))?.overall_rating ?? "",
        status: isFinal ? "final" : "scheduled",
        home_score: homeScore,
        away_score: awayScore,
        actual_winner: actualWinner,
        predicted_winner: predictedWinner,
        prediction_correct: isFinal ? actualWinner === predictedWinner : null,
        actual_margin: actualMargin,
        margin_error: isFinal ? Number(Math.abs(projectedMargin - actualMargin).toFixed(2)) : null,
        actual_total: actualTotal,
        total_error: isFinal ? Number(Math.abs(total - actualTotal).toFixed(2)) : null,
        box_score_url: row.box_score_url ?? "",
      };
    })
    .filter(Boolean);

  const finalGames = games.filter((game) => game.status === "final");
  const correctPicks = finalGames.filter((game) => game.prediction_correct).length;

  const payload = {
    generated_at: new Date().toISOString(),
    stats_last_scraped_at: scrapeState.generatedAt ?? "",
    stats_through_date: scrapeState.lastScrapedGameDate ?? "",
    scraped_game_count: scrapeState.scrapedGameIds?.length ?? "",
    season: Number(targetSeason),
    board_title: "Softball Model Odds",
    board_subtitle: "Current-season softball projections with final-score tracking.",
    data_source: "Local softball model",
    caveat: "These are model-derived lines, not live sportsbook odds.",
    final_games: finalGames.length,
    correct_picks: correctPicks,
    pick_accuracy:
      finalGames.length > 0 ? Number((correctPicks / finalGames.length).toFixed(4)) : null,
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

  console.log(`Published ${games.length} softball odds entries for ${targetSeason}.`);
}

main();
