const DEFAULT_OUTPUT_KEY = "sabres/line-optimizer/latest.json";
const DEFAULT_HISTORY_PREFIX = "sabres/line-optimizer/history";
const DEFAULT_SEASON = "2025-26";

const ufaNames = new Set([
  "Alex Tuch",
  "Tanner Pearson",
  "Beck Malenstyn",
  "Joshua Dunne",
  "Luke Schenn",
  "Logan Stanley",
]);

const defaultForwards = [
  { name: "Tage Thompson", position: "C/RW", gp: 81, goals: 40, assists: 41, points: 81, plusMinus: -6, shots: 272, toi: "19:15", ppGoals: 6, shGoals: 0, tags: ["elite shot", "volume shooter", "PP finisher"], edgeBonus: 11 },
  { name: "Alex Tuch", position: "RW/C", gp: 79, goals: 33, assists: 33, points: 66, plusMinus: 24, shots: 195, toi: "18:59", ppGoals: 7, shGoals: 3, tags: ["two-way driver", "net-front scorer", "PK threat"], edgeBonus: 5 },
  { name: "Ryan McLeod", position: "C", gp: 81, goals: 14, assists: 40, points: 54, plusMinus: 25, shots: 90, toi: "17:36", ppGoals: 0, shGoals: 5, tags: ["transition center", "defensive matchup", "PK driver"], edgeBonus: 4 },
  { name: "Josh Doan", position: "RW/C", gp: 82, goals: 25, assists: 27, points: 52, plusMinus: -4, shots: 170, toi: "15:51", ppGoals: 9, shGoals: 0, tags: ["high-danger shooter", "net-front", "PP option"], edgeBonus: 9 },
  { name: "Jack Quinn", position: "RW/LW", gp: 82, goals: 20, assists: 31, points: 51, plusMinus: 4, shots: 191, toi: "15:39", ppGoals: 4, shGoals: 0, tags: ["playmaking wing", "shot volume", "secondary scorer"], edgeBonus: 3 },
  { name: "Jason Zucker", position: "LW", gp: 62, goals: 24, assists: 21, points: 45, plusMinus: -5, shots: 128, toi: "15:37", ppGoals: 10, shGoals: 0, tags: ["PP scorer", "slot finisher", "veteran"], edgeBonus: 4 },
  { name: "Zach Benson", position: "LW/C", gp: 65, goals: 13, assists: 30, points: 43, plusMinus: 27, shots: 116, toi: "15:53", ppGoals: 1, shGoals: 1, tags: ["puck retriever", "two-way playmaker", "forecheck"], edgeBonus: 7 },
  { name: "Peyton Krebs", position: "C/LW", gp: 82, goals: 12, assists: 27, points: 39, plusMinus: 13, shots: 93, toi: "13:45", ppGoals: 0, shGoals: 0, tags: ["bottom-six center", "possession support", "forecheck"], edgeBonus: 2 },
  { name: "Josh Norris", position: "C", gp: 44, goals: 13, assists: 21, points: 34, plusMinus: 11, shots: 69, toi: "15:49", ppGoals: 2, shGoals: 0, tags: ["offensive-zone center", "PP bumper", "finish"], edgeBonus: 8 },
  { name: "Noah Ostlund", position: "C/LW", gp: 60, goals: 11, assists: 16, points: 27, plusMinus: 11, shots: 60, toi: "13:58", ppGoals: 2, shGoals: 0, tags: ["skill center", "efficient scorer", "sheltered offense"], edgeBonus: 3 },
  { name: "Konsta Helenius", position: "C/RW", gp: 9, goals: 1, assists: 3, points: 4, plusMinus: 1, shots: 15, toi: "11:55", ppGoals: 0, shGoals: 0, tags: ["entry-level prospect", "AHL scorer", "middle-six upside"], edgeBonus: 7 },
  { name: "Jordan Greenway", position: "LW/RW", gp: 40, goals: 1, assists: 5, points: 6, plusMinus: -10, shots: 29, toi: "12:27", ppGoals: 0, shGoals: 0, tags: ["checking wing", "size", "defensive depth"], edgeBonus: 1 },
  { name: "Sam Carrick", position: "C/RW", gp: 73, goals: 9, assists: 7, points: 16, plusMinus: 2, shots: 75, toi: "10:28", ppGoals: 0, shGoals: 0, tags: ["checking", "faceoff support", "physical"], edgeBonus: 1 },
  { name: "Justin Danforth", position: "RW/C", gp: 4, goals: 0, assists: 0, points: 0, plusMinus: -2, shots: 2, toi: "6:14", ppGoals: 0, shGoals: 0, tags: ["depth wing", "signed depth", "energy"], edgeBonus: 0 },
  { name: "Tyson Kozak", position: "C/LW", gp: 46, goals: 2, assists: 4, points: 6, plusMinus: -1, shots: 30, toi: "11:17", ppGoals: 0, shGoals: 0, tags: ["young checker", "faceoff support", "RFA control"], edgeBonus: 1 },
  { name: "Jiri Kulich", position: "C/LW", gp: 12, goals: 3, assists: 2, points: 5, plusMinus: -4, shots: 20, toi: "16:21", ppGoals: 0, shGoals: 0, tags: ["young scorer", "shot-first", "upside"], edgeBonus: 2 },
  { name: "Tanner Pearson", position: "LW", gp: 56, goals: 7, assists: 8, points: 15, plusMinus: 9, shots: 52, toi: "10:49", ppGoals: 0, shGoals: 0, tags: ["veteran wing", "responsible depth", "net-front"], edgeBonus: 1 },
  { name: "Beck Malenstyn", position: "LW/RW", gp: 81, goals: 7, assists: 7, points: 14, plusMinus: 0, shots: 72, toi: "11:14", ppGoals: 0, shGoals: 1, tags: ["checking wing", "PK depth", "forecheck"], edgeBonus: 1 },
];

const defaultDefensemen = [
  { name: "Rasmus Dahlin", side: "LD/RD", gp: 77, goals: 19, assists: 55, points: 74, plusMinus: 18, shots: 194, toi: "24:11", tags: ["No. 1 driver", "offensive-zone engine", "PP1"], edgeBonus: 12 },
  { name: "Mattias Samuelsson", side: "LD/RD", gp: 78, goals: 13, assists: 28, points: 41, plusMinus: 41, shots: 109, toi: "22:49", tags: ["shutdown", "plus-minus anchor", "heavy minutes"], edgeBonus: 5 },
  { name: "Bowen Byram", side: "LD", gp: 82, goals: 11, assists: 31, points: 42, plusMinus: 15, shots: 109, toi: "22:20", tags: ["puck mover", "transition", "secondary offense"], edgeBonus: 5 },
  { name: "Owen Power", side: "LD/RD", gp: 81, goals: 8, assists: 21, points: 29, plusMinus: 9, shots: 120, toi: "21:39", tags: ["minutes eater", "breakout", "reach defender"], edgeBonus: 4 },
  { name: "Conor Timmins", side: "RD", gp: 39, goals: 0, assists: 8, points: 8, plusMinus: -8, shots: 44, toi: "18:45", tags: ["right shot", "puck mover", "third-pair"], edgeBonus: 1 },
  { name: "Zach Metsa", side: "RD/LD", gp: 43, goals: 2, assists: 4, points: 6, plusMinus: 16, shots: 45, toi: "14:20", tags: ["puck mover", "signed depth", "positive results"], edgeBonus: 2 },
  { name: "Logan Stanley", side: "LD", gp: 76, goals: 9, assists: 17, points: 26, plusMinus: 3, shots: 96, toi: "16:41", tags: ["size", "third-pair shot", "PK depth"], edgeBonus: 1 },
  { name: "Luke Schenn", side: "RD", gp: 50, goals: 1, assists: 6, points: 7, plusMinus: -12, shots: 35, toi: "13:39", tags: ["right shot", "physical", "shelter minutes"], edgeBonus: 0 },
];

const forwardLineSlots = [
  { label: "Line 1", role: "Primary scoring line", productionWeight: 0.48, roleWeight: 0.22, centerWeight: 0.14, usageTarget: 17, usageWeight: 0.08, shooterBonus: 7, playmakerBonus: 5, defensiveBonus: 1, prospectBonus: 0 },
  { label: "Line 2", role: "Skill and possession line", productionWeight: 0.4, roleWeight: 0.25, centerWeight: 0.16, usageTarget: 16, usageWeight: 0.09, shooterBonus: 5, playmakerBonus: 7, defensiveBonus: 3, prospectBonus: 2 },
  { label: "Line 3", role: "Matchup line with scoring pop", productionWeight: 0.3, roleWeight: 0.27, centerWeight: 0.18, usageTarget: 14.5, usageWeight: 0.11, shooterBonus: 4, playmakerBonus: 4, defensiveBonus: 7, prospectBonus: 4 },
  { label: "Line 4", role: "Checking line", productionWeight: 0.22, roleWeight: 0.25, centerWeight: 0.18, usageTarget: 12, usageWeight: 0.15, shooterBonus: 1, playmakerBonus: 2, defensiveBonus: 10, prospectBonus: -2 },
];

let s3ModulePromise = null;
let s3Client = null;

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

const clampScore = (value, max = 100) => Math.max(0, Math.min(max, value));
const pointsPer82 = (player) => (player.points / Math.max(player.gp, 1)) * 82;
const goalsPer82 = (player) => (player.goals / Math.max(player.gp, 1)) * 82;
const shotsPer82 = (player) => (player.shots / Math.max(player.gp, 1)) * 82;
const hasTag = (player, patterns) => player.tags.some((tag) => patterns.some((pattern) => tag.includes(pattern)));
const canPlayCenter = (player) => player.position.includes("C");

function toiMinutes(toi) {
  const [minutes, seconds] = String(toi).split(":").map(Number);
  return (Number.isFinite(minutes) ? minutes : 0) + (Number.isFinite(seconds) ? seconds : 0) / 60;
}

function forwardScore(player) {
  return pointsPer82(player) * 0.44 +
    goalsPer82(player) * 0.22 +
    shotsPer82(player) * 0.035 +
    player.plusMinus * 0.18 +
    player.ppGoals * 0.8 +
    player.shGoals * 0.9 +
    toiMinutes(player.toi) * 0.3 +
    (player.edgeBonus ?? 0);
}

function defenseScore(player) {
  return pointsPer82(player) * 0.34 +
    shotsPer82(player) * 0.025 +
    player.plusMinus * 0.24 +
    toiMinutes(player.toi) * 0.65 +
    (player.edgeBonus ?? 0);
}

function combinations(items, size) {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  return items.flatMap((item, index) =>
    combinations(items.slice(index + 1), size - 1).map((rest) => [item, ...rest])
  );
}

function evaluateForwardLine(players) {
  const production = players.reduce((sum, player) => sum + forwardScore(player), 0) / Math.max(players.length, 1);
  const centers = players.filter(canPlayCenter).length;
  const shooterCount = players.filter((player) => hasTag(player, ["shot", "scorer", "finisher", "high-danger"])).length;
  const playmakerCount = players.filter((player) => hasTag(player, ["playmaker", "skill", "transition", "possession"])).length;
  const defensiveCount = players.filter((player) => hasTag(player, ["two-way", "defensive", "checking", "forecheck", "size"])).length;
  const prospectCount = players.filter((player) => hasTag(player, ["prospect", "young", "upside"])).length;
  const hasUfa = players.some((player) => ufaNames.has(player.name));
  const averageToi = players.reduce((sum, player) => sum + toiMinutes(player.toi), 0) / Math.max(players.length, 1);
  const usageBalance = 100 - Math.abs(averageToi - 15.5) * 8;
  const roleBalance =
    Math.min(shooterCount, 2) * 14 +
    Math.min(playmakerCount, 2) * 12 +
    Math.min(defensiveCount, 2) * 10 +
    Math.min(prospectCount, 2) * 6;
  const centerFit = centers >= 2 ? 100 : centers === 1 ? 82 : 35;
  const controlledFit = hasUfa ? 0 : 100;
  const total =
    clampScore(production) * 0.38 +
    clampScore(roleBalance) * 0.24 +
    centerFit * 0.18 +
    controlledFit * 0.12 +
    clampScore(usageBalance) * 0.08;

  return {
    total,
    production: clampScore(production),
    roleBalance: clampScore(roleBalance),
    centerFit,
    controlledFit,
    usageBalance: clampScore(usageBalance),
    centers,
    shooterCount,
    playmakerCount,
    defensiveCount,
    prospectCount,
    hasUfa,
  };
}

function evaluateForwardLineForSlot(players, slot) {
  const base = evaluateForwardLine(players);
  const averageToi = players.reduce((sum, player) => sum + toiMinutes(player.toi), 0) / Math.max(players.length, 1);
  const slotUsage = clampScore(100 - Math.abs(averageToi - slot.usageTarget) * 9);
  const slotTraitBonus =
    Math.min(base.shooterCount, 2) * slot.shooterBonus +
    Math.min(base.playmakerCount, 2) * slot.playmakerBonus +
    Math.min(base.defensiveCount, 2) * slot.defensiveBonus +
    Math.min(base.prospectCount, 2) * slot.prospectBonus;
  const total =
    base.production * slot.productionWeight +
    base.roleBalance * slot.roleWeight +
    base.centerFit * slot.centerWeight +
    base.controlledFit * 0.1 +
    slotUsage * slot.usageWeight +
    slotTraitBonus;

  return {
    ...base,
    total,
    usageBalance: slotUsage,
    slotTraitBonus,
  };
}

function buildForwardLineCandidates(eligibleForwards, slot) {
  return combinations(eligibleForwards, 3)
    .filter((players) => players.some(canPlayCenter))
    .map((players) => ({
      label: slot.label,
      role: slot.role,
      players,
      evaluation: evaluateForwardLineForSlot(players, slot),
    }))
    .sort((left, right) => right.evaluation.total - left.evaluation.total)
    .slice(0, 70);
}

function deriveForwardLines(eligibleForwards) {
  const candidatesBySlot = forwardLineSlots.map((slot) => buildForwardLineCandidates(eligibleForwards, slot));
  let bestLines = [];
  let bestScore = Number.NEGATIVE_INFINITY;

  function search(slotIndex, usedNames, selectedLines, score) {
    if (slotIndex === candidatesBySlot.length) {
      if (score > bestScore) {
        bestScore = score;
        bestLines = selectedLines;
      }
      return;
    }

    for (const candidate of candidatesBySlot[slotIndex]) {
      if (candidate.players.some((player) => usedNames.has(player.name))) continue;
      const nextUsedNames = new Set(usedNames);
      candidate.players.forEach((player) => nextUsedNames.add(player.name));
      search(slotIndex + 1, nextUsedNames, [...selectedLines, candidate], score + candidate.evaluation.total);
    }
  }

  search(0, new Set(), [], 0);
  return bestLines;
}

function pairDefense(eligibleDefensemen) {
  const ranked = eligibleDefensemen.slice().sort((a, b) => defenseScore(b) - defenseScore(a));
  return [
    { label: "Pair 1", role: "Top matchup pair", players: ranked.slice(0, 2) },
    { label: "Pair 2", role: "Puck movement pair", players: ranked.slice(2, 4) },
    { label: "Pair 3", role: "Sheltered third pair", players: ranked.slice(4, 6) },
  ].filter((pair) => pair.players.length === 2);
}

function lineupSignature(lines) {
  return lines
    .map((line) => `${line.label}:${line.players.map((player) => player.name).join("/")}`)
    .join("|");
}

function buildPayload({ forwards, defensemen, source }) {
  const generatedAt = new Date().toISOString();
  const eligibleForwards = forwards.filter((player) => !ufaNames.has(player.name));
  const eligibleDefensemen = defensemen.filter((player) => !ufaNames.has(player.name));
  const forwardLines = deriveForwardLines(eligibleForwards);
  const defensePairs = pairDefense(eligibleDefensemen);
  const averageForwardFit =
    forwardLines.reduce((sum, line) => sum + line.evaluation.total, 0) / Math.max(forwardLines.length, 1);

  return {
    generatedAt,
    season: DEFAULT_SEASON,
    source,
    rules: {
      excludesUfas: true,
      ignoresIrAtEndOfSeason: true,
      requiresCenterPerForwardLine: true,
      optimizer: "exhaustive three-forward combinations with non-overlap search",
    },
    playerPool: {
      forwards: forwards.length,
      eligibleForwards: eligibleForwards.length,
      defensemen: defensemen.length,
      eligibleDefensemen: eligibleDefensemen.length,
      excludedUfas: [...ufaNames],
    },
    forwardLineSet: {
      averageFit: Number(averageForwardFit.toFixed(2)),
      signature: lineupSignature(forwardLines),
      lines: forwardLines.map((line) => ({
        label: line.label,
        role: line.role,
        fit: Number(line.evaluation.total.toFixed(2)),
        players: line.players.map((player) => ({
          name: player.name,
          position: player.position,
          score: Number(forwardScore(player).toFixed(2)),
          pointsPer82: Number(pointsPer82(player).toFixed(1)),
          shotsPer82: Number(shotsPer82(player).toFixed(1)),
          tags: player.tags,
        })),
        evaluation: {
          production: Number(line.evaluation.production.toFixed(2)),
          roleBalance: Number(line.evaluation.roleBalance.toFixed(2)),
          centerFit: Number(line.evaluation.centerFit.toFixed(2)),
          controlledFit: Number(line.evaluation.controlledFit.toFixed(2)),
          usageBalance: Number(line.evaluation.usageBalance.toFixed(2)),
          slotTraitBonus: Number(line.evaluation.slotTraitBonus.toFixed(2)),
        },
      })),
    },
    defensePairs: defensePairs.map((pair) => ({
      label: pair.label,
      role: pair.role,
      players: pair.players.map((player) => ({
        name: player.name,
        side: player.side,
        score: Number(defenseScore(player).toFixed(2)),
        pointsPer82: Number(pointsPer82(player).toFixed(1)),
        shotsPer82: Number(shotsPer82(player).toFixed(1)),
        tags: player.tags,
      })),
    })),
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed for ${url}: HTTP ${response.status}`);
  return response.json();
}

async function bodyToString(body) {
  if (!body) return "";
  if (typeof body.transformToString === "function") return body.transformToString();
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function readPrevious(bucket, key) {
  if (!bucket) return null;
  const { s3, GetObjectCommand } = await getS3();
  try {
    const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return JSON.parse(await bodyToString(response.Body));
  } catch (error) {
    if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

async function writeJson(bucket, key, payload) {
  if (!bucket) return;
  const { s3, PutObjectCommand } = await getS3();
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: `${JSON.stringify(payload, null, 2)}\n`,
    ContentType: "application/json",
    CacheControl: "public, max-age=300",
  }));
}

async function loadPlayerPool() {
  const url = process.env.PLAYER_POOL_URL;
  if (!url) {
    return {
      forwards: defaultForwards,
      defensemen: defaultDefensemen,
      source: "lambda-default-player-pool",
    };
  }

  const data = await fetchJson(url);
  return {
    forwards: Array.isArray(data.forwards) ? data.forwards : defaultForwards,
    defensemen: Array.isArray(data.defensemen) ? data.defensemen : defaultDefensemen,
    source: url,
  };
}

export const handler = async () => {
  const bucket = process.env.OUTPUT_BUCKET || "";
  const outputKey = process.env.OUTPUT_KEY || DEFAULT_OUTPUT_KEY;
  const historyPrefix = process.env.HISTORY_PREFIX || DEFAULT_HISTORY_PREFIX;

  const playerPool = await loadPlayerPool();
  const payload = buildPayload(playerPool);
  const previous = await readPrevious(bucket, outputKey);
  const changed = previous?.forwardLineSet?.signature !== payload.forwardLineSet.signature;

  payload.change = {
    changed,
    previousSignature: previous?.forwardLineSet?.signature ?? null,
    currentSignature: payload.forwardLineSet.signature,
  };

  await writeJson(bucket, outputKey, payload);
  if (changed) {
    const dateKey = payload.generatedAt.replace(/[:.]/g, "-");
    await writeJson(bucket, `${historyPrefix}/${dateKey}.json`, payload);
  }

  console.log(JSON.stringify({
    changed,
    outputBucket: bucket || null,
    outputKey,
    signature: payload.forwardLineSet.signature,
  }));

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(payload),
  };
};
