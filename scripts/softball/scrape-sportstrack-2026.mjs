import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalizeName,
  ensureDir,
  normalizeHeader,
  parseAttributes,
  parseHtmlTables,
  slugify,
  stripTags,
  uniqueBy,
  writeJson,
} from "./shared.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..", "..");
const rawRoot = resolve(projectRoot, "data", "softball", "raw", "2026");
const teamsDir = resolve(rawRoot, "sportstrack", "teams");
const playersDir = resolve(rawRoot, "sportstrack", "players");
const boxScoresDir = resolve(rawRoot, "sportstrack", "box-scores");
const rawStatePath = resolve(rawRoot, "sportstrack-state.json");
const rawGameStatsPath = resolve(rawRoot, "sportstrack-player-game-stats.json");

const baseUrl = "https://lvc.sportstrack.app";
const sport = "softball";
const eventId = "145";
const seasonId = "302";
const season = 2026;

const args = new Set(process.argv.slice(2));
const force = args.has("--force");
const dryRun = args.has("--dry-run");

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeText(filePath, value) {
  ensureDir(filePath);
  writeFileSync(filePath, value, "utf8");
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "sports-talk-tools softball scraper",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }

  return response.text();
}

function normalizeUrl(url) {
  if (!url) {
    return "";
  }
  return new URL(url, baseUrl).toString();
}

function parseUsDate(value) {
  const match = String(value ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) {
    return "";
  }

  const [, month, day, rawYear] = match;
  const fullYear = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function numberValue(value) {
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!text) {
    return 0;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rate(numerator, denominator) {
  if (!denominator) {
    return "";
  }
  return (numerator / denominator).toFixed(3);
}

function findLinks(html, pattern) {
  const links = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = parseAttributes(match[1]);
    const href = normalizeUrl(attrs.href);
    if (!href || !pattern.test(href)) {
      continue;
    }
    links.push({
      href,
      text: stripTags(match[2]),
    });
  }
  return links;
}

function parseTeamsFromTeamsPage(html) {
  const teamNames = uniqueBy(
    [...html.matchAll(/<option class="notranslate"\s+value="([^"]+)">/gi)].map((match) => stripTags(match[1])),
    (name) => name
  ).filter((name) => name && name !== "Free Agents");
  const rosterUrls = uniqueBy(
    findLinks(html, /\/softball\/teams\/[^/]+\/roster/i)
      .map((link) => link.href)
      .filter((href) => !/\/teams\/\/roster/i.test(href)),
    (href) => href.match(/\/teams\/([^/]+)\/roster/i)?.[1] ?? href
  );

  return teamNames
    .map((teamName, index) => {
      const rosterUrl = rosterUrls[index] ?? "";
      const teamId = rosterUrl.match(/\/teams\/([^/]+)\/roster/i)?.[1] ?? "";
      return {
        sportstrack_team_id: teamId,
        team_name: teamName,
        team_slug: slugify(teamName),
        roster_url: rosterUrl,
        stats_url: rosterUrl.replace(/\/roster$/i, "/stats"),
      };
    })
    .filter((team) => team.sportstrack_team_id && team.roster_url);
}

function parsePlayersForTeam(team, rosterHtml) {
  const players = [];

  for (const match of rosterHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = match[1];
    const statsHref = rowHtml.match(/href="([^"]+\/stats\?[^"]+)"/i)?.[1] ?? "";
    if (!statsHref) {
      continue;
    }

    const table = parseHtmlTables(`<table><tr>${rowHtml}</tr></table>`)[0];
    const cells = table?.rows?.[0]?.cells ?? [];
    const playerName = stripTags(rowHtml.match(/<span class="notranslate">([\s\S]*?)<\/span>/i)?.[1] ?? cells[0] ?? "");
    const playerNumber = cells[1] ?? "";
    const status = cells[2] ?? "";
    const statsUrl = normalizeUrl(statsHref);
    const rosterId = new URL(statsUrl).searchParams.get("rosterId") ?? "";
    const playerParam = new URL(statsUrl).searchParams.get("player") ?? "";

    if (!playerName || !rosterId) {
      continue;
    }

    players.push({
      ...team,
      roster_id: rosterId,
      player_param: playerParam,
      player_name: playerName,
      canonical_player_name: canonicalizeName(playerName),
      player_number: playerNumber,
      player_status: status,
      player_url: statsUrl,
    });
  }

  return uniqueBy(players, (player) => player.roster_id);
}

function parseScheduleRows(html) {
  const scheduleRows = [];

  for (const table of parseHtmlTables(html)) {
    const headers = table.headers.map(normalizeHeader);
    if (!headers.includes("date") || !headers.includes("id")) {
      continue;
    }

    for (const row of table.rows) {
      const gameId = row.cells[headers.indexOf("id")] ?? row.cells.at(-1) ?? "";
      const dateLabel = row.cells[headers.indexOf("date")] ?? "";
      const gameDate = parseUsDate(dateLabel);
      const teamNames = row.attrs["data-teams"] ? row.attrs["data-teams"].split(",").map((value) => value.trim()) : [];
      const awayTeam = row.cells[headers.indexOf("visitor")] ?? teamNames[1] ?? "";
      const homeTeam = row.cells[headers.indexOf("home")] ?? teamNames[0] ?? "";

      if (!gameId || !gameDate) {
        continue;
      }

      scheduleRows.push({
        season,
        game_id: gameId,
        game_date: gameDate,
        date_label: dateLabel,
        day_label: row.cells[headers.indexOf("day")] ?? "",
        time_label: row.cells[headers.indexOf("time")] ?? "",
        location: row.cells[headers.indexOf("location")] ?? "",
        away_team: awayTeam,
        home_team: homeTeam,
        away_score: row.cells[headers.lastIndexOf("score")] ?? "",
        home_score: row.cells[headers.indexOf("score")] ?? "",
        status: row.cells[headers.indexOf("status")] ?? "",
        box_score_url: `${baseUrl}/${sport}/seasons/${seasonId}/box-scores/${gameId}`,
        raw_row: row.cells.join(" | "),
      });
    }
  }

  return uniqueBy(scheduleRows, (row) => row.game_id);
}

function parsePlayerGameStats(player, statsHtml, scheduleByGameId) {
  const table = parseHtmlTables(statsHtml).find((candidate) => {
    const headers = candidate.headers.map(normalizeHeader);
    return headers.includes("opponent") && headers.includes("g") && headers.includes("ab");
  });

  if (!table) {
    return [];
  }

  const headers = table.headers.map(normalizeHeader);
  const output = [];

  for (const row of table.rows) {
    const record = {};
    headers.forEach((header, index) => {
      record[header || `col_${index + 1}`] = row.cells[index] ?? "";
    });

    const gameId = record.g ?? "";
    const scheduleRow = scheduleByGameId.get(gameId);
    if (!gameId || !scheduleRow) {
      continue;
    }

    output.push({
      season,
      game_id: gameId,
      game_date: scheduleRow.game_date,
      team_id: `${season}_${player.team_slug}`,
      historical_team_id: player.team_slug,
      team_name: player.team_name,
      sportstrack_team_id: player.sportstrack_team_id,
      player_id: `${season}_${player.team_slug}_${slugify(player.roster_id)}`,
      canonical_player_id: slugify(player.canonical_player_name),
      historical_player_id: slugify(player.canonical_player_name),
      player_name: player.player_name,
      canonical_player_name: player.canonical_player_name,
      roster_id: player.roster_id,
      player_url: player.player_url,
      opponent: record.opponent ?? "",
      game_type: record.type ?? "",
      ...record,
    });
  }

  return output;
}

function aggregatePlayerStats(gameStats) {
  const grouped = new Map();

  for (const row of gameStats) {
    const key = `${row.team_id}__${row.roster_id}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        season: row.season,
        team_id: row.team_id,
        historical_team_id: row.historical_team_id,
        team_name: row.team_name,
        player_id: row.player_id,
        canonical_player_id: row.canonical_player_id,
        historical_player_id: row.historical_player_id,
        player_name: row.player_name,
        canonical_player_name: row.canonical_player_name,
        player_url: row.player_url,
        g: 0,
        gp: 0,
        pa: 0,
        ab: 0,
        r: 0,
        h: 0,
        "1b": 0,
        "2b": 0,
        "3b": 0,
        hr: 0,
        rbi: 0,
        bb: 0,
        ibb: 0,
        obe: 0,
        sf: 0,
        k: 0,
        fc: 0,
        source: "sportstrack",
      });
    }

    const aggregate = grouped.get(key);
    aggregate.g += 1;
    for (const stat of ["gp", "pa", "ab", "r", "h", "1b", "2b", "3b", "hr", "rbi", "bb", "ibb", "obe", "sf", "k", "fc"]) {
      aggregate[stat] += numberValue(row[stat]);
    }
  }

  return [...grouped.values()].map((row) => {
    const totalBases = row["1b"] + row["2b"] * 2 + row["3b"] * 3 + row.hr * 4;
    const obpDenominator = row.ab + row.bb + row.ibb + row.obe + row.sf;
    return {
      ...row,
      avg: rate(row.h, row.ab),
      obp: rate(row.h + row.bb + row.ibb + row.obe, obpDenominator),
      slg: rate(totalBases, row.ab),
      ops:
        row.ab || obpDenominator
          ? (numberValue(rate(row.h + row.bb + row.ibb + row.obe, obpDenominator)) + numberValue(rate(totalBases, row.ab))).toFixed(3)
          : "",
      tb: totalBases,
    };
  });
}

function mergeGameStats(existingRows, nextRows) {
  const combined = uniqueBy([...existingRows, ...nextRows], (row) => `${row.roster_id}__${row.game_id}`);
  combined.sort((left, right) =>
    `${left.game_date}__${left.team_name}__${left.player_name}`.localeCompare(
      `${right.game_date}__${right.team_name}__${right.player_name}`
    )
  );
  return combined;
}

async function main() {
  const state = readJson(rawStatePath, {
    season,
    eventId,
    seasonId,
    lastScrapedGameDate: "",
    scrapedGameIds: [],
  });

  const lastScrapedGameDate = force ? "" : state.lastScrapedGameDate || "";
  const teamsHtml = await fetchText(`${baseUrl}/${sport}/ajax/seasons/${seasonId}/teams?page=teams`);
  const scheduleHtml = await fetchText(`${baseUrl}/${sport}/ajax/seasons/${seasonId}/schedule?page=schedule`);
  const teams = parseTeamsFromTeamsPage(teamsHtml);
  const scheduleRows = parseScheduleRows(scheduleHtml);
  const completedGames = scheduleRows.filter((row) => row.away_score !== "" && row.home_score !== "");
  const scrapedGameIds = new Set(force ? [] : state.scrapedGameIds ?? []);
  const gamesToScrape = completedGames.filter(
    (row) => !scrapedGameIds.has(row.game_id) && (!lastScrapedGameDate || row.game_date >= lastScrapedGameDate)
  );
  const scheduleByGameId = new Map(scheduleRows.map((row) => [row.game_id, row]));
  const targetGameIds = new Set(gamesToScrape.map((row) => row.game_id));

  console.log(`Found ${teams.length} teams and ${completedGames.length} completed games.`);
  console.log(force ? "Force mode: re-scraping all completed games." : `Scraping games after ${lastScrapedGameDate || "start"}.`);

  if (dryRun) {
    console.log(`Dry run would scrape ${gamesToScrape.length} games.`);
    return;
  }

  if (gamesToScrape.length === 0 && !force) {
    console.log("No new completed games to scrape.");
    return;
  }

  writeText(resolve(rawRoot, "teams_page.html"), teamsHtml);
  writeText(resolve(rawRoot, "schedule.html"), scheduleHtml);
  writeJson(resolve(rawRoot, "sportstrack-schedule.json"), scheduleRows);

  const players = [];
  for (const team of teams) {
    const rosterHtml = await fetchText(team.roster_url);
    writeText(resolve(teamsDir, `${team.team_slug}.html`), rosterHtml);
    players.push(...parsePlayersForTeam(team, rosterHtml));
  }

  const existingGameStats = force ? [] : readJson(rawGameStatsPath, []);
  const nextGameStats = [];

  for (const player of players) {
    const playerStatsUrl = `${player.stats_url}/v2?report=batting&player=${encodeURIComponent(player.player_param)}&rosterId=${encodeURIComponent(player.roster_id)}`;
    const statsHtml = await fetchText(playerStatsUrl);
    writeText(resolve(playersDir, `${player.team_slug}_${slugify(player.roster_id)}.html`), statsHtml);
    const playerRows = parsePlayerGameStats(player, statsHtml, scheduleByGameId).filter((row) =>
      targetGameIds.has(row.game_id)
    );
    nextGameStats.push(...playerRows);
    console.log(`${player.team_name} / ${player.player_name}: ${playerRows.length} new game rows`);
  }

  for (const game of gamesToScrape) {
    try {
      const boxScoreHtml = await fetchText(game.box_score_url);
      writeText(resolve(boxScoresDir, `${game.game_id}.html`), boxScoreHtml);
    } catch (error) {
      console.warn(`Could not save box score ${game.game_id}: ${error.message}`);
    }
  }

  const mergedGameStats = mergeGameStats(existingGameStats, nextGameStats);
  const aggregated = aggregatePlayerStats(mergedGameStats);
  const maxScrapedDate = mergedGameStats.reduce(
    (maxDate, row) => (row.game_date > maxDate ? row.game_date : maxDate),
    state.lastScrapedGameDate || ""
  );

  writeJson(rawGameStatsPath, mergedGameStats);
  writeJson(resolve(rawRoot, "sportstrack-player-season-stats.json"), aggregated);
  writeJson(resolve(rawRoot, "sportstrack-rosters.json"), players);
  writeJson(rawStatePath, {
    season,
    eventId,
    seasonId,
    sourceUrl: `${baseUrl}/${sport}/events/${eventId}/teams?season_id=${seasonId}`,
    generatedAt: new Date().toISOString(),
    lastScrapedGameDate: maxScrapedDate,
    scrapedGameIds: [...new Set([...scrapedGameIds, ...gamesToScrape.map((row) => row.game_id), ...mergedGameStats.map((row) => row.game_id)])].sort(),
    teamCount: teams.length,
    playerCount: players.length,
    gameStatRows: mergedGameStats.length,
  });

  console.log(`Saved ${nextGameStats.length} new player-game rows.`);
  console.log(`Raw data pool now has ${mergedGameStats.length} player-game rows and ${aggregated.length} player season rows.`);
  console.log(`Last scraped game date: ${maxScrapedDate || "none"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
