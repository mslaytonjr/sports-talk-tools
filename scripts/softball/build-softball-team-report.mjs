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
const reportRoot = resolve(processedRoot, "team_reports");

const targetSeason = process.argv[2] ?? "2026";
const requestedTeam = process.argv.slice(3).join(" ").trim() || "7th Floor Crew";
const recencyDecay = 0.72;

function readCsvFile(filePath) {
  return parseCsv(readFileSync(filePath, "utf8"));
}

function formatDecimal(value, digits = 2) {
  return Number(value || 0).toFixed(digits);
}

function formatPct(value, digits = 1) {
  return `${(Number(value || 0) * 100).toFixed(digits)}%`;
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
      displayWeight: 0,
      displaySeasons: 0,
      totalSeasons: 0,
    };

    entry.totalSeasons += 1;
    entry.totalWeight += weight;
    entry.weightedAvg += (avg ?? ops ?? 0.33) * weight;
    entry.weightedObp += (obp ?? avg ?? ops ?? 0.34) * weight;
    entry.weightedSlg += (slg ?? ops ?? 0.45) * weight;
    entry.weightedOps += (ops ?? ((obp ?? 0.34) + (slg ?? 0.45))) * weight;
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
        profile_confidence:
          entry.displayWeight >= 10 || entry.displaySeasons >= 1 || entry.totalSeasons > 1
            ? "trusted"
            : "limited",
      },
    ])
  );
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

function buildLineup(teamRows, profileMap, leagueBatScoreRanks) {
  const matched = teamRows
    .filter((row) => row.matched === "yes")
    .map((row) => {
      const profile = profileMap.get(row.historical_player_id);
      return {
        ...row,
        avg: profile?.avg ?? null,
        obp: profile?.obp ?? null,
        slg: profile?.slg ?? null,
        ops: profile?.ops ?? null,
        profile_confidence: profile?.profile_confidence ?? "limited",
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
      profile_confidence: "rookie",
    }));

  const pool = [...matched, ...unmatched];
  const available = new Map(pool.map((player) => [player.player_name, player]));
  const lineup = [];
  const offenseValue = (player) => Number(player.projected_offense_index || player.offense_index || 0);
  const safeObp = (player) =>
    player.profile_confidence === "trusted" ? Number(player.obp ?? 0.32) : 0.32;
  const safeAvg = (player) =>
    player.profile_confidence === "trusted" ? Number(player.avg ?? 0.28) : 0.28;
  const safeSlg = (player) =>
    player.profile_confidence === "trusted" ? Number(player.slg ?? 0.42) : 0.42;
  const safeOps = (player) =>
    player.profile_confidence === "trusted" ? Number(player.ops ?? 0.74) : 0.74;

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
              ? `${ordinal(rank)} of ${leagueBatScoreRanks.totalRankedPlayers} returning players`
              : "n/a";
          })()
        : "Rookie / unmatched",
    offense_index: Number(player.offense_index || 0),
    projected_offense_index: offenseValue(player),
    trend_adjustment: Number(player.trend_adjustment || 0).toFixed(4),
    profile_confidence: player.profile_confidence,
    avg:
      player.profile_confidence === "trusted" && player.avg != null
        ? clamp(player.avg, 0, 1).toFixed(3)
        : "n/a",
    obp:
      player.profile_confidence === "trusted" && player.obp != null
        ? clamp(player.obp, 0, 1).toFixed(3)
        : "n/a",
    slg:
      player.profile_confidence === "trusted" && player.slg != null
        ? clamp(player.slg, 0, 2).toFixed(3)
        : "n/a",
    ops:
      player.profile_confidence === "trusted" && player.ops != null
        ? clamp(player.ops, 0, 3).toFixed(3)
        : "n/a",
    notes:
      player.matched === "yes"
        ? player.profile_confidence === "trusted"
          ? ""
          : "Profile stats hidden until validation confidence improves"
        : "Rookie/no historical match",
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

  const lineupRows = report.best_full_order_if_everyone_shows
    .map(
      (player) => `
        <tr>
          <td>${player.spot}</td>
          <td>${escapeHtml(player.player_name)}</td>
          <td>${escapeHtml(player.lineup_role)}</td>
          <td>${formatDecimal(player.projected_offense_index, 3)}</td>
          <td>${escapeHtml(player.league_bat_score_rank_label)}</td>
          <td>${player.obp === "n/a" ? "Limited data" : escapeHtml(player.obp)}</td>
          <td>${player.ops === "n/a" ? "Limited data" : escapeHtml(player.ops)}</td>
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

  const unmatchedList =
    report.rookies_or_unmatched.length > 0
      ? `<ul>${report.rookies_or_unmatched
          .map((player) => `<li>${escapeHtml(player)}</li>`)
          .join("")}</ul>`
      : "<p>None. Every roster spot matched to a historical player.</p>";

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
                <th>OBP</th>
                <th>OPS</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>${lineupRows}</tbody>
          </table>
        </section>
      </div>

      <div class="stack">
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

  const lineup = buildLineup(teamRows, profileMap, leagueBatScoreRanks);
  const coreLineupPlayers = new Set(
    lineup
      .filter((player) => Number(player.spot) <= 10)
      .map((player) => canonicalizeName(player.player_name))
  );
  const humanSummary = buildHumanSummary(teamRating, teamRatings, teamRows, impactRows);
  const report = {
    season: Number(targetSeason),
    team: requestedTeam,
    team_rating: teamRating ?? null,
    human_summary: humanSummary,
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
