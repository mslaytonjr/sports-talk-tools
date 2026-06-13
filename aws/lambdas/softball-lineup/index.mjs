import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_SEASON = "2026";
const DEFAULT_REPORTS_PREFIX = "softball";

let s3ModulePromise = null;
let s3Client = null;

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeName(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDecimal(value, digits = 3) {
  return toNumber(value).toFixed(digits);
}

function formatPct(value, digits = 0) {
  return `${(toNumber(value) * 100).toFixed(digits)}%`;
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function pickVariant(seed, variants) {
  return variants[hashString(seed) % variants.length];
}

function jsonHeaders() {
  return {
    "content-type": "application/json",
  };
}

function response(statusCode, payload) {
  return {
    statusCode,
    headers: jsonHeaders(),
    body: JSON.stringify(payload, null, 2),
  };
}

async function getS3() {
  if (!s3ModulePromise) {
    s3ModulePromise = import("@aws-sdk/client-s3");
  }
  const module = await s3ModulePromise;
  if (!s3Client) {
    s3Client = new module.S3Client({});
  }
  return { s3: s3Client, ...module };
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readReportFromS3(team, season) {
  const bucket = process.env.SOFTBALL_REPORTS_BUCKET;
  if (!bucket) {
    return null;
  }

  const prefix = process.env.SOFTBALL_REPORTS_PREFIX ?? DEFAULT_REPORTS_PREFIX;
  const key = `${prefix.replace(/\/$/, "")}/team_reports/${slugify(team)}_${season}.json`;
  const { s3, GetObjectCommand } = await getS3();
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return JSON.parse(await streamToString(result.Body));
}

function readReportFromLocal(team, season) {
  const reportPath = resolve(
    process.cwd(),
    "data",
    "softball",
    "processed",
    "team_reports",
    `${slugify(team)}_${season}.json`
  );
  if (!existsSync(reportPath)) {
    return null;
  }
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

async function loadReport(team, season) {
  const s3Report = await readReportFromS3(team, season);
  if (s3Report) {
    return s3Report;
  }
  const localReport = readReportFromLocal(team, season);
  if (localReport) {
    return localReport;
  }
  throw new Error(`Could not load report for ${team} ${season}.`);
}

function mergePlayerSignals(report) {
  const derivedByName = new Map((report.player_derived_stats ?? []).map((row) => [row.player_name, row]));
  const directionByName = new Map((report.player_direction_stats ?? []).map((row) => [row.player_name, row]));

  return (report.best_full_order_if_everyone_shows ?? []).map((player) => ({
    ...player,
    ...(derivedByName.get(player.player_name) ?? {}),
    hit_direction_profile: directionByName.get(player.player_name) ?? null,
  }));
}

function scoreLeadoff(player) {
  return (
    toNumber(player.obp) * 0.42 +
    toNumber(player.productive_pa_percentage) * 0.25 +
    toNumber(player.out_avoidance) * 0.2 +
    toNumber(player.hit_game_percentage) * 0.08 +
    toNumber(player.projected_offense_index) * 0.05
  );
}

function scoreRunProducer(player) {
  return (
    toNumber(player.projected_offense_index) * 0.34 +
    toNumber(player.slg) * 0.24 +
    toNumber(player.iso) * 0.18 +
    toNumber(player.xbh_percentage) * 0.14 +
    toNumber(player.xbh_game_percentage) * 0.1
  );
}

function scoreContactBridge(player) {
  return (
    toNumber(player.obp) * 0.28 +
    toNumber(player.avg) * 0.24 +
    toNumber(player.productive_pa_percentage) * 0.22 +
    toNumber(player.out_avoidance) * 0.16 +
    toNumber(player.projected_offense_index) * 0.1
  );
}

function takeBest(players, used, scoreFn) {
  const choices = players.filter((player) => !used.has(player.player_name));
  choices.sort((left, right) => scoreFn(right) - scoreFn(left));
  const selected = choices[0];
  if (selected) {
    used.add(selected.player_name);
  }
  return selected;
}

function profileFlags(player) {
  return {
    eliteObp: toNumber(player.obp) >= 0.52,
    solidObp: toNumber(player.obp) >= 0.45,
    highAverage: toNumber(player.avg) >= 0.48,
    power: toNumber(player.slg) >= 0.6 || toNumber(player.iso) >= 0.18,
    gapPower: toNumber(player.iso) >= 0.1 || toNumber(player.xbh_percentage) >= 0.18,
    consistent: toNumber(player.hit_game_percentage) >= 0.8,
    multiHit: toNumber(player.multi_hit_game_percentage) >= 0.6,
    xbhGames: toNumber(player.xbh_game_percentage) >= 0.5,
    lowOutAvoidance: toNumber(player.out_avoidance) < 0.32,
  };
}

function compactReason(player, role) {
  const obp = formatDecimal(player.obp);
  const slg = formatDecimal(player.slg);
  const productive = formatPct(player.productive_pa_percentage);
  const xbhGame = formatPct(player.xbh_game_percentage);
  const hitGame = formatPct(player.hit_game_percentage);
  const iso = formatDecimal(player.iso);
  const avg = formatDecimal(player.avg);
  const flags = profileFlags(player);
  const seed = `${player.player_name}:${role}:${player.projected_offense_index}`;

  if (role === "table-setter") {
    if (flags.eliteObp && flags.consistent) {
      return pickVariant(seed, [
        `This is the cleanest leadoff profile on the board: ${obp} OBP, ${productive} productive PA, and a hit in ${hitGame} of 2026 games.`,
        `Set the table with him. The ${obp} OBP and ${hitGame} hit-game rate give the top of the order the best chance to start with traffic.`,
        `He gives the lineup its best first-inning floor: ${obp} OBP, ${productive} productive PA, and consistent contact all season.`,
      ]);
    }
    return pickVariant(seed, [
      `Best table-setter fit: ${obp} OBP, ${productive} productive PA, and enough contact to turn the order over cleanly.`,
      `Lead him off for traffic. The ${obp} OBP and ${hitGame} hit-game rate are the best blend available after scratches.`,
      `He profiles best at the top: ${obp} OBP with ${productive} productive PA gives the bigger bats something to work with.`,
    ]);
  }
  if (role === "traffic") {
    if (flags.eliteObp || flags.highAverage) {
      return pickVariant(seed, [
        `Perfect two-hole job: get on base, avoid the empty out, and let the thump behind him cash it in. Current profile: ${obp} OBP, ${avg} AVG.`,
        `Put him in front of the hammer. The ${obp} OBP and ${productive} productive PA make him a traffic builder, not just a contact bat.`,
        `This spot is about giving the 3-hitter runners. He brings ${obp} OBP and a ${productive} productive-PA signal.`,
      ]);
    }
    return pickVariant(seed, [
      `Contact/traffic spot: ${obp} OBP with ${productive} productive PA before the main run producer.`,
      `He fits here because the profile is more table-setting than slugging: ${obp} OBP, ${productive} productive PA.`,
      `Use him as the bridge into the big bat. The ${productive} productive-PA mark is the key signal.`,
    ]);
  }
  if (role === "best bat") {
    return pickVariant(seed, [
      `Best bat in the available group. The ${obp} OBP, ${slg} SLG, and ${iso} ISO say he should hit with runners on, not empty bases.`,
      `This is the lineup's engine today: ${slg} SLG, ${iso} ISO, and XBHs in ${xbhGame} of 2026 games.`,
      `Anchor the first turn with him. He has the strongest run-production mix: ${obp} OBP, ${slg} SLG, ${iso} ISO.`,
    ]);
  }
  if (role === "rbi") {
    if (flags.power || flags.xbhGames) {
      return pickVariant(seed, [
        `Middle-order RBI fit. The ${slg} SLG and ${xbhGame} XBH-game rate are exactly what you want after the top three.`,
        `Keep the pressure on here. He brings real extra-base signal: ${iso} ISO, ${slg} SLG, ${xbhGame} XBH games.`,
        `This is a run-swing spot, and his profile fits it: ${slg} SLG with ${iso} ISO.`,
      ]);
    }
    return pickVariant(seed, [
      `RBI slot by balance more than pure power: ${slg} SLG, ${productive} productive PA, and enough bat score to protect the 3-hitter.`,
      `He is the best remaining run producer here, with ${slg} SLG and a projected bat score of ${formatDecimal(player.projected_offense_index)}.`,
      `Use him to extend the damage inning. The ${slg} SLG is the strongest remaining middle-order signal.`,
    ]);
  }
  if (role === "power") {
    if (flags.gapPower) {
      return pickVariant(seed, [
        `Extra-base/pressure bat: ${slg} SLG, ${iso} ISO, and enough gap signal to make pitchers work.`,
        `Good 5-hole fit. He is not just a singles bridge; the ${iso} ISO and ${xbhGame} XBH-game rate give this spot punch.`,
        `This keeps some damage potential after the cleanup spot: ${slg} SLG, ${iso} ISO.`,
      ]);
    }
    return pickVariant(seed, [
      `Best remaining pressure bat, even if it is more contact than thump: ${slg} SLG and ${productive} productive PA.`,
      `He fits here to keep the inning from flattening after the cleanup group: ${obp} OBP, ${slg} SLG.`,
      `Use him as the back half of the run-producing pocket. The profile is steady: ${avg} AVG, ${slg} SLG.`,
    ]);
  }
  if (role === "bridge") {
    return pickVariant(seed, [
      `Bridge bat: ${obp} OBP, ${productive} productive PA, keeps the inning moving.`,
      `Good sixth hitter because he can restart the inning instead of ending it: ${obp} OBP, ${productive} productive PA.`,
      `This is the turn-the-lineup-over pocket. He gives you ${obp} OBP and a contact-heavy profile.`,
    ]);
  }
  if (flags.lowOutAvoidance) {
    return pickVariant(seed, [
      `Depth spot for now. The model likes him less because the out-avoidance signal is light, but the goal here is to turn it back to the top.`,
      `Keep him lower until the on-base signal improves. Current markers: ${obp} OBP, ${slg} SLG, projected bat score ${formatDecimal(player.projected_offense_index)}.`,
      `This is a low-risk placement: let him hit, but do not ask this spot to carry the inning yet.`,
    ]);
  }
  return pickVariant(seed, [
    `Depth spot: projected bat score ${formatDecimal(player.projected_offense_index)}, ${obp} OBP, ${slg} SLG.`,
    `Lower-order fit with enough profile to keep the lineup connected: ${obp} OBP, ${productive} productive PA.`,
    `This is where the remaining signals fit best: ${avg} AVG, ${obp} OBP, projected bat score ${formatDecimal(player.projected_offense_index)}.`,
  ]);
}

function buildLineup(report, unavailablePlayers) {
  const unavailable = new Set(unavailablePlayers.map(normalizeName));
  const players = mergePlayerSignals(report).filter((player) => !unavailable.has(normalizeName(player.player_name)));
  const used = new Set();
  const ordered = [];

  const third = takeBest(players, used, scoreRunProducer);
  const first = takeBest(players, used, scoreLeadoff);
  const second = takeBest(players, used, (player) => scoreContactBridge(player) - toNumber(player.iso) * 0.08);
  const fourth = takeBest(players, used, (player) => scoreRunProducer(player) + toNumber(player.slg) * 0.08);
  const fifth = takeBest(players, used, scoreRunProducer);
  const sixth = takeBest(players, used, scoreContactBridge);

  [
    [first, "table-setter"],
    [second, "traffic"],
    [third, "best bat"],
    [fourth, "rbi"],
    [fifth, "power"],
    [sixth, "bridge"],
  ].forEach(([player, role]) => {
    if (player) {
      ordered.push({ player, role });
    }
  });

  const rest = players
    .filter((player) => !used.has(player.player_name))
    .sort((left, right) => scoreContactBridge(right) - scoreContactBridge(left));

  rest.forEach((player) => ordered.push({ player, role: "depth" }));

  return ordered.map(({ player, role }, index) => ({
    spot: index + 1,
    player_name: player.player_name,
    role,
    reason: compactReason(player, role),
    projected_offense_index: toNumber(player.projected_offense_index),
    league_bat_score_rank_label: player.league_bat_score_rank_label ?? "n/a",
    avg: player.avg,
    obp: player.obp,
    slg: player.slg,
    ops: player.ops,
    iso: player.iso,
    productive_pa_percentage: player.productive_pa_percentage,
    out_avoidance: player.out_avoidance,
    xbh_percentage: player.xbh_percentage,
    hit_game_percentage: player.hit_game_percentage,
    multi_hit_game_percentage: player.multi_hit_game_percentage,
    xbh_game_percentage: player.xbh_game_percentage,
  }));
}

function formatLineupText(team, unavailablePlayers, lineup) {
  const unavailableText =
    unavailablePlayers.length > 0
      ? `Unavailable: ${unavailablePlayers.join(", ")}`
      : "Unavailable: none";
  const lines = [`${team} Batting Order`, unavailableText, ""];

  for (const row of lineup) {
    lines.push(`${row.spot}. ${row.player_name}`);
    lines.push(`   ${row.reason}`);
    lines.push("");
  }

  const top = lineup.slice(0, 3).map((row) => row.player_name).join(" -> ");
  if (top) {
    lines.push(`Summary: Keep ${top} at the top based on the current advanced batter signals.`);
  }

  return lines.join("\n").trim();
}

function parseBody(event) {
  if (!event?.body) {
    return {};
  }
  if (event.isBase64Encoded) {
    return JSON.parse(Buffer.from(event.body, "base64").toString("utf8"));
  }
  return typeof event.body === "string" ? JSON.parse(event.body) : event.body;
}

export async function handler(event = {}) {
  if (event.requestContext?.http?.method === "OPTIONS") {
    return { statusCode: 204, headers: jsonHeaders(), body: "" };
  }

  try {
    const body = parseBody(event);
    const team = body.team ?? body.teamName;
    if (!team) {
      return response(400, { error: "Missing required field: team" });
    }

    const season = String(body.season ?? process.env.SOFTBALL_SEASON ?? DEFAULT_SEASON);
    const unavailable = Array.isArray(body.unavailable)
      ? body.unavailable
      : Array.isArray(body.missingPlayers)
        ? body.missingPlayers
        : [];
    const report = await loadReport(team, season);
    const lineup = buildLineup(report, unavailable);
    const text = formatLineupText(report.team ?? team, unavailable, lineup);

    return response(200, {
      team: report.team ?? team,
      season,
      stats_through_date: report.stats_through_date,
      unavailable,
      lineup,
      text,
    });
  } catch (error) {
    console.error(error);
    return response(500, { error: error.message });
  }
}
