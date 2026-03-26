import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    extractSackDefenders,
    filterOneScorePlays,
    filterQualifyingSackPlays,
    loadPublishedPlayImpactSeason,
    ONE_SCORE_MARGIN,
    summarizeQualifyingSacks,
    summarizeTopSackDefenders,
    type PlayByPlaySeason,
    type PublishedPlayImpactSeason,
} from "@/lib/playImpact";

type StepStatus = "pending" | "active" | "done";
const AVAILABLE_SEASONS = ["2025", "2024", "2023", "2022", "2021", "2020", "2019"] as const;

type SampleSackRow = {
    gameId: string;
    playId: string;
    offense: string;
    defense: string;
    qtr: string | number | null;
    scoreDiff: string | number | null;
    winProbabilityBefore: number | null;
    winProbabilityAfter: number | null;
    wpDeltaOffense: number | null;
    defenders: string[];
    desc: string;
};

function sortByImpact(rows: SampleSackRow[]) {
    return [...rows].sort((left, right) => {
        const leftValue = left.wpDeltaOffense ?? 0;
        const rightValue = right.wpDeltaOffense ?? 0;
        return leftValue - rightValue;
    });
}

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
    const [seasonInput, setSeasonInput] = useState<string>(AVAILABLE_SEASONS[0]);
    const [seasonData, setSeasonData] = useState<PlayByPlaySeason | null>(null);
    const [publishedSeason, setPublishedSeason] = useState<PublishedPlayImpactSeason | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [activityLog, setActivityLog] = useState<string[]>([]);

    const summary = useMemo(() => {
        if (publishedSeason) {
            return {
                plays: publishedSeason.summary.rowCount,
                oneScorePlays: publishedSeason.summary.oneScoreRowCount,
                qualifyingSacks: publishedSeason.summary.qualifyingSackRowCount,
                qualifyingSummary: publishedSeason.summary.qualifyingSackSummary,
                games: publishedSeason.summary.gameCount,
                rowsWithWp: publishedSeason.summary.rowsWithWp,
                rowsWithWpa: publishedSeason.summary.rowsWithDerivedWpAfter,
                sacks: publishedSeason.summary.sackCount,
            };
        }

        if (!seasonData) {
            return null;
        }

        const oneScoreData = filterOneScorePlays(seasonData);
        const qualifyingSacks = filterQualifyingSackPlays(seasonData);
        const qualifyingSummary = summarizeQualifyingSacks(seasonData);
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
            qualifyingSacks: qualifyingSacks.rows.length,
            qualifyingSummary,
            games: gameIds.size,
            rowsWithWp,
            rowsWithWpa,
            sacks,
        };
    }, [seasonData]);

    const sampleRows = useMemo(() => seasonData?.rows.slice(0, 8) ?? [], [seasonData]);
    const qualifyingSackRows = useMemo<SampleSackRow[]>(() => {
        if (publishedSeason) {
            return (publishedSeason.summary.topImpactSacks ?? []).map((row) => ({
                gameId: row.game_id,
                playId: row.play_id,
                offense: row.posteam,
                defense: row.defteam,
                qtr: row.qtr,
                scoreDiff: row.score_differential,
                winProbabilityBefore: row.win_probability_before,
                winProbabilityAfter: row.win_probability_after,
                wpDeltaOffense: row.wp_delta_offense,
                defenders: extractSackDefenders(row.desc),
                desc: row.desc,
            }));
        }

        return seasonData
            ? filterQualifyingSackPlays(seasonData)
                  .rows
                  .map((row) => ({
                      gameId: row.gameId,
                      playId: row.playId,
                      offense: row.posteam,
                      defense: row.defteam,
                      qtr: row.qtr,
                      scoreDiff: row.scoreDifferential,
                      winProbabilityBefore: row.winProbabilityBefore,
                      winProbabilityAfter: row.winProbabilityAfter,
                      wpDeltaOffense: row.wpDeltaOffense,
                      defenders: extractSackDefenders(row.desc),
                      desc: row.desc,
                  }))
            : [];
    }, [publishedSeason, seasonData]);
    const topImpactSacks = useMemo(() => sortByImpact(qualifyingSackRows).slice(0, 10), [qualifyingSackRows]);
    const topSackDefenders = useMemo(() => {
        if (publishedSeason) {
            return publishedSeason.summary.topSackLeaders ?? [];
        }

        return seasonData ? summarizeTopSackDefenders(filterQualifyingSackPlays(seasonData).rows, 10) : [];
    }, [publishedSeason, seasonData]);

    const steps = useMemo(
        () => [
            {
                title: "Load published site artifacts first",
                detail: "Use committed play impact outputs from /public when that season has already been pushed.",
                status: publishedSeason ? "done" : loading ? "active" : "pending",
            },
            {
                title: "Keep only the model columns",
                detail: "Retain play context plus the win probability fields needed for impact work.",
                status: publishedSeason || seasonData ? "done" : "pending",
            },
        ] satisfies { title: string; detail: string; status: StepStatus }[],
        [loading, publishedSeason, seasonData]
    );

    async function handleLoadSeason() {
        const season = Number(seasonInput);
        if (!AVAILABLE_SEASONS.includes(seasonInput as (typeof AVAILABLE_SEASONS)[number])) {
            setError("Select an available published season.");
            return;
        }

        setLoading(true);
        setError("");
        setSeasonData(null);
        setPublishedSeason(null);
        setActivityLog([`Queued ${season} season load.`]);

        try {
            setActivityLog((current) => [
                ...current.slice(-5),
                `Checking for published ${season} play impact artifacts.`,
            ]);
            const published = await loadPublishedPlayImpactSeason(season);
            setPublishedSeason(published);
            setActivityLog((current) => [
                ...current.slice(-5),
                `Loaded published ${season} artifacts from the site bundle.`,
            ]);
        } catch (caughtError) {
            setError(
                caughtError instanceof Error
                    ? caughtError.message
                    : "Published season artifacts could not be loaded."
            );
            setActivityLog((current) => [
                ...current.slice(-5),
                `Published ${season} artifacts were not found on the site.`,
            ]);
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
                        <CardTitle className="text-lg text-white">Sack Impact Metric Definition</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-slate-300">
                        <p>
                            Qualifying plays for the first impact pass are:
                            <span className="font-semibold text-white"> 4th quarter</span>,
                            <span className="font-semibold text-white"> one-score</span>,
                            and
                            <span className="font-semibold text-white"> sack plays</span>.
                        </p>
                        <p>
                            Offense perspective is canonical. `posteam` is treated as the offense,
                            `winProbabilityBefore` is the offense&apos;s pre-play win probability, and
                            `winProbabilityAfter` stays in that same offense frame.
                        </p>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
                            `wpDeltaOffense = winProbabilityAfter - winProbabilityBefore`
                        </div>
                        <p>
                            The reusable written definition for this V1 metric lives in
                            `docs/play-impact-v1.md`.
                        </p>
                        <p>
                            Published site seasons are controlled by `AVAILABLE_SEASONS` in this
                            page. Add `2024` and `2023` there after their artifacts are generated
                            and committed.
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
                                <select
                                    value={seasonInput}
                                    onChange={(event) => setSeasonInput(event.target.value)}
                                    className="flex h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1 text-sm text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                >
                                    {AVAILABLE_SEASONS.map((season) => (
                                        <option key={season} value={season}>
                                            {season}
                                        </option>
                                    ))}
                                </select>
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
                                The deployed page only loads published site artifacts. If a season
                                is missing here, generate it locally, commit the `public/play-impact`
                                files, and redeploy.
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
                    <div className="space-y-6">
                    <Card className="border-slate-800 bg-slate-900/80">
                        <CardHeader>
                            <CardTitle className="text-lg text-white">Season Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
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
                                    Q4 One-Score Sacks
                                </div>
                                <div className="mt-2 text-2xl font-semibold text-white">
                                    {summary.qualifyingSacks.toLocaleString()}
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
                    <Card className="border-slate-800 bg-slate-900/80">
                        <CardHeader>
                            <CardTitle className="text-lg text-white">
                                Qualifying Sack Summary
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 md:grid-cols-3">
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    Total Qualifying Plays
                                </div>
                                <div className="mt-2 text-2xl font-semibold text-white">
                                    {summary.qualifyingSummary.qualifyingPlayCount.toLocaleString()}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    Average wp_delta_offense
                                </div>
                                <div className="mt-2 text-2xl font-semibold text-white">
                                    {summary.qualifyingSummary.averageWpDeltaOffense == null
                                        ? "n/a"
                                        : summary.qualifyingSummary.averageWpDeltaOffense.toFixed(4)}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                    Median wp_delta_offense
                                </div>
                                <div className="mt-2 text-2xl font-semibold text-white">
                                    {summary.qualifyingSummary.medianWpDeltaOffense == null
                                        ? "n/a"
                                        : summary.qualifyingSummary.medianWpDeltaOffense.toFixed(4)}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="border-slate-800 bg-slate-900/80">
                        <CardHeader>
                            <CardTitle className="text-lg text-white">
                                Sack Counts By Player
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
                                These counts are parsed from qualifying sack play descriptions, so
                                they are a practical readout for this v1 workflow rather than an
                                official stat feed.
                            </div>
                            <div className="overflow-x-auto rounded-xl border border-slate-800">
                                <table className="min-w-full divide-y divide-slate-800 text-sm">
                                    <thead className="bg-slate-950/80 text-slate-300">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Rank</th>
                                            <th className="px-3 py-2 text-left">Player</th>
                                            <th className="px-3 py-2 text-left">Sacks</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                                        {topSackDefenders.map((leader, index) => (
                                            <tr key={leader.defender}>
                                                <td className="px-3 py-2 text-slate-200">
                                                    {index + 1}
                                                </td>
                                                <td className="px-3 py-2 font-semibold text-white">
                                                    {leader.defender}
                                                </td>
                                                <td className="px-3 py-2 text-slate-200">
                                                    {leader.sacks}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                    </div>
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
                                            <th className="px-3 py-2 text-left">Offense</th>
                                            <th className="px-3 py-2 text-left">Defense</th>
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
                                                <td className="px-3 py-2 text-slate-200">{row.defteam}</td>
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

                {topImpactSacks.length > 0 ? (
                    <Card className="border-slate-800 bg-slate-900/80">
                        <CardHeader>
                            <CardTitle className="text-lg text-white">
                                Biggest Win Probability Swing Sacks
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
                                These are the qualifying 4th-quarter one-score sacks with the
                                largest negative `wp_delta_offense`, meaning the biggest drop in the
                                offense&apos;s win probability under the v1 metric. Published site
                                seasons use the precomputed top-impact list from the season
                                summary.
                            </div>

                            <div className="overflow-x-auto rounded-xl border border-slate-800">
                                <table className="min-w-full divide-y divide-slate-800 text-sm">
                                    <thead className="bg-slate-950/80 text-slate-300">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Game</th>
                                            <th className="px-3 py-2 text-left">Play</th>
                                            <th className="px-3 py-2 text-left">Offense</th>
                                            <th className="px-3 py-2 text-left">Defense</th>
                                            <th className="px-3 py-2 text-left">Qtr</th>
                                            <th className="px-3 py-2 text-left">Score Diff</th>
                                            <th className="px-3 py-2 text-left">WP Before</th>
                                            <th className="px-3 py-2 text-left">WP After</th>
                                            <th className="px-3 py-2 text-left">wp_delta_offense</th>
                                            <th className="px-3 py-2 text-left">Sack By</th>
                                            <th className="px-3 py-2 text-left">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                                        {topImpactSacks.map((row) => (
                                            <tr key={`${row.gameId}-${row.playId}`}>
                                                <td className="px-3 py-2 text-slate-200">
                                                    {row.gameId}
                                                </td>
                                                <td className="px-3 py-2 text-slate-200">
                                                    {row.playId}
                                                </td>
                                                <td className="px-3 py-2 text-slate-200">
                                                    {row.offense}
                                                </td>
                                                <td className="px-3 py-2 text-slate-200">
                                                    {row.defense}
                                                </td>
                                                <td className="px-3 py-2 text-slate-200">
                                                    {row.qtr}
                                                </td>
                                                <td className="px-3 py-2 text-slate-200">
                                                    {row.scoreDiff}
                                                </td>
                                                <td className="px-3 py-2 text-slate-200">
                                                    {formatPercent(row.winProbabilityBefore)}
                                                </td>
                                                <td className="px-3 py-2 text-slate-200">
                                                    {formatPercent(row.winProbabilityAfter)}
                                                </td>
                                                <td className="px-3 py-2 font-semibold text-white">
                                                    {row.wpDeltaOffense == null
                                                        ? "n/a"
                                                        : row.wpDeltaOffense.toFixed(3)}
                                                </td>
                                                <td className="px-3 py-2 text-slate-200">
                                                    {row.defenders.join(", ")}
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
