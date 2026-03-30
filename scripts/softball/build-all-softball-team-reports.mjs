import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./shared.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const processedRoot = resolve(projectRoot, "data", "softball", "processed");
const targetSeason = process.argv[2] ?? "2026";

function readCsvFile(filePath) {
  return parseCsv(readFileSync(filePath, "utf8"));
}

function main() {
  const teamRatings = readCsvFile(resolve(processedRoot, "team_ratings.csv"));
  const teamNames = [...new Set(teamRatings.map((row) => String(row.team ?? "").trim()).filter(Boolean))];

  if (teamNames.length === 0) {
    console.error("No teams found in team_ratings.csv. Run softball:build-model first.");
    process.exit(1);
  }

  for (const teamName of teamNames) {
    const result = spawnSync(
      process.execPath,
      [resolve(projectRoot, "scripts", "softball", "build-softball-team-report.mjs"), targetSeason, teamName],
      {
        cwd: projectRoot,
        stdio: "inherit",
      }
    );

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }

  console.log(`Built team reports for ${teamNames.length} teams in ${targetSeason}.`);
}

main();
