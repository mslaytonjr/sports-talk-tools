import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Clipboard, Loader2, Plus, Send, Trash2, X } from "lucide-react";

const LINEUP_ENDPOINT =
    import.meta.env.VITE_SOFTBALL_LINEUP_ENDPOINT ??
    "https://lzlprfjkm2ektxqjjohoo4uk5y0bclsu.lambda-url.us-east-1.on.aws/";

const teams = [
    "7th Floor Crew",
    "Bash Brothers",
    "Black Mambas",
    "Honey Badgers",
    "Lunch Pail Guys",
    "Muscle Hamsters",
    "Nails",
    "The Big Papi's",
    "The Big Units",
    "The Ryan Express",
    "The Sultans of Swat",
    "Wild Things",
];

type LineupPlayer = {
    spot: number;
    player_name: string;
    role: string;
    reason: string;
    league_bat_score_rank_label: string;
    obp: string;
    slg: string;
    iso: string;
    productive_pa_percentage: number;
    hit_game_percentage: number;
    xbh_game_percentage: number;
};

type LineupResponse = {
    team: string;
    season: string;
    stats_through_date?: string;
    unavailable: string[];
    lineup: LineupPlayer[];
    text: string;
};

function normalizePlayerName(value: string) {
    return value.trim().replace(/\s+/g, " ");
}

function formatPct(value: number | undefined) {
    if (typeof value !== "number" || Number.isNaN(value)) {
        return "n/a";
    }
    return `${Math.round(value * 100)}%`;
}

export default function SoftballLineupBuilderPage() {
    const [team, setTeam] = useState("7th Floor Crew");
    const [playerInput, setPlayerInput] = useState("");
    const [unavailable, setUnavailable] = useState<string[]>([]);
    const [result, setResult] = useState<LineupResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);

    const canSubmit = useMemo(() => team.trim().length > 0 && !loading, [team, loading]);

    function addPlayersFromInput() {
        const names = playerInput
            .split(/[\n,]+/)
            .map(normalizePlayerName)
            .filter(Boolean);

        if (names.length === 0) {
            return;
        }

        setUnavailable((current) => {
            const existing = new Set(current.map((name) => name.toUpperCase()));
            const next = [...current];
            for (const name of names) {
                if (!existing.has(name.toUpperCase())) {
                    existing.add(name.toUpperCase());
                    next.push(name);
                }
            }
            return next;
        });
        setPlayerInput("");
    }

    function removePlayer(name: string) {
        setUnavailable((current) => current.filter((player) => player !== name));
    }

    async function submitLineup(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        addPlayersFromInput();

        const pendingNames = playerInput
            .split(/[\n,]+/)
            .map(normalizePlayerName)
            .filter(Boolean);
        const mergedUnavailable = [...unavailable];
        const existing = new Set(mergedUnavailable.map((name) => name.toUpperCase()));
        pendingNames.forEach((name) => {
            if (!existing.has(name.toUpperCase())) {
                mergedUnavailable.push(name);
            }
        });

        setLoading(true);
        setError("");
        setCopied(false);

        try {
            const response = await fetch(LINEUP_ENDPOINT, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    team,
                    unavailable: mergedUnavailable,
                }),
            });

            const payload = await response.json();
            if (!response.ok) {
                throw new Error(payload?.error ?? payload?.Message ?? "Lineup request failed.");
            }

            setUnavailable(mergedUnavailable);
            setPlayerInput("");
            setResult(payload);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : "Lineup request failed.");
        } finally {
            setLoading(false);
        }
    }

    async function copyText() {
        if (!result?.text) {
            return;
        }
        await navigator.clipboard.writeText(result.text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
    }

    return (
        <main className="min-h-[calc(100vh-4rem)] bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
            <section className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
                <div className="space-y-6">
                    <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-300">
                            LVC Softball
                        </div>
                        <h1 className="text-3xl font-semibold tracking-normal text-white">
                            Lineup Builder
                        </h1>
                    </div>

                    <form
                        onSubmit={submitLineup}
                        className="rounded-lg border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/20"
                    >
                        <div className="space-y-5">
                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-slate-200">Team</span>
                                <select
                                    value={team}
                                    onChange={(event) => setTeam(event.target.value)}
                                    className="h-11 w-full rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none transition focus:border-emerald-400"
                                >
                                    {teams.map((teamName) => (
                                        <option key={teamName} value={teamName}>
                                            {teamName}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <div className="space-y-2">
                                <label htmlFor="missing-players" className="text-sm font-medium text-slate-200">
                                    Missing players
                                </label>
                                <div className="flex gap-2">
                                    <textarea
                                        id="missing-players"
                                        value={playerInput}
                                        onChange={(event) => setPlayerInput(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                                                event.preventDefault();
                                                addPlayersFromInput();
                                            }
                                        }}
                                        rows={4}
                                        className="min-h-24 flex-1 resize-y rounded-md border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400"
                                        placeholder="Brad Hartung&#10;Kevin DeJong&#10;Alexander Sweetwood"
                                    />
                                    <button
                                        type="button"
                                        onClick={addPlayersFromInput}
                                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-100 transition hover:bg-white/10"
                                        aria-label="Add missing players"
                                        title="Add missing players"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            {unavailable.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {unavailable.map((name) => (
                                        <span
                                            key={name}
                                            className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-sm text-emerald-100"
                                        >
                                            {name}
                                            <button
                                                type="button"
                                                onClick={() => removePlayer(name)}
                                                className="rounded-full text-emerald-100/80 transition hover:text-white"
                                                aria-label={`Remove ${name}`}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className="flex gap-2">
                                <button
                                    type="submit"
                                    disabled={!canSubmit}
                                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    Generate lineup
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setUnavailable([]);
                                        setPlayerInput("");
                                        setResult(null);
                                        setError("");
                                    }}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-100 transition hover:bg-white/10"
                                    aria-label="Clear lineup form"
                                    title="Clear"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </form>

                    {error && (
                        <div className="rounded-md border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                            {error}
                        </div>
                    )}
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4 shadow-2xl shadow-black/20">
                    {!result ? (
                        <div className="flex min-h-[520px] items-center justify-center rounded-md border border-dashed border-white/10 text-center text-sm text-slate-400">
                            Submit a team and missing-player list to generate a lineup.
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
                                        {result.season} lineup
                                    </div>
                                    <h2 className="mt-1 text-2xl font-semibold text-white">{result.team}</h2>
                                    {result.stats_through_date && (
                                        <div className="mt-1 text-sm text-slate-400">
                                            Stats through {result.stats_through_date}
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={copyText}
                                    className="inline-flex h-10 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-medium text-slate-100 transition hover:bg-white/10"
                                >
                                    <Clipboard className="h-4 w-4" />
                                    {copied ? "Copied" : "Copy text"}
                                </button>
                            </div>

                            <div className="grid gap-3 rounded-md border border-white/10 bg-slate-900/70 p-4 text-sm sm:grid-cols-[160px_minmax(0,1fr)]">
                                <div>
                                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                        Team
                                    </div>
                                    <div className="mt-1 font-medium text-white">{result.team}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                        Missing
                                    </div>
                                    {result.unavailable.length > 0 ? (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {result.unavailable.map((name) => (
                                                <span
                                                    key={name}
                                                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-200"
                                                >
                                                    {name}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="mt-1 text-slate-300">No players marked out</div>
                                    )}
                                </div>
                            </div>

                            <div className="overflow-hidden rounded-md border border-white/10">
                                <table className="w-full border-collapse text-left text-sm">
                                    <thead className="bg-white/5 text-xs uppercase tracking-[0.16em] text-slate-400">
                                        <tr>
                                            <th className="w-14 px-3 py-3">Spot</th>
                                            <th className="px-3 py-3">Player</th>
                                            <th className="hidden px-3 py-3 md:table-cell">Role</th>
                                            <th className="hidden px-3 py-3 lg:table-cell">OBP</th>
                                            <th className="hidden px-3 py-3 lg:table-cell">SLG</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/10">
                                        {result.lineup.map((player) => (
                                            <tr key={`${player.spot}-${player.player_name}`} className="align-top">
                                                <td className="px-3 py-3 font-semibold text-emerald-300">
                                                    {player.spot}
                                                </td>
                                                <td className="px-3 py-3">
                                                    <div className="font-medium text-white">{player.player_name}</div>
                                                    <div className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
                                                        {player.reason}
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                                                        <span>{player.league_bat_score_rank_label}</span>
                                                        <span>Productive PA {formatPct(player.productive_pa_percentage)}</span>
                                                        <span>Hit games {formatPct(player.hit_game_percentage)}</span>
                                                        <span>XBH games {formatPct(player.xbh_game_percentage)}</span>
                                                    </div>
                                                </td>
                                                <td className="hidden px-3 py-3 text-slate-300 md:table-cell">
                                                    {player.role}
                                                </td>
                                                <td className="hidden px-3 py-3 text-slate-300 lg:table-cell">
                                                    {player.obp}
                                                </td>
                                                <td className="hidden px-3 py-3 text-slate-300 lg:table-cell">
                                                    {player.slg}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <pre className="max-h-96 overflow-auto rounded-md border border-white/10 bg-slate-900 p-4 text-sm leading-6 text-slate-100">
                                {result.text}
                            </pre>
                        </div>
                    )}
                </div>
            </section>
        </main>
    );
}
