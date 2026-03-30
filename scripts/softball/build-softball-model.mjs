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
const maxTrendAdjustment = 0.04;
const simulatedInnings = 7;
const simulationCount = 1500;

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function clampProbability(value) {
  return clamp(Number(value || 0), 0, 1);
}

function normalizeEventProfile(profile) {
  const walk = clampProbability(profile.walk_probability);
  const single = clampProbability(profile.single_probability);
  const doubleHit = clampProbability(profile.double_probability);
  const triple = clampProbability(profile.triple_probability);
  const homeRun = clampProbability(profile.home_run_probability);
  const totalOnBase = walk + single + doubleHit + triple + homeRun;
  if (totalOnBase > 0.95) {
    const scale = 0.95 / totalOnBase;
    return {
      walk_probability: walk * scale,
      single_probability: single * scale,
      double_probability: doubleHit * scale,
      triple_probability: triple * scale,
      home_run_probability: homeRun * scale,
      out_probability: 0.05,
    };
  }
  return {
    walk_probability: walk,
    single_probability: single,
    double_probability: doubleHit,
    triple_probability: triple,
    home_run_probability: homeRun,
    out_probability: 1 - totalOnBase,
  };
}

function applyWalk(bases) {
  let runs = 0;
  const [first, second, third] = bases;
  if (first && second && third) {
    runs += 1;
  }
  return {
    runs,
    bases: [
      true,
      second || first,
      third || (first && second),
    ],
  };
}

function applySingle(bases) {
  const [first, second, third] = bases;
  return {
    runs: third ? 1 : 0,
    bases: [true, first, second],
  };
}

function applyDouble(bases) {
  const [first, second, third] = bases;
  return {
    runs: (second ? 1 : 0) + (third ? 1 : 0),
    bases: [false, true, first],
  };
}

function applyTriple(bases) {
  const [first, second, third] = bases;
  return {
    runs: (first ? 1 : 0) + (second ? 1 : 0) + (third ? 1 : 0),
    bases: [false, false, true],
  };
}

function applyHomeRun(bases) {
  const [first, second, third] = bases;
  return {
    runs: 1 + (first ? 1 : 0) + (second ? 1 : 0) + (third ? 1 : 0),
    bases: [false, false, false],
  };
}

function simulateLineupRuns(lineup, innings, iterations, seedLabel) {
  const seed = hashString(seedLabel);
  let totalRuns = 0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const rng = createRng(seed + iteration);
    let batterIndex = 0;
    let runs = 0;

    for (let inning = 0; inning < innings; inning += 1) {
      let outs = 0;
      let bases = [false, false, false];

      while (outs < 3) {
        const batter = lineup[batterIndex % lineup.length];
        batterIndex += 1;
        const roll = rng();
        const walkCutoff = batter.walk_probability;
        const singleCutoff = walkCutoff + batter.single_probability;
        const doubleCutoff = singleCutoff + batter.double_probability;
        const tripleCutoff = doubleCutoff + batter.triple_probability;
        const homeRunCutoff = tripleCutoff + batter.home_run_probability;

        if (roll < walkCutoff) {
          const outcome = applyWalk(bases);
          runs += outcome.runs;
          bases = outcome.bases;
          continue;
        }
        if (roll < singleCutoff) {
          const outcome = applySingle(bases);
          runs += outcome.runs;
          bases = outcome.bases;
          continue;
        }
        if (roll < doubleCutoff) {
          const outcome = applyDouble(bases);
          runs += outcome.runs;
          bases = outcome.bases;
          continue;
        }
        if (roll < tripleCutoff) {
          const outcome = applyTriple(bases);
          runs += outcome.runs;
          bases = outcome.bases;
          continue;
        }
        if (roll < homeRunCutoff) {
          const outcome = applyHomeRun(bases);
          runs += outcome.runs;
          bases = outcome.bases;
          continue;
        }

        outs += 1;
      }
    }

    totalRuns += runs;
  }

  return totalRuns / Math.max(iterations, 1);
}

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
      const hits = toNumber(row.h);
      const singles = toNumber(row["1b"]);
      const doubles = toNumber(row["2b"]);
      const triples = toNumber(row["3b"]);
      const homeRuns = toNumber(row.hr);
      const walks = toNumber(row.tbb) ?? toNumber(row.bb);
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
        hits,
        singles,
        doubles,
        triples,
        homeRuns,
        walks,
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

  const totalPlateAppearances = historicalRows.reduce(
    (sum, row) => sum + Math.max(row.plateAppearances ?? 0, 0),
    0
  );
  const leagueWalkProbability =
    historicalRows.reduce(
      (sum, row) => sum + Math.max(row.walks ?? Math.max(((row.onBase ?? row.averageRate ?? 0.33) - (row.averageRate ?? 0.3)) * (row.plateAppearances ?? 0), 0), 0),
      0
    ) / Math.max(totalPlateAppearances, 1);
  const leagueSingleProbability =
    historicalRows.reduce(
      (sum, row) => sum + Math.max(row.singles ?? Math.max((row.hits ?? 0) - (row.doubles ?? 0) - (row.triples ?? 0) - (row.homeRuns ?? 0), 0), 0),
      0
    ) / Math.max(totalPlateAppearances, 1);
  const leagueDoubleProbability =
    historicalRows.reduce((sum, row) => sum + Math.max(row.doubles ?? 0, 0), 0) / Math.max(totalPlateAppearances, 1);
  const leagueTripleProbability =
    historicalRows.reduce((sum, row) => sum + Math.max(row.triples ?? 0, 0), 0) / Math.max(totalPlateAppearances, 1);
  const leagueHomeRunProbability =
    historicalRows.reduce((sum, row) => sum + Math.max(row.homeRuns ?? 0, 0), 0) / Math.max(totalPlateAppearances, 1);

  const leagueProfile = normalizeEventProfile({
    walk_probability: leagueWalkProbability,
    single_probability: leagueSingleProbability,
    double_probability: leagueDoubleProbability,
    triple_probability: leagueTripleProbability,
    home_run_probability: leagueHomeRunProbability,
  });

  const leagueAverageLineup = Array.from({ length: lineupSize }, () => leagueProfile);
  const leagueRunsPerGame = simulateLineupRuns(
    leagueAverageLineup,
    simulatedInnings,
    simulationCount,
    `league-average-${targetSeason}`
  );

  return {
    leagueOffenseIndex: weightedRate,
    leagueRunsPerGame,
    leagueFielding: fieldingValues.length > 0 ? average(fieldingValues) : 0.95,
    leagueProfile,
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
      weightedSingles: 0,
      weightedDoubles: 0,
      weightedTriples: 0,
      weightedHomeRuns: 0,
      weightedWalks: 0,
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
    const inferredSingles = row.singles ?? Math.max((row.hits ?? 0) - (row.doubles ?? 0) - (row.triples ?? 0) - (row.homeRuns ?? 0), 0);
    const inferredWalks =
      row.walks ?? Math.max(((row.onBase ?? row.averageRate ?? 0.33) - (row.averageRate ?? 0.3)) * Math.max(row.plateAppearances ?? 0, 0), 0);
    entry.weightedSingles += Math.max(inferredSingles, 0) * recencyWeight;
    entry.weightedDoubles += Math.max(row.doubles ?? 0, 0) * recencyWeight;
    entry.weightedTriples += Math.max(row.triples ?? 0, 0) * recencyWeight;
    entry.weightedHomeRuns += Math.max(row.homeRuns ?? 0, 0) * recencyWeight;
    entry.weightedWalks += Math.max(inferredWalks, 0) * recencyWeight;
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
        const profileDenominator = Math.max(entry.weightedSample + shrinkPlateAppearances, 1);
        const eventProfile = normalizeEventProfile({
          walk_probability:
            (entry.weightedWalks + leagueContext.leagueProfile.walk_probability * shrinkPlateAppearances) /
            profileDenominator,
          single_probability:
            (entry.weightedSingles + leagueContext.leagueProfile.single_probability * shrinkPlateAppearances) /
            profileDenominator,
          double_probability:
            (entry.weightedDoubles + leagueContext.leagueProfile.double_probability * shrinkPlateAppearances) /
            profileDenominator,
          triple_probability:
            (entry.weightedTriples + leagueContext.leagueProfile.triple_probability * shrinkPlateAppearances) /
            profileDenominator,
          home_run_probability:
            (entry.weightedHomeRuns + leagueContext.leagueProfile.home_run_probability * shrinkPlateAppearances) /
            profileDenominator,
        });
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
        walk_probability: eventProfile.walk_probability,
        single_probability: eventProfile.single_probability,
        double_probability: eventProfile.double_probability,
        triple_probability: eventProfile.triple_probability,
        home_run_probability: eventProfile.home_run_probability,
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
  const overrideMap = getPlayerOverrideMap();

  return rosterRows.map((row) => {
    const teamName = String(row.team ?? "").trim();
    const playerName = String(row.player_name ?? "").trim();
    const override = overrideMap.get(
      `${canonicalizeName(teamName)}__${canonicalizeName(playerName)}`
    );

    return {
      season: Number(row.season || targetSeason),
      team: teamName,
      team_id: slugify(teamName),
      player_name: playerName,
      canonical_player_name: canonicalizeName(playerName),
      lookup_canonical_player_name: canonicalizeName(
        override?.historical_player_name || playerName
      ),
      available: true,
      expected_start: true,
      notes: [override?.notes ?? ""].filter(Boolean).join(" | "),
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
      walk_probability: history?.walk_probability ?? "",
      single_probability: history?.single_probability ?? "",
      double_probability: history?.double_probability ?? "",
      triple_probability: history?.triple_probability ?? "",
      home_run_probability: history?.home_run_probability ?? "",
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

function buildBatterProfile(player, leagueContext, offenseScale = 1) {
  const normalized = normalizeEventProfile({
    walk_probability: toNumber(player.walk_probability) ?? leagueContext.leagueProfile.walk_probability,
    single_probability: toNumber(player.single_probability) ?? leagueContext.leagueProfile.single_probability,
    double_probability: toNumber(player.double_probability) ?? leagueContext.leagueProfile.double_probability,
    triple_probability: toNumber(player.triple_probability) ?? leagueContext.leagueProfile.triple_probability,
    home_run_probability: toNumber(player.home_run_probability) ?? leagueContext.leagueProfile.home_run_probability,
  });

  return normalizeEventProfile({
    walk_probability: normalized.walk_probability * offenseScale,
    single_probability: normalized.single_probability * offenseScale,
    double_probability: normalized.double_probability * offenseScale,
    triple_probability: normalized.triple_probability * offenseScale,
    home_run_probability: normalized.home_run_probability * offenseScale,
  });
}

function buildReplacementPlayer(leagueContext) {
  return {
    player_name: "Replacement Player",
    matched: "replacement",
    projected_offense_index: leagueContext.leagueOffenseIndex * 0.9,
    offense_index: leagueContext.leagueOffenseIndex * 0.9,
    fielding: leagueContext.leagueFielding,
    available: true,
    expected_start: false,
    ...buildBatterProfile({}, leagueContext, 0.9),
  };
}

function buildTeamLineup(rosterRows, leagueContext) {
  const availablePlayers = rosterRows.filter((row) => row.available);
  const rankedPlayers = [...availablePlayers].sort((left, right) => {
    const rightStarter = right.expected_start ? 1 : 0;
    const leftStarter = left.expected_start ? 1 : 0;
    if (rightStarter !== leftStarter) {
      return rightStarter - leftStarter;
    }
    return Number(right.projected_offense_index || right.offense_index || 0) -
      Number(left.projected_offense_index || left.offense_index || 0);
  });
  const lineup = rankedPlayers.slice(0, lineupSize).map((player) =>
    player.matched === "yes"
      ? { ...player, ...buildBatterProfile(player, leagueContext) }
      : { ...player, ...buildBatterProfile({}, leagueContext, 0.9) }
  );

  while (lineup.length < lineupSize) {
    lineup.push(buildReplacementPlayer(leagueContext));
  }

  return lineup;
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
  const lineup = buildTeamLineup(rosterRows, leagueContext);
  const projectedRuns = simulateLineupRuns(
    lineup,
    simulatedInnings,
    simulationCount,
    `team-${rosterRows[0]?.team_id ?? "unknown"}-${targetSeason}`
  );
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

function summarizeImpactTeam(rosterRows, leagueContext) {
  const availablePlayers = rosterRows.filter((row) => row.available);
  const lineup = buildTeamLineup(availablePlayers, leagueContext);
  const offenseIndex = average(lineup.map((player) => getImpactPlayerOffense(player, leagueContext)));
  const projectedRuns = simulateLineupRuns(
    lineup,
    simulatedInnings,
    simulationCount,
    `impact-${rosterRows[0]?.team_id ?? "unknown"}-${availablePlayers.map((row) => row.player_name).join("|")}`
  );
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
    "walk_probability",
    "single_probability",
    "double_probability",
    "triple_probability",
    "home_run_probability",
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
    simulatedInnings,
    simulationCount,
    teamCount: teams.length,
    matchedRosterPlayers: rosterMatches.filter((row) => row.matched === "yes").length,
    unmatchedRosterPlayers: rosterMatches.filter((row) => row.matched !== "yes").length,
  });

  console.log(`Built softball model outputs for ${targetSeason}.`);
}

main();
