import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalizeName,
  clamp,
  parseCsv,
  slugify,
  toNumber,
  toRate,
} from "./shared.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const processedRoot = resolve(projectRoot, "data", "softball", "processed");
const rawRoot = resolve(projectRoot, "data", "softball", "raw");
const reportRoot = resolve(processedRoot, "team_reports");

const targetSeason = process.argv[2] ?? "2026";
const requestedTeam = process.argv.slice(3).join(" ").trim() || "7th Floor Crew";
const recencyDecay = 0.72;
const directionSeasonWeights = new Map([
  [1, 1],
  [2, 0.9],
  [3, 0.8],
]);

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

function formatDateTime(value) {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(parsed);
}

function formatDateLabel(value) {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function safeDivide(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return numerator / denominator;
}

function formatDecimal(value, digits = 2) {
  return Number(value || 0).toFixed(digits);
}

function formatPct(value, digits = 1) {
  return `${(Number(value || 0) * 100).toFixed(digits)}%`;
}

function formatNullablePct(value, digits = 1) {
  return value == null ? "n/a" : formatPct(value, digits);
}

function formatTinyDecimal(value, digits = 2) {
  const numeric = Number(value || 0);
  const threshold = 1 / 10 ** digits;
  if (numeric > 0 && numeric < threshold) {
    return `< ${threshold.toFixed(digits)}`;
  }
  return numeric.toFixed(digits);
}

function formatTinyPct(value, digits = 1) {
  const numeric = Number(value || 0);
  const threshold = 1 / 10 ** (digits + 2);
  if (numeric > 0 && numeric < threshold) {
    return `< ${formatPct(threshold, digits)}`;
  }
  return formatPct(numeric, digits);
}

function ordinal(value) {
  const number = Number(value);
  const mod10 = number % 10;
  const mod100 = number % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${number}st`;
  }
  if (mod10 === 2 && mod100 !== 12) {
    return `${number}nd`;
  }
  if (mod10 === 3 && mod100 !== 13) {
    return `${number}rd`;
  }
  return `${number}th`;
}

function describeRating(teamRank, totalTeams) {
  if (teamRank <= Math.max(2, Math.ceil(totalTeams * 0.25))) {
    return "Top-tier contender";
  }
  if (teamRank <= Math.max(4, Math.ceil(totalTeams * 0.5))) {
    return "Solid playoff-level group";
  }
  if (teamRank <= Math.max(6, Math.ceil(totalTeams * 0.75))) {
    return "Middle-of-the-pack team";
  }
  return "Needs help to close the gap";
}

function describeLineupRole(spot) {
  if (spot === 1) {
    return "Table setter";
  }
  if (spot === 2) {
    return "Contact bat";
  }
  if (spot === 3 || spot === 4 || spot === 5) {
    return "Run producer";
  }
  if (spot <= 10) {
    return "Core lineup";
  }
  return "Depth bat";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function getWeightedProfiles() {
  const rows = getHistoricalStatsRows();
  const grouped = new Map();
  const currentSeason = Number(targetSeason);

  for (const row of rows) {
    const historicalPlayerId = row.historical_player_id || row.canonical_player_id;
    const season = toNumber(row.season);
    const games = toNumber(row.g);
    const pa = toNumber(row.pa);
    const ab = toNumber(row.ab);
    const sample = pa ?? ab ?? (games != null ? Math.min(games * 4, 80) : null);
    const avg = toRate(row.avg);
    const obp = toRate(row.obp);
    const slg = toRate(row.slg);
    const ops = toRate(row.ops);
    const lineOuts = toNumber(row.lo);
    const flyOuts = toNumber(row.fo);
    const groundOuts = toNumber(row.go);

    if (
      !historicalPlayerId ||
      !season ||
      sample == null ||
      sample <= 0 ||
      row.canonical_player_name?.startsWith("SUB") ||
      (avg == null && obp == null && slg == null && ops == null)
    ) {
      continue;
    }

    const seasonDistance = Number(targetSeason) - season;
    const recencyWeight = seasonDistance >= 0 ? recencyDecay ** seasonDistance : 1;
    const weight = sample * recencyWeight;
    const entry = grouped.get(historicalPlayerId) ?? {
      historical_player_id: historicalPlayerId,
      player_name: row.player_name,
      canonical_player_name: row.canonical_player_name,
      totalWeight: 0,
      weightedAvg: 0,
      weightedObp: 0,
      weightedSlg: 0,
      weightedOps: 0,
      weightedIso: 0,
      weightedXbhPercentage: 0,
      weightedProductivePaPercentage: 0,
      weightedOutAvoidance: 0,
      weightedLineOuts: 0,
      weightedFlyOuts: 0,
      weightedGroundOuts: 0,
      displayWeight: 0,
      displaySeasons: 0,
      currentSeasonSample: 0,
      previousSeasonSample: 0,
      recentSample: 0,
      totalSeasons: 0,
    };

    entry.totalSeasons += 1;
    entry.totalWeight += weight;
    entry.weightedAvg += (avg ?? ops ?? 0.33) * weight;
    entry.weightedObp += (obp ?? avg ?? ops ?? 0.34) * weight;
    entry.weightedSlg += (slg ?? ops ?? 0.45) * weight;
    entry.weightedOps += (ops ?? ((obp ?? 0.34) + (slg ?? 0.45))) * weight;

    const hits = toNumber(row.h);
    const doubles = toNumber(row["2b"]);
    const triples = toNumber(row["3b"]);
    const homeRuns = toNumber(row.hr);
    const walks = toNumber(row.bb) ?? toNumber(row.tbb) ?? 0;
    const sacrificeFlies = toNumber(row.sf) ?? 0;
    const onByError = toNumber(row.obe) ?? 0;
    const fieldersChoices = toNumber(row.fc) ?? 0;
    const derivedPa = pa ?? (ab != null ? ab + walks + sacrificeFlies : null);
    const iso = avg != null && slg != null ? Math.max(slg - avg, 0) : null;
    const xbhPercentage =
      hits != null ? safeDivide((doubles ?? 0) + (triples ?? 0) + (homeRuns ?? 0), hits) : null;
    const productivePaPercentage =
      hits != null && derivedPa != null
        ? safeDivide(hits + walks + sacrificeFlies + onByError, derivedPa)
        : null;
    const outAvoidance =
      ab != null && hits != null && derivedPa != null
        ? 1 - safeDivide(Math.max(ab - hits, 0) + sacrificeFlies + fieldersChoices, derivedPa)
        : null;

    entry.weightedIso += (iso ?? 0) * weight;
    entry.weightedXbhPercentage += (xbhPercentage ?? 0) * weight;
    entry.weightedProductivePaPercentage += (productivePaPercentage ?? 0) * weight;
    entry.weightedOutAvoidance += (outAvoidance ?? 0) * weight;
    entry.weightedLineOuts += (lineOuts ?? 0) * recencyWeight;
    entry.weightedFlyOuts += (flyOuts ?? 0) * recencyWeight;
    entry.weightedGroundOuts += (groundOuts ?? 0) * recencyWeight;
    if (season === currentSeason) {
      entry.currentSeasonSample += sample;
    }
    if (season === currentSeason - 1) {
      entry.previousSeasonSample += sample;
    }
    if (season === currentSeason || season === currentSeason - 1) {
      entry.recentSample += sample;
    }
    if (String(row.stats_display_allowed ?? "no") === "yes") {
      entry.displayWeight += weight;
      entry.displaySeasons += 1;
    }
    grouped.set(historicalPlayerId, entry);
  }

  return new Map(
    [...grouped.entries()].map(([key, entry]) => [
      key,
      {
        historical_player_id: key,
        player_name: entry.player_name,
        canonical_player_name: entry.canonical_player_name,
        avg: entry.weightedAvg / entry.totalWeight,
        obp: entry.weightedObp / entry.totalWeight,
        slg: entry.weightedSlg / entry.totalWeight,
        ops: entry.weightedOps / entry.totalWeight,
        iso: entry.weightedIso / entry.totalWeight,
        xbh_percentage: entry.weightedXbhPercentage / entry.totalWeight,
        productive_pa_percentage: entry.weightedProductivePaPercentage / entry.totalWeight,
        out_avoidance: entry.weightedOutAvoidance / entry.totalWeight,
        weighted_line_outs: Number(entry.weightedLineOuts.toFixed(2)),
        weighted_fly_outs: Number(entry.weightedFlyOuts.toFixed(2)),
        weighted_ground_outs: Number(entry.weightedGroundOuts.toFixed(2)),
        line_out_percentage:
          entry.weightedLineOuts + entry.weightedFlyOuts + entry.weightedGroundOuts > 0
            ? entry.weightedLineOuts / (entry.weightedLineOuts + entry.weightedFlyOuts + entry.weightedGroundOuts)
            : null,
        fly_out_percentage:
          entry.weightedLineOuts + entry.weightedFlyOuts + entry.weightedGroundOuts > 0
            ? entry.weightedFlyOuts / (entry.weightedLineOuts + entry.weightedFlyOuts + entry.weightedGroundOuts)
            : null,
        ground_out_percentage:
          entry.weightedLineOuts + entry.weightedFlyOuts + entry.weightedGroundOuts > 0
            ? entry.weightedGroundOuts / (entry.weightedLineOuts + entry.weightedFlyOuts + entry.weightedGroundOuts)
            : null,
        current_season_sample: Number(entry.currentSeasonSample.toFixed(2)),
        previous_season_sample: Number(entry.previousSeasonSample.toFixed(2)),
        recent_sample: Number(entry.recentSample.toFixed(2)),
        profile_confidence: getProfileConfidence(entry),
      },
    ])
  );
}

function getProfileConfidence(entry) {
  if (entry.displayWeight >= 10 || entry.displaySeasons >= 1 || entry.recentSample >= 40) {
    return "trusted";
  }
  if (entry.previousSeasonSample >= 10 && entry.currentSeasonSample > 0) {
    return "returning_early";
  }
  if (entry.totalSeasons > 1) {
    return "known_history";
  }
  return "limited";
}

function canUseProfileStats(player) {
  return ["trusted", "returning_early", "known_history"].includes(player.profile_confidence);
}

function describeProfileNote(player) {
  if (player.matched !== "yes") {
    return "Rookie/no historical match";
  }
  if (player.profile_confidence === "returning_early") {
    return "Known player, early current-season sample";
  }
  if (player.profile_confidence === "known_history") {
    return "Known historical player, small recent sample";
  }
  if (player.profile_confidence === "limited") {
    return "Limited profile sample";
  }
  return "";
}

function displayRateCell(player, key) {
  if (player[key] !== "n/a") {
    return escapeHtml(player[key]);
  }
  if (player.profile_confidence === "rookie") {
    return "No match";
  }
  if (player.profile_confidence === "returning_early") {
    return "n/a";
  }
  if (player.profile_confidence === "known_history") {
    return "n/a";
  }
  return "Limited data";
}

function getSupplemental2025DirectionRows() {
  const reportPath = resolve(projectRoot, "valhalla2025_h2_report.csv");
  if (!existsSync(reportPath)) {
    return [];
  }

  const historicalIdByName = new Map();
  for (const row of getHistoricalStatsRows()) {
    if (String(row.season) !== "2025") {
      continue;
    }
    const historicalPlayerId = row.historical_player_id || row.canonical_player_id;
    if (!historicalPlayerId || row.canonical_player_name?.startsWith("SUB")) {
      continue;
    }
    historicalIdByName.set(canonicalizeName(row.player_name), historicalPlayerId);
    historicalIdByName.set(canonicalizeName(row.canonical_player_name), historicalPlayerId);
  }

  return readCsvFile(reportPath)
    .map((row) => {
      const playerName = String(row.Player ?? "").trim();
      const historicalPlayerId = historicalIdByName.get(canonicalizeName(playerName)) ?? slugify(playerName);
      return {
        season: "2025",
        historical_player_id: historicalPlayerId,
        canonical_player_id: historicalPlayerId,
        player_name: playerName,
        canonical_player_name: canonicalizeName(playerName),
        h2l: row.H2L,
        h2c: row.H2C,
        h2r: row.H2R,
      };
    })
    .filter((row) => {
      const directionTotal =
        (toNumber(row.h2l) ?? 0) + (toNumber(row.h2c) ?? 0) + (toNumber(row.h2r) ?? 0);
      return row.player_name && !row.canonical_player_name.startsWith("SUB") && directionTotal > 0;
    });
}

function getCurrentSeasonConsistencyProfiles() {
  const gameStatsPath = resolve(rawRoot, targetSeason, "sportstrack-player-game-stats.json");
  if (!existsSync(gameStatsPath)) {
    return new Map();
  }

  const rows = readJsonIfExists(gameStatsPath);
  if (!Array.isArray(rows)) {
    return new Map();
  }

  const grouped = new Map();
  for (const row of rows) {
    const historicalPlayerId = row.historical_player_id || row.canonical_player_id;
    if (!historicalPlayerId || row.canonical_player_name?.startsWith("SUB")) {
      continue;
    }

    const plateAppearances = toNumber(row.pa) ?? toNumber(row.ab);
    if (plateAppearances == null || plateAppearances <= 0) {
      continue;
    }

    const entry = grouped.get(historicalPlayerId) ?? {
      games: 0,
      hitGames: 0,
      multiHitGames: 0,
      xbhGames: 0,
    };
    const hits = toNumber(row.h) ?? 0;
    const extraBaseHits = (toNumber(row["2b"]) ?? 0) + (toNumber(row["3b"]) ?? 0) + (toNumber(row.hr) ?? 0);

    entry.games += 1;
    if (hits > 0) {
      entry.hitGames += 1;
    }
    if (hits >= 2) {
      entry.multiHitGames += 1;
    }
    if (extraBaseHits > 0) {
      entry.xbhGames += 1;
    }
    grouped.set(historicalPlayerId, entry);
  }

  return new Map(
    [...grouped.entries()].map(([key, entry]) => [
      key,
      {
        games: entry.games,
        hit_game_percentage: safeDivide(entry.hitGames, entry.games),
        multi_hit_game_percentage: safeDivide(entry.multiHitGames, entry.games),
        xbh_game_percentage: safeDivide(entry.xbhGames, entry.games),
        consistency_score: safeDivide(entry.hitGames, entry.games),
      },
    ])
  );
}

function getWeightedDirectionProfiles() {
  const rows = [...getHistoricalStatsRows(), ...getSupplemental2025DirectionRows()];
  const grouped = new Map();
  const targetSeasonNumber = Number(targetSeason);

  for (const row of rows) {
    const historicalPlayerId = row.historical_player_id || row.canonical_player_id;
    const season = toNumber(row.season);
    const left = toNumber(row.h2l);
    const center = toNumber(row.h2c);
    const right = toNumber(row.h2r);
    const directionTotal = (left ?? 0) + (center ?? 0) + (right ?? 0);

    if (
      !historicalPlayerId ||
      !season ||
      !directionTotal ||
      directionTotal <= 0 ||
      row.canonical_player_name?.startsWith("SUB")
    ) {
      continue;
    }

    const seasonAge = targetSeasonNumber - season;
    const seasonWeight = directionSeasonWeights.get(seasonAge);
    if (seasonWeight == null) {
      continue;
    }

    const entry = grouped.get(historicalPlayerId) ?? {
      historical_player_id: historicalPlayerId,
      player_name: row.player_name,
      weightedLeft: 0,
      weightedCenter: 0,
      weightedRight: 0,
      weightedTotal: 0,
      seasons: new Set(),
    };

    entry.weightedLeft += (left ?? 0) * seasonWeight;
    entry.weightedCenter += (center ?? 0) * seasonWeight;
    entry.weightedRight += (right ?? 0) * seasonWeight;
    entry.weightedTotal += directionTotal * seasonWeight;
    entry.seasons.add(String(season));
    grouped.set(historicalPlayerId, entry);
  }

  return new Map(
    [...grouped.entries()].map(([key, entry]) => [
      key,
      {
        historical_player_id: key,
        player_name: entry.player_name,
        weighted_left: entry.weightedLeft,
        weighted_center: entry.weightedCenter,
        weighted_right: entry.weightedRight,
        weighted_total: entry.weightedTotal,
        seasons_used: [...entry.seasons].sort(),
      },
    ])
  );
}

function buildHitDirectionProfile(teamRows, directionProfileMap) {
  const matchedPlayers = teamRows.filter((row) => row.matched === "yes");
  const matchedRosterPlayers = matchedPlayers.length;
  const profiles = matchedPlayers
    .map((row) => directionProfileMap.get(row.historical_player_id))
    .filter(Boolean);

  const totals = profiles.reduce(
    (sum, profile) => ({
      left: sum.left + profile.weighted_left,
      center: sum.center + profile.weighted_center,
      right: sum.right + profile.weighted_right,
      total: sum.total + profile.weighted_total,
    }),
    { left: 0, center: 0, right: 0, total: 0 }
  );

  const seasonsUsed = [...new Set(profiles.flatMap((profile) => profile.seasons_used))].sort();

  return {
    weighted_h2l: Number(totals.left.toFixed(2)),
    weighted_h2c: Number(totals.center.toFixed(2)),
    weighted_h2r: Number(totals.right.toFixed(2)),
    weighted_total: Number(totals.total.toFixed(2)),
    h2l_percentage: totals.total > 0 ? totals.left / totals.total : 0,
    h2c_percentage: totals.total > 0 ? totals.center / totals.total : 0,
    h2r_percentage: totals.total > 0 ? totals.right / totals.total : 0,
    players_with_direction_data: profiles.length,
    matched_roster_players: matchedRosterPlayers,
    seasons_used: seasonsUsed,
    weighting_note:
      "Uses the last three seasons before the report year with weights of 1.0 for the previous year, 0.9 for two years back, and 0.8 for three years back. Seasons with blank H2L/H2C/H2R data are skipped.",
  };
}

function buildLeagueBatScoreRanks(rosterMatches) {
  const rankedPlayers = rosterMatches
    .filter((row) => row.matched === "yes")
    .map((row) => ({
      historical_player_id: row.historical_player_id,
      projected_offense_index: Number(row.projected_offense_index || row.offense_index || 0),
    }))
    .filter((row) => row.historical_player_id)
    .sort((left, right) => right.projected_offense_index - left.projected_offense_index);

  const rankMap = new Map();
  let currentRank = 0;
  let previousScore = null;

  rankedPlayers.forEach((player, index) => {
    if (previousScore == null || player.projected_offense_index !== previousScore) {
      currentRank = index + 1;
      previousScore = player.projected_offense_index;
    }

    if (!rankMap.has(player.historical_player_id)) {
      rankMap.set(player.historical_player_id, currentRank);
    }
  });

  return {
    rankMap,
    totalRankedPlayers: rankedPlayers.length,
  };
}

function buildLineup(teamRows, profileMap, directionProfileMap, consistencyProfileMap, leagueBatScoreRanks) {
  const matched = teamRows
    .filter((row) => row.matched === "yes")
    .map((row) => {
      const profile = profileMap.get(row.historical_player_id);
      const directionProfile = directionProfileMap.get(row.historical_player_id);
      const consistencyProfile = consistencyProfileMap.get(row.historical_player_id);
      return {
        ...row,
        avg: profile?.avg ?? null,
        obp: profile?.obp ?? null,
        slg: profile?.slg ?? null,
        ops: profile?.ops ?? null,
        iso: profile?.iso ?? null,
        xbh_percentage: profile?.xbh_percentage ?? null,
        productive_pa_percentage: profile?.productive_pa_percentage ?? null,
        out_avoidance: profile?.out_avoidance ?? null,
        consistency_score: consistencyProfile?.consistency_score ?? null,
        consistency_games: consistencyProfile?.games ?? 0,
        hit_game_percentage: consistencyProfile?.hit_game_percentage ?? null,
        multi_hit_game_percentage: consistencyProfile?.multi_hit_game_percentage ?? null,
        xbh_game_percentage: consistencyProfile?.xbh_game_percentage ?? null,
        weighted_line_outs: profile?.weighted_line_outs ?? null,
        weighted_fly_outs: profile?.weighted_fly_outs ?? null,
        weighted_ground_outs: profile?.weighted_ground_outs ?? null,
        line_out_percentage: profile?.line_out_percentage ?? null,
        fly_out_percentage: profile?.fly_out_percentage ?? null,
        ground_out_percentage: profile?.ground_out_percentage ?? null,
        current_season_sample: profile?.current_season_sample ?? 0,
        previous_season_sample: profile?.previous_season_sample ?? 0,
        recent_sample: profile?.recent_sample ?? 0,
        profile_confidence: profile?.profile_confidence ?? "limited",
        hit_direction_profile: directionProfile ?? null,
      };
    });

  const unmatched = teamRows
    .filter((row) => row.matched !== "yes")
    .map((row) => ({
      ...row,
      avg: null,
      obp: null,
      slg: null,
      ops: null,
      iso: null,
      xbh_percentage: null,
      productive_pa_percentage: null,
      out_avoidance: null,
      consistency_score: null,
      consistency_games: 0,
      hit_game_percentage: null,
      multi_hit_game_percentage: null,
      xbh_game_percentage: null,
      weighted_line_outs: null,
      weighted_fly_outs: null,
      weighted_ground_outs: null,
      line_out_percentage: null,
      fly_out_percentage: null,
      ground_out_percentage: null,
      current_season_sample: 0,
      previous_season_sample: 0,
      recent_sample: 0,
      profile_confidence: "rookie",
      hit_direction_profile: null,
    }));

  const pool = [...matched, ...unmatched];
  const available = new Map(pool.map((player) => [player.player_name, player]));
  const lineup = [];
  const offenseValue = (player) => Number(player.projected_offense_index || player.offense_index || 0);
  const safeObp = (player) => (canUseProfileStats(player) ? Number(player.obp ?? 0.32) : 0.32);
  const safeAvg = (player) => (canUseProfileStats(player) ? Number(player.avg ?? 0.28) : 0.28);
  const safeSlg = (player) => (canUseProfileStats(player) ? Number(player.slg ?? 0.42) : 0.42);
  const safeOps = (player) => (canUseProfileStats(player) ? Number(player.ops ?? 0.74) : 0.74);

  function takeBest(scoreFn) {
    const choices = [...available.values()];
    if (choices.length === 0) {
      return null;
    }
    choices.sort((left, right) => scoreFn(right) - scoreFn(left));
    const selected = choices[0];
    available.delete(selected.player_name);
    lineup.push(selected);
    return selected;
  }

  takeBest((player) => (safeObp(player) * 0.65) + (offenseValue(player) * 0.35));
  takeBest((player) => (safeObp(player) * 0.45) + (safeAvg(player) * 0.2) + (offenseValue(player) * 0.35));
  takeBest((player) => (offenseValue(player) * 0.6) + (safeSlg(player) * 0.4));
  takeBest((player) => (safeSlg(player) * 0.6) + (safeOps(player) * 0.4));
  takeBest((player) => (offenseValue(player) * 0.55) + (safeOps(player) * 0.45));

  while (available.size > 0) {
    takeBest((player) => (offenseValue(player) * 0.7) + (safeOps(player) * 0.3));
  }

  return lineup.map((player, index) => ({
    spot: index + 1,
    lineup_role: describeLineupRole(index + 1),
    player_name: player.player_name,
    matched: player.matched,
    league_bat_score_rank:
      player.matched === "yes"
        ? leagueBatScoreRanks.rankMap.get(player.historical_player_id) ?? null
        : null,
    league_bat_score_rank_label:
      player.matched === "yes"
        ? (() => {
            const rank = leagueBatScoreRanks.rankMap.get(player.historical_player_id);
            return rank != null
              ? `${ordinal(rank)} of ${leagueBatScoreRanks.totalRankedPlayers} ranked players`
              : "n/a";
          })()
        : "Rookie / unmatched",
    offense_index: Number(player.offense_index || 0),
    projected_offense_index: offenseValue(player),
    trend_adjustment: Number(player.trend_adjustment || 0).toFixed(4),
    profile_confidence: player.profile_confidence,
    current_season_sample: player.current_season_sample,
    previous_season_sample: player.previous_season_sample,
    recent_sample: player.recent_sample,
    h2l_percentage:
      player.hit_direction_profile?.weighted_total > 0
        ? player.hit_direction_profile.weighted_left / player.hit_direction_profile.weighted_total
        : null,
    h2c_percentage:
      player.hit_direction_profile?.weighted_total > 0
        ? player.hit_direction_profile.weighted_center / player.hit_direction_profile.weighted_total
        : null,
    h2r_percentage:
      player.hit_direction_profile?.weighted_total > 0
        ? player.hit_direction_profile.weighted_right / player.hit_direction_profile.weighted_total
        : null,
    direction_seasons_used: player.hit_direction_profile?.seasons_used ?? [],
    weighted_h2l: player.hit_direction_profile?.weighted_left ?? null,
    weighted_h2c: player.hit_direction_profile?.weighted_center ?? null,
    weighted_h2r: player.hit_direction_profile?.weighted_right ?? null,
    weighted_direction_total: player.hit_direction_profile?.weighted_total ?? null,
    line_out_percentage: player.line_out_percentage,
    fly_out_percentage: player.fly_out_percentage,
    ground_out_percentage: player.ground_out_percentage,
    weighted_line_outs: player.weighted_line_outs,
    weighted_fly_outs: player.weighted_fly_outs,
    weighted_ground_outs: player.weighted_ground_outs,
    avg:
      canUseProfileStats(player) && player.avg != null
        ? clamp(player.avg, 0, 1).toFixed(3)
        : "n/a",
    obp:
      canUseProfileStats(player) && player.obp != null
        ? clamp(player.obp, 0, 1).toFixed(3)
        : "n/a",
    slg:
      canUseProfileStats(player) && player.slg != null
        ? clamp(player.slg, 0, 2).toFixed(3)
        : "n/a",
    ops:
      canUseProfileStats(player) && player.ops != null
        ? clamp(player.ops, 0, 3).toFixed(3)
        : "n/a",
    iso:
      canUseProfileStats(player) && player.iso != null
        ? clamp(player.iso, 0, 2).toFixed(3)
        : null,
    xbh_percentage: canUseProfileStats(player) ? player.xbh_percentage : null,
    productive_pa_percentage: canUseProfileStats(player) ? player.productive_pa_percentage : null,
    out_avoidance: canUseProfileStats(player) ? player.out_avoidance : null,
    consistency_score: player.consistency_score,
    consistency_games: player.consistency_games,
    hit_game_percentage: player.hit_game_percentage,
    multi_hit_game_percentage: player.multi_hit_game_percentage,
    xbh_game_percentage: player.xbh_game_percentage,
    notes: describeProfileNote(player),
  }));
}

function buildHumanSummary(teamRating, teamRatings, teamRows, impactRows) {
  if (!teamRating) {
    return null;
  }

  const sortedTeams = [...teamRatings].sort(
    (left, right) => Number(right.overall_rating) - Number(left.overall_rating)
  );
  const teamRank = sortedTeams.findIndex(
    (row) => canonicalizeName(row.team) === canonicalizeName(teamRating.team)
  ) + 1;
  const totalTeams = sortedTeams.length;
  const activePlayers = Number(teamRating.active_players || 0);
  const matchedPlayers = Number(teamRating.matched_players || 0);
  const unmatchedPlayers = Number(teamRating.unmatched_players || 0);
  const rosterSize = Number(teamRating.roster_size || 0);
  const strongestAbsence = impactRows[0] ?? null;
  const easiestAbsence = [...impactRows]
    .sort((left, right) => left.win_probability_swing - right.win_probability_swing)[0] ?? null;

  return {
    team_rank: teamRank,
    total_teams: totalTeams,
    team_tier: describeRating(teamRank, totalTeams),
    expected_runs: Number(teamRating.projected_runs || 0),
    roster_size: rosterSize,
    active_players: activePlayers,
    matched_players: matchedPlayers,
    unmatched_players: unmatchedPlayers,
    roster_match_rate: rosterSize > 0 ? matchedPlayers / rosterSize : 0,
    strongest_absence: strongestAbsence
      ? {
          player_name: strongestAbsence.player_name,
          run_swing: strongestAbsence.run_swing,
          win_probability_swing: strongestAbsence.win_probability_swing,
        }
      : null,
    easiest_absence: easiestAbsence
      ? {
          player_name: easiestAbsence.player_name,
          run_swing: easiestAbsence.run_swing,
          win_probability_swing: easiestAbsence.win_probability_swing,
        }
      : null,
    plain_english_notes: [
      `${teamRating.team} projects as the ${ordinal(teamRank)}-strongest team out of ${totalTeams}.`,
      `The model expects about ${formatDecimal(teamRating.projected_runs, 1)} runs per game with the current full roster.`,
      `${matchedPlayers} of ${rosterSize} players have a historical match in the dataset.`,
      unmatchedPlayers > 0
        ? `${unmatchedPlayers} roster spots are still using fallback assumptions because there is no clean historical match.`
        : "Every roster spot matched to a historical player record.",
    ],
  };
}

function buildHtmlReport(report) {
  const summary = report.human_summary;
  const teamRating = report.team_rating;
  const directionProfile = report.hit_direction_profile;
  const teamSlug = slugify(report.team);
  const wristSheetLinks = ["3x5", "4x6", "5x7"]
    .map(
      (size) =>
        `<a class="action-link" href="./wrist_sheets/${teamSlug}_${report.season}_wrist_${size}.html">${size} wrist sheet</a>`
    )
    .join("");

  const lineupRows = report.best_full_order_if_everyone_shows
    .map(
      (player) => `
        <tr>
          <td>${player.spot}</td>
          <td>${escapeHtml(player.player_name)}</td>
          <td>${escapeHtml(player.lineup_role)}</td>
          <td>${formatDecimal(player.projected_offense_index, 3)}</td>
          <td>${escapeHtml(player.league_bat_score_rank_label)}</td>
          <td>${player.h2l_percentage == null ? "n/a" : formatPct(player.h2l_percentage, 1)}</td>
          <td>${player.h2c_percentage == null ? "n/a" : formatPct(player.h2c_percentage, 1)}</td>
          <td>${player.h2r_percentage == null ? "n/a" : formatPct(player.h2r_percentage, 1)}</td>
          <td>${displayRateCell(player, "obp")}</td>
          <td>${displayRateCell(player, "ops")}</td>
          <td>${escapeHtml(player.notes || "")}</td>
        </tr>`
    )
    .join("");

  const mustHaveRows = report.top_5_must_have_players
    .map(
      (player) => `
        <tr>
          <td>${escapeHtml(player.player_name)}</td>
          <td>${formatTinyDecimal(player.run_swing, 2)} runs</td>
          <td>${formatTinyPct(player.win_probability_swing, 1)}</td>
        </tr>`
    )
    .join("");

  const derivedStatRows =
    report.player_derived_stats.length > 0
      ? report.player_derived_stats
          .map(
            (player) => `
        <tr>
          <td>${escapeHtml(player.player_name)}</td>
          <td>${escapeHtml(player.iso ?? "n/a")}</td>
          <td>${formatNullablePct(player.xbh_percentage, 1)}</td>
          <td>${formatNullablePct(player.productive_pa_percentage, 1)}</td>
          <td>${formatNullablePct(player.out_avoidance, 1)}</td>
          <td>${formatNullablePct(player.consistency_score, 1)}</td>
          <td>${escapeHtml(player.consistency_games ? `${player.consistency_games} games` : "n/a")}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="7">No derived batter stats available.</td></tr>`;

  const playerDirectionRows =
    report.player_direction_stats.length > 0
      ? report.player_direction_stats
          .map(
            (player) => `
        <tr>
          <td>${escapeHtml(player.player_name)}</td>
          <td>${formatPct(player.h2l_percentage, 1)}</td>
          <td>${formatPct(player.h2c_percentage, 1)}</td>
          <td>${formatPct(player.h2r_percentage, 1)}</td>
          <td>${formatDecimal(player.weighted_total, 1)}</td>
          <td>${escapeHtml(player.seasons_used.join(", "))}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="6">No player-level direction data available.</td></tr>`;

  const unmatchedList =
    report.rookies_or_unmatched.length > 0
      ? `<ul>${report.rookies_or_unmatched
          .map((player) => `<li>${escapeHtml(player)}</li>`)
          .join("")}</ul>`
      : "<p>None. Every roster spot matched to a historical player.</p>";
  const directionSeasonText =
    directionProfile?.seasons_used?.length > 0
      ? directionProfile.seasons_used.join(", ")
      : "No populated direction seasons";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(report.team)} ${report.season} Team Report</title>
  <style>
    :root {
      --bg: #f5f1e8;
      --paper: #fffaf0;
      --ink: #182028;
      --muted: #5d6873;
      --accent: #1d5b79;
      --line: #d9cdb8;
      --good: #1f7a4d;
      --warn: #8d5b12;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background: linear-gradient(180deg, #efe5d2 0%, var(--bg) 100%);
      color: var(--ink);
    }
    .page {
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }
    .hero, .panel {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 22px;
      box-shadow: 0 10px 30px rgba(24, 32, 40, 0.08);
    }
    .hero {
      margin-bottom: 18px;
      background: linear-gradient(135deg, #fff7e8 0%, #f7fbff 100%);
    }
    h1, h2, h3 { margin: 0 0 10px; }
    h1 { font-size: 40px; line-height: 1; }
    h2 { font-size: 22px; }
    p { margin: 0 0 10px; color: var(--muted); }
    .kicker {
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--accent);
      font-size: 12px;
      margin-bottom: 10px;
      font-weight: 700;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 18px;
    }
    .summary-card {
      background: rgba(29, 91, 121, 0.06);
      border: 1px solid rgba(29, 91, 121, 0.14);
      border-radius: 14px;
      padding: 14px;
    }
    .summary-card .label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .summary-card .value {
      font-size: 28px;
      font-weight: 700;
      color: var(--ink);
    }
    .summary-card .sub {
      font-size: 14px;
      color: var(--muted);
      margin-top: 4px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1.3fr 0.9fr;
      gap: 18px;
      margin-top: 18px;
    }
    .stack {
      display: grid;
      gap: 18px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th, td {
      text-align: left;
      padding: 10px 8px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }
    ul {
      margin: 10px 0 0 18px;
      color: var(--muted);
    }
    .action-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;
    }
    .action-link {
      display: inline-flex;
      align-items: center;
      min-height: 34px;
      padding: 7px 10px;
      border: 1px solid rgba(29, 91, 121, 0.24);
      border-radius: 8px;
      background: rgba(29, 91, 121, 0.08);
      color: var(--accent);
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
    }
    .action-link:hover,
    .action-link:focus-visible {
      text-decoration: underline;
    }
    .tag {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(31, 122, 77, 0.10);
      color: var(--good);
      font-size: 12px;
      font-weight: 700;
    }
    .tag.warn {
      background: rgba(141, 91, 18, 0.10);
      color: var(--warn);
    }
    .note {
      margin-top: 10px;
      font-size: 14px;
      color: var(--muted);
    }
    @media (max-width: 900px) {
      .grid {
        grid-template-columns: 1fr;
      }
      h1 {
        font-size: 32px;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <div class="kicker">Softball Team Report</div>
      <h1>${escapeHtml(report.team)}</h1>
      <p>${report.season} season outlook. ${escapeHtml(summary?.team_tier ?? "No summary available.")}</p>
      <div class="action-row">${wristSheetLinks}</div>
      <div class="summary-grid">
        <div class="summary-card">
          <div class="label">League Rank</div>
          <div class="value">${summary ? ordinal(summary.team_rank) : "n/a"}</div>
          <div class="sub">${summary ? `Out of ${summary.total_teams} teams` : ""}</div>
        </div>
        <div class="summary-card">
          <div class="label">Expected Runs</div>
          <div class="value">${teamRating ? formatDecimal(teamRating.projected_runs, 1) : "n/a"}</div>
          <div class="sub">Projected runs per game</div>
        </div>
        <div class="summary-card">
          <div class="label">Matched Roster</div>
          <div class="value">${summary ? formatPct(summary.roster_match_rate, 0) : "n/a"}</div>
          <div class="sub">${summary ? `${summary.matched_players} of ${summary.roster_size} players matched` : ""}</div>
        </div>
        <div class="summary-card">
          <div class="label">Best Available Core</div>
          <div class="value">${teamRating ? `${teamRating.active_players}/${teamRating.roster_size}` : "n/a"}</div>
          <div class="sub">Active players in current report</div>
        </div>
        <div class="summary-card">
          <div class="label">Report Updated</div>
          <div class="value">${escapeHtml(formatDateTime(report.generated_at))}</div>
          <div class="sub">Team report build time</div>
        </div>
        <div class="summary-card">
          <div class="label">Stats Through</div>
          <div class="value">${escapeHtml(formatDateLabel(report.stats_through_date))}</div>
          <div class="sub">${report.scraped_game_count ? `${report.scraped_game_count} scraped games` : "Sportstrack scrape state"}</div>
        </div>
      </div>
    </section>

    <div class="grid">
      <div class="stack">
        <section class="panel">
          <h2>Plain-English Readout</h2>
          <ul>
            ${(summary?.plain_english_notes ?? []).map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
          </ul>
        </section>

        <section class="panel">
          <h2>Best Full Lineup If Everyone Shows</h2>
          <p>This is the recommended batting order based on who creates traffic, who drives in runs, and how strong each bat projects to be.</p>
          <p>Bat Score is the model's overall hitting grade. Higher means the bat projects to create more offense, using recent results, sample size, and trend adjustment. It is not a batting average. It is a blended score the model uses to compare hitters to each other.</p>
          <table>
            <thead>
              <tr>
                <th>Spot</th>
                <th>Player</th>
                <th>Role</th>
                <th>Bat Score</th>
                <th>League Rank</th>
                <th>H2L</th>
                <th>H2C</th>
                <th>H2R</th>
                <th>OBP</th>
                <th>OPS</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>${lineupRows}</tbody>
          </table>
        </section>

        <section class="panel">
          <h2>Advanced Batter Signals</h2>
          <p>Derived from the current stat pool. ISO is extra-base power, XBH% is extra-base hits per hit, Productive PA% counts hits, walks, sacrifice flies, and reached by error, Out Avoidance estimates non-out plate appearances, and Consistency Score is 2026 games with at least one hit.</p>
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>ISO</th>
                <th>XBH%</th>
                <th>Prod PA%</th>
                <th>Out Avoid</th>
                <th>Consist.</th>
                <th>2026 Log</th>
              </tr>
            </thead>
            <tbody>${derivedStatRows}</tbody>
          </table>
        </section>
      </div>

      <div class="stack">
        <section class="panel">
          <h2>Hit Direction Profile</h2>
          <p>Weighted current-roster history for H2L, H2C, and H2R. Newer seasons count slightly more when direction data is available.</p>
          <div class="summary-grid">
            <div class="summary-card">
              <div class="label">Hits To Left</div>
              <div class="value">${formatPct(directionProfile?.h2l_percentage ?? 0, 1)}</div>
              <div class="sub">${formatDecimal(directionProfile?.weighted_h2l ?? 0, 1)} weighted events</div>
            </div>
            <div class="summary-card">
              <div class="label">Hits To Center</div>
              <div class="value">${formatPct(directionProfile?.h2c_percentage ?? 0, 1)}</div>
              <div class="sub">${formatDecimal(directionProfile?.weighted_h2c ?? 0, 1)} weighted events</div>
            </div>
            <div class="summary-card">
              <div class="label">Hits To Right</div>
              <div class="value">${formatPct(directionProfile?.h2r_percentage ?? 0, 1)}</div>
              <div class="sub">${formatDecimal(directionProfile?.weighted_h2r ?? 0, 1)} weighted events</div>
            </div>
          </div>
          <p class="note">Direction data covers ${directionProfile?.players_with_direction_data ?? 0} of ${directionProfile?.matched_roster_players ?? 0} matched roster players. Seasons used: ${escapeHtml(directionSeasonText)}.</p>
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>H2L</th>
                <th>H2C</th>
                <th>H2R</th>
                <th>Weighted Events</th>
                <th>Seasons</th>
              </tr>
            </thead>
            <tbody>${playerDirectionRows}</tbody>
          </table>
        </section>

        <section class="panel">
          <h2>Most Important Absences</h2>
          <p>If one of these players is out, the offense takes the biggest hit.</p>
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Run Drop</th>
                <th>Win Odds Drop</th>
              </tr>
            </thead>
            <tbody>${mustHaveRows}</tbody>
          </table>
        </section>

        <section class="panel">
          <h2>Rookies Or Unmatched Players</h2>
          <p>These roster spots do not have a clean historical match, so the model is using fallback assumptions.</p>
          ${unmatchedList}
        </section>
      </div>
    </div>
  </div>
</body>
</html>
`;
}

function main() {
  const rosterMatches = readCsvFile(resolve(processedRoot, "roster_matches.csv"));
  const playerImpact = readCsvFile(resolve(processedRoot, "player_impact.csv"));
  const teamRatings = readCsvFile(resolve(processedRoot, "team_ratings.csv"));
  const profileMap = getWeightedProfiles();
  const directionProfileMap = getWeightedDirectionProfiles();
  const consistencyProfileMap = getCurrentSeasonConsistencyProfiles();
  const leagueBatScoreRanks = buildLeagueBatScoreRanks(rosterMatches);

  const teamRows = rosterMatches.filter(
    (row) => canonicalizeName(row.team) === canonicalizeName(requestedTeam)
  );

  if (teamRows.length === 0) {
    console.error(`No roster rows found for team: ${requestedTeam}`);
    process.exit(1);
  }

  const teamRating = teamRatings.find(
    (row) => canonicalizeName(row.team) === canonicalizeName(requestedTeam)
  );
  const impactRows = playerImpact
    .filter((row) => canonicalizeName(row.team) === canonicalizeName(requestedTeam))
    .map((row) => ({
      player_name: row.player_name,
      run_swing: Number(row.run_swing),
      win_probability_swing: Number(row.win_probability_swing),
    }))
    .sort((left, right) => right.win_probability_swing - left.win_probability_swing);

  const lineup = buildLineup(teamRows, profileMap, directionProfileMap, consistencyProfileMap, leagueBatScoreRanks);
  const playerDerivedStats = lineup
    .map((player) => ({
      player_name: player.player_name,
      spot: player.spot,
      iso: player.iso,
      xbh_percentage: player.xbh_percentage,
      productive_pa_percentage: player.productive_pa_percentage,
      out_avoidance: player.out_avoidance,
      consistency_score: player.consistency_score,
      consistency_games: player.consistency_games,
      hit_game_percentage: player.hit_game_percentage,
      multi_hit_game_percentage: player.multi_hit_game_percentage,
      xbh_game_percentage: player.xbh_game_percentage,
      profile_confidence: player.profile_confidence,
    }))
    .filter(
      (player) =>
        player.iso != null ||
        player.xbh_percentage != null ||
        player.productive_pa_percentage != null ||
        player.out_avoidance != null ||
        player.consistency_score != null
    );
  const playerDirectionStats = lineup
    .filter((player) => player.h2l_percentage != null && player.h2c_percentage != null && player.h2r_percentage != null)
    .map((player) => ({
      player_name: player.player_name,
      h2l_percentage: player.h2l_percentage,
      h2c_percentage: player.h2c_percentage,
      h2r_percentage: player.h2r_percentage,
      weighted_left: player.weighted_h2l ?? 0,
      weighted_center: player.weighted_h2c ?? 0,
      weighted_right: player.weighted_h2r ?? 0,
      weighted_total: player.weighted_direction_total ?? 0,
      seasons_used: player.direction_seasons_used ?? [],
    }))
    .sort((left, right) => right.weighted_total - left.weighted_total);
  const coreLineupPlayers = new Set(
    lineup
      .filter((player) => Number(player.spot) <= 10)
      .map((player) => canonicalizeName(player.player_name))
  );
  const humanSummary = buildHumanSummary(teamRating, teamRatings, teamRows, impactRows);
  const scrapeState = readJsonIfExists(resolve(rawRoot, targetSeason, "sportstrack-state.json"));
  const report = {
    generated_at: new Date().toISOString(),
    stats_last_scraped_at: scrapeState.generatedAt ?? "",
    stats_through_date: scrapeState.lastScrapedGameDate ?? "",
    scraped_game_count: scrapeState.scrapedGameIds?.length ?? "",
    season: Number(targetSeason),
    team: requestedTeam,
    team_rating: teamRating ?? null,
    human_summary: humanSummary,
    hit_direction_profile: buildHitDirectionProfile(teamRows, directionProfileMap),
    player_direction_stats: playerDirectionStats,
    player_derived_stats: playerDerivedStats,
    best_full_order_if_everyone_shows: lineup,
    top_5_must_have_players: impactRows
      .filter((row) => coreLineupPlayers.has(canonicalizeName(row.player_name)))
      .slice(0, 5),
    lowest_penalty_absences: [...impactRows]
      .sort((left, right) => left.win_probability_swing - right.win_probability_swing)
      .slice(0, 5),
    rookies_or_unmatched: teamRows
      .filter((row) => row.matched !== "yes")
      .map((row) => row.player_name),
  };

  mkdirSync(reportRoot, { recursive: true });
  const outputPath = resolve(reportRoot, `${slugify(requestedTeam)}_${targetSeason}.json`);
  const htmlOutputPath = resolve(reportRoot, `${slugify(requestedTeam)}_${targetSeason}.html`);
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(htmlOutputPath, buildHtmlReport(report), "utf8");

  console.log(`Built team report for ${requestedTeam}: ${outputPath} and ${htmlOutputPath}`);
}

main();
