import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");

const targetSeason = process.argv.find((arg) => /^\d{4}$/.test(arg)) ?? process.env.SOFTBALL_SEASON ?? "2026";
const forceScrape = process.argv.includes("--force") || process.env.SOFTBALL_FORCE_SCRAPE === "true";
const publishBucket = process.env.SOFTBALL_REPORTS_BUCKET ?? "";
const publishPrefix = process.env.SOFTBALL_REPORTS_PREFIX ?? "softball";
const cloudFrontDistributionId = process.env.SOFTBALL_CLOUDFRONT_DISTRIBUTION_ID ?? "";
const awsRegion = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNpm(script, args = []) {
  if (process.env.npm_execpath) {
    run(process.execPath, [process.env.npm_execpath, "run", script, "--", ...args]);
    return;
  }

  run("npm", ["run", script, "--", ...args], {
    shell: process.platform === "win32",
  });
}

runNpm("softball:scrape-sportstrack", forceScrape ? ["--force"] : []);
runNpm("softball:build-dataset", [targetSeason, "2025", "2024", "2023"]);
runNpm("softball:build-model", [targetSeason]);
runNpm("softball:team-report:all", [targetSeason]);
runNpm("softball:league-overview", [targetSeason]);
runNpm("softball:publish-reports", [targetSeason]);

if (publishBucket) {
  if (!existsSync(resolve(projectRoot, "public", "softball"))) {
    throw new Error("Missing public/softball output directory after publish step.");
  }

  run("aws", [
    "s3",
    "sync",
    resolve(projectRoot, "public", "softball"),
    `s3://${publishBucket}/${publishPrefix}`.replace(/\/$/, ""),
    "--delete",
    "--cache-control",
    "no-cache, no-store, must-revalidate",
    "--region",
    awsRegion,
  ]);

  if (cloudFrontDistributionId) {
    run("aws", [
      "cloudfront",
      "create-invalidation",
      "--distribution-id",
      cloudFrontDistributionId,
      "--paths",
      `/${publishPrefix.replace(/^\/+|\/+$/g, "")}/*`,
    ]);
  }
}

console.log("\nDaily softball update complete.");
