type RosterPlayer = {
    name: string;
    position: string;
    capHit: number;
    status?: string;
    expires?: string;
    freeAgentType?: string;
};

const capSummary = {
    season: "2025-26",
    capLimit: 95500000,
    allocatedCap: 94578196,
    capSpace: 921804,
    activeRoster: 28,
    listedPlayers: 30,
    source: "PuckPedia",
    sourceUrl: "https://puckpedia.com/team/buffalo-sabres",
    asOf: "May 24, 2026",
};

const forwards: RosterPlayer[] = [
    { name: "Jason Zucker", position: "LW/RW", capHit: 4750000 },
    { name: "Sam Carrick", position: "C/RW", capHit: 1000000 },
    { name: "Tanner Pearson", position: "LW", capHit: 1000000, expires: "July 1, 2026", freeAgentType: "UFA" },
    { name: "Alex Tuch", position: "RW/C", capHit: 4750000, expires: "July 1, 2026", freeAgentType: "UFA" },
    { name: "Jordan Greenway", position: "LW/RW", capHit: 4000000 },
    { name: "Tage Thompson", position: "C/RW", capHit: 7142857 },
    { name: "Beck Malenstyn", position: "LW/RW", capHit: 1350000, expires: "July 1, 2026", freeAgentType: "UFA" },
    { name: "Joshua Norris", position: "C", capHit: 7950000 },
    { name: "Ryan McLeod", position: "C", capHit: 5000000 },
    { name: "Peyton Krebs", position: "C/LW", capHit: 1450000, expires: "July 1, 2026", freeAgentType: "RFA" },
    { name: "Jack Quinn", position: "RW/LW", capHit: 3375000 },
    { name: "Joshua Dunne", position: "C/LW", capHit: 775000, expires: "July 1, 2026", freeAgentType: "UFA" },
    { name: "Justin Danforth", position: "RW/C", capHit: 1800000, status: "IR" },
    { name: "Josh Doan", position: "RW/C", capHit: 925000 },
    { name: "Tyson Kozak", position: "C/LW", capHit: 775000 },
    { name: "Noah Ostlund", position: "C/LW", capHit: 886666 },
    { name: "Jiri Kulich", position: "C/LW", capHit: 886666, status: "IR" },
    { name: "Zach Benson", position: "LW/C", capHit: 950000, expires: "July 1, 2026", freeAgentType: "RFA" },
];

const defense: RosterPlayer[] = [
    { name: "Luke Schenn", position: "RD", capHit: 1375000, expires: "July 1, 2026", freeAgentType: "UFA" },
    { name: "Logan Stanley", position: "LD", capHit: 1250000, expires: "July 1, 2026", freeAgentType: "UFA" },
    { name: "Conor Timmins", position: "RD", capHit: 2200000 },
    { name: "Rasmus Dahlin", position: "LD/RD", capHit: 11000000 },
    { name: "Mattias Samuelsson", position: "LD/RD", capHit: 4285714 },
    { name: "Michael Kesselring", position: "RD", capHit: 1400000, expires: "July 1, 2026", freeAgentType: "RFA" },
    { name: "Bowen Byram", position: "LD", capHit: 6250000 },
    { name: "Owen Power", position: "LD/RD", capHit: 8350000 },
    { name: "Zach Metsa", position: "RD/LD", capHit: 775000 },
];

const goalies: RosterPlayer[] = [
    { name: "Alex Lyon", position: "G", capHit: 1500000 },
    { name: "Ukko-Pekka Luukkonen", position: "G", capHit: 4750000 },
    { name: "Colten Ellis", position: "G", capHit: 775000 },
];

const buyoutCharges = [{ name: "Jeff Skinner buyout", capHit: 4444444 }];
const rosterGroups = [
    { title: "Forwards", players: forwards },
    { title: "Defense", players: defense },
    { title: "Goaltenders", players: goalies },
];
const activeRoster = [...forwards, ...defense, ...goalies];
const expiringContracts = activeRoster.filter((player) => player.expires);

function formatMoney(value: number) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
    }).format(value);
}

function formatShortMoney(value: number) {
    return `$${(value / 1000000).toFixed(value >= 1000000 ? 2 : 3)}M`;
}

function CapSummaryCard({
    label,
    value,
    detail,
}: {
    label: string;
    value: string;
    detail?: string;
}) {
    return (
        <div className="rounded-[1.35rem] border border-white/10 bg-white/5 p-5">
            <div className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-blue-200/80">
                {label}
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">{value}</div>
            {detail ? <div className="mt-2 text-sm text-slate-400">{detail}</div> : null}
        </div>
    );
}

function RosterTable({ title, players }: { title: string; players: RosterPlayer[] }) {
    const total = players.reduce((sum, player) => sum + player.capHit, 0);

    return (
        <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/65 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="text-[0.72rem] font-bold uppercase tracking-[0.26em] text-slate-400">
                        {title}
                    </div>
                    <h2 className="mt-2 text-2xl font-semibold text-white">{formatMoney(total)}</h2>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-slate-200">
                    {players.length} players
                </div>
            </div>

            <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-white/10 text-[0.68rem] uppercase tracking-[0.22em] text-slate-500">
                        <tr>
                            <th className="py-3 pr-4 font-bold">Player</th>
                            <th className="px-4 py-3 font-bold">Pos</th>
                            <th className="px-4 py-3 font-bold">Status</th>
                            <th className="py-3 pl-4 text-right font-bold">Cap Hit</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/8">
                        {players.map((player) => (
                            <tr key={player.name}>
                                <td className="py-3 pr-4 font-semibold text-white">{player.name}</td>
                                <td className="px-4 py-3 text-slate-300">{player.position}</td>
                                <td className="px-4 py-3 text-slate-300">
                                    {player.status ?? player.freeAgentType ?? "Signed"}
                                </td>
                                <td className="py-3 pl-4 text-right font-semibold text-white">
                                    {formatMoney(player.capHit)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

export default function SabresCapRosterPage() {
    const buyoutCap = buyoutCharges.reduce((sum, charge) => sum + charge.capHit, 0);
    const capUsedPercent = (capSummary.allocatedCap / capSummary.capLimit) * 100;

    return (
        <main className="landing-shell min-h-screen px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6 sm:p-8">
                    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
                        <div className="space-y-4">
                            <div className="landing-kicker">Sabres Cap Table</div>
                            <h1 className="landing-title">Current Roster and Cap</h1>
                            <p className="max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                                Active roster and injured reserve cap hits, projected allocation, and
                                contracts scheduled to expire on July 1, 2026.
                            </p>
                            <a
                                href={capSummary.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
                            >
                                Source: {capSummary.source}, checked {capSummary.asOf}
                            </a>
                        </div>

                        <div className="space-y-3">
                            <div className="h-3 overflow-hidden rounded-full bg-white/10">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-blue-400 to-yellow-300"
                                    style={{ width: `${Math.min(capUsedPercent, 100)}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-sm text-slate-300">
                                <span>{capUsedPercent.toFixed(1)}% allocated</span>
                                <span>{formatShortMoney(capSummary.capSpace)} projected space</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <CapSummaryCard
                        label="Total Cap"
                        value={formatMoney(capSummary.capLimit)}
                        detail={`${capSummary.season} NHL upper limit`}
                    />
                    <CapSummaryCard
                        label="Allocated Cap"
                        value={formatMoney(capSummary.allocatedCap)}
                        detail="Projected team cap hit"
                    />
                    <CapSummaryCard
                        label="Active Roster"
                        value={`${capSummary.activeRoster} players`}
                        detail={`${capSummary.listedPlayers} players listed including IR`}
                    />
                    <CapSummaryCard
                        label="Buyout Charges"
                        value={formatMoney(buyoutCap)}
                        detail={buyoutCharges.map((charge) => charge.name).join(", ")}
                    />
                </section>

                <section className="rounded-[1.6rem] border border-amber-300/20 bg-amber-300/8 p-5">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <div className="text-[0.72rem] font-bold uppercase tracking-[0.26em] text-amber-100/80">
                                July 1 Expiring Contracts
                            </div>
                            <h2 className="mt-2 text-2xl font-semibold text-white">
                                {expiringContracts.length} players
                            </h2>
                        </div>
                        <div className="text-sm text-slate-300">
                            UFA: {expiringContracts.filter((player) => player.freeAgentType === "UFA").length}
                            {" / "}
                            RFA: {expiringContracts.filter((player) => player.freeAgentType === "RFA").length}
                        </div>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {expiringContracts.map((player) => (
                            <div
                                key={player.name}
                                className="rounded-[1.1rem] border border-white/10 bg-slate-950/55 p-4"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="font-semibold text-white">{player.name}</div>
                                        <div className="mt-1 text-sm text-slate-400">{player.position}</div>
                                    </div>
                                    <div className="rounded-full border border-amber-200/30 bg-amber-200/10 px-3 py-1 text-xs font-bold text-amber-100">
                                        {player.freeAgentType}
                                    </div>
                                </div>
                                <div className="mt-4 flex justify-between text-sm">
                                    <span className="text-slate-400">Cap hit</span>
                                    <span className="font-semibold text-white">{formatMoney(player.capHit)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <div className="grid gap-5 xl:grid-cols-2">
                    {rosterGroups.map((group) => (
                        <RosterTable key={group.title} title={group.title} players={group.players} />
                    ))}
                </div>
            </div>
        </main>
    );
}
