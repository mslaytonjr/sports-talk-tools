import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clamp, parseCsv, slugify, toNumber, writeCsv, writeJson } from "./shared.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const processedRoot = resolve(projectRoot, "data", "softball", "processed");
const inputRoot = resolve(projectRoot, "data", "softball", "inputs");

const targetSeason = process.argv[2] ?? "2026";
const featureNames = [
  "projected_run_diff",
  "rating_diff",
  "baseline_logit",
  "matched_player_diff",
  "match_rate_diff",
];

function readCsvFile(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }
  return parseCsv(readFileSync(filePath, "utf8"));
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

function buildFeatureRow(row) {
  return {
    projected_run_diff: toNumber(row.projected_run_diff) ?? 0,
    rating_diff: toNumber(row.rating_diff) ?? 0,
    baseline_logit: logit(toNumber(row.baseline_home_win_probability) ?? 0.5),
    matched_player_diff: toNumber(row.matched_player_diff) ?? 0,
    match_rate_diff: toNumber(row.match_rate_diff) ?? 0,
  };
}

function getScaler(featureRows) {
  const means = {};
  const scales = {};

  for (const feature of featureNames) {
    const values = featureRows.map((row) => row[feature]);
    const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(values.length, 1);
    means[feature] = mean;
    scales[feature] = Math.sqrt(variance) || 1;
  }

  return { means, scales };
}

function vectorize(featureRow, scaler) {
  return [
    1,
    ...featureNames.map((feature) => (featureRow[feature] - scaler.means[feature]) / scaler.scales[feature]),
  ];
}

function trainLogisticRegression(rows, iterations = 3500, learningRate = 0.08, l2 = 0.03) {
  const featureRows = rows.map(buildFeatureRow);
  const scaler = getScaler(featureRows);
  const vectors = featureRows.map((row) => vectorize(row, scaler));
  const labels = rows.map((row) => toNumber(row.home_win) ?? 0);
  const weights = Array(vectors[0]?.length ?? featureNames.length + 1).fill(0);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradients = weights.map(() => 0);

    for (let rowIndex = 0; rowIndex < vectors.length; rowIndex += 1) {
      const vector = vectors[rowIndex];
      const score = vector.reduce((sum, value, index) => sum + value * weights[index], 0);
      const error = sigmoid(score) - labels[rowIndex];

      for (let index = 0; index < gradients.length; index += 1) {
        gradients[index] += error * vector[index];
      }
    }

    for (let index = 0; index < weights.length; index += 1) {
      const penalty = index === 0 ? 0 : l2 * weights[index];
      weights[index] -= learningRate * ((gradients[index] / Math.max(vectors.length, 1)) + penalty);
    }
  }

  return { featureNames, scaler, weights };
}

function predictWithModel(model, row) {
  const vector = vectorize(buildFeatureRow(row), model.scaler);
  const score = vector.reduce((sum, value, index) => sum + value * model.weights[index], 0);
  return sigmoid(score);
}

function brierScore(rows, getProbability) {
  if (rows.length === 0) {
    return null;
  }
  return rows.reduce((sum, row) => {
    const label = toNumber(row.home_win) ?? 0;
    return sum + (getProbability(row) - label) ** 2;
  }, 0) / rows.length;
}

function accuracy(rows, getProbability) {
  if (rows.length === 0) {
    return null;
  }
  const correct = rows.filter((row) => {
    const label = toNumber(row.home_win) ?? 0;
    return (getProbability(row) >= 0.5 ? 1 : 0) === label;
  }).length;
  return correct / rows.length;
}

function buildLeaveOneOutRows(rows) {
  if (rows.length < 4) {
    return [];
  }

  return rows.map((row, index) => {
    const trainRows = rows.filter((_, candidateIndex) => candidateIndex !== index);
    const model = trainLogisticRegression(trainRows, 2500, 0.08, 0.05);
    return {
      ...row,
      ml_home_win_probability: predictWithModel(model, row),
    };
  });
}

function findScheduleGame(scheduleRows, prediction) {
  return scheduleRows.find(
    (row) =>
      String(row.date ?? "") === String(prediction.date ?? "") &&
      slugify(row.home_team) === slugify(prediction.home_team) &&
      slugify(row.away_team) === slugify(prediction.away_team)
  );
}

function makePredictionFeatureRow(prediction, teamRatingsById) {
  const homeRating = teamRatingsById.get(slugify(prediction.home_team));
  const awayRating = teamRatingsById.get(slugify(prediction.away_team));
  const homeMatchedPlayers = toNumber(homeRating?.matched_players);
  const awayMatchedPlayers = toNumber(awayRating?.matched_players);
  const homeRosterSize = toNumber(homeRating?.roster_size);
  const awayRosterSize = toNumber(awayRating?.roster_size);

  return {
    projected_run_diff:
      (toNumber(prediction.home_projected_runs) ?? 0) - (toNumber(prediction.away_projected_runs) ?? 0),
    rating_diff:
      (toNumber(homeRating?.overall_rating) ?? 0) - (toNumber(awayRating?.overall_rating) ?? 0),
    baseline_home_win_probability: toNumber(prediction.home_win_probability) ?? 0.5,
    matched_player_diff: (homeMatchedPlayers ?? 0) - (awayMatchedPlayers ?? 0),
    match_rate_diff:
      homeRosterSize && awayRosterSize
        ? (homeMatchedPlayers ?? 0) / homeRosterSize - (awayMatchedPlayers ?? 0) / awayRosterSize
        : 0,
  };
}

function main() {
  const datasetPath = resolve(processedRoot, `ml_training_dataset_${targetSeason}.csv`);
  const rows = readCsvFile(datasetPath);

  if (rows.length < 4) {
    throw new Error(
      `Need at least 4 completed games in ${datasetPath}. Run softball:ml-dataset after scores are available.`
    );
  }

  const model = trainLogisticRegression(rows);
  const evaluatedRows = rows.map((row) => ({
    ...row,
    ml_home_win_probability: predictWithModel(model, row),
  }));
  const leaveOneOutRows = buildLeaveOneOutRows(rows);

  writeJson(resolve(processedRoot, `ml_model_${targetSeason}.json`), {
    generatedAt: new Date().toISOString(),
    season: Number(targetSeason),
    type: "logistic_regression",
    target: "home_win",
    features: featureNames,
    scaler: model.scaler,
    weights: model.weights,
    trainingRows: rows.length,
  });

  writeJson(resolve(processedRoot, `ml_evaluation_${targetSeason}.json`), {
    generatedAt: new Date().toISOString(),
    season: Number(targetSeason),
    trainingRows: rows.length,
    baseline: {
      brierScore: brierScore(rows, (row) => toNumber(row.baseline_home_win_probability) ?? 0.5),
      accuracy: accuracy(rows, (row) => toNumber(row.baseline_home_win_probability) ?? 0.5),
    },
    mlInSample: {
      brierScore: brierScore(evaluatedRows, (row) => row.ml_home_win_probability),
      accuracy: accuracy(evaluatedRows, (row) => row.ml_home_win_probability),
    },
    mlLeaveOneOut:
      leaveOneOutRows.length > 0
        ? {
            brierScore: brierScore(leaveOneOutRows, (row) => row.ml_home_win_probability),
            accuracy: accuracy(leaveOneOutRows, (row) => row.ml_home_win_probability),
          }
        : null,
    note:
      rows.length < 30
        ? "Small sample. Treat ML probabilities as a learning/calibration aid, not a replacement for the base model."
        : "Compare leave-one-out metrics against the baseline before trusting the ML layer.",
  });

  writeCsv(resolve(processedRoot, `ml_training_predictions_${targetSeason}.csv`), [
    "season",
    "date",
    "game_id",
    "home_team",
    "away_team",
    "home_score",
    "away_score",
    "home_win",
    "baseline_home_win_probability",
    "ml_home_win_probability",
  ], evaluatedRows.map((row) => ({
    ...row,
    ml_home_win_probability: row.ml_home_win_probability.toFixed(4),
  })));

  const predictions = readCsvFile(resolve(processedRoot, "predictions.csv"));
  const scheduleRows = readCsvFile(resolve(inputRoot, `schedule_${targetSeason}.csv`));
  const teamRatings = readCsvFile(resolve(processedRoot, "team_ratings.csv"));
  const teamRatingsById = new Map(teamRatings.map((row) => [row.team_id, row]));

  const mlPredictions = predictions.map((prediction) => {
    const scheduleGame = findScheduleGame(scheduleRows, prediction);
    const featureRow = makePredictionFeatureRow(prediction, teamRatingsById);
    const mlHomeWinProbability = predictWithModel(model, featureRow);
    return {
      ...prediction,
      game_id: scheduleGame?.game_id ?? "",
      home_score: scheduleGame?.home_score ?? "",
      away_score: scheduleGame?.away_score ?? "",
      baseline_home_win_probability: prediction.home_win_probability,
      ml_home_win_probability: mlHomeWinProbability.toFixed(4),
      ml_away_win_probability: (1 - mlHomeWinProbability).toFixed(4),
    };
  });

  writeCsv(resolve(processedRoot, `ml_predictions_${targetSeason}.csv`), [
    "season",
    "date",
    "game_id",
    "home_team",
    "away_team",
    "home_projected_runs",
    "away_projected_runs",
    "home_score",
    "away_score",
    "baseline_home_win_probability",
    "ml_home_win_probability",
    "ml_away_win_probability",
  ], mlPredictions);

  console.log(`Trained local ML calibrator from ${rows.length} completed games for ${targetSeason}.`);
}

main();
