import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    filterOneScorePlays,
    loadSeasonPlayByPlay,
    ONE_SCORE_MARGIN,
    type LoadProgress,
    type PlayByPlaySeason,
} from "@/lib/playImpact";

type StepStatus = "pending" | "active" | "done";

function formatStatusClass(status: StepStatus) {
    if (status === "done") {
        return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
    }

    if (status === "active") {
        return "border-amber-500/40 bg-amber-500/10 text-amber-100";
    }

    return "border-slate-800 bg-slate-950/60 text-slate-300";
}

function formatPercent(value: number | null | undefined) {
    if (value == null) {
        return "n/a";
    }

    return `${(value * 100).toFixed(1)}%`;
}

export default function PlayImpactModelPage() {
    const [seasonInput, setSeasonInput] = useState("2024");
    const [seasonData, setSeasonData] = useState<PlayByPlaySeason | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [progress, setProgress] = useState<LoadProgress | null>(null);
    const [activityLog, setActivityLog] = useState<string[]>([]);

    const summary = useMemo(() => {
        if (!seasonData) {
            return null;
        }

        const oneScoreData = filterOneScorePlays(seasonData);
        const gameIds = new Set<string>();
        let rowsWithWp = 0;
        let rowsWithWpa = 0;
        let sacks = 0;

        for (const row of seasonData.rows) {
            if (row.gameId) {
                gameIds.add(row.gameId);
            }
            if (row.wp != null) {
                rowsWithWp += 1;
            }
            if (row.wpa != null) {
                rowsWithWpa += 1;
            }
            if (row.playType === "sack") {
                sacks += 1;
            }
        }

        return {
            plays: seasonData.rows.length,
            oneScorePlays: oneScoreData.rows.length,
            games: gameIds.size,
            rowsWithWp,
            rowsWithWpa,
            sacks,
        };
    }, [seasonData]);

    const sampleRows = useMemo(() => seasonData?.rows.slice(0, 8) ?? [], [seasonData]);

    const steps = useMemo(
        () => [
            {
                title: "Download one season from nflverse",
                detail: "Pull the public season CSV from nflverse's play-by-play release.",
                status: progress
                    ? progress.stage === "starting" || progress.stage === "downloading"
                        ? "active"
                        : "done"
                    : "pending",
            },
            {
                title: "Stream and parse the CSV",
                detail: "Read the file incrementally so the browser is not waiting on one giant text blob.",
                status: progress
                    ? progress.stage === "parsing"
                        ? "active"
                        : progress.stage === "complete"
                          ? "done"
                          : "pending"
                    : "pending",
            },
            {
                title: "Keep only the model columns",
                detail: "Retain play context plus the win probability fields needed for impact work.",
                status: seasonData ? "done" : "pending",
            },
        ] satisfies { title: string; detail: string; status: StepStatus }[],
        [progress, seasonData]
    );

    async function handleLoadSeason() {
        const season = Number(seasonInput);
        if (!Number.isInteger(season) || season < 1999 || season > 2100) {
            setError("Enter a valid NFL season year.");
            return;
        }

        setLoading(true);
        setError("");
        setSeasonData(null);
        setProgress(null);
        setActivityLog([`Queued ${season} season load.`]);

        try {
            const data = await loadSeasonPlayByPlay(season, (nextProgress) => {
                setProgress(nextProgress);
                setActivityLog((current) => {
                    if (current[current.length - 1] === nextProgress.message) {
                        return current;
                    }
                    return [...current.slice(-5), nextProgress.message];
                });
            });
            setSeasonData(data);
        } catch (caughtError) {
            setError(
                caughtError instanceof Error ? caughtError.message : "Failed to load season data."
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-slate-950 px-3 py-4 text-white sm:px-4 md:px-6">
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="space-y-2">
                    <h1 className="text-2xl font-bold sm:text-3xl">Play Impact Model</h1>
                    <p className="max-w-4xl text-sm text-slate-300">
                        Step one is just the data foundation: load one full NFL season of
                        play-by-play data with win probability, confirm the fields are there, and
                        expose the rows we will filter later for one-score fourth-quarter sacks.
                    </p>
                </div>

                <Card className="border-slate-800 bg-slate-900/80">
                    <CardHeader>
                        <CardTitle className="text-lg text-white">One-Score Filter Definition</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-slate-300">
                        <p>
                            For the initial sack impact work, a one-score game is defined at the{" "}
                            <span className="font-semibold text-white">play level</span> as:
                            absolute score differential less than or equal to{" "}
                            <span className="font-semibold text-white">{ONE_SCORE_MARGIN}</span>.
                        </p>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
                            Code rule: `Math.abs(scoreDifferential) &lt;= {ONE_SCORE_MARGIN}`
                        </div>
                        <p>
                            That rule is implemented in the shared play impact model code so the
                            same boundary can be reused by the script workflow and all downstream
                            analysis steps.
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-slate-800 bg-slate-900/80">
                    <CardHeader>
                        <CardTitle className="text-lg text-white">Load One Season</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-[220px_180px_1fr]">
                            <label className="space-y-2">
                                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    Season
                                </div>
                                <Input
                                    value={seasonInput}
                                    onChange={(event) => setSeasonInput(event.target.value)}
                                    placeholder="2024"
                                    className="border-slate-700 bg-slate-950 text-white"
                                />
                            </label>

                            <div className="flex items-end">
                                <Button
                                    type="button"
                                    className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
                                    onClick={handleLoadSeason}
                                    disabled={loading}
                                >
                                    {loading ? "Loading Season..." : "Load Season Data"}
                                </Button>
                            </div>

                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
                                Source: nflverse season CSV release. We are keeping the first pass
                                browser-native so the data path is easy to inspect before we build
                                filters and summaries on top.
                            </div>
                        </div>

                        {error ? (
                            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
                                {error}
                            </div>
                        ) : null}

                        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                                <div className="text-sm font-semibold text-white">What Is Happening</div>
                                <div className="mt-3 grid gap-3">
                                    {steps.map((step) => (
                                        <div
                                            key={step.title}
                                            className={`rounded-xl border p-3 text-sm ${formatStatusClass(step.status)}`}
                                        >
                                            <div className="font-semibold">{step.title}</div>
                                            <div className="mt-1 text-xs leading-6 opacity-90">
                                                {step.detail}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                                <div className="text-sm font-semibold text-white">Live Activity</div>
                                <div className="mt-3 space-y-2 text-sm text-slate-300">
                                    {activityLog.length > 0 ? (
                                        activityLog.map((message, index) => (
                                            <div
                                                key={`${index}-${message}`}
                                                className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2"
                                            >
                                                {message}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2">
                                            No season load started yet.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {summary ? (
                    <Card className="border-slate-800 bg-slate-900/80">
                        <CardHeader>
                            <CardTitle className="text-lg text-white">Season Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    Plays
                                </div>
                                <div className="mt-2 text-2xl font-semibold text-white">
                                    {summary.plays.toLocaleString()}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    One-Score Plays
                                </div>
                                <div className="mt-2 text-2xl font-semibold text-white">
                                    {summary.oneScorePlays.toLocaleString()}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    Games
                                </div>
                                <div className="mt-2 text-2xl font-semibold text-white">
                                    {summary.games.toLocaleString()}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    Rows With WP
                                </div>
                                <div className="mt-2 text-2xl font-semibold text-white">
                                    {summary.rowsWithWp.toLocaleString()}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    Rows With WPA
                                </div>
                                <div className="mt-2 text-2xl font-semibold text-white">
                                    {summary.rowsWithWpa.toLocaleString()}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    Sack Plays
                                </div>
                                <div className="mt-2 text-2xl font-semibold text-white">
                                    {summary.sacks.toLocaleString()}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ) : null}

                {seasonData ? (
                    <Card className="border-slate-800 bg-slate-900/80">
                        <CardHeader>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <CardTitle className="text-lg text-white">Loaded Sample Rows</CardTitle>
                                <Badge className="bg-emerald-500/15 text-emerald-200">
                                    Season {seasonData.season}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
                                We now have one season in memory with the core context fields plus
                                `wp`, `def_wp`, `home_wp`, `away_wp`, and `wpa`. The next step is
                                filtering these rows down to one-score fourth-quarter situations and
                                then isolating sacks.
                            </div>

                            <div className="overflow-x-auto rounded-xl border border-slate-800">
                                <table className="min-w-full divide-y divide-slate-800 text-sm">
                                    <thead className="bg-slate-950/80 text-slate-300">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Game</th>
                                            <th className="px-3 py-2 text-left">Week</th>
                                            <th className="px-3 py-2 text-left">Qtr</th>
                                            <th className="px-3 py-2 text-left">Down</th>
                                            <th className="px-3 py-2 text-left">Play Type</th>
                                            <th className="px-3 py-2 text-left">Posteam</th>
                                            <th className="px-3 py-2 text-left">WP</th>
                                            <th className="px-3 py-2 text-left">WPA</th>
                                            <th className="px-3 py-2 text-left">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                                        {sampleRows.map((row, index) => (
                                            <tr key={`${row.gameId}-${index}`}>
                                                <td className="px-3 py-2 text-slate-200">{row.gameId}</td>
                                                <td className="px-3 py-2 text-slate-200">{row.week ?? ""}</td>
                                                <td className="px-3 py-2 text-slate-200">{row.qtr ?? ""}</td>
                                                <td className="px-3 py-2 text-slate-200">{row.down ?? ""}</td>
                                                <td className="px-3 py-2 text-slate-200">{row.playType}</td>
                                                <td className="px-3 py-2 text-slate-200">{row.posteam}</td>
                                                <td className="px-3 py-2 text-slate-200">
                                                    {formatPercent(row.wp)}
                                                </td>
                                                <td className="px-3 py-2 text-slate-200">
                                                    {row.wpa == null ? "n/a" : row.wpa.toFixed(3)}
                                                </td>
                                                <td className="max-w-[560px] px-3 py-2 text-slate-300">
                                                    {row.desc}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                ) : null}
            </div>
        </div>
    );
}
