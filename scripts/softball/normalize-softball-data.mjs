import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalizeName,
  makeUniqueHeaders,
  normalizeHeader,
  parseAttributes,
  parseHtmlTables,
  slugify,
  stripTags,
  uniqueBy,
  writeCsv,
  writeJson,
} from "./shared.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const rawRoot = resolve(projectRoot, "data", "softball", "raw");
const processedRoot = resolve(projectRoot, "data", "softball", "processed");

const seasonArgs = process.argv.slice(2);
const seasons = seasonArgs.length > 0 ? seasonArgs : ["2025", "2024", "2023"];

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function parseRecordLabel(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return {
      record_label: "",
      wins: "",
      losses: "",
      ties: "",
    };
  }

  const [wins = "", losses = "", ties = ""] = text.split("-");
  return {
    record_label: text,
    wins,
    losses,
    ties,
  };
}

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
    const playerHref =
      rowHtml.match(/<a class="player-link" href="([^"]+)"/i)?.[1] ?? "";
    const playerName = stripTags(
      rowHtml.match(/<a class="player-link"[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? ""
    );

    rows.push({
      attrs,
      cells,
      playerHref,
      playerName,
    });
  }

  return rows;
}

function buildPlayerHeaders(html) {
  const tables = parseHtmlTables(html);
  for (const table of tables) {
    const normalized = table.headers.map(normalizeHeader);
    const uniqueHeaders = makeUniqueHeaders(
      normalized.map((header, index) => header || `col_${index + 1}`)
    );
    if (uniqueHeaders.includes("player") || uniqueHeaders.includes("name")) {
      return uniqueHeaders;
    }
  }

  return [];
}

function buildPlayerRecords(season, html) {
  const headers = buildPlayerHeaders(html);
  const rows = extractPlayerRows(html);

  const playerRecords = rows.map((row, index) => {
    const teamName = row.attrs["data-team"] ?? "";
    const playerName = row.playerName || row.cells[1] || "";
    const canonicalPlayerName = canonicalizeName(playerName);
    const historicalTeamId = slugify(teamName);
    const teamId = `${season}_${historicalTeamId}`;
    const playerKey =
      row.playerHref.match(/player=([^&]+)/i)?.[1] ?? `${teamId}_${slugify(playerName)}`;
    const playerId = `${season}_${historicalTeamId}_${slugify(playerKey)}`;
    const canonicalPlayerId = canonicalPlayerName
      ? slugify(canonicalPlayerName)
      : `unknown_${index + 1}`;

    const base = {
      season: Number(season),
      team_id: teamId,
      historical_team_id: historicalTeamId,
      team_name: teamName,
      player_id: playerId,
      canonical_player_id: canonicalPlayerId,
      historical_player_id: canonicalPlayerId,
      player_name: playerName,
      canonical_player_name: canonicalPlayerName,
      player_url: row.playerHref,
    };

    const stats = {};
    headers.forEach((header, headerIndex) => {
      stats[header || `col_${headerIndex + 1}`] = row.cells[headerIndex] ?? "";
    });

    return {
      base,
      stats,
      reviewNeeded:
        !playerName ||
        canonicalPlayerName.startsWith("SUB") ||
        canonicalPlayerName === "" ||
        row.playerHref === "",
    };
  });

  return {
    headers,
    playerRecords,
  };
}

function buildTeamsFromPlayerRecords(season, playerRecords) {
  const teams = playerRecords
    .map((record) => ({
      season: Number(season),
      team_id: record.base.team_id,
      historical_team_id: record.base.historical_team_id,
      team_name: record.base.team_name,
      team_slug: record.base.team_id.replace(`${season}_`, ""),
      source_file: "",
      record_label: "",
      wins: "",
      losses: "",
      ties: "",
    }))
    .filter((row) => row.team_name);

  return uniqueBy(teams, (row) => row.team_id);
}

function discoverTeamRows(seasonDir, season) {
  const manifestPath = resolve(seasonDir, "manifest.json");
  const teamsDir = resolve(seasonDir, "teams");
  const rows = [];

  if (existsSync(manifestPath)) {
    const manifest = readJson(manifestPath);
    const teamLinks = manifest?.discovered?.teamLinks ?? [];
    for (const teamLink of teamLinks) {
      const rawName = teamLink.split(`valhalla${season}_`)[1] ?? "";
      const teamName = decodeURIComponent(rawName).trim();
      const teamSlug = slugify(teamName);
      rows.push({
        season: Number(season),
        team_id: `${season}_${teamSlug}`,
        historical_team_id: teamSlug,
        team_name: teamName,
        team_slug: teamSlug,
        source_file: "",
        record_label: "",
        wins: "",
        losses: "",
        ties: "",
      });
    }
  }

  if (existsSync(teamsDir)) {
    for (const fileName of readdirSync(teamsDir).filter((name) => name.endsWith(".html"))) {
      const teamSlug = fileName.replace(/\.html$/i, "");
      const html = readText(resolve(teamsDir, fileName));
      const teamName =
        stripTags(html.match(/<h1 class="team-name">\s*([\s\S]*?)<span class="team-record">/i)?.[1] ?? "") ||
        stripTags(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "") ||
        teamSlug.replace(/_/g, " ").toUpperCase();
      const recordLabel = stripTags(html.match(/<span class="team-record">([\s\S]*?)<\/span>/i)?.[1] ?? "");

      rows.push({
        season: Number(season),
        team_id: `${season}_${teamSlug}`,
        historical_team_id: teamSlug,
        team_name: teamName,
        team_slug: teamSlug,
        source_file: fileName,
        ...parseRecordLabel(recordLabel),
      });
    }
  }

  return uniqueBy(rows, (row) => row.team_id);
}

function discoverGamesFromTeamPages(seasonDir, season) {
  const teamsDir = resolve(seasonDir, "teams");
  if (!existsSync(teamsDir)) {
    return [];
  }

  const games = [];

  for (const fileName of readdirSync(teamsDir).filter((name) => name.endsWith(".html"))) {
    const html = readText(resolve(teamsDir, fileName));
    const tables = parseHtmlTables(html);
    const teamSlug = fileName.replace(/\.html$/i, "");
    const teamId = `${season}_${teamSlug}`;

    for (const table of tables) {
      const normalizedHeaders = table.headers.map(normalizeHeader);
      const hasDate = normalizedHeaders.includes("date");
      const hasOpponent = normalizedHeaders.includes("opponent") || normalizedHeaders.includes("opp");

      if (!hasDate || !hasOpponent) {
        continue;
      }

      for (const row of table.rows) {
        if (row.cells.length === 0) {
          continue;
        }

        const record = {
          season: Number(season),
          source_team_id: teamId,
          game_key: `${season}_${teamSlug}_${slugify(row.cells.join("_").slice(0, 80))}`,
          date_label: row.cells[normalizedHeaders.indexOf("date")] ?? "",
          opponent: row.cells[
            normalizedHeaders.includes("opponent")
              ? normalizedHeaders.indexOf("opponent")
              : normalizedHeaders.indexOf("opp")
          ] ?? "",
          raw_row: row.cells.join(" | "),
        };

        games.push(record);
      }
    }
  }

  return uniqueBy(games, (game) => game.game_key);
}

function main() {
  const allTeams = [];
  const allPlayers = [];
  const allPlayerStats = [];
  const allGames = [];
  const reviewRows = [];
  const summary = [];

  for (const season of seasons) {
    const seasonDir = resolve(rawRoot, season);
    const playersTablePath = resolve(seasonDir, "players_table.html");
    const leadersPath = resolve(seasonDir, "leaders_xhr.html");

    const sourcePath = existsSync(playersTablePath) ? playersTablePath : leadersPath;

    if (!existsSync(sourcePath)) {
      summary.push({
        season: Number(season),
        skipped: true,
        reason: `Missing raw player table file: ${sourcePath}`,
      });
      continue;
    }

    const leadersHtml = readText(sourcePath);
    const { headers, playerRecords } = buildPlayerRecords(season, leadersHtml);
    const teams = discoverTeamRows(seasonDir, season);
    const derivedTeams = teams.length > 0 ? teams : buildTeamsFromPlayerRecords(season, playerRecords);
    const games = discoverGamesFromTeamPages(seasonDir, season);

    allTeams.push(...derivedTeams);
    allGames.push(...games);

    for (const record of playerRecords) {
      allPlayers.push(record.base);
      allPlayerStats.push({
        ...record.base,
        ...record.stats,
      });

      if (record.reviewNeeded) {
        reviewRows.push({
          season: Number(season),
          player_name: record.base.player_name,
          canonical_player_name: record.base.canonical_player_name,
          team_name: record.base.team_name,
          reason: "manual_review_needed",
          player_url: record.base.player_url,
        });
      }
    }

    summary.push({
      season: Number(season),
      teamCount: derivedTeams.length,
      playerCount: playerRecords.length,
      playerHeaderCount: headers.length,
      discoveredGameRows: games.length,
      reviewCount: playerRecords.filter((record) => record.reviewNeeded).length,
      usedDerivedTeams: teams.length === 0,
      sourceFile: sourcePath,
    });
  }

  const players = uniqueBy(allPlayers, (row) => `${row.season}_${row.player_id}`);
  const teams = uniqueBy(allTeams, (row) => row.team_id);
  const games = uniqueBy(allGames, (row) => row.game_key);
  const normalizedPlayerStatsHeaders = uniqueBy(
    allPlayerStats.flatMap((row) => Object.keys(row)),
    (key) => key
  );

  writeCsv(resolve(processedRoot, "teams.csv"), [
    "season",
    "team_id",
    "historical_team_id",
    "team_name",
    "team_slug",
    "source_file",
    "record_label",
    "wins",
    "losses",
    "ties",
  ], teams);
  writeCsv(resolve(processedRoot, "players.csv"), [
    "season",
    "team_id",
    "historical_team_id",
    "team_name",
    "player_id",
    "canonical_player_id",
    "historical_player_id",
    "player_name",
    "canonical_player_name",
    "player_url",
  ], players);
  writeCsv(resolve(processedRoot, "player_stats.csv"), normalizedPlayerStatsHeaders, allPlayerStats);
  writeCsv(resolve(processedRoot, "games.csv"), [
    "season",
    "source_team_id",
    "game_key",
    "date_label",
    "opponent",
    "raw_row",
  ], games);
  writeCsv(resolve(processedRoot, "player_review.csv"), [
    "season",
    "player_name",
    "canonical_player_name",
    "team_name",
    "reason",
    "player_url",
  ], reviewRows);
  writeJson(resolve(processedRoot, "normalization-summary.json"), {
    generatedAt: new Date().toISOString(),
    seasons: summary,
  });

  console.log(`Normalized ${players.length} player rows across ${teams.length} teams.`);
}

main();
