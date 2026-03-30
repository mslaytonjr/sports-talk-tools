import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  average,
  canonicalizeName,
  clamp,
  parseCsv,
  slugify,
  toNumber,
  toRate,
  writeCsv,
  writeJson,
} from "./shared.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const processedRoot = resolve(projectRoot, "data", "softball", "processed");
const inputRoot = resolve(projectRoot, "data", "softball", "inputs");

const targetSeason = process.argv[2] ?? "2026";
const lineupSize = 10;
const shrinkPlateAppearances = 25;
const recencyDecay = 0.72;
const baselineRunsPerGame = 10;
const maxTrendAdjustment = 0.04;

function readCsvFile(filePath) {
  return parseCsv(readFileSync(filePath, "utf8"));
}

function getHistoricalStatsRows() {
  const trustedPath = resolve(processedRoot, "player_stats_trusted.csv");
  const validatedPath = resolve(processedRoot, "player_stats_validated.csv");
  if (existsSync(trustedPath)) {
    return readCsvFile(trustedPath);
  }
  if (existsSync(validatedPath)) {
    return readCsvFile(validatedPath).filter((row) => row.row_quality !== "rejected");
  }
  return readCsvFile(resolve(processedRoot, "player_stats.csv"));
}

function parseTabbedRosterMatrix(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\r/g, ""))
    .filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    return [];
  }

  const [headerLine, ...playerLines] = lines;
  const teams = headerLine.split("\t").map((value) => String(value).trim());
  const rosterRows = [];

  for (const playerLine of playerLines) {
    const cells = playerLine.split("\t");
    teams.forEach((team, index) => {
      const playerName = String(cells[index] ?? "").trim();
      if (!team || !playerName) {
        return;
      }

      rosterRows.push({
        season: targetSeason,
        team,
        player_name: playerName,
      });
    });
  }

  return rosterRows;
}

function getRosterRows() {
  const rosterCsvPath = resolve(inputRoot, `rosters_${targetSeason}.csv`);
  const rosterTsvPath = resolve(inputRoot, `rosters_${targetSeason}.tsv`);

  if (existsSync(rosterTsvPath)) {
    return parseTabbedRosterMatrix(readFileSync(rosterTsvPath, "utf8"));
  }

  if (!existsSync(rosterCsvPath)) {
    return [];
  }

  const text = readFileSync(rosterCsvPath, "utf8");
  if (text.includes("\t") && !text.includes("season,team,player_name")) {
    return parseTabbedRosterMatrix(text);
  }

  return parseCsv(text);
}

function getPlayerOverrideMap() {
  const overridePath = resolve(inputRoot, `player_name_overrides_${targetSeason}.csv`);
  if (!existsSync(overridePath)) {
    return new Map();
  }

  return new Map(
    readCsvFile(overridePath).map((row) => [
      `${canonicalizeName(row.team)}__${canonicalizeName(row.player_name)}`,
      {
        historical_player_name: String(row.historical_player_name ?? "").trim(),
        notes: String(row.notes ?? "").trim(),
      },
    ])
  );
}

function getHistoricalRows() {
  const playerStats = getHistoricalStatsRows();

  return playerStats
    .map((row) => {
      const atBats = toNumber(row.ab);
      const games = toNumber(row.g);
      const rawPlateAppearances = toNumber(row.pa);
      const plateAppearances =
        rawPlateAppearances != null && rawPlateAppearances > 0 && rawPlateAppearances <= 80
          ? rawPlateAppearances
          : atBats != null && atBats > 0 && atBats <= 80
            ? atBats
            : games != null && games > 0
              ? Math.min(games * 4, 80)
              : null;
      const rawFielding = toRate(row.fiel);
      const fielding = rawFielding != null && rawFielding >= 0.7 && rawFielding <= 1 ? rawFielding : null;
      const ops = toRate(row.ops);
      const averageRate = toRate(row.avg);
      const onBase = toRate(row.obp);
      const slugging = toRate(row.slg);
      const season = toNumber(row.season);
      const isSub = row.canonical_player_name?.startsWith("SUB");
      const offenseIndex = clamp(
        ((onBase ?? averageRate ?? ops ?? 0.33) * 0.45) +
          ((slugging ?? ops ?? onBase ?? averageRate ?? 0.45) * 0.35) +
          ((averageRate ?? onBase ?? 0.3) * 0.2),
        0.08,
        1.2
      );

      return {
        ...row,
        season,
        plateAppearances,
        fielding,
        ops,
        averageRate,
        onBase,
        slugging,
        offenseIndex,
        isSub,
      };
    })
    .filter(
      (row) =>
        row.season != null &&
        !row.isSub &&
        row.plateAppearances != null &&
        row.plateAppearances > 0 &&
        (row.averageRate != null || row.onBase != null || row.slugging != null || row.ops != null)
    );
}

function getLeagueContext(historicalRows) {
  const offenseSamples = historicalRows
    .filter((row) => row.plateAppearances && row.plateAppearances > 0)
    .map((row) => ({
      rate: row.offenseIndex,
      weight: row.plateAppearances,
      fielding: row.fielding,
    }));

  const weightedRate =
    offenseSamples.reduce((sum, sample) => sum + sample.rate * sample.weight, 0) /
    Math.max(offenseSamples.reduce((sum, sample) => sum + sample.weight, 0), 1);

  const fieldingValues = offenseSamples
    .map((sample) => sample.fielding)
    .filter((value) => value != null);

  return {
    leagueOffenseIndex: weightedRate,
    leagueRunsPerGame: baselineRunsPerGame,
    leagueFielding: fieldingValues.length > 0 ? average(fieldingValues) : 0.95,
  };
}

function computeTrendAdjustment(seasonRows) {
  if (seasonRows.length < 2) {
    return {
      trend_slope: 0,
      trend_adjustment: 0,
    };
  }

  const totalWeight = seasonRows.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight <= 0) {
    return {
      trend_slope: 0,
      trend_adjustment: 0,
    };
  }

  const meanSeason =
    seasonRows.reduce((sum, row) => sum + row.season * row.weight, 0) / totalWeight;
  const meanValue =
    seasonRows.reduce((sum, row) => sum + row.value * row.weight, 0) / totalWeight;

  let numerator = 0;
  let denominator = 0;
  for (const row of seasonRows) {
    const seasonDelta = row.season - meanSeason;
    numerator += row.weight * seasonDelta * (row.value - meanValue);
    denominator += row.weight * seasonDelta * seasonDelta;
  }

  const slope = denominator > 0 ? numerator / denominator : 0;
  const confidence = clamp(totalWeight / 60, 0, 1);

  return {
    trend_slope: slope,
    trend_adjustment: clamp(slope * confidence * 0.8, -maxTrendAdjustment, maxTrendAdjustment),
  };
}

function buildPlayerHistory(historicalRows, leagueContext) {
  const grouped = new Map();

  for (const row of historicalRows) {
    const key = row.historical_player_id || row.canonical_player_id;
    if (!key) {
      continue;
    }

    const seasonDistance = Number(targetSeason) - row.season;
    const recencyWeight = seasonDistance >= 0 ? recencyDecay ** seasonDistance : 1;
    const sampleWeight = recencyWeight * Math.max(row.plateAppearances ?? 0, 1);
    const offenseWithShrink =
      ((row.offenseIndex * (row.plateAppearances ?? 0)) +
        leagueContext.leagueOffenseIndex * shrinkPlateAppearances) /
      ((row.plateAppearances ?? 0) + shrinkPlateAppearances);

    const entry = grouped.get(key) ?? {
      historical_player_id: key,
      canonical_player_name: row.canonical_player_name,
      player_name: row.player_name,
      seasons_played: 0,
      weightedSample: 0,
      weightedOffense: 0,
      weightedFielding: 0,
      fieldingWeight: 0,
      last_season: row.season,
      historical_teams: new Set(),
      seasonRows: [],
    };

    entry.seasons_played += 1;
    entry.weightedSample += sampleWeight;
    entry.weightedOffense += offenseWithShrink * sampleWeight;
    if (row.fielding != null) {
      entry.weightedFielding += row.fielding * sampleWeight;
      entry.fieldingWeight += sampleWeight;
    }
    entry.last_season = Math.max(entry.last_season, row.season);
    if (row.historical_team_id) {
      entry.historical_teams.add(row.historical_team_id);
    }
    entry.seasonRows.push({
      season: row.season,
      value: offenseWithShrink,
      weight: sampleWeight,
    });

    grouped.set(key, entry);
  }

  return new Map(
    [...grouped.entries()].map(([key, entry]) => [
      key,
      (() => {
        const trend = computeTrendAdjustment(entry.seasonRows);
        const offenseIndex = entry.weightedOffense / Math.max(entry.weightedSample, 1);
        return {
        historical_player_id: key,
        canonical_player_name: entry.canonical_player_name,
        player_name: entry.player_name,
        seasons_played: entry.seasons_played,
        weighted_sample: entry.weightedSample,
        offense_index: offenseIndex,
        projected_offense_index: clamp(offenseIndex + trend.trend_adjustment, 0.08, 1.2),
        trend_slope: trend.trend_slope,
        trend_adjustment: trend.trend_adjustment,
        fielding: entry.fieldingWeight > 0 ? entry.weightedFielding / entry.fieldingWeight : null,
        last_season: entry.last_season,
        historical_teams: [...entry.historical_teams].sort().join("|"),
        };
      })(),
    ])
  );
}

function getAvailabilityRows() {
  const availabilityPath = resolve(inputRoot, `availability_${targetSeason}.csv`);
  if (!existsSync(availabilityPath)) {
    return [];
  }

  return readCsvFile(availabilityPath);
}

function buildRosterUniverse() {
  const rosterRows = getRosterRows();
  const availabilityRows = getAvailabilityRows();
  const overrideMap = getPlayerOverrideMap();
  const availabilityMap = new Map(
    availabilityRows.map((row) => [
      `${canonicalizeName(row.team)}__${canonicalizeName(row.player_name)}`,
      row,
    ])
  );

  return rosterRows.map((row) => {
    const teamName = String(row.team ?? "").trim();
    const playerName = String(row.player_name ?? "").trim();
    const override = overrideMap.get(
      `${canonicalizeName(teamName)}__${canonicalizeName(playerName)}`
    );
    const availability = availabilityMap.get(
      `${canonicalizeName(teamName)}__${canonicalizeName(playerName)}`
    );
    const isAvailable = !availability || !/^(out|no|false|0)$/i.test(String(availability.available ?? "yes"));
    const isStarter = !availability || /^(yes|true|1)$/i.test(String(availability.expected_start ?? "yes"));

    return {
      season: Number(row.season || targetSeason),
      team: teamName,
      team_id: slugify(teamName),
      player_name: playerName,
      canonical_player_name: canonicalizeName(playerName),
      lookup_canonical_player_name: canonicalizeName(
        override?.historical_player_name || playerName
      ),
      available: isAvailable,
      expected_start: isStarter,
      notes: [availability?.notes ?? "", override?.notes ?? ""].filter(Boolean).join(" | "),
    };
  });
}

function buildRosterMatches(playerHistory) {
  const rosterRows = buildRosterUniverse();

  return rosterRows.map((row) => {
    const history = playerHistory.get(slugify(row.lookup_canonical_player_name));
    return {
      ...row,
      historical_player_id: history?.historical_player_id ?? "",
      matched: history ? "yes" : "no",
      matched_player_name: history?.player_name ?? "",
      matched_canonical_name: history?.canonical_player_name ?? "",
      offense_index: history?.offense_index ?? "",
      projected_offense_index: history?.projected_offense_index ?? "",
      trend_slope: history?.trend_slope ?? "",
      trend_adjustment: history?.trend_adjustment ?? "",
      fielding: history?.fielding ?? "",
      weighted_sample: history?.weighted_sample ?? "",
      historical_teams: history?.historical_teams ?? "",
    };
  });
}

function starterWeight(index, isStarter) {
  if (!isStarter) {
    return 0.15;
  }
  if (index < lineupSize) {
    return 1;
  }
  return 0.35;
}

function summarizeTeam(rosterRows, leagueContext) {
  const matchedPlayers = rosterRows
    .filter((row) => row.matched === "yes" && row.available)
    .sort((left, right) => Number(right.projected_offense_index || right.offense_index) - Number(left.projected_offense_index || left.offense_index));

  const unmatchedPlayers = rosterRows.filter((row) => row.matched !== "yes");
  const activeWeights = matchedPlayers.map((player, index) => starterWeight(index, player.expected_start));
  const totalWeight = activeWeights.reduce((sum, value) => sum + value, 0);

  const weightedOffense =
    matchedPlayers.reduce(
      (sum, player, index) =>
        sum + Number(player.projected_offense_index || player.offense_index) * activeWeights[index],
      0
    ) / Math.max(totalWeight, 1);
  const rosterCoverage = clamp(matchedPlayers.length / lineupSize, 0.4, 1);
  const projectedRuns =
    leagueContext.leagueRunsPerGame *
    (weightedOffense / Math.max(leagueContext.leagueOffenseIndex, 0.01)) *
    rosterCoverage;
  const defenseRating = 0;
  const offenseRating = Math.log(Math.max(projectedRuns, 0.1) / leagueContext.leagueRunsPerGame);

  return {
    team: rosterRows[0]?.team ?? "",
    team_id: rosterRows[0]?.team_id ?? "",
    roster_size: rosterRows.length,
    active_players: rosterRows.filter((row) => row.available).length,
    matched_players: matchedPlayers.length,
    unmatched_players: unmatchedPlayers.length,
    projected_runs: projectedRuns,
    offense_index: weightedOffense,
    offense_rating: offenseRating,
    defense_rating: defenseRating,
    overall_rating: offenseRating + defenseRating,
  };
}

function getImpactPlayerOffense(player, leagueContext) {
  const matchedValue = Number(player.projected_offense_index || player.offense_index || 0);
  if (player.matched === "yes" && matchedValue > 0) {
    return matchedValue;
  }

  return leagueContext.leagueOffenseIndex * 0.9;
}

function getImpactPlayerFielding(player, leagueContext) {
  const fielding = toNumber(player.fielding);
  if (fielding != null) {
    return fielding;
  }
  return leagueContext.leagueFielding;
}

function buildReplacementPlayer(leagueContext) {
  return {
    player_name: "Replacement Player",
    matched: "replacement",
    projected_offense_index: leagueContext.leagueOffenseIndex * 0.9,
    offense_index: leagueContext.leagueOffenseIndex * 0.9,
    fielding: leagueContext.leagueFielding,
    available: true,
  };
}

function summarizeImpactTeam(rosterRows, leagueContext) {
  const availablePlayers = rosterRows.filter((row) => row.available);
  const rankedPlayers = [...availablePlayers].sort(
    (left, right) =>
      getImpactPlayerOffense(right, leagueContext) - getImpactPlayerOffense(left, leagueContext)
  );

  while (rankedPlayers.length < lineupSize) {
    rankedPlayers.push(buildReplacementPlayer(leagueContext));
  }

  const lineup = rankedPlayers.slice(0, lineupSize);
  const offenseIndex = average(lineup.map((player) => getImpactPlayerOffense(player, leagueContext)));
  const projectedRuns =
    leagueContext.leagueRunsPerGame *
    (offenseIndex / Math.max(leagueContext.leagueOffenseIndex, 0.01));
  const defenseRating = 0;
  const offenseRating = Math.log(Math.max(projectedRuns, 0.1) / leagueContext.leagueRunsPerGame);

  return {
    team: rosterRows[0]?.team ?? "",
    team_id: rosterRows[0]?.team_id ?? "",
    projected_runs: projectedRuns,
    offense_index: offenseIndex,
    offense_rating: offenseRating,
    defense_rating: defenseRating,
    overall_rating: offenseRating + defenseRating,
  };
}

function buildPlayerImpact(teamRows, leagueContext) {
  const grouped = new Map();
  for (const row of teamRows) {
    const key = row.team_id;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  const teamBaselines = new Map(
    [...grouped.entries()].map(([teamId, rosterRows]) => [teamId, summarizeImpactTeam(rosterRows, leagueContext)])
  );
  const baselines = [...teamBaselines.values()];
  const averageOpponentRating =
    baselines.length > 0 ? average(baselines.map((row) => row.overall_rating)) : 0;

  const impacts = [];

  for (const [teamId, rosterRows] of grouped.entries()) {
    const baseline = teamBaselines.get(teamId);
    if (!baseline) {
      continue;
    }

    const baselineWinProbability = 1 / (1 + Math.exp(-(baseline.overall_rating - averageOpponentRating) * 2.2));

    for (const player of rosterRows.filter((row) => row.matched === "yes" && row.available)) {
      const withoutPlayer = summarizeImpactTeam(
        rosterRows.filter((row) => row.player_name !== player.player_name),
        leagueContext
      );
      const withoutWinProbability =
        1 / (1 + Math.exp(-(withoutPlayer.overall_rating - averageOpponentRating) * 2.2));
      const runSwing = Math.max(baseline.projected_runs - withoutPlayer.projected_runs, 0);
      const winProbabilitySwing = Math.max(baselineWinProbability - withoutWinProbability, 0);

      impacts.push({
        season: Number(targetSeason),
        team: baseline.team,
        player_name: player.player_name,
        canonical_player_name: player.canonical_player_name,
        historical_player_id: player.historical_player_id,
        baseline_projected_runs: baseline.projected_runs.toFixed(2),
        projected_runs_without_player: withoutPlayer.projected_runs.toFixed(2),
        run_swing: runSwing.toFixed(2),
        baseline_win_probability_vs_average: baselineWinProbability.toFixed(4),
        win_probability_without_player: withoutWinProbability.toFixed(4),
        win_probability_swing: winProbabilitySwing.toFixed(4),
      });
    }
  }

  impacts.sort((left, right) => Number(right.win_probability_swing) - Number(left.win_probability_swing));
  return impacts;
}

function main() {
  const historicalRows = getHistoricalRows();
  const leagueContext = getLeagueContext(historicalRows);
  const playerHistory = buildPlayerHistory(historicalRows, leagueContext);
  const rosterMatches = buildRosterMatches(playerHistory);

  const teams = [...new Set(rosterMatches.map((row) => row.team_id))]
    .map((teamId) => summarizeTeam(rosterMatches.filter((row) => row.team_id === teamId), leagueContext))
    .sort((left, right) => right.overall_rating - left.overall_rating);

  const playerImpact = buildPlayerImpact(rosterMatches, leagueContext);

  writeCsv(resolve(processedRoot, "roster_matches.csv"), [
    "season",
    "team",
    "team_id",
    "player_name",
    "canonical_player_name",
    "available",
    "expected_start",
    "notes",
    "historical_player_id",
    "matched",
    "matched_player_name",
    "matched_canonical_name",
    "offense_index",
    "projected_offense_index",
    "trend_slope",
    "trend_adjustment",
    "fielding",
    "weighted_sample",
    "historical_teams",
  ], rosterMatches);

  writeCsv(resolve(processedRoot, "team_ratings.csv"), [
    "team",
    "team_id",
    "roster_size",
    "active_players",
    "matched_players",
    "unmatched_players",
    "projected_runs",
    "offense_index",
    "offense_rating",
    "defense_rating",
    "overall_rating",
  ], teams);

  writeCsv(resolve(processedRoot, "player_impact.csv"), [
    "season",
    "team",
    "player_name",
    "canonical_player_name",
    "historical_player_id",
    "baseline_projected_runs",
    "projected_runs_without_player",
    "run_swing",
    "baseline_win_probability_vs_average",
    "win_probability_without_player",
    "win_probability_swing",
  ], playerImpact);

  writeJson(resolve(processedRoot, "model_summary.json"), {
    generatedAt: new Date().toISOString(),
    season: Number(targetSeason),
    leagueContext,
    teamCount: teams.length,
    matchedRosterPlayers: rosterMatches.filter((row) => row.matched === "yes").length,
    unmatchedRosterPlayers: rosterMatches.filter((row) => row.matched !== "yes").length,
  });

  console.log(`Built softball model outputs for ${targetSeason}.`);
}

main();
