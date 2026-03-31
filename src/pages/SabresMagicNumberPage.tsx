import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SABRES_API_URL =
    import.meta.env.VITE_SABRES_LAMBDA_URL ?? "https://api.wnysportsnet.com/standings";
const OBJECTIVE_ORDER = ["makePlayoffs", "winDivision", "winConference"] as const;
type ObjectiveKey = (typeof OBJECTIVE_ORDER)[number];

type RegulationOvertimeSplit = {
    regulationWins: number | null;
    overtimeWins: number | null;
    overtimeLosses: number | null;
    label: string;
};

type OpponentPreview = {
    date?: string;
    dateLabel: string;
    opponent: string;
    venue: "vs" | "@";
    matchup: string;
    difficulty: number | null;
};

type RootingGuideGame = {
    gameId: string | number;
    startTimeUTC: string | null;
    matchup: string;
    recommendedOutcome: string;
    impact: string;
    reasoning: string;
    bestCase: {
        outcome: string;
        label: string;
        magicPointsNeeded: number;
        clinchTarget: number;
    };
    worstCase: {
        outcome: string;
        label: string;
        magicPointsNeeded: number;
        clinchTarget: number;
    };
};

type RootingGuideComboOutcome = {
    gameId: string | number;
    matchup: string;
    outcome: string;
    label: string;
};

type RootingGuideComboSummary = {
    games_considered: number;
    best_case: {
        magicPointsNeeded: number;
        clinchTarget: number;
        impact: string;
        outcomes: RootingGuideComboOutcome[];
    };
    worst_case: {
        magicPointsNeeded: number;
        clinchTarget: number;
        outcomes: RootingGuideComboOutcome[];
    };
};

type RootingGuideDay = {
    date: string;
    label: string;
    bestNightCombo?: RootingGuideComboSummary;
    games: RootingGuideGame[];
};

type Competitor = {
    teamKey?: string;
    team: string;
    teamAbbrev: string;
    conference?: string;
    division?: string;
    playoffDisplayLabel?: string | null;
    currentPoints: number;
    gamesRemaining: number;
    maxPossiblePoints: number;
    thresholdPoints?: number;
    tiebreakStatus?: {
        sabresHasClinchableEdge: boolean;
        winningMetric: string | null;
        label: string;
    };
    next3Opponents: OpponentPreview[];
    regulationOvertimeSplit: RegulationOvertimeSplit | null;
    trendLast10: string | null;
    difficultyScore: number | null;
};

type SabresSummary = {
    currentPoints: number;
    gamesPlayed: number;
    gamesRemaining: number;
    maxPossiblePoints: number;
    clinchTarget: number;
    magicPointsNeeded: number;
};

type SabresApiResponse = {
    asOf: string;
    defaultObjective?: ObjectiveKey;
    objectives?: Record<
        ObjectiveKey,
        {
            key: ObjectiveKey;
            title: string;
            description: string;
            sabres: SabresSummary;
            competitors: Competitor[];
            nightlyRootingGuide?: RootingGuideDay[];
        }
    >;
    sabres?: SabresSummary;
    competitors?: Competitor[];
    nightlyRootingGuide?: RootingGuideDay[];
};

function normalizeObjectives(data: SabresApiResponse): NonNullable<SabresApiResponse["objectives"]> {
    if (data.objectives) {
        return data.objectives;
    }

    const fallbackSabres = data.sabres ?? {
        currentPoints: 0,
        gamesPlayed: 0,
        gamesRemaining: 0,
        maxPossiblePoints: 0,
        clinchTarget: 0,
        magicPointsNeeded: 0,
    };
    const fallbackCompetitors = data.competitors ?? [];
    const fallbackGuide = data.nightlyRootingGuide ?? [];

    return {
        makePlayoffs: {
            key: "makePlayoffs",
            title: "Make Playoffs",
            description: "Finish top 3 in the Atlantic or claim one of the 2 Eastern Conference wild cards.",
            sabres: fallbackSabres,
            competitors: fallbackCompetitors,
            nightlyRootingGuide: fallbackGuide,
        },
        winDivision: {
            key: "winDivision",
            title: "Win Division",
            description: "Finish first in the Sabres' division.",
            sabres: fallbackSabres,
            competitors: [],
            nightlyRootingGuide: [],
        },
        winConference: {
            key: "winConference",
            title: "Win Conference",
            description: "Finish first in the Eastern Conference.",
            sabres: fallbackSabres,
            competitors: [],
            nightlyRootingGuide: [],
        },
    };
}

function difficultyLabel(score: number | null) {
    if (score === null) return "Unknown";
    if (score <= 45) return "Soft";
    if (score <= 52) return "Favorable";
    if (score <= 60) return "Neutral";
    if (score <= 70) return "Hard";
    return "Brutal";
}

async function fetchSabresData(url: string) {
    try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return (await response.json()) as SabresApiResponse;
    } catch {
        const retryResponse = await fetch(url, { cache: "no-store" });
        if (!retryResponse.ok) {
            throw new Error(`HTTP ${retryResponse.status}`);
        }

        return (await retryResponse.json()) as SabresApiResponse;
    }
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
    const [data, setData] = useState<SabresApiResponse | null>(null);
    const [selectedObjective, setSelectedObjective] = useState<ObjectiveKey>("makePlayoffs");

    useEffect(() => {
        async function loadSabresData() {
            try {
                setLoading(true);
                setError("");

                if (!SABRES_API_URL) {
                    throw new Error("Missing VITE_SABRES_LAMBDA_URL");
                }

                const json = await fetchSabresData(SABRES_API_URL);
                setData(json);
                setSelectedObjective(json.defaultObjective ?? "makePlayoffs");
            } catch (loadError) {
                console.error("Failed to load Sabres data:", loadError);
                setError(
                    loadError instanceof Error ? loadError.message : "Failed to load Sabres data"
                );
            } finally {
                setLoading(false);
            }
        }

        loadSabresData();
    }, []);

    if (loading) {
        return <div className="px-4 py-6 text-white">Loading Sabres Magic Numbers...</div>;
    }

    if (error) {
        return <div className="px-4 py-6 text-red-400">{error}</div>;
    }

    if (!data) {
        return <div className="px-4 py-6 text-white">No data available.</div>;
    }

    const objectives = normalizeObjectives(data);
    const objective = objectives[selectedObjective] ?? objectives.makePlayoffs;

    return (
        <div className="min-h-screen bg-slate-950 px-3 py-4 text-white sm:px-4 md:px-6">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold sm:text-3xl">Sabres Magic Number</h1>
                    <p className="text-xs text-slate-400">
                        As of {data.asOf}. Data is loaded through the WNYSportsNet Lambda endpoint.
                    </p>
                </div>

                <div className="flex flex-wrap gap-3">
                    {OBJECTIVE_ORDER.map((key) => {
                        const item = objectives[key];
                        const isActive = key === selectedObjective;

                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setSelectedObjective(key)}
                                className={[
                                    "rounded-full border px-4 py-2 text-sm font-medium transition",
                                    isActive
                                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
                                        : "border-slate-700 bg-slate-900/70 text-slate-200 hover:bg-slate-800",
                                ].join(" ")}
                            >
                                {item.title}
                            </button>
                        );
                    })}
                </div>

                <Card className="border-slate-800 bg-slate-900/70">
                    <CardHeader>
                        <CardTitle className="text-lg text-white">{objective.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-slate-200">
                        <p className="text-sm text-slate-300">{objective.description}</p>
                    </CardContent>
                </Card>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {summaryCard("Current Points", objective.sabres.currentPoints)}
                    {summaryCard("Games Played", objective.sabres.gamesPlayed)}
                    {summaryCard("Games Left", objective.sabres.gamesRemaining)}
                    {summaryCard("Max Possible", objective.sabres.maxPossiblePoints)}
                    {summaryCard("Magic Points Needed", objective.sabres.magicPointsNeeded)}
                </div>

                <Card className="border-slate-800 bg-slate-900/70">
                    <CardHeader>
                        <CardTitle className="text-lg text-white">
                            Target To {objective.title}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-slate-200">
                        Buffalo locks in this outcome by reaching{" "}
                        <span className="font-semibold text-white">
                            {objective.sabres.clinchTarget}
                        </span>{" "}
                        points.
                    </CardContent>
                </Card>

                {objective.nightlyRootingGuide && objective.nightlyRootingGuide.length > 0 ? (
                    <div className="space-y-4">
                        <div className="space-y-1">
                            <h2 className="text-xl font-semibold text-white">Nightly Rooting Guide</h2>
                            <p className="text-sm text-slate-300">
                                Each game is simulated across regulation and OT outcomes to find the
                                result that helps Buffalo most.
                            </p>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                            {objective.nightlyRootingGuide.map((day) => (
                                <Card key={day.date} className="border-slate-800 bg-slate-900/80">
                                    <CardHeader>
                                        <CardTitle className="text-lg text-white">{day.label}</CardTitle>
                                    </CardHeader>

                                    <CardContent className="space-y-3">
                                        {day.bestNightCombo ? (
                                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                                                <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">
                                                    Best Full Night For Buffalo
                                                </div>
                                                <div className="mt-2 text-sm text-slate-200">
                                                    Simulated across {day.bestNightCombo.games_considered} relevant games.
                                                </div>
                                                <div className="mt-2 text-sm font-medium text-white">
                                                    Best-case impact: {day.bestNightCombo.best_case.impact}
                                                </div>
                                                <div className="mt-1 text-xs text-slate-300">
                                                    Magic number after slate: {day.bestNightCombo.best_case.magicPointsNeeded}
                                                </div>
                                                <div className="text-xs text-slate-300">
                                                    Clinch target after slate: {day.bestNightCombo.best_case.clinchTarget}
                                                </div>
                                                <div className="mt-3 space-y-2">
                                                    {day.bestNightCombo.best_case.outcomes.map((outcome) => (
                                                        <div
                                                            key={`${day.date}-${outcome.gameId}-${outcome.outcome}`}
                                                            className="rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100"
                                                        >
                                                            <div className="font-medium text-white">{outcome.matchup}</div>
                                                            <div className="text-xs text-slate-300">{outcome.label}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}

                                        {day.games.length === 0 ? (
                                            <div className="text-sm text-slate-400">
                                                No games scheduled.
                                            </div>
                                        ) : (
                                            day.games.map((game) => (
                                                <div
                                                    key={game.gameId}
                                                    className="rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                                                >
                                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-semibold text-white">
                                                                {game.matchup}
                                                            </div>
                                                            <div className="mt-1 text-xs text-slate-400">
                                                                {game.reasoning === "This result gives Buffalo the lowest simulated playoff pressure from this game."
                                                                    || game.reasoning === "This game is close to neutral for Buffalo."
                                                                    ? ""
                                                                    : game.reasoning}
                                                            </div>
                                                        </div>
                                                        {game.impact === "0 clinch target" ? (
                                                            <div className="rounded-md border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                                                                No Impact On Magic Number Currently
                                                            </div>
                                                        ) : null}
                                                    </div>

                                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                                        <div className="rounded-lg bg-slate-900/80 p-3">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                                                    Best Case For Buffalo
                                                                </div>
                                                                {game.impact !== "0 clinch target" ? (
                                                                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-300">
                                                                        {game.impact}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                            <div className="mt-2 text-sm font-medium text-white">
                                                                {game.recommendedOutcome}
                                                            </div>
                                                            <div className="mt-1 text-xs text-slate-400">
                                                                Magic number after game: {game.bestCase.magicPointsNeeded}
                                                            </div>
                                                            <div className="text-xs text-slate-400">
                                                                Clinch target: {game.bestCase.clinchTarget}
                                                            </div>
                                                        </div>

                                                        <div className="rounded-lg bg-slate-900/80 p-3">
                                                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                                                Worst Case For Buffalo
                                                            </div>
                                                            <div className="mt-2 text-sm font-medium text-white">
                                                                {game.worstCase.label}
                                                            </div>
                                                            <div className="mt-1 text-xs text-slate-400">
                                                                Magic number after game: {game.worstCase.magicPointsNeeded}
                                                            </div>
                                                            <div className="text-xs text-slate-400">
                                                                Clinch target: {game.worstCase.clinchTarget}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                ) : null}

                <div className="space-y-3">
                    <div className="space-y-1">
                        <h2 className="text-xl font-semibold text-white">Competing Teams</h2>
                        <p className="text-sm text-slate-300">
                            Competing teams show current points, remaining games, maximum possible
                            points, the tiebreak-aware point threshold Buffalo still needs against
                            them, next three opponents, regulation/overtime split when available,
                            last-10 trend, and a 0-100 difficulty score for the next three games.
                        </p>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                    {objective.competitors.map((row) => (
                        <Card key={row.teamAbbrev} className="border-slate-800 bg-slate-900/80">
                            <CardHeader className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <CardTitle className="text-lg text-white">{row.team}</CardTitle>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {row.playoffDisplayLabel ? (
                                            <Badge
                                                variant="outline"
                                                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                            >
                                                {row.playoffDisplayLabel}
                                            </Badge>
                                        ) : null}
                                        <Badge variant="secondary" className="bg-slate-800 text-slate-200">
                                            {row.teamAbbrev}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
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
                                            {row.gamesRemaining}
                                        </div>
                                    </div>
                                    <div className="rounded-xl bg-slate-950/70 p-3">
                                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                            Max
                                        </div>
                                        <div className="mt-1 text-xl font-semibold text-white">
                                            {row.maxPossiblePoints}
                                        </div>
                                    </div>
                                    <div className="rounded-xl bg-slate-950/70 p-3">
                                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                            Safe At
                                        </div>
                                        <div className="mt-1 text-xl font-semibold text-white">
                                            {row.thresholdPoints ?? row.maxPossiblePoints + 1}
                                        </div>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        Tiebreak Status Vs Buffalo
                                    </div>
                                    <div className="mt-2 text-sm text-slate-100">
                                        {row.tiebreakStatus?.label ?? "Tiebreaker not yet clinched"}
                                    </div>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                        <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                            Regulation / Overtime
                                        </div>
                                        <div className="mt-2 text-sm text-slate-100">
                                            {row.regulationOvertimeSplit?.label ?? "Not available"}
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
                                            Difficulty:{" "}
                                            <span className="font-semibold text-white">
                                                {difficultyLabel(row.difficultyScore)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="mt-3 grid gap-2">
                                        {row.next3Opponents.length === 0 ? (
                                            <div className="text-sm text-slate-400">
                                                Upcoming schedule not available.
                                            </div>
                                        ) : (
                                            row.next3Opponents.map((opponent) => (
                                                <div
                                                    key={`${row.teamAbbrev}-${opponent.dateLabel}-${opponent.matchup}`}
                                                    className="flex items-center justify-between gap-3 rounded-lg bg-slate-900/80 px-3 py-2"
                                                >
                                                    <div>
                                                        <div className="text-sm font-medium text-white">
                                                            {opponent.matchup}
                                                        </div>
                                                        <div className="text-xs text-slate-400">
                                                            {opponent.dateLabel}
                                                        </div>
                                                    </div>
                                                    <Badge
                                                        variant="outline"
                                                        className="border-slate-700 text-slate-200"
                                                    >
                                                        {difficultyLabel(opponent.difficulty)}
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
        </div>
    );
}
