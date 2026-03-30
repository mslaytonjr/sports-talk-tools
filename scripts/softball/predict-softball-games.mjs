import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clamp, parseCsv, slugify, writeCsv } from "./shared.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const processedRoot = resolve(projectRoot, "data", "softball", "processed");
const inputRoot = resolve(projectRoot, "data", "softball", "inputs");

const targetSeason = process.argv[2] ?? "2026";

function readCsvFile(filePath) {
  return parseCsv(readFileSync(filePath, "utf8"));
}

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
  const [first, second, third] = bases;
  let runs = 0;
  if (first && second && third) {
    runs += 1;
  }
  return {
    runs,
    bases: [true, second || first, third || (first && second)],
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

function buildReplacementPlayer(leagueProfile, offenseScale = 0.9) {
  return normalizeEventProfile({
    walk_probability: Number(leagueProfile.walk_probability || 0) * offenseScale,
    single_probability: Number(leagueProfile.single_probability || 0) * offenseScale,
    double_probability: Number(leagueProfile.double_probability || 0) * offenseScale,
    triple_probability: Number(leagueProfile.triple_probability || 0) * offenseScale,
    home_run_probability: Number(leagueProfile.home_run_probability || 0) * offenseScale,
  });
}

function buildAvailableLineup(teamRows, availabilityMap, leagueProfile) {
  const availablePlayers = teamRows
    .map((row) => {
      const availability = availabilityMap.get(`${row.team_id}__${slugify(row.player_name)}`);
      const available = !availability || !/^(out|no|false|0)$/i.test(String(availability.available ?? "yes"));
      const expectedStart = !availability || /^(yes|true|1)$/i.test(String(availability.expected_start ?? "yes"));
      return {
        ...row,
        available,
        expected_start: expectedStart,
      };
    })
    .filter((row) => row.available)
    .sort((left, right) => {
      const starterDelta = Number(right.expected_start) - Number(left.expected_start);
      if (starterDelta !== 0) {
        return starterDelta;
      }
      return Number(right.projected_offense_index || right.offense_index || 0) -
        Number(left.projected_offense_index || left.offense_index || 0);
    });

  const lineup = availablePlayers.slice(0, 10).map((player) =>
    player.matched === "yes"
      ? normalizeEventProfile({
          walk_probability: player.walk_probability,
          single_probability: player.single_probability,
          double_probability: player.double_probability,
          triple_probability: player.triple_probability,
          home_run_probability: player.home_run_probability,
        })
      : buildReplacementPlayer(leagueProfile)
  );

  while (lineup.length < 10) {
    lineup.push(buildReplacementPlayer(leagueProfile));
  }

  return lineup;
}

function buildAvailabilityMap(rows) {
  return new Map(
    rows.map((row) => [
      `${slugify(row.team)}__${slugify(row.player_name)}`,
      row,
    ])
  );
}

function buildAdjustedRatings(teamRatings, rosterMatches, availabilityRows, modelSummary) {
  const availabilityMap = buildAvailabilityMap(availabilityRows);
  const groupedRoster = new Map();
  for (const row of rosterMatches) {
    const list = groupedRoster.get(row.team_id) ?? [];
    list.push(row);
    groupedRoster.set(row.team_id, list);
  }

  return teamRatings.map((team) => {
    const teamRows = groupedRoster.get(team.team_id) ?? [];
    const lineup = buildAvailableLineup(teamRows, availabilityMap, modelSummary.leagueContext.leagueProfile);
    const projectedRuns = simulateLineupRuns(
      lineup,
      Number(modelSummary.simulatedInnings || 7),
      Number(modelSummary.simulationCount || 1500),
      `availability-${team.team_id}-${targetSeason}`
    );
    const offenseRating = Math.log(
      Math.max(projectedRuns, 0.1) / Math.max(Number(modelSummary.leagueContext.leagueRunsPerGame || 1), 0.1)
    );

    return {
      ...team,
      projected_runs: projectedRuns,
      offense_rating: offenseRating,
      overall_rating: offenseRating,
      defense_rating: 0,
    };
  });
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
  const rosterMatches = readCsvFile(resolve(processedRoot, "roster_matches.csv"));
  const modelSummary = JSON.parse(readFileSync(resolve(processedRoot, "model_summary.json"), "utf8"));
  const availabilityPath = resolve(inputRoot, `availability_${targetSeason}.csv`);
  const availabilityRows = existsSync(availabilityPath) ? readCsvFile(availabilityPath) : [];
  const adjustedRatings = buildAdjustedRatings(teamRatings, rosterMatches, availabilityRows, modelSummary);
  const byTeamId = new Map(adjustedRatings.map((row) => [row.team_id, row]));
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
        predictions.push(buildPrediction(adjustedRatings[index], adjustedRatings[opponentIndex]));
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
