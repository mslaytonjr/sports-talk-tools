import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const seasons = process.argv.slice(2);
const args = seasons.length > 0 ? seasons : ["2025", "2024", "2023"];

function runNodeScript(scriptPath, scriptArgs) {
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runNodeScript(resolve(projectRoot, "scripts", "softball", "normalize-softball-data.mjs"), args);
runNodeScript(resolve(projectRoot, "scripts", "softball", "validate-softball-stats.mjs"), args);
