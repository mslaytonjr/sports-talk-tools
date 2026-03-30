import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const processedRoot = resolve(projectRoot, "data", "softball", "processed");
const publicSoftballRoot = resolve(projectRoot, "public", "softball");

const targetSeason = process.argv[2] ?? "2026";

function ensureExists(path, label) {
  if (!existsSync(path)) {
    throw new Error(`Missing ${label}: ${path}`);
  }
}

function rewriteLeagueOverviewForPublic(html) {
  return html.replaceAll("../team_reports/", "./team_reports/");
}

function rewriteLeagueOverviewJsonForPublic(jsonText) {
  const payload = JSON.parse(jsonText);
  payload.team_rankings = (payload.team_rankings ?? []).map((team) => ({
    ...team,
    team_report_href: String(team.team_report_href ?? "").replace("../team_reports/", "./team_reports/"),
  }));
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function main() {
  const leagueHtmlSource = resolve(processedRoot, "league_reports", `league_overview_${targetSeason}.html`);
  const leagueJsonSource = resolve(processedRoot, "league_reports", `league_overview_${targetSeason}.json`);
  const teamReportsSource = resolve(processedRoot, "team_reports");

  ensureExists(leagueHtmlSource, "league overview HTML");
  ensureExists(leagueJsonSource, "league overview JSON");
  ensureExists(teamReportsSource, "team reports directory");

  mkdirSync(publicSoftballRoot, { recursive: true });

  const publicTeamReportsRoot = resolve(publicSoftballRoot, "team_reports");
  rmSync(publicTeamReportsRoot, { recursive: true, force: true });
  mkdirSync(publicTeamReportsRoot, { recursive: true });

  cpSync(teamReportsSource, publicTeamReportsRoot, { recursive: true });

  const leagueHtml = rewriteLeagueOverviewForPublic(readFileSync(leagueHtmlSource, "utf8"));
  const leagueJson = rewriteLeagueOverviewJsonForPublic(readFileSync(leagueJsonSource, "utf8"));

  writeFileSync(resolve(publicSoftballRoot, `league_overview_${targetSeason}.html`), leagueHtml, "utf8");
  writeFileSync(resolve(publicSoftballRoot, `league_overview_${targetSeason}.json`), leagueJson, "utf8");
  writeFileSync(resolve(publicSoftballRoot, "index.html"), leagueHtml, "utf8");

  console.log(`Published softball reports for ${targetSeason} to ${publicSoftballRoot}`);
}

main();
