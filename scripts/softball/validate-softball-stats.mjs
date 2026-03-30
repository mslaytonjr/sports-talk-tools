import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, toNumber, toRate, writeCsv, writeJson } from "./shared.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const processedRoot = resolve(projectRoot, "data", "softball", "processed");
const inputRoot = resolve(projectRoot, "data", "softball", "inputs");

function readCsvFile(filePath) {
  return parseCsv(readFileSync(filePath, "utf8"));
}

function getManualReviewMap() {
  const reviewPath = resolve(inputRoot, "historical_player_review.csv");
  try {
    const rows = readCsvFile(reviewPath);
    return new Map(
      rows.map((row) => [
        `${row.season ?? ""}__${row.historical_player_id ?? row.canonical_player_id ?? ""}`,
        row,
      ])
    );
  } catch {
    return new Map();
  }
}

function validateRow(row, manualReviewMap) {
  const reasons = [];
  const ab = toNumber(row.ab);
  const pa = toNumber(row.pa);
  const h = toNumber(row.h);
  const singles = toNumber(row["1b"]);
  const doubles = toNumber(row["2b"]);
  const triples = toNumber(row["3b"]);
  const homeRuns = toNumber(row.hr);
  const avg = toRate(row.avg);
  const obp = toRate(row.obp);
  const slg = toRate(row.slg);
  const ops = toRate(row.ops);
  const sample = pa ?? ab;
  const canonicalName = String(row.canonical_player_name ?? "").trim();

  if (!canonicalName) {
    reasons.push("missing_name");
  }
  if (canonicalName.startsWith("SUB")) {
    reasons.push("sub_placeholder");
  }
  if (ab != null && h != null && h > ab) {
    reasons.push("hits_exceed_at_bats");
  }
  if (
    h != null &&
    [singles, doubles, triples, homeRuns].every((value) => value != null) &&
    (singles ?? 0) + (doubles ?? 0) + (triples ?? 0) + (homeRuns ?? 0) > h
  ) {
    reasons.push("hit_breakdown_exceeds_hits");
  }
  if (avg != null && (avg < 0 || avg > 1)) {
    reasons.push("avg_out_of_range");
  }
  if (obp != null && (obp < 0 || obp > 1.2)) {
    reasons.push("obp_out_of_range");
  }
  if (slg != null && (slg < 0 || slg > 4)) {
    reasons.push("slg_out_of_range");
  }
  if (ops != null && (ops < 0 || ops > 5)) {
    reasons.push("ops_out_of_range");
  }
  if (sample != null && sample > 120) {
    reasons.push("sample_outlier");
  }
  if (sample == null && avg == null && obp == null && slg == null && ops == null) {
    reasons.push("empty_stat_shell");
  }

  let rowQuality = "trusted";
  if (
    reasons.some((reason) =>
      [
        "missing_name",
        "sub_placeholder",
        "avg_out_of_range",
        "obp_out_of_range",
        "slg_out_of_range",
        "ops_out_of_range",
        "empty_stat_shell",
      ].includes(reason)
    )
  ) {
    rowQuality = "rejected";
  } else if (reasons.length > 0) {
    rowQuality = "questionable";
  }

  const manualReview = manualReviewMap.get(
    `${row.season ?? ""}__${row.historical_player_id ?? row.canonical_player_id ?? ""}`
  );
  if (manualReview) {
    const action = String(manualReview.action ?? "").trim().toLowerCase();
    if (action === "trust") {
      rowQuality = "trusted";
    } else if (action === "reject" || action === "exclude") {
      rowQuality = "rejected";
    }
  }

  return {
    ...row,
    row_quality: rowQuality,
    validation_reasons: reasons.join("|"),
    manual_review_action: manualReview?.action ?? "",
    manual_review_notes: manualReview?.notes ?? "",
    stats_display_allowed:
      rowQuality === "trusted" &&
      sample != null &&
      sample >= 10 &&
      avg != null &&
      obp != null &&
      slg != null &&
      ops != null &&
      !reasons.includes("hits_exceed_at_bats") &&
      !reasons.includes("hit_breakdown_exceeds_hits")
        ? "yes"
        : "no",
  };
}

function main() {
  const rows = readCsvFile(resolve(processedRoot, "player_stats.csv"));
  const manualReviewMap = getManualReviewMap();
  const validated = rows.map((row) => validateRow(row, manualReviewMap));
  const trusted = validated.filter((row) => row.row_quality === "trusted");
  const rejected = validated.filter((row) => row.row_quality === "rejected");
  const review = validated.filter((row) => row.row_quality !== "trusted");
  const headers = [...new Set(validated.flatMap((row) => Object.keys(row)))];

  writeCsv(resolve(processedRoot, "player_stats_validated.csv"), headers, validated);
  writeCsv(resolve(processedRoot, "player_stats_trusted.csv"), headers, trusted);
  writeCsv(resolve(processedRoot, "player_stats_rejected.csv"), headers, rejected);
  writeCsv(resolve(processedRoot, "player_stats_review.csv"), headers, review);
  writeJson(resolve(processedRoot, "player_stats_validation_summary.json"), {
    generatedAt: new Date().toISOString(),
    totalRows: validated.length,
    trustedRows: trusted.length,
    questionableRows: validated.filter((row) => row.row_quality === "questionable").length,
    rejectedRows: rejected.length,
  });

  console.log(`Validated ${validated.length} softball stat rows.`);
}

main();
