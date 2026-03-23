import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type GameSlot = {
    team?: string;
    sourceGameId?: string;
};

type BracketGame = {
    id: string;
    round: number;
    label?: string;
    pickKey?: string;
    slots: [GameSlot, GameSlot];
    winner?: string;
};

type Participant = {
    name: string;
    picks: Record<string, string>;
};

type ParsedData = {
    games: BracketGame[];
    participants: Participant[];
};

type Scenario = {
    winners: Record<string, string>;
    scores: Record<string, number>;
    leaders: string[];
};

type OutcomeSummary = {
    winner: string;
    scenarios: number;
    targetOutrightWins: number;
    targetSharedWins: number;
    targetBestScore: number;
    fieldBestScore: number;
    averageMargin: number;
};

type RootingGuideItem = {
    gameId: string;
    label: string;
    matchup: string;
    recommendedWinner: string;
    reason: string;
    outcomes: OutcomeSummary[];
};

const DEFAULT_SCORING = [1, 2, 4, 8, 16, 32];
const BACKGROUND_GAMES_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vQLTTG_-7-70kySWVudmo67YlGO9EiQxyfEYJsj4smLP0PCk8LrBcv0vFj6nSqTkzloaDeAvwlcvDrN/pub?gid=0&single=true&output=csv";
const REGIONS = ["EAST", "SOUTH", "WEST", "MIDWEST"] as const;

const SAMPLE_DATA: ParsedData = {
    games: [
        {
            id: "east_vs_south_r5_1",
            round: 5,
            label: "Final Four East vs South",
            pickKey: "east_vs_south_r5_1",
            slots: [{ team: "DUKE" }, { team: "FLORIDA" }],
        },
        {
            id: "midwest_vs_west_r5_1",
            round: 5,
            label: "Final Four Midwest vs West",
            pickKey: "midwest_vs_west_r5_1",
            slots: [{ team: "HOUSTON" }, { team: "AUBURN" }],
        },
        {
            id: "championship_r6_1",
            round: 6,
            label: "Championship",
            pickKey: "championship_r6_1",
            slots: [
                { sourceGameId: "east_vs_south_r5_1" },
                { sourceGameId: "midwest_vs_west_r5_1" },
            ],
        },
    ],
    participants: [
        {
            name: "Mark",
            picks: {
                east_vs_south_r5_1: "DUKE",
                midwest_vs_west_r5_1: "HOUSTON",
                championship_r6_1: "DUKE",
            },
        },
        {
            name: "Jen",
            picks: {
                east_vs_south_r5_1: "FLORIDA",
                midwest_vs_west_r5_1: "HOUSTON",
                championship_r6_1: "FLORIDA",
            },
        },
        {
            name: "Chris",
            picks: {
                east_vs_south_r5_1: "DUKE",
                midwest_vs_west_r5_1: "AUBURN",
                championship_r6_1: "AUBURN",
            },
        },
    ],
};

const ROUND_LABELS = [
    "First Round",
    "Second Round",
    "Sweet 16",
    "Elite 8",
    "Final Four",
    "Championship",
] as const;

const SCENARIO_LIMIT = 200000;

function safeName(value: string | undefined) {
    return value?.trim() ?? "";
}

function upperText(value: string | undefined) {
    return safeName(value).toUpperCase();
}

function normalizeTeam(value: string | undefined) {
    return upperText(value);
}

function teamMatchKey(value: string | undefined) {
    return normalizeTeam(value).replaceAll(/[^A-Z0-9]+/g, "");
}

function isOneEditAway(a: string, b: string) {
    if (Math.abs(a.length - b.length) > 1) {
        return false;
    }

    let i = 0;
    let j = 0;
    let edits = 0;

    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            i += 1;
            j += 1;
            continue;
        }

        edits += 1;
        if (edits > 1) {
            return false;
        }

        if (a.length > b.length) {
            i += 1;
        } else if (b.length > a.length) {
            j += 1;
        } else {
            i += 1;
            j += 1;
        }
    }

    if (i < a.length || j < b.length) {
        edits += 1;
    }

    return edits <= 1;
}

function canonicalWinnerName(winner: string, teamA: string, teamB: string) {
    const normalizedWinner = normalizeTeam(winner);
    if (!normalizedWinner) {
        return "";
    }

    const normalizedTeamA = normalizeTeam(teamA);
    const normalizedTeamB = normalizeTeam(teamB);
    const winnerKey = teamMatchKey(winner);
    const teamAKey = teamMatchKey(teamA);
    const teamBKey = teamMatchKey(teamB);

    if (winnerKey && winnerKey === teamAKey) {
        return normalizedTeamA;
    }

    if (winnerKey && winnerKey === teamBKey) {
        return normalizedTeamB;
    }

    if (winnerKey && isOneEditAway(winnerKey, teamAKey)) {
        return normalizedTeamA;
    }

    if (winnerKey && isOneEditAway(winnerKey, teamBKey)) {
        return normalizedTeamB;
    }

    return normalizedWinner;
}

function slugPart(value: string | undefined) {
    return safeName(value)
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "_")
        .replaceAll(/^_+|_+$/g, "");
}

function roundPoints(round: number, scoring: number[]) {
    return scoring[round - 1] ?? 0;
}

function pickKeyForGame(game: BracketGame) {
    return safeName(game.pickKey) || safeName(game.label) || game.id;
}

function describeMargin(margin: number) {
    if (margin >= 8) return "This creates the strongest scoring cushion.";
    if (margin >= 2) return "This gives the target a modest scoring edge.";
    if (margin > -2) return "This outcome is close, but still slightly better.";
    return "This keeps the target alive, but leaves them chasing the field.";
}

function resolveSlotTeam(
    slot: GameSlot,
    winners: Record<string, string>,
    gameMap: Map<string, BracketGame>
): string | null {
    if (slot.team) {
        return normalizeTeam(slot.team) || null;
    }

    if (!slot.sourceGameId) {
        return null;
    }

    const sourceGame = gameMap.get(slot.sourceGameId);
    if (!sourceGame) {
        return null;
    }

    return winners[sourceGame.id] ?? normalizeTeam(sourceGame.winner) ?? null;
}

function resolveEntrants(
    game: BracketGame,
    winners: Record<string, string>,
    gameMap: Map<string, BracketGame>
) {
    const left = resolveSlotTeam(game.slots[0], winners, gameMap);
    const right = resolveSlotTeam(game.slots[1], winners, gameMap);
    return { left, right };
}

function buildGameLookup(games: BracketGame[]) {
    const lookup = new Map<string, BracketGame>();

    for (const game of games) {
        lookup.set(game.id, game);

        const label = safeName(game.label);
        if (label) {
            lookup.set(label, game);
        }
    }

    return lookup;
}

function possibleWinnersForGame(
    game: BracketGame,
    fixedWinners: Record<string, string>,
    gameMap: Map<string, BracketGame>,
    cache: Map<string, Set<string>>
) {
    if (cache.has(game.id)) {
        return cache.get(game.id) as Set<string>;
    }

    const fixedWinner = fixedWinners[game.id];
    if (fixedWinner) {
        const fixed = new Set([fixedWinner]);
        cache.set(game.id, fixed);
        return fixed;
    }

    const possible = new Set<string>();

    for (const slot of game.slots) {
        if (slot.team) {
            possible.add(normalizeTeam(slot.team));
            continue;
        }

        if (!slot.sourceGameId) {
            continue;
        }

        const sourceGame = gameMap.get(slot.sourceGameId);
        if (!sourceGame) {
            continue;
        }

        for (const team of possibleWinnersForGame(sourceGame, fixedWinners, gameMap, cache)) {
            possible.add(team);
        }
    }

    cache.set(game.id, possible);
    return possible;
}

function computeScores(
    participants: Participant[],
    games: BracketGame[],
    winners: Record<string, string>,
    scoring: number[]
) {
    const scores: Record<string, number> = {};

    for (const participant of participants) {
        let score = 0;

        for (const game of games) {
            const winner = winners[game.id];
            const pickedWinner =
                normalizeTeam(participant.picks[pickKeyForGame(game)]) ||
                normalizeTeam(participant.picks[game.id]);
            if (winner && pickedWinner === winner) {
                score += roundPoints(game.round, scoring);
            }
        }

        scores[participant.name] = score;
    }

    return scores;
}

function enumerateScenarios(
    games: BracketGame[],
    gameMap: Map<string, BracketGame>,
    participants: Participant[],
    scoring: number[],
    winners: Record<string, string>,
    limit: number
) {
    const scenarios: Scenario[] = [];
    let truncated = false;
    const orderedGames = [...games].sort((a, b) => a.round - b.round);

    function walk(currentWinners: Record<string, string>) {
        if (scenarios.length >= limit) {
            truncated = true;
            return;
        }

        const nextGame = orderedGames.find((game) => {
            if (currentWinners[game.id]) {
                return false;
            }

            const entrants = resolveEntrants(game, currentWinners, gameMap);
            return Boolean(entrants.left && entrants.right);
        });

        if (!nextGame) {
            const unresolved = orderedGames.some((game) => !currentWinners[game.id]);
            if (unresolved) {
                return;
            }

            const scores = computeScores(participants, orderedGames, currentWinners, scoring);
            const topScore = Math.max(...Object.values(scores));
            const leaders = Object.entries(scores)
                .filter(([, score]) => score === topScore)
                .map(([name]) => name);

            scenarios.push({
                winners: currentWinners,
                scores,
                leaders,
            });
            return;
        }

        const entrants = resolveEntrants(nextGame, currentWinners, gameMap);
        const options = [...new Set([entrants.left, entrants.right].filter(Boolean))] as string[];

        for (const option of options) {
            walk({
                ...currentWinners,
                [nextGame.id]: option,
            });
        }
    }

    walk(winners);
    return { scenarios, truncated };
}

function summarizeOutcome(
    winner: string,
    scenarios: Scenario[],
    targetName: string
): OutcomeSummary {
    let targetOutrightWins = 0;
    let targetSharedWins = 0;
    let targetBestScore = Number.NEGATIVE_INFINITY;
    let fieldBestScore = Number.NEGATIVE_INFINITY;
    let marginTotal = 0;

    for (const scenario of scenarios) {
        const targetScore = scenario.scores[targetName] ?? 0;
        const opponentScores = Object.entries(scenario.scores)
            .filter(([name]) => name !== targetName)
            .map(([, score]) => score);
        const bestOpponent = opponentScores.length > 0 ? Math.max(...opponentScores) : targetScore;

        targetBestScore = Math.max(targetBestScore, targetScore);
        fieldBestScore = Math.max(fieldBestScore, bestOpponent);
        marginTotal += targetScore - bestOpponent;

        if (scenario.leaders.length === 1 && scenario.leaders[0] === targetName) {
            targetOutrightWins += 1;
        }

        if (scenario.leaders.includes(targetName)) {
            targetSharedWins += 1;
        }
    }

    return {
        winner,
        scenarios: scenarios.length,
        targetOutrightWins,
        targetSharedWins,
        targetBestScore: Number.isFinite(targetBestScore) ? targetBestScore : 0,
        fieldBestScore: Number.isFinite(fieldBestScore) ? fieldBestScore : 0,
        averageMargin: scenarios.length > 0 ? marginTotal / scenarios.length : 0,
    };
}

function compareOutcomes(a: OutcomeSummary, b: OutcomeSummary) {
    if (a.targetOutrightWins !== b.targetOutrightWins) {
        return b.targetOutrightWins - a.targetOutrightWins;
    }

    if (a.targetSharedWins !== b.targetSharedWins) {
        return b.targetSharedWins - a.targetSharedWins;
    }

    if (Math.abs(a.averageMargin - b.averageMargin) > 0.001) {
        return b.averageMargin - a.averageMargin;
    }

    return b.targetBestScore - a.targetBestScore;
}

function buildReason(best: OutcomeSummary, secondBest: OutcomeSummary | undefined) {
    if (!secondBest) {
        return `${best.winner} is the only valid winner still available.`;
    }

    const outrightDelta = best.targetOutrightWins - secondBest.targetOutrightWins;
    if (outrightDelta > 0) {
        return `${best.winner} gives the target ${outrightDelta} more outright-winning scenarios than ${secondBest.winner}.`;
    }

    const shareDelta = best.targetSharedWins - secondBest.targetSharedWins;
    if (shareDelta > 0) {
        return `${best.winner} keeps the target alive in ${shareDelta} more title paths than ${secondBest.winner}.`;
    }

    return describeMargin(best.averageMargin);
}

function analyzeRootingGuide(
    games: BracketGame[],
    participants: Participant[],
    scoring: number[],
    targetName: string
) {
    const gameMap = buildGameLookup(games);
    const fixedWinners = Object.fromEntries(
        games
            .filter((game) => normalizeTeam(game.winner))
            .map((game) => [game.id, normalizeTeam(game.winner)])
    );

    const activeGames = games
        .filter((game) => !fixedWinners[game.id])
        .map((game) => {
            const entrants = resolveEntrants(game, fixedWinners, gameMap);
            return { game, entrants };
        })
        .filter(({ entrants }) => entrants.left && entrants.right);

    const guide: RootingGuideItem[] = [];
    let truncated = false;

    for (const { game, entrants } of activeGames) {
        const winners = [...new Set([entrants.left, entrants.right].filter(Boolean))] as string[];
        const outcomes: OutcomeSummary[] = [];

        for (const winner of winners) {
            const result = enumerateScenarios(
                games,
                gameMap,
                participants,
                scoring,
                { ...fixedWinners, [game.id]: winner },
                SCENARIO_LIMIT
            );

            truncated ||= result.truncated;
            outcomes.push(summarizeOutcome(winner, result.scenarios, targetName));
        }

        outcomes.sort(compareOutcomes);
        guide.push({
            gameId: game.id,
            label: game.label?.trim() || game.id,
            matchup: `${entrants.left} vs ${entrants.right}`,
            recommendedWinner: outcomes[0]?.winner ?? "",
            reason: buildReason(outcomes[0], outcomes[1]),
            outcomes,
        });
    }

    return { guide, truncated };
}

function standingsWithPointsPossible(
    games: BracketGame[],
    participants: Participant[],
    scoring: number[]
) {
    const fixedWinners = Object.fromEntries(
        games
            .filter((game) => normalizeTeam(game.winner))
            .map((game) => [game.id, normalizeTeam(game.winner)])
    );

    const gameMap = buildGameLookup(games);
    const possibleWinnerCache = new Map<string, Set<string>>();

    return participants
        .map((participant) => {
            let currentScore = 0;
            let pointsPossible = 0;

            for (const game of games) {
                const pickedWinner =
                    normalizeTeam(participant.picks[pickKeyForGame(game)]) ||
                    normalizeTeam(participant.picks[game.id]);

                if (!pickedWinner) {
                    continue;
                }

                const gamePoints = roundPoints(game.round, scoring);
                const actualWinner = fixedWinners[game.id];

                if (actualWinner) {
                    if (pickedWinner === actualWinner) {
                        currentScore += gamePoints;
                        pointsPossible += gamePoints;
                    }
                    continue;
                }

                const possibleWinners = possibleWinnersForGame(
                    game,
                    fixedWinners,
                    gameMap,
                    possibleWinnerCache
                );
                if (possibleWinners.has(pickedWinner)) {
                    pointsPossible += gamePoints;
                }
            }

            return {
                name: participant.name,
                currentScore,
                pointsPossible,
            };
        })
        .sort((a, b) => {
            if (b.currentScore !== a.currentScore) {
                return b.currentScore - a.currentScore;
            }

            return b.pointsPossible - a.pointsPossible;
        });
}

const PICKS_TEMPLATE_HEADER = [
    "ENTRANT",
    ...Array.from({ length: 8 }, (_, index) => `R1_EAST_${index + 1}`),
    ...Array.from({ length: 4 }, (_, index) => `R2_EAST_${index + 1}`),
    ...Array.from({ length: 2 }, (_, index) => `SWEET16_EAST_${index + 1}`),
    "ELITE8_EAST_1",
    ...Array.from({ length: 8 }, (_, index) => `R1_SOUTH_${index + 1}`),
    ...Array.from({ length: 4 }, (_, index) => `R2_SOUTH_${index + 1}`),
    ...Array.from({ length: 2 }, (_, index) => `SWEET16_SOUTH_${index + 1}`),
    "ELITE8_SOUTH_1",
    ...Array.from({ length: 8 }, (_, index) => `R1_WEST_${index + 1}`),
    ...Array.from({ length: 4 }, (_, index) => `R2_WEST_${index + 1}`),
    ...Array.from({ length: 2 }, (_, index) => `SWEET16_WEST_${index + 1}`),
    "ELITE8_WEST_1",
    ...Array.from({ length: 8 }, (_, index) => `R1_MIDWEST_${index + 1}`),
    ...Array.from({ length: 4 }, (_, index) => `R2_MIDWEST_${index + 1}`),
    ...Array.from({ length: 2 }, (_, index) => `SWEET16_MIDWEST_${index + 1}`),
    "ELITE8_MIDWEST_1",
    "FINAL4_EAST_SOUTH_1",
    "FINAL4_MIDWEST_WEST_1",
    "CHAMPIONSHIP_1",
].join("\t");

function parseCsv(text: string) {
    const rows: string[][] = [];
    let current = "";
    let row: string[] = [];
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const next = text[index + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                current += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === "," && !inQuotes) {
            row.push(current.trim());
            current = "";
            continue;
        }

        if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && next === "\n") {
                index += 1;
            }
            row.push(current.trim());
            if (row.some((cell) => cell.length > 0)) {
                rows.push(row);
            }
            row = [];
            current = "";
            continue;
        }

        current += char;
    }

    row.push(current.trim());
    if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
    }

    return rows;
}

function normalizeHeader(value: string) {
    return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, "_");
}

type SheetResultRow = {
    round: number;
    region: string;
    seedA: number | null;
    teamA: string;
    seedB: number | null;
    teamB: string;
    winner: string;
};

function normalizeRegion(value: string) {
    return upperText(value).replaceAll(/\s+/g, " ");
}

function parseSeed(value: string) {
    const trimmed = safeName(value);
    if (!trimmed) {
        return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

const ROUND_ONE_SLOT_BY_PAIR = new Map<string, number>([
    ["1_16", 1],
    ["8_9", 2],
    ["5_12", 3],
    ["4_13", 4],
    ["6_11", 5],
    ["3_14", 6],
    ["7_10", 7],
    ["2_15", 8],
]);

const ROUND_ONE_SLOT_BY_SEED = new Map<number, number>([
    [1, 1],
    [16, 1],
    [8, 2],
    [9, 2],
    [5, 3],
    [12, 3],
    [4, 4],
    [13, 4],
    [6, 5],
    [11, 5],
    [3, 6],
    [14, 6],
    [7, 7],
    [10, 7],
    [2, 8],
    [15, 8],
]);

function bracketSlot(round: number, seedA: number | null, seedB: number | null) {
    if (round === 1) {
        if (seedA === null || seedB === null) {
            return null;
        }

        const key = [seedA, seedB].sort((a, b) => a - b).join("_");
        return ROUND_ONE_SLOT_BY_PAIR.get(key) ?? null;
    }

    if (round === 2) {
        if (seedA === null || seedB === null) {
            return null;
        }

        const slotA = ROUND_ONE_SLOT_BY_SEED.get(seedA);
        const slotB = ROUND_ONE_SLOT_BY_SEED.get(seedB);
        if (!slotA || !slotB) {
            return null;
        }

        const low = Math.min(slotA, slotB);
        const high = Math.max(slotA, slotB);
        if (low === 1 && high === 2) return 1;
        if (low === 3 && high === 4) return 2;
        if (low === 5 && high === 6) return 3;
        if (low === 7 && high === 8) return 4;
        return null;
    }

    if (round === 3) {
        if (seedA === null || seedB === null) {
            return null;
        }

        const slotA = ROUND_ONE_SLOT_BY_SEED.get(seedA);
        const slotB = ROUND_ONE_SLOT_BY_SEED.get(seedB);
        if (!slotA || !slotB) {
            return null;
        }

        if (slotA <= 4 && slotB <= 4) return 1;
        if (slotA >= 5 && slotB >= 5) return 2;
        return null;
    }

    if (round === 4) {
        return 1;
    }

    return 1;
}

function regionalGameId(region: string, round: number, slot: number) {
    return `${slugPart(region)}_r${round}_${slot}`;
}

function finalFourGameId(region: string) {
    const normalized = slugPart(region);
    if (normalized === "east" || normalized === "south" || normalized === "east_vs_south") {
        return "east_vs_south_r5_1";
    }

    if (normalized === "midwest" || normalized === "west" || normalized === "midwest_vs_west") {
        return "midwest_vs_west_r5_1";
    }

    return `${normalized}_r5_1`;
}

function gameIdForSheetRow(row: SheetResultRow, index: number) {
    const region = normalizeRegion(row.region);

    if (row.round >= 1 && row.round <= 4) {
        const slot = bracketSlot(row.round, row.seedA, row.seedB);
        if (!slot) {
            throw new Error(
                `Could not determine bracket slot for ${region} round ${row.round} at row ${index + 2}.`
            );
        }

        return regionalGameId(region, row.round, slot);
    }

    if (row.round === 5) {
        return finalFourGameId(region);
    }

    if (row.round === 6) {
        return "championship_r6_1";
    }

    throw new Error(`Unsupported round ${row.round} at row ${index + 2}.`);
}

function sourceSlotsForGame(row: SheetResultRow) {
    const region = normalizeRegion(row.region);

    if (row.round === 2) {
        const slot = bracketSlot(row.round, row.seedA, row.seedB);
        if (slot === 1) return [regionalGameId(region, 1, 1), regionalGameId(region, 1, 2)];
        if (slot === 2) return [regionalGameId(region, 1, 3), regionalGameId(region, 1, 4)];
        if (slot === 3) return [regionalGameId(region, 1, 5), regionalGameId(region, 1, 6)];
        if (slot === 4) return [regionalGameId(region, 1, 7), regionalGameId(region, 1, 8)];
    }

    if (row.round === 3) {
        const slot = bracketSlot(row.round, row.seedA, row.seedB);
        if (slot === 1) return [regionalGameId(region, 2, 1), regionalGameId(region, 2, 2)];
        if (slot === 2) return [regionalGameId(region, 2, 3), regionalGameId(region, 2, 4)];
    }

    if (row.round === 4) {
        return [regionalGameId(region, 3, 1), regionalGameId(region, 3, 2)];
    }

    if (row.round === 5) {
        const normalized = slugPart(region);
        if (
            normalized === "east" ||
            normalized === "south" ||
            normalized === "east_vs_south"
        ) {
            return [regionalGameId("EAST", 4, 1), regionalGameId("SOUTH", 4, 1)];
        }

        if (
            normalized === "midwest" ||
            normalized === "west" ||
            normalized === "midwest_vs_west"
        ) {
            return [regionalGameId("MIDWEST", 4, 1), regionalGameId("WEST", 4, 1)];
        }
    }

    return null;
}

function resultsRowsFromSheet(rows: string[][]) {
    if (rows.length < 2) {
        throw new Error("Games sheet must have a header row and at least one game row.");
    }

    const headers = rows[0].map(normalizeHeader);
    const headerIndex = Object.fromEntries(headers.map((header, index) => [header, index]));

    const getValue = (row: string[], key: string) => row[headerIndex[key]]?.trim() ?? "";

    return rows.slice(1).map((row) => ({
        round: Number(getValue(row, "round")),
        region: normalizeRegion(getValue(row, "region")),
        seedA: parseSeed(getValue(row, "seed_a")),
        teamA: getValue(row, "team_a"),
        seedB: parseSeed(getValue(row, "seed_b")),
        teamB: getValue(row, "team_b"),
        winner: getValue(row, "winner"),
    }));
}

function gamesFromSheet(rows: string[][]) {
    const resultRows = resultsRowsFromSheet(rows);
    const importedGames = resultRows.map((row, index) => {
        const id = gameIdForSheetRow(row, index);
        const sourceIds = sourceSlotsForGame(row);
        const hasKnownTeams = safeName(row.teamA) && safeName(row.teamB);
        const resolvedWinner = canonicalWinnerName(row.winner, row.teamA, row.teamB);
        const shouldUseSourceSlots =
            row.round > 1 && !resolvedWinner && Array.isArray(sourceIds) && sourceIds.length === 2;

        return {
            id,
            round: row.round,
            label:
                row.round <= 4
                    ? `${row.region} Round ${row.round}`
                    : row.round === 5
                      ? `Final Four ${row.region}`
                      : "Championship",
            pickKey: id,
            winner: resolvedWinner,
            slots: shouldUseSourceSlots
                ? [{ sourceGameId: sourceIds[0] }, { sourceGameId: sourceIds[1] }]
                : hasKnownTeams
                  ? [{ team: row.teamA }, { team: row.teamB }]
                  : sourceIds
                  ? [{ sourceGameId: sourceIds[0] }, { sourceGameId: sourceIds[1] }]
                  : [{ team: row.teamA }, { team: row.teamB }],
        } satisfies BracketGame;
    });

    const byId = new Map(importedGames.map((game) => [game.id, game]));
    const scaffoldGames: BracketGame[] = [];

    for (const region of REGIONS) {
        for (let slot = 1; slot <= 8; slot += 1) {
            const id = regionalGameId(region, 1, slot);
            scaffoldGames.push(
                byId.get(id) ?? {
                    id,
                    round: 1,
                    label: `${region} ROUND 1`,
                    pickKey: id,
                    slots: [{ team: "" }, { team: "" }],
                }
            );
        }

        for (let slot = 1; slot <= 4; slot += 1) {
            const id = regionalGameId(region, 2, slot);
            scaffoldGames.push(
                byId.get(id) ?? {
                    id,
                    round: 2,
                    label: `${region} ROUND 2`,
                    pickKey: id,
                    slots: sourceSlotsForGame({
                        round: 2,
                        region,
                        seedA: null,
                        teamA: "",
                        seedB: null,
                        teamB: "",
                        winner: "",
                    })!.map((sourceGameId) => ({ sourceGameId })) as [GameSlot, GameSlot],
                }
            );
        }

        for (let slot = 1; slot <= 2; slot += 1) {
            const id = regionalGameId(region, 3, slot);
            scaffoldGames.push(
                byId.get(id) ?? {
                    id,
                    round: 3,
                    label: `${region} SWEET 16`,
                    pickKey: id,
                    slots: sourceSlotsForGame({
                        round: 3,
                        region,
                        seedA: null,
                        teamA: "",
                        seedB: null,
                        teamB: "",
                        winner: "",
                    })!.map((sourceGameId) => ({ sourceGameId })) as [GameSlot, GameSlot],
                }
            );
        }

        const eliteId = regionalGameId(region, 4, 1);
        scaffoldGames.push(
            byId.get(eliteId) ?? {
                id: eliteId,
                round: 4,
                label: `${region} ELITE 8`,
                pickKey: eliteId,
                slots: sourceSlotsForGame({
                    round: 4,
                    region,
                    seedA: null,
                    teamA: "",
                    seedB: null,
                    teamB: "",
                    winner: "",
                })!.map((sourceGameId) => ({ sourceGameId })) as [GameSlot, GameSlot],
            }
        );
    }

    scaffoldGames.push(
        byId.get("east_vs_south_r5_1") ?? {
            id: "east_vs_south_r5_1",
            round: 5,
            label: "FINAL FOUR EAST VS SOUTH",
            pickKey: "east_vs_south_r5_1",
            slots: [
                { sourceGameId: regionalGameId("EAST", 4, 1) },
                { sourceGameId: regionalGameId("SOUTH", 4, 1) },
            ],
        }
    );

    scaffoldGames.push(
        byId.get("midwest_vs_west_r5_1") ?? {
            id: "midwest_vs_west_r5_1",
            round: 5,
            label: "FINAL FOUR MIDWEST VS WEST",
            pickKey: "midwest_vs_west_r5_1",
            slots: [
                { sourceGameId: regionalGameId("MIDWEST", 4, 1) },
                { sourceGameId: regionalGameId("WEST", 4, 1) },
            ],
        }
    );

    scaffoldGames.push(
        byId.get("championship_r6_1") ?? {
            id: "championship_r6_1",
            round: 6,
            label: "CHAMPIONSHIP",
            pickKey: "championship_r6_1",
            slots: [
                { sourceGameId: "east_vs_south_r5_1" },
                { sourceGameId: "midwest_vs_west_r5_1" },
            ],
        }
    );

    return scaffoldGames;
}

function pickColumnToGameId(header: string) {
    const normalized = normalizeHeader(header).toUpperCase();

    let match = normalized.match(/^R([12])_([A-Z0-9]+)_(\d+)$/);
    if (match) {
        const [, round, region, slot] = match;
        return regionalGameId(region, Number(round), Number(slot));
    }

    match = normalized.match(/^SWEET16_([A-Z0-9]+)_(\d+)$/);
    if (match) {
        const [, region, slot] = match;
        return regionalGameId(region, 3, Number(slot));
    }

    match = normalized.match(/^ELITE8_([A-Z0-9]+)_(\d+)$/);
    if (match) {
        const [, region, slot] = match;
        return regionalGameId(region, 4, Number(slot));
    }

    match = normalized.match(/^FINAL4_([A-Z0-9]+)_([A-Z0-9]+)_(\d+)$/);
    if (match) {
        const [, regionA, regionB] = match;
        const pair = [regionA, regionB].sort().join("_");
        if (pair === ["EAST", "SOUTH"].sort().join("_")) {
            return "east_vs_south_r5_1";
        }

        if (pair === ["MIDWEST", "WEST"].sort().join("_")) {
            return "midwest_vs_west_r5_1";
        }
    }

    if (normalized === "CHAMPIONSHIP_1") {
        return "championship_r6_1";
    }

    return "";
}

function participantsFromSheet(rows: string[][], games: BracketGame[]) {
    if (rows.length < 2) {
        throw new Error("Picks sheet must have a header row and at least one entrant row.");
    }

    const headers = rows[0].map((header) => header.trim());
    const entrantIndex = headers.findIndex((header) => normalizeHeader(header) === "entrant");
    if (entrantIndex === -1) {
        throw new Error("Picks sheet must include an ENTRANT column.");
    }

    const validGameIds = new Set(games.map((game) => game.id));
    const pickColumns = headers
        .map((header, index) => ({
            index,
            gameId: pickColumnToGameId(header),
        }))
        .filter(
            ({ index, gameId }) =>
                index !== entrantIndex && safeName(gameId) && validGameIds.has(gameId)
        );

    return rows
        .slice(1)
        .map((row) => {
            const entrant = safeName(row[entrantIndex]);
            if (!entrant) {
                return null;
            }

            return {
                name: entrant,
                picks: Object.fromEntries(
                    pickColumns
                        .map(({ index, gameId }) => [gameId, normalizeTeam(row[index])])
                        .filter(([, winner]) => safeName(winner)),
                ),
            } satisfies Participant;
        })
        .filter((participant): participant is Participant => participant !== null);
}

export default function BracketRootingGuidePage() {
    const [scoring, setScoring] = useState<number[]>(DEFAULT_SCORING);
    const [loadedData, setLoadedData] = useState<ParsedData | null>(null);
    const [selectedTarget, setSelectedTarget] = useState("Mark");
    const [picksSheetUrl, setPicksSheetUrl] = useState("");
    const [sheetLoading, setSheetLoading] = useState(false);
    const [sheetError, setSheetError] = useState("");
    const [sheetSuccess, setSheetSuccess] = useState("");
    const participantNames = loadedData?.participants.map((participant) => participant.name) ?? [];
    const targetName = participantNames.includes(selectedTarget)
        ? selectedTarget
        : participantNames[0] ?? "";

    const analysis = useMemo(() => {
        if (!loadedData || !targetName) {
            return null;
        }

        return analyzeRootingGuide(loadedData.games, loadedData.participants, scoring, targetName);
    }, [loadedData, scoring, targetName]);

    const standings = useMemo(() => {
        if (!loadedData) {
            return [];
        }

        return standingsWithPointsPossible(loadedData.games, loadedData.participants, scoring);
    }, [loadedData, scoring]);

    async function handleLoadGoogleSheets() {
        try {
            setSheetLoading(true);
            setSheetError("");
            setSheetSuccess("");

            if (!safeName(picksSheetUrl)) {
                throw new Error("Enter a published picks sheet CSV URL.");
            }

            const [gamesResponse, picksResponse] = await Promise.all([
                fetch(BACKGROUND_GAMES_CSV_URL, { cache: "no-store" }),
                fetch(picksSheetUrl.trim(), { cache: "no-store" }),
            ]);

            if (!gamesResponse.ok) {
                throw new Error(`Failed to load games sheet (${gamesResponse.status}).`);
            }

            if (!picksResponse.ok) {
                throw new Error(`Failed to load picks sheet (${picksResponse.status}).`);
            }

            const [gamesCsv, picksCsv] = await Promise.all([
                gamesResponse.text(),
                picksResponse.text(),
            ]);

            const importedGames = gamesFromSheet(parseCsv(gamesCsv));
            const importedParticipants = participantsFromSheet(parseCsv(picksCsv), importedGames);

            setLoadedData({
                games: importedGames,
                participants: importedParticipants,
            });
            setSheetSuccess(
                `Loaded ${importedGames.length} games and ${importedParticipants.length} brackets from Google Sheets.`
            );
        } catch (error) {
            setSheetError(error instanceof Error ? error.message : "Failed to load Google Sheets.");
        } finally {
            setSheetLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-slate-950 px-3 py-4 text-white sm:px-4 md:px-6">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold sm:text-3xl">Bracket Rooting Guide</h1>
                    <p className="max-w-4xl text-sm text-slate-300">
                        Load the remaining bracket games plus everyone&apos;s picks, choose the
                        person you care about, and the simulator will rank which winner helps that
                        person most in each currently playable game.
                    </p>
                </div>

                <Card className="border-slate-800 bg-slate-900/80">
                    <CardHeader>
                        <CardTitle className="text-lg text-white">Google Sheets Import</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <label className="space-y-2">
                            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                Picks CSV URL
                            </div>
                            <input
                                type="text"
                                value={picksSheetUrl}
                                onChange={(event) => setPicksSheetUrl(event.target.value)}
                                placeholder="Published picks CSV URL"
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-500"
                            />
                        </label>

                        <div className="flex flex-wrap items-center gap-3">
                            <Button
                                type="button"
                                variant="secondary"
                                className="bg-slate-800 text-white hover:bg-slate-700"
                                onClick={handleLoadGoogleSheets}
                                disabled={sheetLoading}
                            >
                                {sheetLoading ? "Loading Sheets..." : "Load From Google Sheets"}
                            </Button>
                            {sheetSuccess ? (
                                <span className="text-sm text-emerald-300">{sheetSuccess}</span>
                            ) : null}
                        </div>

                        {sheetError ? (
                            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
                                {sheetError}
                            </div>
                        ) : null}

                        <div className="grid gap-4 xl:grid-cols-2">
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
                                <div className="font-semibold text-white">Games tab columns</div>
                                <div className="mt-2 text-xs leading-6 text-slate-400">
                                    `round`, `region`, `seed_a`, `team_a`, `seed_b`, `team_b`,
                                    `winner`
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
                                <div className="font-semibold text-white">Picks tab columns</div>
                                <div className="mt-2 text-xs leading-6 text-slate-400">
                                    `player`, `round`, `region`, `seed_a`, `team_a`, `seed_b`,
                                    `team_b`, optional `winner`
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
                                <div className="font-semibold text-white">How To Maintain The Sheets</div>
                                <ol className="mt-3 list-decimal space-y-2 pl-4 text-xs leading-6 text-slate-400">
                                    <li>
                                        Keep one tab for actual games/results and one tab for picks. Use
                                        the exact tab names you enter above.
                                    </li>
                                    <li>
                                        Put every actual tournament game in the games tab. If the
                                        game has already been played, fill in `winner`. If the game
                                        has not been played yet, leave `winner` blank.
                                    </li>
                                    <li>
                                        The app maps regional games into the standard NCAA bracket
                                        automatically from round, region, and seed pairings such as
                                        `1 vs 16`, `8 vs 9`, `5 vs 12`, and so on.
                                    </li>
                                    <li>
                                        Final Four pairing is fixed to `EAST vs SOUTH` and
                                        `MIDWEST vs WEST` for simulation purposes.
                                    </li>
                                    <li>
                                        In the picks tab, add one row per player per game they
                                        picked. The app will infer bracket slots from round, region,
                                        and seeds.
                                    </li>
                                    <li>
                                        If you include a `winner` column on the picks tab, the app
                                        will use it directly. If you leave it blank for earlier
                                        rounds, it will try to infer the picked winner from that
                                        player&apos;s later-round rows.
                                    </li>
                                    <li>
                                        When a real game result is added to the games tab, reload the
                                        sheet here and the standings plus future rooting model will
                                        update automatically.
                                    </li>
                                </ol>
                            </div>

                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
                                <div className="font-semibold text-white">How To Make The Sheet Readable</div>
                                <ol className="mt-3 list-decimal space-y-2 pl-4 text-xs leading-6 text-slate-400">
                                    <li>
                                        Open the Google Sheet and click <span className="font-semibold text-slate-200">Share</span>.
                                    </li>
                                    <li>
                                        Under general access, change it to{" "}
                                        <span className="font-semibold text-slate-200">Anyone with the link</span>.
                                    </li>
                                    <li>
                                        Set permission to{" "}
                                        <span className="font-semibold text-slate-200">Viewer</span>.
                                    </li>
                                    <li>
                                        Make sure the sheet is not restricted to your organization only,
                                        otherwise the browser fetch will fail.
                                    </li>
                                    <li>
                                        Copy the sheet id from the URL. It is the long value between
                                        `/d/` and `/edit`.
                                    </li>
                                    <li>
                                        If link sharing still does not work, use Google Sheets{" "}
                                        <span className="font-semibold text-slate-200">File &gt; Share &gt; Publish to web</span>
                                        and keep the tabs publicly available.
                                    </li>
                                </ol>
                            </div>
                        </div>

                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs leading-6 text-emerald-100">
                            Example games tab row:
                            <br />
                            `1 | East | 1 | Duke | 16 | Mount St. Mary&apos;s | Duke`
                            <br />
                            Example future game row:
                            <br />
                            `2 | East | 1 | Duke | 8 | Mississippi State |`
                            <br />
                            Example picks tab row:
                            <br />
                            `Mark | 1 | East | 1 | Duke | 16 | Mount St. Mary&apos;s | Duke`
                        </div>

                        <p className="text-xs text-slate-400">
                            The master games sheet runs in the background. Users only need to supply
                            the published CSV URL for the picks sheet.
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-slate-800 bg-slate-900/80">
                    <CardHeader>
                        <CardTitle className="text-lg text-white">Scoring Rules</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                            {ROUND_LABELS.map((label, index) => (
                                <label key={label} className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        {label}
                                    </div>
                                    <input
                                        type="number"
                                        min={0}
                                        value={scoring[index] ?? 0}
                                        onChange={(event) => {
                                            const next = [...scoring];
                                            next[index] = Number(event.target.value) || 0;
                                            setScoring(next);
                                        }}
                                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-500"
                                    />
                                </label>
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Button
                                type="button"
                                variant="secondary"
                                className="bg-slate-800 text-white hover:bg-slate-700"
                                onClick={() => setScoring(DEFAULT_SCORING)}
                            >
                                Reset to 1-2-4-8-16-32
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
                    <Card className="border-slate-800 bg-slate-900/80">
                        <CardHeader>
                            <CardTitle className="text-lg text-white">Controls</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    Target Bracket
                                </div>
                                <select
                                    value={targetName}
                                    onChange={(event) => setSelectedTarget(event.target.value)}
                                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-500"
                                >
                                    {participantNames.map((name) => (
                                        <option key={name} value={name}>
                                            {name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <Button
                                type="button"
                                variant="secondary"
                                className="w-full bg-slate-800 text-white hover:bg-slate-700"
                                onClick={() => {
                                    setLoadedData(SAMPLE_DATA);
                                    setSelectedTarget("Mark");
                                    setScoring(DEFAULT_SCORING);
                                    setSheetError("");
                                    setSheetSuccess("Loaded sample bracket data.");
                                }}
                            >
                                Load Sample Data
                            </Button>

                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
                                Best for late-round analysis. The simulator enumerates all valid
                                remaining outcomes, so very large unfinished brackets can exceed the
                                browser-friendly scenario limit.
                            </div>

                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
                                {loadedData
                                    ? `Loaded ${loadedData.games.length} games and ${loadedData.participants.length} brackets.`
                                    : "No bracket data loaded yet. Load from Google Sheets or use the sample data."}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="border-slate-800 bg-slate-900/80">
                    <CardHeader>
                        <CardTitle className="text-lg text-white">Picks Template</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-sm text-slate-300">
                            Paste this tab-separated header row into cell `A1` in Google Sheets for a
                            one-row-per-entrant picks template.
                        </p>
                        <textarea
                            readOnly
                            value={PICKS_TEMPLATE_HEADER}
                            className="min-h-[9rem] w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-100 outline-none"
                        />
                    </CardContent>
                </Card>

                {standings.length > 0 ? (
                    <Card className="border-slate-800 bg-slate-900/80">
                        <CardHeader>
                            <CardTitle className="text-lg text-white">Current Standings</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            {standings.map((entry, index) => (
                                <div
                                    key={entry.name}
                                    className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                                >
                                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        #{index + 1}
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-white">
                                        {entry.name}
                                    </div>
                                    <div className="mt-3 grid gap-2 text-sm text-slate-200">
                                        <div>
                                            Current:{" "}
                                            <span className="font-semibold text-white">
                                                {entry.currentScore}
                                            </span>
                                        </div>
                                        <div>
                                            Points Possible:{" "}
                                            <span className="font-semibold text-white">
                                                {entry.pointsPossible}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                ) : null}

                {analysis ? (
                    <div className="space-y-4">
                        <Card className="border-slate-800 bg-slate-900/80">
                            <CardHeader>
                                <CardTitle className="text-lg text-white">How The Model Works</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm text-slate-300">
                                <p>
                                    The app combines the background games/results sheet with the picks
                                    sheet for every entrant. Completed games use the real winner from
                                    the games sheet and award points immediately based on the scoring
                                    rules above.
                                </p>
                                <p>
                                    `Current Score` is the number of points an entrant has already
                                    earned from completed games. `Points Possible` is the maximum
                                    total they can still finish with if every remaining live pick
                                    breaks their way.
                                </p>
                                <p>
                                    For unresolved games, the model builds the rest of the tournament
                                    from the fixed NCAA bracket path, not just from the currently
                                    visible future matchup text. That lets it handle changing future
                                    combinations correctly.
                                </p>
                                <p>
                                    The rooting guide then simulates the remaining bracket paths and
                                    ranks which winner helps the selected entrant most in each live
                                    game.
                                </p>
                            </CardContent>
                        </Card>

                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-semibold text-white">Rooting Guide</h2>
                                <p className="text-sm text-slate-300">
                                    Recommendations are optimized for{" "}
                                    <span className="font-semibold text-white">{targetName}</span>.
                                </p>
                            </div>
                            {analysis.truncated ? (
                                <Badge variant="outline" className="border-amber-500/40 text-amber-200">
                                    Scenario limit reached
                                </Badge>
                            ) : null}
                        </div>

                        {analysis.guide.length === 0 ? (
                            <Card className="border-slate-800 bg-slate-900/80">
                                <CardContent className="p-6 text-sm text-slate-300">
                                    No currently playable unresolved games were found. Completed
                                    games can have a `winner`, and future games can point at
                                    earlier games with `sourceGameId`.
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="grid gap-4 xl:grid-cols-2">
                                {analysis.guide.map((item) => (
                                    <Card key={item.gameId} className="border-slate-800 bg-slate-900/80">
                                        <CardHeader className="space-y-2">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                        {item.label}
                                                    </div>
                                                    <CardTitle className="text-lg text-white">
                                                        {item.matchup}
                                                    </CardTitle>
                                                </div>
                                                <Badge className="bg-emerald-500/15 text-emerald-200">
                                                    Root for {item.recommendedWinner}
                                                </Badge>
                                            </div>
                                            <p className="text-sm text-slate-300">{item.reason}</p>
                                        </CardHeader>
                                        <CardContent className="grid gap-3 sm:grid-cols-2">
                                            {item.outcomes.map((outcome) => (
                                                <div
                                                    key={`${item.gameId}-${outcome.winner}`}
                                                    className={[
                                                        "rounded-xl border p-3",
                                                        outcome.winner === item.recommendedWinner
                                                            ? "border-emerald-500/40 bg-emerald-500/10"
                                                            : "border-slate-800 bg-slate-950/60",
                                                    ].join(" ")}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="text-sm font-semibold text-white">
                                                            {outcome.winner} wins
                                                        </div>
                                                        <div className="text-xs text-slate-400">
                                                            {outcome.scenarios} scenario
                                                            {outcome.scenarios === 1 ? "" : "s"}
                                                        </div>
                                                    </div>
                                                    <div className="mt-3 grid gap-2 text-sm text-slate-200">
                                                        <div>
                                                            Outright titles for {targetName}:{" "}
                                                            <span className="font-semibold text-white">
                                                                {outcome.targetOutrightWins}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            Titles incl. ties:{" "}
                                                            <span className="font-semibold text-white">
                                                                {outcome.targetSharedWins}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            Best score for {targetName}:{" "}
                                                            <span className="font-semibold text-white">
                                                                {outcome.targetBestScore}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            Best opponent score:{" "}
                                                            <span className="font-semibold text-white">
                                                                {outcome.fieldBestScore}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            Avg. margin vs field:{" "}
                                                            <span className="font-semibold text-white">
                                                                {outcome.averageMargin.toFixed(2)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
