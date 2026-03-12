import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const TOTAL_GAMES = 82;
const TARGET_TEAM = "Buffalo Sabres";
const NHL_API_BASE = "https://api-web.nhle.com";

type LocalizedValue = {
    default?: string;
};

type NhlStanding = {
    teamName?: LocalizedValue;
    teamCommonName?: LocalizedValue;
    teamAbbrev?: LocalizedValue;
    conferenceAbbrev?: string;
    gamesPlayed?: number;
    points?: number;
    regulationWins?: number;
    regulationPlusOtWins?: number;
    overtimeWins?: number;
    otWins?: number;
    wins?: number;
    losses?: number;
    otLosses?: number;
    l10Wins?: number;
    l10Losses?: number;
    l10OtLosses?: number;
};

type TeamMax = {
    team: string;
    abbrev: string;
    conference: string;
    gp: number;
    pts: number;
    gamesLeft: number;
    maxPoints: number;
    regulationWins: number | null;
    overtimeWins: number | null;
    overtimeLosses: number | null;
    last10: string | null;
    pointPct: number | null;
};

type ScheduleTeam = {
    abbrev?: string | LocalizedValue;
    commonName?: LocalizedValue;
    placeName?: LocalizedValue;
};

type ScheduleGame = {
    startTimeUTC?: string;
    gameState?: string;
    homeTeam?: ScheduleTeam;
    awayTeam?: ScheduleTeam;
};

type OpponentPreview = {
    label: string;
    dateLabel: string;
    difficulty: number | null;
};

type CatchTeamRow = {
    team: string;
    teamAbbrev: string;
    currentPoints: number;
    gamesLeft: number;
    maxPoints: number;
    regulationOvertimeSplit: string | null;
    trendLast10: string | null;
    nextOpponents: OpponentPreview[];
    difficultyScore: number | null;
};

type SabresData = {
    currentPoints: number;
    gamesPlayed: number;
    gamesLeft: number;
    maxPossiblePoints: number;
    clinchTarget: number;
    magicPointsNeeded: number;
    catchRows: CatchTeamRow[];
};

function getLocalizedText(value?: string | LocalizedValue | null) {
    if (!value) return "";
    if (typeof value === "string") return value;
    return value.default ?? "";
}

function getTeamLabel(team?: ScheduleTeam) {
    const abbrev = getLocalizedText(team?.abbrev);
    const place = getLocalizedText(team?.placeName);
    const common = getLocalizedText(team?.commonName);

    return [place, common].filter(Boolean).join(" ") || abbrev || "TBD";
}

function getTeamAbbrev(team?: ScheduleTeam) {
    return getLocalizedText(team?.abbrev).toUpperCase();
}

function formatLast10(team: NhlStanding) {
    if (
        typeof team.l10Wins !== "number" ||
        typeof team.l10Losses !== "number" ||
        typeof team.l10OtLosses !== "number"
    ) {
        return null;
    }

    return `${team.l10Wins}-${team.l10Losses}-${team.l10OtLosses}`;
}

function formatRegulationOvertimeSplit(team: NhlStanding) {
    const regulationWins =
        typeof team.regulationWins === "number" ? team.regulationWins : null;
    const overtimeWins =
        typeof team.overtimeWins === "number"
            ? team.overtimeWins
            : typeof team.otWins === "number"
              ? team.otWins
              : typeof team.regulationPlusOtWins === "number" && regulationWins !== null
                ? Math.max(0, team.regulationPlusOtWins - regulationWins)
                : null;
    const overtimeLosses =
        typeof team.otLosses === "number" ? team.otLosses : null;

    if (
        regulationWins === null &&
        overtimeWins === null &&
        overtimeLosses === null
    ) {
        return null;
    }

    return `RW ${regulationWins ?? "—"} | OTW ${overtimeWins ?? "—"} | OTL ${overtimeLosses ?? "—"}`;
}

function getPointPct(team: NhlStanding) {
    const gamesPlayed = team.gamesPlayed ?? 0;
    const points = team.points ?? 0;

    if (!gamesPlayed) return null;
    return points / (gamesPlayed * 2);
}

function computeDifficultyScore(opponents: OpponentPreview[]) {
    const valid = opponents.filter(
        (opponent) => typeof opponent.difficulty === "number"
    );

    if (!valid.length) return null;

    const average =
        valid.reduce((sum, opponent) => sum + (opponent.difficulty ?? 0), 0) /
        valid.length;

    return Math.round(average);
}

function formatGameDate(dateValue?: string) {
    if (!dateValue) return "TBD";

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
    }).format(new Date(dateValue));
}

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return response.json() as Promise<T>;
}

async function loadUpcomingOpponents(
    teamAbbrev: string,
    pointPctByAbbrev: Map<string, number>
) {
    const seasonNowUrl = `${NHL_API_BASE}/v1/club-schedule-season/${teamAbbrev}/now`;
    const scheduleJson = await fetchJson<{ games?: ScheduleGame[] }>(seasonNowUrl);
    const games = scheduleJson.games ?? [];
    const now = Date.now();

    const nextGames = games
        .filter((game) => {
            if (!game.startTimeUTC) return false;
            return new Date(game.startTimeUTC).getTime() >= now;
        })
        .sort((a, b) => {
            const aTime = a.startTimeUTC ? new Date(a.startTimeUTC).getTime() : 0;
            const bTime = b.startTimeUTC ? new Date(b.startTimeUTC).getTime() : 0;
            return aTime - bTime;
        })
        .slice(0, 3);

    return nextGames.map((game) => {
        const homeAbbrev = getTeamAbbrev(game.homeTeam);
        const awayAbbrev = getTeamAbbrev(game.awayTeam);
        const isHome = homeAbbrev === teamAbbrev;
        const opponent = isHome ? game.awayTeam : game.homeTeam;
        const opponentAbbrev = isHome ? awayAbbrev : homeAbbrev;
        const opponentPct = pointPctByAbbrev.get(opponentAbbrev);
        const venueLabel = isHome ? "vs" : "@";
        const difficulty =
            typeof opponentPct === "number"
                ? Math.round(Math.min(100, opponentPct * 100 + (isHome ? 0 : 5)))
                : null;

        return {
            label: `${venueLabel} ${getTeamLabel(opponent)}`,
            dateLabel: formatGameDate(game.startTimeUTC),
            difficulty,
        };
    });
}

function summaryCard(label: string, value: string | number) {
    return (
        <Card className="border-slate-800 bg-slate-900/80">
            <CardContent className="p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</div>
                <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
            </CardContent>
        </Card>
    );
}

export default function SabresMagicNumberPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [data, setData] = useState<SabresData | null>(null);

    useEffect(() => {
        async function loadStandings() {
            try {
                setLoading(true);
                setError("");

                const standingsJson = await fetchJson<{ standings?: NhlStanding[] }>(
                    `${NHL_API_BASE}/v1/standings/now`
                );
                const standings = standingsJson.standings ?? [];

                const teams: TeamMax[] = standings.map((team) => {
                    const gp = team.gamesPlayed ?? 0;
                    const pts = team.points ?? 0;
                    const gamesLeft = TOTAL_GAMES - gp;

                    return {
                        team: getLocalizedText(team.teamName) || "Unknown Team",
                        abbrev: getLocalizedText(team.teamAbbrev).toUpperCase(),
                        conference: team.conferenceAbbrev ?? "",
                        gp,
                        pts,
                        gamesLeft,
                        maxPoints: pts + gamesLeft * 2,
                        regulationWins:
                            typeof team.regulationWins === "number"
                                ? team.regulationWins
                                : null,
                        overtimeWins:
                            typeof team.overtimeWins === "number"
                                ? team.overtimeWins
                                : typeof team.otWins === "number"
                                  ? team.otWins
                                  : typeof team.regulationPlusOtWins === "number" &&
                                      typeof team.regulationWins === "number"
                                    ? Math.max(0, team.regulationPlusOtWins - team.regulationWins)
                                    : null,
                        overtimeLosses:
                            typeof team.otLosses === "number" ? team.otLosses : null,
                        last10: formatLast10(team),
                        pointPct: getPointPct(team),
                    };
                });

                const pointPctByAbbrev = new Map<string, number>(
                    teams
                        .filter(
                            (team): team is TeamMax & { pointPct: number } =>
                                typeof team.pointPct === "number"
                        )
                        .map((team) => [team.abbrev, team.pointPct])
                );

                const east = teams
                    .filter((team) => team.conference === "E")
                    .sort((a, b) => {
                        if (b.maxPoints !== a.maxPoints) return b.maxPoints - a.maxPoints;
                        if (b.pts !== a.pts) return b.pts - a.pts;
                        return a.team.localeCompare(b.team);
                    });

                const sabres = east.find((team) => team.team === TARGET_TEAM);

                if (!sabres) {
                    throw new Error("Buffalo Sabres not found in standings");
                }

                if (east.length < 9) {
                    throw new Error("Unexpected Eastern Conference standings data");
                }

                const competingTeams = east.filter(
                    (team) => team.team !== TARGET_TEAM && team.maxPoints >= sabres.pts
                );

                const upcomingByTeam = await Promise.all(
                    competingTeams.map(async (team) => {
                        try {
                            const nextOpponents = await loadUpcomingOpponents(
                                team.abbrev,
                                pointPctByAbbrev
                            );

                            return [team.abbrev, nextOpponents] as const;
                        } catch (scheduleError) {
                            console.error(`Failed to load schedule for ${team.abbrev}:`, scheduleError);
                            return [team.abbrev, [] as OpponentPreview[]] as const;
                        }
                    })
                );

                const upcomingMap = new Map(upcomingByTeam);

                const catchRows: CatchTeamRow[] = competingTeams
                    .map((team) => {
                        const nextOpponents = upcomingMap.get(team.abbrev) ?? [];

                        return {
                            team: team.team,
                            teamAbbrev: team.abbrev,
                            currentPoints: team.pts,
                            gamesLeft: team.gamesLeft,
                            maxPoints: team.maxPoints,
                            regulationOvertimeSplit: formatRegulationOvertimeSplit({
                                regulationWins: team.regulationWins ?? undefined,
                                overtimeWins: team.overtimeWins ?? undefined,
                                otLosses: team.overtimeLosses ?? undefined,
                            }),
                            trendLast10: team.last10,
                            nextOpponents,
                            difficultyScore: computeDifficultyScore(nextOpponents),
                        };
                    })
                    .sort((a, b) => {
                        if (b.maxPoints !== a.maxPoints) return b.maxPoints - a.maxPoints;
                        return b.currentPoints - a.currentPoints;
                    });

                const eastWithoutSabres = east.filter((team) => team.team !== TARGET_TEAM);

                const teamsThatCouldFinishAboveSabres = eastWithoutSabres
                    .filter((team) => team.maxPoints >= sabres.pts)
                    .sort((a, b) => {
                        if (b.maxPoints !== a.maxPoints) return b.maxPoints - a.maxPoints;
                        return b.pts - a.pts;
                    });

                const eighthChallengerMax =
                    teamsThatCouldFinishAboveSabres.length >= 8
                        ? teamsThatCouldFinishAboveSabres[7].maxPoints
                        : 0;

                const clinchTarget = eighthChallengerMax + 1;
                const magicPointsNeeded = Math.max(0, clinchTarget - sabres.pts);

                setData({
                    currentPoints: sabres.pts,
                    gamesPlayed: sabres.gp,
                    gamesLeft: sabres.gamesLeft,
                    maxPossiblePoints: sabres.maxPoints,
                    clinchTarget,
                    magicPointsNeeded,
                    catchRows,
                });
            } catch (loadError) {
                console.error("Failed to load standings:", loadError);
                setError(
                    loadError instanceof Error ? loadError.message : "Failed to load standings"
                );
            } finally {
                setLoading(false);
            }
        }

        loadStandings();
    }, []);

    if (loading) {
        return <div className="px-4 py-6 text-white">Loading Sabres standings...</div>;
    }

    if (error) {
        return <div className="px-4 py-6 text-red-400">{error}</div>;
    }

    if (!data) {
        return <div className="px-4 py-6 text-white">No data available.</div>;
    }

    return (
        <div className="min-h-screen bg-slate-950 px-3 py-4 text-white sm:px-4 md:px-6">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold sm:text-3xl">Sabres Magic Number</h1>
                    <p className="max-w-3xl text-sm text-slate-300 sm:text-base">
                        Competing teams show current points, remaining games, maximum possible
                        points, next three opponents, available regulation/overtime splits, last-10
                        trend, and a 0-100 difficulty score for the next three games.
                    </p>
                    <p className="text-xs text-slate-400">
                        Difficulty score uses opponent points percentage with a small road-game bump.
                    </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {summaryCard("Current Points", data.currentPoints)}
                    {summaryCard("Games Played", data.gamesPlayed)}
                    {summaryCard("Games Left", data.gamesLeft)}
                    {summaryCard("Max Possible", data.maxPossiblePoints)}
                    {summaryCard("Magic Points Needed", data.magicPointsNeeded)}
                </div>

                <Card className="border-slate-800 bg-slate-900/70">
                    <CardHeader>
                        <CardTitle className="text-lg text-white">
                            Points Needed To Stay Above 9th
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-slate-200">
                        Buffalo guarantees a finish above ninth place by reaching{" "}
                        <span className="font-semibold text-white">{data.clinchTarget}</span> points.
                    </CardContent>
                </Card>

                <div className="grid gap-4 lg:grid-cols-2">
                    {data.catchRows.map((row) => (
                        <Card key={row.teamAbbrev} className="border-slate-800 bg-slate-900/80">
                            <CardHeader className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <CardTitle className="text-lg text-white">{row.team}</CardTitle>
                                    <Badge variant="secondary" className="bg-slate-800 text-slate-200">
                                        {row.teamAbbrev}
                                    </Badge>
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-sm">
                                    <div className="rounded-xl bg-slate-950/70 p-3">
                                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                            Current
                                        </div>
                                        <div className="mt-1 text-xl font-semibold text-white">
                                            {row.currentPoints}
                                        </div>
                                    </div>
                                    <div className="rounded-xl bg-slate-950/70 p-3">
                                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                            Left
                                        </div>
                                        <div className="mt-1 text-xl font-semibold text-white">
                                            {row.gamesLeft}
                                        </div>
                                    </div>
                                    <div className="rounded-xl bg-slate-950/70 p-3">
                                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                            Max
                                        </div>
                                        <div className="mt-1 text-xl font-semibold text-white">
                                            {row.maxPoints}
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                        <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                            Regulation / Overtime
                                        </div>
                                        <div className="mt-2 text-sm text-slate-100">
                                            {row.regulationOvertimeSplit ?? "Not available"}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                        <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                            Last 10 Trend
                                        </div>
                                        <div className="mt-2 text-sm text-slate-100">
                                            {row.trendLast10 ?? "Not available"}
                                        </div>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                            Next 3 Opponents
                                        </div>
                                        <div className="text-sm text-slate-200">
                                            Difficulty Score:{" "}
                                            <span className="font-semibold text-white">
                                                {row.difficultyScore ?? "—"}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="mt-3 grid gap-2">
                                        {row.nextOpponents.length === 0 ? (
                                            <div className="text-sm text-slate-400">
                                                Upcoming schedule not available.
                                            </div>
                                        ) : (
                                            row.nextOpponents.map((opponent) => (
                                                <div
                                                    key={`${row.teamAbbrev}-${opponent.dateLabel}-${opponent.label}`}
                                                    className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/80 px-3 py-2"
                                                >
                                                    <div>
                                                        <div className="text-sm font-medium text-white">
                                                            {opponent.label}
                                                        </div>
                                                        <div className="text-xs text-slate-400">
                                                            {opponent.dateLabel}
                                                        </div>
                                                    </div>
                                                    <Badge
                                                        variant="outline"
                                                        className="border-slate-700 text-slate-200"
                                                    >
                                                        {opponent.difficulty ?? "—"}
                                                    </Badge>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
