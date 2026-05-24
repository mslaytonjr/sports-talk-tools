type Forward = {
    name: string;
    position: string;
    handedness?: string;
    gp: number;
    goals: number;
    assists: number;
    points: number;
    plusMinus: number;
    shots: number;
    shootingPct: number;
    toi: string;
    ppGoals: number;
    shGoals: number;
    tags: string[];
    edgeBonus?: number;
};

type Defenseman = {
    name: string;
    side: string;
    gp: number;
    goals: number;
    assists: number;
    points: number;
    plusMinus: number;
    shots: number;
    toi: string;
    tags: string[];
    edgeBonus?: number;
};

const forwards: Forward[] = [
    {
        name: "Tage Thompson",
        position: "C/RW",
        gp: 81,
        goals: 40,
        assists: 41,
        points: 81,
        plusMinus: -6,
        shots: 272,
        shootingPct: 14.7,
        toi: "19:14",
        ppGoals: 6,
        shGoals: 0,
        tags: ["elite shot", "volume shooter", "PP finisher"],
        edgeBonus: 11,
    },
    {
        name: "Alex Tuch",
        position: "RW/C",
        gp: 79,
        goals: 33,
        assists: 33,
        points: 66,
        plusMinus: 24,
        shots: 195,
        shootingPct: 16.9,
        toi: "18:59",
        ppGoals: 7,
        shGoals: 3,
        tags: ["two-way driver", "net-front scorer", "PK threat"],
        edgeBonus: 5,
    },
    {
        name: "Ryan McLeod",
        position: "C",
        gp: 81,
        goals: 14,
        assists: 40,
        points: 54,
        plusMinus: 25,
        shots: 90,
        shootingPct: 15.6,
        toi: "17:36",
        ppGoals: 0,
        shGoals: 5,
        tags: ["transition center", "defensive matchup", "PK driver"],
        edgeBonus: 4,
    },
    {
        name: "Josh Doan",
        position: "RW/C",
        gp: 82,
        goals: 25,
        assists: 27,
        points: 52,
        plusMinus: -4,
        shots: 170,
        shootingPct: 14.7,
        toi: "15:51",
        ppGoals: 9,
        shGoals: 0,
        tags: ["high-danger shooter", "net-front", "PP option"],
        edgeBonus: 9,
    },
    {
        name: "Jack Quinn",
        position: "RW/LW",
        gp: 82,
        goals: 20,
        assists: 31,
        points: 51,
        plusMinus: 4,
        shots: 191,
        shootingPct: 10.5,
        toi: "15:39",
        ppGoals: 4,
        shGoals: 0,
        tags: ["playmaking wing", "shot volume", "secondary scorer"],
        edgeBonus: 3,
    },
    {
        name: "Jordan Greenway",
        position: "LW/RW",
        gp: 40,
        goals: 1,
        assists: 5,
        points: 6,
        plusMinus: -10,
        shots: 29,
        shootingPct: 3.1,
        toi: "12:27",
        ppGoals: 0,
        shGoals: 0,
        tags: ["checking wing", "size", "defensive depth"],
        edgeBonus: 1,
    },
    {
        name: "Jason Zucker",
        position: "LW",
        gp: 62,
        goals: 24,
        assists: 21,
        points: 45,
        plusMinus: -5,
        shots: 128,
        shootingPct: 18.8,
        toi: "15:37",
        ppGoals: 10,
        shGoals: 0,
        tags: ["PP scorer", "slot finisher", "veteran"],
        edgeBonus: 4,
    },
    {
        name: "Zach Benson",
        position: "LW/C",
        gp: 65,
        goals: 13,
        assists: 30,
        points: 43,
        plusMinus: 27,
        shots: 116,
        shootingPct: 11.2,
        toi: "15:53",
        ppGoals: 1,
        shGoals: 1,
        tags: ["puck retriever", "two-way playmaker", "forecheck"],
        edgeBonus: 7,
    },
    {
        name: "Peyton Krebs",
        position: "C/LW",
        gp: 82,
        goals: 12,
        assists: 27,
        points: 39,
        plusMinus: 13,
        shots: 93,
        shootingPct: 12.9,
        toi: "13:45",
        ppGoals: 0,
        shGoals: 0,
        tags: ["bottom-six center", "possession support", "forecheck"],
        edgeBonus: 2,
    },
    {
        name: "Justin Danforth",
        position: "RW/C",
        gp: 4,
        goals: 0,
        assists: 0,
        points: 0,
        plusMinus: -2,
        shots: 2,
        shootingPct: 0,
        toi: "6:14",
        ppGoals: 0,
        shGoals: 0,
        tags: ["depth wing", "signed depth", "energy"],
        edgeBonus: 0,
    },
    {
        name: "Josh Norris",
        position: "C",
        gp: 44,
        goals: 13,
        assists: 21,
        points: 34,
        plusMinus: 11,
        shots: 69,
        shootingPct: 18.8,
        toi: "15:49",
        ppGoals: 2,
        shGoals: 0,
        tags: ["offensive-zone center", "PP bumper", "finish"],
        edgeBonus: 8,
    },
    {
        name: "Noah Ostlund",
        position: "C/LW",
        gp: 60,
        goals: 11,
        assists: 16,
        points: 27,
        plusMinus: 11,
        shots: 60,
        shootingPct: 18.3,
        toi: "13:58",
        ppGoals: 2,
        shGoals: 0,
        tags: ["skill center", "efficient scorer", "sheltered offense"],
        edgeBonus: 3,
    },
    {
        name: "Konsta Helenius",
        position: "C/RW",
        gp: 9,
        goals: 1,
        assists: 3,
        points: 4,
        plusMinus: 1,
        shots: 15,
        shootingPct: 6.7,
        toi: "11:55",
        ppGoals: 0,
        shGoals: 0,
        tags: ["entry-level prospect", "AHL scorer", "middle-six upside"],
        edgeBonus: 7,
    },
    {
        name: "Sam Carrick",
        position: "C/RW",
        gp: 73,
        goals: 9,
        assists: 7,
        points: 16,
        plusMinus: 2,
        shots: 75,
        shootingPct: 12,
        toi: "10:28",
        ppGoals: 0,
        shGoals: 0,
        tags: ["checking", "faceoff support", "physical"],
        edgeBonus: 1,
    },
    {
        name: "Tyson Kozak",
        position: "C/LW",
        gp: 46,
        goals: 2,
        assists: 4,
        points: 6,
        plusMinus: -1,
        shots: 30,
        shootingPct: 6.7,
        toi: "11:17",
        ppGoals: 0,
        shGoals: 0,
        tags: ["young checker", "faceoff support", "RFA control"],
        edgeBonus: 1,
    },
    {
        name: "Tanner Pearson",
        position: "LW",
        gp: 56,
        goals: 7,
        assists: 8,
        points: 15,
        plusMinus: 9,
        shots: 52,
        shootingPct: 13.5,
        toi: "10:49",
        ppGoals: 0,
        shGoals: 0,
        tags: ["veteran wing", "responsible depth", "net-front"],
        edgeBonus: 1,
    },
    {
        name: "Beck Malenstyn",
        position: "LW/RW",
        gp: 81,
        goals: 7,
        assists: 7,
        points: 14,
        plusMinus: 0,
        shots: 72,
        shootingPct: 9.7,
        toi: "11:14",
        ppGoals: 0,
        shGoals: 1,
        tags: ["checking wing", "PK depth", "forecheck"],
        edgeBonus: 1,
    },
    {
        name: "Jiri Kulich",
        position: "C/LW",
        gp: 12,
        goals: 3,
        assists: 2,
        points: 5,
        plusMinus: -4,
        shots: 20,
        shootingPct: 15,
        toi: "16:21",
        ppGoals: 0,
        shGoals: 0,
        tags: ["young scorer", "shot-first", "upside"],
        edgeBonus: 2,
    },
];

const defensemen: Defenseman[] = [
    {
        name: "Rasmus Dahlin",
        side: "LD/RD",
        gp: 77,
        goals: 19,
        assists: 55,
        points: 74,
        plusMinus: 18,
        shots: 194,
        toi: "24:11",
        tags: ["No. 1 driver", "offensive-zone engine", "PP1"],
        edgeBonus: 12,
    },
    {
        name: "Mattias Samuelsson",
        side: "LD/RD",
        gp: 78,
        goals: 13,
        assists: 28,
        points: 41,
        plusMinus: 41,
        shots: 109,
        toi: "22:49",
        tags: ["shutdown", "plus-minus anchor", "heavy minutes"],
        edgeBonus: 5,
    },
    {
        name: "Bowen Byram",
        side: "LD",
        gp: 82,
        goals: 11,
        assists: 31,
        points: 42,
        plusMinus: 15,
        shots: 109,
        toi: "22:20",
        tags: ["puck mover", "transition", "secondary offense"],
        edgeBonus: 5,
    },
    {
        name: "Owen Power",
        side: "LD/RD",
        gp: 81,
        goals: 8,
        assists: 21,
        points: 29,
        plusMinus: 9,
        shots: 120,
        toi: "21:39",
        tags: ["minutes eater", "breakout", "reach defender"],
        edgeBonus: 4,
    },
    {
        name: "Logan Stanley",
        side: "LD",
        gp: 76,
        goals: 9,
        assists: 17,
        points: 26,
        plusMinus: 3,
        shots: 96,
        toi: "16:41",
        tags: ["size", "third-pair shot", "PK depth"],
        edgeBonus: 1,
    },
    {
        name: "Conor Timmins",
        side: "RD",
        gp: 39,
        goals: 0,
        assists: 8,
        points: 8,
        plusMinus: -8,
        shots: 44,
        toi: "18:45",
        tags: ["right shot", "puck mover", "third-pair"],
        edgeBonus: 1,
    },
    {
        name: "Zach Metsa",
        side: "RD/LD",
        gp: 43,
        goals: 2,
        assists: 4,
        points: 6,
        plusMinus: 16,
        shots: 45,
        toi: "14:20",
        tags: ["puck mover", "signed depth", "positive results"],
        edgeBonus: 2,
    },
    {
        name: "Luke Schenn",
        side: "RD",
        gp: 50,
        goals: 1,
        assists: 6,
        points: 7,
        plusMinus: -12,
        shots: 35,
        toi: "13:39",
        tags: ["right shot", "physical", "shelter minutes"],
        edgeBonus: 0,
    },
];

const ufaNames = new Set([
    "Alex Tuch",
    "Tanner Pearson",
    "Beck Malenstyn",
    "Joshua Dunne",
    "Luke Schenn",
    "Logan Stanley",
]);
const excludedForwardNames = new Set([...ufaNames].filter((name) => forwards.some((player) => player.name === name)));
const excludedDefenseNames = new Set([...ufaNames].filter((name) => defensemen.some((player) => player.name === name)));
const eligibleForwards = forwards.filter((player) => !excludedForwardNames.has(player.name));
const eligibleDefensemen = defensemen.filter((player) => !excludedDefenseNames.has(player.name));

const forwardLineSlots = [
    {
        label: "Line 1",
        role: "Primary scoring line",
        productionWeight: 0.48,
        roleWeight: 0.22,
        centerWeight: 0.14,
        usageTarget: 17,
        usageWeight: 0.08,
        shooterBonus: 7,
        playmakerBonus: 5,
        defensiveBonus: 1,
        prospectBonus: 0,
    },
    {
        label: "Line 2",
        role: "Skill and possession line",
        productionWeight: 0.4,
        roleWeight: 0.25,
        centerWeight: 0.16,
        usageTarget: 16,
        usageWeight: 0.09,
        shooterBonus: 5,
        playmakerBonus: 7,
        defensiveBonus: 3,
        prospectBonus: 2,
    },
    {
        label: "Line 3",
        role: "Matchup line with scoring pop",
        productionWeight: 0.3,
        roleWeight: 0.27,
        centerWeight: 0.18,
        usageTarget: 14.5,
        usageWeight: 0.11,
        shooterBonus: 4,
        playmakerBonus: 4,
        defensiveBonus: 7,
        prospectBonus: 4,
    },
    {
        label: "Line 4",
        role: "Checking line",
        productionWeight: 0.22,
        roleWeight: 0.25,
        centerWeight: 0.18,
        usageTarget: 12,
        usageWeight: 0.15,
        shooterBonus: 1,
        playmakerBonus: 2,
        defensiveBonus: 10,
        prospectBonus: -2,
    },
];

const recommendedPairs = [
    {
        label: "Pair 1",
        players: ["Rasmus Dahlin", "Mattias Samuelsson"],
        role: "Top matchup pair",
        reason:
            "Dahlin drives exits and offense; Samuelsson's plus-minus and heavy-minute profile makes him the stabilizer.",
    },
    {
        label: "Pair 2",
        players: ["Bowen Byram", "Owen Power"],
        role: "Puck movement pair",
        reason:
            "The second pair leans into transition and controlled breakouts while keeping both high-minute defenders involved.",
    },
    {
        label: "Pair 3",
        players: ["Zach Metsa", "Conor Timmins"],
        role: "Sheltered third pair",
        reason:
            "Metsa's positive on-ice results and Timmins' right-shot puck movement keep the third pair built from non-UFA options.",
    },
];

const sourceLinks = [
    {
        name: "NHL media playoff guide regular-season stats",
        href: "https://media.nhl.com/site/asset/public/ext/2025-26/2026StanleyCupPlayoffs_1stRound.pdf",
    },
    {
        name: "NHL EDGE Sabres advanced-stat notes",
        href: "https://www.nhl.com/news/topic/nhl-edge/nhl-edge-stats-buffalo-sabres-potential-turnaround-2025-26",
    },
];

function pointsPer82(player: { gp: number; points: number }) {
    return (player.points / Math.max(player.gp, 1)) * 82;
}

function goalsPer82(player: { gp: number; goals: number }) {
    return (player.goals / Math.max(player.gp, 1)) * 82;
}

function shotsPer82(player: { gp: number; shots: number }) {
    return (player.shots / Math.max(player.gp, 1)) * 82;
}

function toiMinutes(toi: string) {
    const [minutes, seconds] = toi.split(":").map(Number);
    return minutes + seconds / 60;
}

function forwardScore(player: Forward) {
    return (
        pointsPer82(player) * 0.44 +
        goalsPer82(player) * 0.22 +
        shotsPer82(player) * 0.035 +
        player.plusMinus * 0.18 +
        player.ppGoals * 0.8 +
        player.shGoals * 0.9 +
        toiMinutes(player.toi) * 0.3 +
        (player.edgeBonus ?? 0)
    );
}

function defenseScore(player: Defenseman) {
    return (
        pointsPer82(player) * 0.34 +
        shotsPer82(player) * 0.025 +
        player.plusMinus * 0.24 +
        toiMinutes(player.toi) * 0.65 +
        (player.edgeBonus ?? 0)
    );
}

function hasTag(player: Forward, patterns: string[]) {
    return player.tags.some((tag) => patterns.some((pattern) => tag.includes(pattern)));
}

function canPlayCenter(player: Forward) {
    return player.position.includes("C");
}

function combinations<T>(items: T[], size: number): T[][] {
    if (size === 0) {
        return [[]];
    }
    if (items.length < size) {
        return [];
    }

    return items.flatMap((item, index) =>
        combinations(items.slice(index + 1), size - 1).map((rest) => [item, ...rest])
    );
}

function clampScore(value: number, max = 100) {
    return Math.max(0, Math.min(max, value));
}

function evaluateForwardLine(players: Forward[]) {
    const production = players.reduce((sum, player) => sum + forwardScore(player), 0) / Math.max(players.length, 1);
    const centers = players.filter(canPlayCenter).length;
    const shooterCount = players.filter((player) =>
        hasTag(player, ["shot", "scorer", "finisher", "high-danger"])
    ).length;
    const playmakerCount = players.filter((player) =>
        hasTag(player, ["playmaker", "skill", "transition", "possession"])
    ).length;
    const defensiveCount = players.filter((player) =>
        hasTag(player, ["two-way", "defensive", "checking", "forecheck", "size"])
    ).length;
    const prospectCount = players.filter((player) =>
        hasTag(player, ["prospect", "young", "upside"])
    ).length;
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
        clampScore(production, 100) * 0.38 +
        clampScore(roleBalance, 100) * 0.24 +
        centerFit * 0.18 +
        controlledFit * 0.12 +
        clampScore(usageBalance, 100) * 0.08;

    return {
        total,
        production: clampScore(production, 100),
        roleBalance: clampScore(roleBalance, 100),
        centerFit,
        controlledFit,
        usageBalance: clampScore(usageBalance, 100),
        centers,
        shooterCount,
        playmakerCount,
        defensiveCount,
        prospectCount,
        hasUfa,
    };
}

function evaluateForwardLineForSlot(players: Forward[], slot: (typeof forwardLineSlots)[number]) {
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

function buildForwardLineCandidates(slot: (typeof forwardLineSlots)[number]) {
    return combinations(eligibleForwards, 3)
        .filter((players) => players.some(canPlayCenter))
        .map((players) => ({
            ...slot,
            players: players.map((player) => player.name),
            evaluation: evaluateForwardLineForSlot(players, slot),
        }))
        .sort((left, right) => right.evaluation.total - left.evaluation.total)
        .slice(0, 70);
}

function deriveForwardLines() {
    const candidatesBySlot = forwardLineSlots.map(buildForwardLineCandidates);
    let bestLines: Array<{
        label: string;
        role: string;
        players: string[];
        evaluation: ReturnType<typeof evaluateForwardLineForSlot>;
    }> = [];
    let bestScore = Number.NEGATIVE_INFINITY;

    function search(slotIndex: number, usedNames: Set<string>, selectedLines: typeof bestLines, score: number) {
        if (slotIndex === candidatesBySlot.length) {
            if (score > bestScore) {
                bestScore = score;
                bestLines = selectedLines;
            }
            return;
        }

        for (const candidate of candidatesBySlot[slotIndex]) {
            if (candidate.players.some((name) => usedNames.has(name))) {
                continue;
            }

            const nextUsedNames = new Set(usedNames);
            candidate.players.forEach((name) => nextUsedNames.add(name));
            search(slotIndex + 1, nextUsedNames, [...selectedLines, candidate], score + candidate.evaluation.total);
        }
    }

    search(0, new Set<string>(), [], 0);
    return bestLines;
}

function forwardLineReason(players: Forward[], evaluation: ReturnType<typeof evaluateForwardLine>) {
    const bestProducer = players.slice().sort((a, b) => forwardScore(b) - forwardScore(a))[0];
    const centerNames = players.filter(canPlayCenter).map((player) => player.name);
    const traits = [
        `${evaluation.shooterCount} shooting/scoring profile${evaluation.shooterCount === 1 ? "" : "s"}`,
        `${evaluation.playmakerCount} playmaking/transition profile${evaluation.playmakerCount === 1 ? "" : "s"}`,
        `${evaluation.defensiveCount} defensive/checking profile${evaluation.defensiveCount === 1 ? "" : "s"}`,
    ];

    return [
        `${bestProducer.name} is the highest model-score player on the line.`,
        `Center coverage: ${centerNames.length ? centerNames.join(", ") : "none"}.`,
        `Role mix: ${traits.join(", ")}.`,
        evaluation.hasUfa
            ? "This line is penalized because it contains an unrestricted free agent."
            : "All players are signed or team-controlled in this model.",
    ].join(" ");
}

function defensePairReason(players: Defenseman[]) {
    const bestProducer = players.slice().sort((a, b) => defenseScore(b) - defenseScore(a))[0];
    const sides = players.map((player) => player.side).join(" / ");
    const traits = players.flatMap((player) => player.tags.slice(0, 2)).join(", ");

    return `${bestProducer?.name ?? "This pair"} carries the highest model score on the pair. Side coverage: ${sides}. Traits: ${traits}.`;
}

function findForward(name: string) {
    return forwards.find((player) => player.name === name);
}

function findDefenseman(name: string) {
    return defensemen.find((player) => player.name === name);
}

function LineCard({
    label,
    players,
    role,
    type,
}: {
    label: string;
    players: string[];
    role: string;
    type: "forward" | "defense";
}) {
    const resolvedPlayers = players.map((name) =>
        type === "forward" ? findForward(name) : findDefenseman(name)
    );
    const score = resolvedPlayers.reduce((sum, player) => {
        if (!player) {
            return sum;
        }
        return sum + (type === "forward" ? forwardScore(player as Forward) : defenseScore(player as Defenseman));
    }, 0);
    const forwardPlayers =
        type === "forward" ? resolvedPlayers.filter((player): player is Forward => Boolean(player)) : [];
    const lineEvaluation = type === "forward" ? evaluateForwardLine(forwardPlayers) : null;
    const displayScore = lineEvaluation?.total ?? score;
    const reason =
        type === "forward" && lineEvaluation
            ? forwardLineReason(forwardPlayers, lineEvaluation)
            : defensePairReason(resolvedPlayers.filter((player): player is Defenseman => Boolean(player)));

    return (
        <article className="rounded-[1.6rem] border border-white/10 bg-slate-950/70 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-blue-200/80">
                        {label}
                    </div>
                    <h2 className="mt-2 text-xl font-semibold text-white">{role}</h2>
                </div>
                <div className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-sm font-semibold text-emerald-100">
                    Fit {displayScore.toFixed(1)}
                </div>
            </div>

            <div className={`mt-5 grid gap-3 ${type === "forward" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                {resolvedPlayers.map((player) => {
                    if (!player) {
                        return null;
                    }
                    const playerScore =
                        type === "forward" ? forwardScore(player as Forward) : defenseScore(player as Defenseman);
                    return (
                        <div key={player.name} className="rounded-[1.1rem] border border-white/10 bg-white/5 p-4">
                            <div className="font-semibold text-white">{player.name}</div>
                            <div className="mt-1 text-sm text-slate-400">
                                {"position" in player ? player.position : player.side}
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <div className="text-[0.64rem] uppercase tracking-[0.2em] text-slate-500">
                                        P/82
                                    </div>
                                    <div className="mt-1 font-semibold text-white">
                                        {pointsPer82(player).toFixed(1)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[0.64rem] uppercase tracking-[0.2em] text-slate-500">
                                        Score
                                    </div>
                                    <div className="mt-1 font-semibold text-white">{playerScore.toFixed(1)}</div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {lineEvaluation ? (
                <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-5">
                    {[
                        ["Production", lineEvaluation.production],
                        ["Role Mix", lineEvaluation.roleBalance],
                        ["Center Fit", lineEvaluation.centerFit],
                        ["Control", lineEvaluation.controlledFit],
                        ["Usage", lineEvaluation.usageBalance],
                    ].map(([name, value]) => (
                        <div key={name as string} className="rounded-[0.9rem] border border-white/10 bg-white/5 p-3">
                            <div className="text-[0.58rem] font-bold uppercase tracking-[0.18em] text-slate-500">
                                {name}
                            </div>
                            <div className="mt-1 font-semibold text-white">{(value as number).toFixed(0)}</div>
                        </div>
                    ))}
                </div>
            ) : null}

            <p className="mt-5 text-sm leading-6 text-slate-300">{reason}</p>
        </article>
    );
}

function PlayerRankings() {
    const rankedForwards = eligibleForwards.slice().sort((a, b) => forwardScore(b) - forwardScore(a));
    const rankedDefense = eligibleDefensemen.slice().sort((a, b) => defenseScore(b) - defenseScore(a));

    return (
        <section className="grid gap-5 xl:grid-cols-2">
            <RankingTable title="Forward Fit Rankings" players={rankedForwards} type="forward" />
            <RankingTable title="Defense Fit Rankings" players={rankedDefense} type="defense" />
        </section>
    );
}

function RankingTable({
    title,
    players,
    type,
}: {
    title: string;
    players: Array<Forward | Defenseman>;
    type: "forward" | "defense";
}) {
    return (
        <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/65 p-5">
            <div className="text-[0.72rem] font-bold uppercase tracking-[0.26em] text-slate-400">
                {title}
            </div>
            <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-white/10 text-[0.68rem] uppercase tracking-[0.2em] text-slate-500">
                        <tr>
                            <th className="py-3 pr-4">Player</th>
                            <th className="px-4 py-3">P/82</th>
                            <th className="px-4 py-3">Shots/82</th>
                            <th className="px-4 py-3">+/-</th>
                            <th className="py-3 pl-4 text-right">Fit</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/8">
                        {players.map((player) => (
                            <tr key={player.name}>
                                <td className="py-3 pr-4">
                                    <div className="font-semibold text-white">{player.name}</div>
                                    <div className="mt-1 text-xs text-slate-500">
                                        {player.tags.slice(0, 2).join(" / ")}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-slate-300">{pointsPer82(player).toFixed(1)}</td>
                                <td className="px-4 py-3 text-slate-300">{shotsPer82(player).toFixed(1)}</td>
                                <td className="px-4 py-3 text-slate-300">
                                    {player.plusMinus > 0 ? "+" : ""}
                                    {player.plusMinus}
                                </td>
                                <td className="py-3 pl-4 text-right font-semibold text-white">
                                    {(type === "forward"
                                        ? forwardScore(player as Forward)
                                        : defenseScore(player as Defenseman)
                                    ).toFixed(1)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export default function SabresLineOptimizerPage() {
    const topForward = eligibleForwards.slice().sort((a, b) => forwardScore(b) - forwardScore(a))[0];
    const topDefenseman = eligibleDefensemen.slice().sort((a, b) => defenseScore(b) - defenseScore(a))[0];
    const evaluatedForwardLines = deriveForwardLines();
    const averageLineFit =
        evaluatedForwardLines.reduce((sum, line) => sum + line.evaluation.total, 0) /
        Math.max(evaluatedForwardLines.length, 1);
    const lineSetHasUfa = evaluatedForwardLines.some((line) => line.evaluation.hasUfa);

    return (
        <main className="landing-shell min-h-screen px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 sm:p-8">
                    <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
                        <div className="space-y-4">
                            <div className="landing-kicker">Sabres Line Builder</div>
                            <h1 className="landing-title">Best Potential Lines</h1>
                            <p className="max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                                Derived forward lines and defense pairs using 2025-26 production,
                                shooting volume, special teams value, two-way results, ice time, and
                                public NHL EDGE traits. Injured-reserve status is ignored because the
                                season is over, and unrestricted free agents are excluded from the
                                recommended lines. Konsta Helenius is included as a controlled
                                entry-level prospect.
                            </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-[1.2rem] border border-white/10 bg-white/5 p-4">
                                <div className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-blue-200/80">
                                    Top Forward Fit
                                </div>
                                <div className="mt-2 text-xl font-semibold text-white">{topForward.name}</div>
                                <div className="mt-1 text-sm text-slate-400">
                                    {forwardScore(topForward).toFixed(1)} model score
                                </div>
                            </div>
                            <div className="rounded-[1.2rem] border border-white/10 bg-white/5 p-4">
                                <div className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-blue-200/80">
                                    Top Defense Fit
                                </div>
                                <div className="mt-2 text-xl font-semibold text-white">{topDefenseman.name}</div>
                                <div className="mt-1 text-sm text-slate-400">
                                    {defenseScore(topDefenseman).toFixed(1)} model score
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="rounded-[1.6rem] border border-white/10 bg-white/5 p-5">
                    <div className="text-[0.72rem] font-bold uppercase tracking-[0.26em] text-slate-400">
                        Model Weights
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                        {[
                            "Production: points and goals per 82 games",
                            "Pressure: shots per 82 and high-danger/shot-speed traits",
                            "Trust: plus-minus, shorthanded goals, and ice time",
                            "Fit: center balance, roles, handedness, and line identity",
                        ].map((item) => (
                            <div key={item} className="rounded-[1rem] border border-white/10 bg-slate-950/55 p-4 text-sm text-slate-300">
                                {item}
                            </div>
                        ))}
                    </div>
                </section>

                <section className="rounded-[1.6rem] border border-blue-300/20 bg-blue-300/8 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <div className="text-[0.72rem] font-bold uppercase tracking-[0.26em] text-blue-100/80">
                                Optimization Model
                            </div>
                            <h2 className="mt-2 text-2xl font-semibold text-white">
                                Best non-overlapping combos
                            </h2>
                            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                                The optimizer generates every eligible three-forward combo with at least
                                one center, scores each combo against the role of Lines 1-4, and selects
                                the highest-scoring set without reusing players. Future players enter the
                                same pool with the same production, role, center-fit, control, and usage
                                checks.
                            </p>
                        </div>
                        <div className="rounded-[1.1rem] border border-white/10 bg-slate-950/55 p-4 text-right">
                            <div className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-slate-500">
                                Set Fit
                            </div>
                            <div className="mt-2 text-3xl font-semibold text-white">
                                {averageLineFit.toFixed(1)}
                            </div>
                            <div className="mt-1 text-sm text-slate-400">
                                {lineSetHasUfa ? "Contains UFA penalty" : "No UFA penalty"}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    {evaluatedForwardLines.map((line) => (
                        <LineCard key={line.label} {...line} type="forward" />
                    ))}
                </section>

                <section className="space-y-4">
                    {recommendedPairs.map((pair) => (
                        <LineCard key={pair.label} {...pair} type="defense" />
                    ))}
                </section>

                <PlayerRankings />

                <section className="rounded-[1.4rem] border border-white/10 bg-slate-950/65 p-5 text-sm leading-6 text-slate-300">
                    <div className="text-[0.72rem] font-bold uppercase tracking-[0.26em] text-slate-400">
                        Sources
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3">
                        {sourceLinks.map((source) => (
                            <a
                                key={source.href}
                                href={source.href}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 font-semibold text-white transition hover:bg-white/10"
                            >
                                {source.name}
                            </a>
                        ))}
                    </div>
                </section>
            </div>
        </main>
    );
}
