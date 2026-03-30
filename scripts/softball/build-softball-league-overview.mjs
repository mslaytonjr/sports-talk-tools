import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./shared.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const processedRoot = resolve(projectRoot, "data", "softball", "processed");
const reportRoot = resolve(processedRoot, "league_reports");

const targetSeason = process.argv[2] ?? "2026";

function readCsvFile(filePath) {
  return parseCsv(readFileSync(filePath, "utf8"));
}

function formatDecimal(value, digits = 2) {
  return Number(value || 0).toFixed(digits);
}

function formatPct(value, digits = 1) {
  return `${(Number(value || 0) * 100).toFixed(digits)}%`;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTeamReportHref(teamId, season) {
  return `../team_reports/${teamId}_${season}.html`;
}

function buildHtmlReport(payload) {
  const standingsRows = payload.team_rankings
    .map(
      (team) => `
        <tr>
          <td>${team.rank}</td>
          <td><a class="team-link" href="${escapeHtml(team.team_report_href)}">${escapeHtml(team.team)}</a></td>
          <td>${formatDecimal(team.projected_runs, 2)}</td>
          <td>${team.matched_players}/${team.roster_size}</td>
          <td>${formatDecimal(team.overall_rating, 3)}</td>
        </tr>`
    )
    .join("");

  const topPlayersRows = payload.top_5_most_important_players
    .map(
      (player, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(player.player_name)}</td>
          <td>${escapeHtml(player.team)}</td>
          <td>${formatDecimal(player.run_swing, 2)} runs</td>
          <td>${formatPct(player.win_probability_swing, 1)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Softball League Overview ${escapeHtml(payload.season)}</title>
  <style>
    :root {
      --bg: #f3efe8;
      --panel: #fffaf2;
      --ink: #182028;
      --muted: #5f6a73;
      --line: #d7ccba;
      --accent: #8c2f39;
      --accent-soft: #f4ddd7;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, #f7e8df 0, transparent 30%),
        linear-gradient(180deg, #efe8dc 0%, var(--bg) 100%);
    }
    .page {
      max-width: 1180px;
      margin: 0 auto;
      padding: 28px 20px 48px;
    }
    .hero, .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 20px;
      box-shadow: 0 14px 34px rgba(24, 32, 40, 0.08);
    }
    .hero {
      padding: 24px;
      margin-bottom: 18px;
      background: linear-gradient(135deg, #fff7ef 0%, #fffdf9 60%, #f8ebe5 100%);
    }
    .kicker {
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 12px;
      color: var(--accent);
      font-weight: 700;
      margin-bottom: 10px;
    }
    h1, h2 {
      margin: 0 0 10px;
    }
    h1 {
      font-size: 42px;
      line-height: 1;
    }
    h2 {
      font-size: 24px;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
    }
    .summary-strip {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 18px;
    }
    .summary-card {
      border-radius: 14px;
      padding: 14px;
      background: var(--accent-soft);
      border: 1px solid rgba(140, 47, 57, 0.12);
    }
    .summary-card .label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .summary-card .value {
      font-size: 30px;
      font-weight: 700;
    }
    .grid {
      display: grid;
      grid-template-columns: 1.3fr 0.9fr;
      gap: 18px;
    }
    .panel {
      padding: 22px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    th, td {
      text-align: left;
      padding: 10px 8px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
    }
    .team-link {
      color: var(--accent);
      text-decoration: none;
      font-weight: 700;
    }
    .team-link:hover,
    .team-link:focus-visible {
      text-decoration: underline;
    }
    .note {
      margin-top: 10px;
      font-size: 14px;
      color: var(--muted);
    }
    @media (max-width: 920px) {
      .grid {
        grid-template-columns: 1fr;
      }
      h1 {
        font-size: 34px;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <section class="hero">
      <div class="kicker">Softball League Overview</div>
      <h1>${escapeHtml(payload.season)} League Snapshot</h1>
      <p>This page ranks the current teams by model strength and highlights the five players whose one-game absence hurts their team the most.</p>
      <div class="summary-strip">
        <div class="summary-card">
          <div class="label">Top Team</div>
          <div class="value">${escapeHtml(payload.team_rankings[0]?.team ?? "n/a")}</div>
        </div>
        <div class="summary-card">
          <div class="label">Best Important Player</div>
          <div class="value">${escapeHtml(payload.top_5_most_important_players[0]?.player_name ?? "n/a")}</div>
        </div>
        <div class="summary-card">
          <div class="label">Highest One-Game Run Loss</div>
          <div class="value">${payload.top_5_most_important_players[0] ? `${formatDecimal(payload.top_5_most_important_players[0].run_swing, 2)} runs` : "n/a"}</div>
        </div>
      </div>
    </section>

    <div class="grid">
      <section class="panel">
        <h2>League Rankings</h2>
        <p>Teams are ordered by current overall model strength. Click a team name to open its report.</p>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Team</th>
              <th>Expected Runs</th>
              <th>Matched Roster</th>
              <th>Overall Rating</th>
            </tr>
          </thead>
          <tbody>${standingsRows}</tbody>
        </table>
      </section>

      <section class="panel">
        <h2>Top 5 Most Important Players</h2>
        <p>These are the five players whose one-game absence creates the biggest drop for their team.</p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Team</th>
              <th>Run Loss</th>
              <th>Win Odds Loss</th>
            </tr>
          </thead>
          <tbody>${topPlayersRows}</tbody>
        </table>
        <p class="note">This section is league-wide, not per team.</p>
      </section>
    </div>
  </div>
</body>
</html>
`;
}

function main() {
  const teamRatings = readCsvFile(resolve(processedRoot, "team_ratings.csv"));
  const playerImpact = readCsvFile(resolve(processedRoot, "player_impact.csv"));

  const teamRankings = [...teamRatings]
    .map((row) => ({
      team: row.team,
      team_id: row.team_id,
      projected_runs: Number(row.projected_runs || 0),
      matched_players: Number(row.matched_players || 0),
      roster_size: Number(row.roster_size || 0),
      overall_rating: Number(row.overall_rating || 0),
      team_report_href: buildTeamReportHref(row.team_id, targetSeason),
    }))
    .sort((left, right) => right.overall_rating - left.overall_rating)
    .map((row, index) => ({
      ...row,
      rank: index + 1,
      rank_label: ordinal(index + 1),
    }));

  const topPlayers = [...playerImpact]
    .map((row) => ({
      team: row.team,
      player_name: row.player_name,
      run_swing: Number(row.run_swing || 0),
      win_probability_swing: Number(row.win_probability_swing || 0),
    }))
    .sort((left, right) => {
      if (right.win_probability_swing !== left.win_probability_swing) {
        return right.win_probability_swing - left.win_probability_swing;
      }
      return right.run_swing - left.run_swing;
    })
    .slice(0, 5);

  const payload = {
    generated_at: new Date().toISOString(),
    season: Number(targetSeason),
    team_rankings: teamRankings,
    top_5_most_important_players: topPlayers,
  };

  mkdirSync(reportRoot, { recursive: true });
  const jsonPath = resolve(reportRoot, `league_overview_${targetSeason}.json`);
  const htmlPath = resolve(reportRoot, `league_overview_${targetSeason}.html`);

  writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  writeFileSync(htmlPath, buildHtmlReport(payload), "utf8");

  console.log(`Built league overview for ${targetSeason}: ${jsonPath} and ${htmlPath}`);
}

main();
