import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeUniqueHeaders, normalizeHeader, parseAttributes, parseHtmlTables, stripTags } from "./shared.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const rawRoot = resolve(projectRoot, "data", "softball", "raw");
const processedRoot = resolve(projectRoot, "data", "softball", "processed");

const season = process.argv[2] ?? "2025";
const playerFilter = String(process.argv.slice(3).join(" ") ?? "").trim().toUpperCase();

function extractPlayerRows(html) {
  const rows = [];
  for (const match of html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const attrs = parseAttributes(match[1]);
    if (!attrs["data-team"]) {
      continue;
    }

    const rowHtml = match[2];
    const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cellMatch) =>
      stripTags(cellMatch[1])
    );
    const playerName = stripTags(
      rowHtml.match(/<a class="player-link"[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? ""
    );

    rows.push({
      team: attrs["data-team"] ?? "",
      playerName,
      cells,
    });
  }

  return rows;
}

function buildHeaders(html) {
  const tables = parseHtmlTables(html);
  for (const table of tables) {
    const headers = makeUniqueHeaders(
      table.headers.map((header, index) => normalizeHeader(header) || `col_${index + 1}`)
    );
    if (headers.includes("player") || headers.includes("name")) {
      return headers;
    }
  }
  return [];
}

function main() {
  const inputPath = resolve(rawRoot, season, "players_table.html");
  const outputPath = resolve(processedRoot, `players_table_debug_${season}.txt`);
  const html = readFileSync(inputPath, "utf8");
  const headers = buildHeaders(html);
  const rows = extractPlayerRows(html).filter((row) =>
    playerFilter ? row.playerName.toUpperCase().includes(playerFilter) : true
  );

  const lines = [
    `Season: ${season}`,
    `Headers (${headers.length}): ${headers.join(", ")}`,
    `Rows matched: ${rows.length}`,
    "",
  ];

  for (const row of rows) {
    lines.push(`PLAYER: ${row.playerName}`);
    lines.push(`TEAM: ${row.team}`);
    lines.push(`CELL COUNT: ${row.cells.length}`);
    headers.forEach((header, index) => {
      lines.push(`${header}: ${row.cells[index] ?? ""}`);
    });
    if (row.cells.length > headers.length) {
      lines.push("EXTRA CELLS:");
      row.cells.slice(headers.length).forEach((value, index) => {
        lines.push(`extra_${index + 1}: ${value}`);
      });
    }
    lines.push("");
  }

  mkdirSync(processedRoot, { recursive: true });
  writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${rows.length} debug rows to ${outputPath}`);
}

main();
