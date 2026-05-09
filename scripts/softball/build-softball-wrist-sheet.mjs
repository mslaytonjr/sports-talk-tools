import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { slugify } from "./shared.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const processedReportsRoot = resolve(projectRoot, "data", "softball", "processed", "team_reports");
const publicReportsRoot = resolve(projectRoot, "public", "softball", "team_reports");

const targetSeason = process.argv[2] ?? "2026";
const requestedTeam = process.argv[3] ?? "all";
const requestedSize = process.argv[4] ?? "4x6";
const supportedSizes = new Set(["3x5", "4x6", "5x7"]);
const size = supportedSizes.has(requestedSize) ? requestedSize : "4x6";
const defaultRowLimit = size === "3x5" ? 10 : 15;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getPlayerScore(player) {
  const numeric = Number(player.projected_offense_index ?? player.offense_index);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildThreatCurve(reports) {
  const scores = reports
    .flatMap((report) => report.best_full_order_if_everyone_shows ?? [])
    .map(getPlayerScore)
    .filter((score) => score != null);

  if (scores.length === 0) {
    return { min: 0, max: 1 };
  }

  return {
    min: Math.min(...scores),
    max: Math.max(...scores),
  };
}

function getThreatScore(rawScore, curve) {
  if (rawScore == null || curve.max <= curve.min) {
    return null;
  }

  return ((rawScore - curve.min) / (curve.max - curve.min)) * 100;
}

function getThreatTier(rawScore, curve) {
  const score = getThreatScore(rawScore, curve);
  if (score == null) {
    return "Unknown";
  }

  if (score >= 90) {
    return "Red Alert";
  }
  if (score >= 75) {
    return "Danger";
  }
  if (score >= 60) {
    return "Respect";
  }
  if (score >= 40) {
    return "Normal";
  }
  if (score >= 20) {
    return "Attack";
  }
  return "Low Threat";
}

function formatRate(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "n/a") {
    return "-";
  }

  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric.toFixed(3) : text;
}

function formatPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric * 100)}%` : "-";
}

function recommendShade(player) {
  const left = Number(player.h2l_percentage);
  const center = Number(player.h2c_percentage);
  const right = Number(player.h2r_percentage);
  const values = [left, center, right].filter(Number.isFinite);

  if (values.length !== 3 || values.every((value) => value === 0)) {
    return "Balanced";
  }

  const sorted = [
    ["left", left],
    ["center", center],
    ["right", right],
  ].sort((a, b) => b[1] - a[1]);

  const [leader, leadValue] = sorted[0];
  const secondValue = sorted[1][1];
  const gap = leadValue - secondValue;

  if (gap < 0.1) {
    return "Balanced";
  }

  if (leader === "left") {
    if (left >= 0.65) {
      return "Hard left";
    }
    if (center >= 0.35) {
      return "LF/LCF gap";
    }
    return "Shade left";
  }

  if (leader === "right") {
    if (right >= 0.35) {
      return "Hard right";
    }
    if (center >= 0.35) {
      return "RCF/RF gap";
    }
    return "Shade right";
  }

  if (left >= 0.3 && right < 0.12) {
    return "Shade left";
  }
  if (right >= 0.18 && left < 0.2) {
    return "Shade right";
  }
  return "Center";
}

function getReportPath(teamSlug) {
  const fileName = `${teamSlug}_${targetSeason}.json`;
  const processedPath = resolve(processedReportsRoot, fileName);
  const publicPath = resolve(publicReportsRoot, fileName);

  if (existsSync(processedPath)) {
    return processedPath;
  }
  if (existsSync(publicPath)) {
    return publicPath;
  }
  return null;
}

function getAvailableReports() {
  const sourceRoot = existsSync(processedReportsRoot) ? processedReportsRoot : publicReportsRoot;
  if (!existsSync(sourceRoot)) {
    return [];
  }

  return readFileSync(resolve(projectRoot, "data", "softball", "processed", "team_ratings.csv"), "utf8")
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(",")[0])
    .map((team) => team.trim())
    .filter(Boolean)
    .map((team) => ({ team, path: getReportPath(slugify(team)) }))
    .filter((entry) => entry.path);
}

function readReport(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function buildRows(report, threatCurve) {
  return (report.best_full_order_if_everyone_shows ?? [])
    .slice(0, defaultRowLimit)
    .map((player) => {
      const rawScore = getPlayerScore(player);
      return {
        spot: player.spot,
        player: player.player_name,
        threat: getThreatTier(rawScore, threatCurve),
        avg: formatRate(player.avg),
        obp: formatRate(player.obp),
        shade: recommendShade(player),
      };
    });
}

function buildHtml(report, threatCurve) {
  const rows = buildRows(report, threatCurve);
  const team = report.team ?? requestedTeam;
  const profile = report.hit_direction_profile ?? {};
  const pageSize = size.replace("x", "in ") + "in";
  const sheetClass = [
    "sheet",
    size === "3x5" ? "small" : "",
    size === "4x6" ? "medium" : "",
  ].filter(Boolean).join(" ");
  const subtitle =
    size === "3x5"
      ? `Top ${rows.length} bats by projected order`
      : `Projected order, ${rows.length} listed`;

  const bodyRows = rows
    .map(
      (row) => `<tr>
        <td class="spot">${escapeHtml(row.spot)}</td>
        <td class="player">${escapeHtml(row.player)}</td>
        <td class="threat">${escapeHtml(row.threat)}</td>
        <td>${escapeHtml(row.avg)}</td>
        <td>${escapeHtml(row.obp)}</td>
        <td class="shade">${escapeHtml(row.shade)}</td>
      </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(team)} ${targetSeason} Wrist Sheet</title>
  <style>
    @page { size: ${pageSize}; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #e8e8e8;
      color: #111;
      font-family: Arial, Helvetica, sans-serif;
    }
    .sheet {
      width: 5in;
      height: 7in;
      margin: 16px auto;
      background: #fff;
      border: 1px solid #111;
      padding: 0.13in;
      overflow: hidden;
    }
    .sheet.small {
      width: 3in;
      height: 5in;
      padding: 0.08in;
    }
    .sheet.medium {
      width: 4in;
      height: 6in;
      padding: 0.1in;
    }
    header {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.08in;
      align-items: start;
      border-bottom: 2px solid #111;
      padding-bottom: 0.06in;
      margin-bottom: 0.06in;
    }
    h1 {
      margin: 0;
      font-size: 17px;
      line-height: 1.02;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .small h1 { font-size: 12px; }
    .medium h1 { font-size: 14px; }
    .meta {
      margin-top: 2px;
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .team-profile {
      text-align: right;
      font-size: 8px;
      line-height: 1.25;
      font-weight: 700;
      white-space: nowrap;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 9px;
    }
    .small table { font-size: 6.8px; }
    .medium table { font-size: 7.7px; }
    th, td {
      border-bottom: 1px solid #aaa;
      padding: 0.035in 0.025in;
      vertical-align: middle;
      line-height: 1.05;
    }
    .small th, .small td { padding: 0.022in 0.012in; }
    .medium th, .medium td { padding: 0.026in 0.016in; }
    th {
      text-align: left;
      border-bottom: 1.5px solid #111;
      font-size: 7px;
      text-transform: uppercase;
    }
    .small th { font-size: 5.7px; }
    .medium th { font-size: 6.2px; }
    .spot { width: 6%; text-align: center; font-weight: 700; }
    .player { width: 26%; font-weight: 700; }
    .threat { width: 16%; font-weight: 800; text-transform: uppercase; }
    .shade { width: 36%; font-weight: 800; text-transform: uppercase; }
    .legend {
      margin-top: 0.06in;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.05in;
      font-size: 7.2px;
      line-height: 1.2;
      font-weight: 700;
    }
    .small .legend { font-size: 5.8px; }
    .medium .legend { font-size: 6.2px; }
    .box {
      border: 1px solid #111;
      padding: 0.04in;
    }
    @media print {
      body { background: #fff; }
      .sheet { margin: 0; border: 0; }
    }
  </style>
</head>
<body>
  <section class="${sheetClass}">
    <header>
      <div>
        <h1>${escapeHtml(team)}</h1>
        <div class="meta">${targetSeason} defensive wrist sheet - ${escapeHtml(subtitle)}</div>
      </div>
      <div class="team-profile">
        Team H2L ${formatPercent(profile.h2l_percentage)}<br>
        H2C ${formatPercent(profile.h2c_percentage)} / H2R ${formatPercent(profile.h2r_percentage)}
      </div>
    </header>
    <table>
      <thead>
        <tr>
          <th class="spot">#</th>
          <th class="player">Player</th>
          <th class="threat">Threat</th>
          <th>BA</th>
          <th>OBP</th>
          <th class="shade">Defense</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div class="legend">
      <div class="box">Threat is curved league-wide from modeled bat strength: Red Alert, Danger, Respect, Normal, Attack, Low Threat.</div>
      <div class="box">Defense is the recommended outfield shade from available hit-direction history. 2026 public stats do not include new direction data.</div>
    </div>
  </section>
</body>
</html>
`;
}

function writeReport(report, threatCurve) {
  const teamSlug = slugify(report.team);
  const fileName = `${teamSlug}_${targetSeason}_wrist_${size}.html`;
  const html = buildHtml(report, threatCurve);

  for (const root of [processedReportsRoot, publicReportsRoot]) {
    const outputRoot = resolve(root, "wrist_sheets");
    mkdirSync(outputRoot, { recursive: true });
    writeFileSync(resolve(outputRoot, fileName), html, "utf8");
  }

  return fileName;
}

function main() {
  const reports =
    requestedTeam.toLowerCase() === "all"
      ? getAvailableReports()
      : [{ team: requestedTeam, path: getReportPath(slugify(requestedTeam)) }].filter((entry) => entry.path);

  if (reports.length === 0) {
    console.error(`No team report JSON found for ${requestedTeam} ${targetSeason}. Build team reports first.`);
    process.exit(1);
  }

  const reportPayloads = reports.map((entry) => readReport(entry.path));
  const leagueReports = getAvailableReports().map((entry) => readReport(entry.path));
  const threatCurve = buildThreatCurve(leagueReports.length > 0 ? leagueReports : reportPayloads);
  const written = reportPayloads.map((report) => writeReport(report, threatCurve));
  console.log(`Built ${written.length} ${size} softball wrist sheet${written.length === 1 ? "" : "s"}.`);
}

main();
