import { useEffect, useState } from "react";
import { loadOpeningDayOddsBoard, type OpeningDayOddsBoard, type OpeningDayOddsGame } from "@/lib/softballOdds";

const TARGET_SEASON = 2026;

function formatPercent(value: number) {
    return `${(value * 100).toFixed(1)}%`;
}

function formatTilt(game: OpeningDayOddsGame) {
    const gap = Math.abs(game.home_win_probability - game.away_win_probability);
    return `${(gap * 100).toFixed(1)} pt edge`;
}

function edgeTone(confidenceTier: string) {
    if (confidenceTier === "Strong") {
        return "border-emerald-400/40 bg-emerald-400/12 text-emerald-100";
    }

    if (confidenceTier === "Lean") {
        return "border-amber-300/40 bg-amber-300/12 text-amber-100";
    }

    return "border-slate-300/20 bg-slate-400/10 text-slate-100";
}

function TeamPill({
    team,
    moneyline,
    winProbability,
    projectedRuns,
    favored,
}: {
    team: string;
    moneyline: string;
    winProbability: number;
    projectedRuns: number;
    favored: boolean;
}) {
    return (
        <div
            className={[
                "rounded-[1.35rem] border p-4 transition",
                favored
                    ? "border-emerald-300/35 bg-emerald-300/10 shadow-[0_18px_40px_rgba(16,185,129,0.12)]"
                    : "border-white/10 bg-white/5",
            ].join(" ")}
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-[0.68rem] uppercase tracking-[0.3em] text-slate-400">
                        {favored ? "Model Favorite" : "Underdog"}
                    </div>
                    <div className="mt-2 text-xl font-semibold text-white">{team}</div>
                </div>
                <div className="rounded-full border border-white/10 bg-slate-950 px-3 py-1 text-sm font-semibold text-white">
                    {moneyline}
                </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-slate-300">
                <div>
                    <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-500">
                        Win Prob
                    </div>
                    <div className="mt-1 text-base font-semibold text-white">
                        {formatPercent(winProbability)}
                    </div>
                </div>
                <div>
                    <div className="text-[0.65rem] uppercase tracking-[0.22em] text-slate-500">
                        Team Total
                    </div>
                    <div className="mt-1 text-base font-semibold text-white">
                        {projectedRuns.toFixed(1)}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function SoftballOpeningDayOddsPage() {
    const [board, setBoard] = useState<OpeningDayOddsBoard | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;

        async function loadBoard() {
            setLoading(true);
            setError("");

            try {
                const nextBoard = await loadOpeningDayOddsBoard(TARGET_SEASON);
                if (active) {
                    setBoard(nextBoard);
                }
            } catch (caughtError) {
                if (active) {
                    setError(
                        caughtError instanceof Error
                            ? caughtError.message
                            : "Opening day odds board could not be loaded."
                    );
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        }

        void loadBoard();

        return () => {
            active = false;
        };
    }, []);

    const strongEdges = board?.games.filter((game) => game.confidence_tier === "Strong") ?? [];

    return (
        <main className="softball-board-shell min-h-screen px-3 py-5 sm:px-4 md:px-6">
            <div className="mx-auto max-w-7xl space-y-6">
                <section className="softball-board-hero overflow-hidden rounded-[2rem] border border-white/10 p-6 sm:p-8">
                    <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
                        <div className="space-y-4">
                            <div className="softball-board-kicker">Softball Opening Day</div>
                            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                                Model odds board with sportsbook-style pricing for the full opening slate.
                            </h1>
                            <p className="max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                                Neutral-site local projections built from the current roster model. This
                                board is styled like a sportsbook market view, but every line here is
                                generated from the model, not a live book.
                            </p>
                        </div>

                        <div className="softball-board-summary grid gap-3">
                            <div className="softball-summary-card">
                                <div className="softball-summary-label">Board</div>
                                <div className="softball-summary-value">
                                    {board?.board_title ?? "Opening Day Model Odds"}
                                </div>
                            </div>
                            <div className="softball-summary-card">
                                <div className="softball-summary-label">Games</div>
                                <div className="softball-summary-value">
                                    {board?.games.length ?? 0}
                                </div>
                            </div>
                            <div className="softball-summary-card">
                                <div className="softball-summary-label">Strong Edges</div>
                                <div className="softball-summary-value">{strongEdges.length}</div>
                            </div>
                            <div className="softball-summary-card">
                                <div className="softball-summary-label">Source</div>
                                <div className="softball-summary-value text-base">
                                    {board?.data_source ?? "Local softball model"}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {loading ? (
                    <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6 text-slate-300">
                        Loading opening day odds board...
                    </section>
                ) : null}

                {error ? (
                    <section className="rounded-[1.75rem] border border-red-400/30 bg-red-500/10 p-6 text-red-100">
                        {error}
                    </section>
                ) : null}

                {board ? (
                    <>
                        <section className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
                            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/65 p-5">
                                <div className="text-[0.72rem] uppercase tracking-[0.26em] text-slate-400">
                                    Best Edges
                                </div>
                                <div className="mt-4 space-y-3">
                                    {board.games
                                        .slice()
                                        .sort(
                                            (left, right) =>
                                                Math.abs(right.home_win_probability - 0.5) -
                                                Math.abs(left.home_win_probability - 0.5)
                                        )
                                        .slice(0, 4)
                                        .map((game) => {
                                            const favoriteIsHome =
                                                game.home_win_probability >= game.away_win_probability;
                                            return (
                                                <div
                                                    key={game.game_id}
                                                    className="rounded-[1.2rem] border border-white/10 bg-white/5 p-4"
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-semibold text-white">
                                                                {game.favorite}
                                                            </div>
                                                            <div className="mt-1 text-xs text-slate-400">
                                                                vs{" "}
                                                                {favoriteIsHome
                                                                    ? game.away_team
                                                                    : game.home_team}
                                                            </div>
                                                        </div>
                                                        <div
                                                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${edgeTone(
                                                                game.confidence_tier
                                                            )}`}
                                                        >
                                                            {game.confidence_tier}
                                                        </div>
                                                    </div>
                                                    <div className="mt-3 flex items-center justify-between text-sm">
                                                        <span className="text-slate-300">
                                                            {formatTilt(game)}
                                                        </span>
                                                        <span className="font-semibold text-white">
                                                            {favoriteIsHome
                                                                ? game.home_moneyline
                                                                : game.away_moneyline}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>

                            <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/65 p-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div className="text-[0.72rem] uppercase tracking-[0.26em] text-slate-400">
                                            Board Note
                                        </div>
                                        <div className="mt-2 text-sm text-slate-300">
                                            {board.caveat}
                                        </div>
                                    </div>
                                    <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
                                        Neutral Site
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="space-y-4">
                            {board.games.map((game) => {
                                const homeFavored = game.home_win_probability >= game.away_win_probability;
                                return (
                                    <article
                                        key={game.game_id}
                                        className="rounded-[1.85rem] border border-white/10 bg-slate-950/70 p-5 shadow-[0_24px_50px_rgba(0,0,0,0.24)]"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-4">
                                            <div>
                                                <div className="text-[0.72rem] uppercase tracking-[0.26em] text-slate-500">
                                                    {game.display_date} • Opening Day
                                                </div>
                                                <div className="mt-2 text-xl font-semibold text-white">
                                                    {game.away_team} vs {game.home_team}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div
                                                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${edgeTone(
                                                        game.confidence_tier
                                                    )}`}
                                                >
                                                    {game.confidence_tier}
                                                </div>
                                                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                                                    Total {game.total_runs.toFixed(1)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
                                            <TeamPill
                                                team={game.away_team}
                                                moneyline={game.away_moneyline}
                                                winProbability={game.away_win_probability}
                                                projectedRuns={game.away_projected_runs}
                                                favored={!homeFavored}
                                            />

                                            <div className="flex flex-col items-center justify-center gap-3 rounded-[1.35rem] border border-white/10 bg-white/5 px-5 py-4 text-center">
                                                <div className="text-[0.68rem] uppercase tracking-[0.3em] text-slate-400">
                                                    Model Line
                                                </div>
                                                <div className="text-3xl font-semibold tracking-tight text-white">
                                                    {game.spread_like_line}
                                                </div>
                                                <div className="text-sm text-slate-300">
                                                    {game.favorite} favored
                                                </div>
                                            </div>

                                            <TeamPill
                                                team={game.home_team}
                                                moneyline={game.home_moneyline}
                                                winProbability={game.home_win_probability}
                                                projectedRuns={game.home_projected_runs}
                                                favored={homeFavored}
                                            />
                                        </div>
                                    </article>
                                );
                            })}
                        </section>
                    </>
                ) : null}
            </div>
        </main>
    );
}
