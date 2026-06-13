import { Link, Route, Routes, useLocation } from "react-router-dom";
import DepthChartPage from "./pages/DepthChartPage";
import BracketRootingGuidePage from "./pages/BracketRootingGuidePage";
import SabresPage from "./pages/SabresMagicNumberPage";
import PlayImpactModelPage from "./pages/PlayImpactModelPage";
import SoftballOpeningDayOddsPage from "./pages/SoftballOpeningDayOddsPage";
import SoftballLineupBuilderPage from "./pages/SoftballLineupBuilderPage";
import SabresCapRosterPage from "./pages/SabresCapRosterPage";
import SabresLineOptimizerPage from "./pages/SabresLineOptimizerPage";
import logo from "./assets/wny-sports-net-logo.png";

const navLinkClass = (active: boolean) =>
    [
        "rounded-full border px-4 py-2 text-sm font-medium transition",
        active
            ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
            : "border-white/15 bg-white/5 text-white hover:bg-white/10",
    ].join(" ");

function HomePage() {
    return (
        <main className="landing-shell px-4 py-10 sm:px-6 lg:px-8">
            <section className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-6xl flex-col items-center justify-center">
                <div className="landing-grid w-full items-center gap-10">
                    <div className="order-2 space-y-6 text-center lg:order-1 lg:text-left">
                        <div className="space-y-3">
                            <div className="landing-kicker">Western New York Sports Network</div>
                            <h1 className="landing-title">
                                Stats, Standings, and Takes for Western New York.
                            </h1>
                            <p className="mx-auto max-w-2xl text-sm leading-7 text-slate-300 lg:mx-0 sm:text-base">
                                WNYSportsNet brings tools for the Smart Buffalo Sports Fan.
                            </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <Link to="/Bills" className="landing-card group">
                                <div className="landing-card-label">Football Tools</div>
                                <div className="landing-card-title">Bills</div>
                                <p className="landing-card-copy">
                                    Depth chart views, roster structure, and football model workspaces
                                    built around Buffalo.
                                </p>
                                <div className="landing-card-action">Enter Bills tools</div>
                            </Link>

                            <Link to="/Sabres" className="landing-card group">
                                <div className="landing-card-label">Hockey Tools</div>
                                <div className="landing-card-title">Sabres</div>
                                <p className="landing-card-copy">
                                    Playoff math, standings context, and nightly rooting guidance for
                                    Buffalo hockey.
                                </p>
                                <div className="landing-card-action">Enter Sabres tools</div>
                            </Link>

                            <Link to="/Softball" className="landing-card group">
                                <div className="landing-card-label">LVC Tools</div>
                                <div className="landing-card-title">Softball</div>
                                <p className="landing-card-copy">
                                    Daily team reports, odds context, and lineup building from the latest
                                    scraped stats.
                                </p>
                                <div className="landing-card-action">Enter softball tools</div>
                            </Link>
                        </div>
                    </div>

                    <div className="order-1 flex justify-center lg:order-2 lg:justify-end">
                        <div className="logo-stage">
                            <div className="logo-burst" />
                            <img
                                src={logo}
                                alt="WNYSportsNet buffalo logo"
                                className="logo-mark relative z-10"
                            />
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}

function ToolHubPage({
    title,
    kicker,
    copy,
    tools,
}: {
    title: string;
    kicker: string;
    copy: string;
    tools: Array<{
        to: string;
        label: string;
        title: string;
        copy: string;
        action: string;
    }>;
}) {
    return (
        <main className="landing-shell px-4 py-10 sm:px-6 lg:px-8">
            <section className="mx-auto min-h-[calc(100vh-7rem)] max-w-5xl py-10">
                <div className="space-y-4">
                    <div className="landing-kicker">{kicker}</div>
                    <h1 className="landing-title">{title}</h1>
                    <p className="max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                        {copy}
                    </p>
                </div>

                <div className="mt-10 grid gap-4 md:grid-cols-2">
                    {tools.map((tool) => (
                        <Link key={tool.to} to={tool.to} className="landing-card group">
                            <div className="landing-card-label">{tool.label}</div>
                            <div className="landing-card-title">{tool.title}</div>
                            <p className="landing-card-copy">{tool.copy}</p>
                            <div className="landing-card-action">{tool.action}</div>
                        </Link>
                    ))}
                </div>
            </section>
        </main>
    );
}

function BillsPage() {
    return (
        <ToolHubPage
            title="Bills"
            kicker="Buffalo Football"
            copy="Bills tools for roster context, depth chart scanning, and football model work."
            tools={[
                {
                    to: "/BillsDepthChart",
                    label: "Roster Tool",
                    title: "Bills Depth Chart",
                    copy:
                        "Position groups, roster structure, and field-level alignment for quick scan depth chart viewing.",
                    action: "Open depth chart",
                },
                {
                    to: "/PlayImpactModel",
                    label: "Model Workspace",
                    title: "Play Impact Model",
                    copy:
                        "Start with one season of play-by-play, preserve win probability context, and build the impact model from clean data.",
                    action: "Open model workspace",
                },
            ]}
        />
    );
}

function SabresHubPage() {
    return (
        <ToolHubPage
            title="Sabres"
            kicker="Buffalo Hockey"
            copy="Sabres tools for standings context, playoff math, and the nightly chase."
            tools={[
                {
                    to: "/SabresMagicNumber",
                    label: "Standings Tool",
                    title: "Sabres Magic Number",
                    copy:
                        "Playoff math, division chase, conference race, and nightly rooting guidance built around what helps Buffalo most.",
                    action: "Open magic number",
                },
                {
                    to: "/SabresCapRoster",
                    label: "Cap Tool",
                    title: "Roster and Cap",
                    copy:
                        "Current roster cap hits, projected cap allocation, and July 1 free agent status.",
                    action: "Open cap table",
                },
                {
                    to: "/SabresLineOptimizer",
                    label: "Line Tool",
                    title: "Best Potential Lines",
                    copy:
                        "Suggested forward lines and defense pairs using production, shot volume, two-way stats, and advanced traits.",
                    action: "Open line builder",
                },
            ]}
        />
    );
}

function SoftballHubPage() {
    return (
        <ToolHubPage
            title="Softball"
            kicker="Lake Valhalla Club"
            copy="Softball tools for lineup construction, current stats, and team report context."
            tools={[
                {
                    to: "/SoftballLineupBuilder",
                    label: "Lineup Tool",
                    title: "Lineup Builder",
                    copy:
                        "Pick a team, mark players out, and generate a full everyone-bats order from the latest report data.",
                    action: "Build a lineup",
                },
                {
                    to: "/SoftballOpeningDayOdds",
                    label: "Report Tool",
                    title: "Opening Day Odds",
                    copy:
                        "View the softball odds report and preseason context in the existing report format.",
                    action: "Open odds report",
                },
            ]}
        />
    );
}

export default function App() {
    const location = useLocation();
    const isBillsActive =
        location.pathname === "/Bills" ||
        location.pathname === "/BillsDepthChart" ||
        location.pathname === "/PlayImpactModel";
    const isSabresActive =
        location.pathname === "/Sabres" ||
        location.pathname === "/SabresMagicNumber" ||
        location.pathname === "/SabresCapRoster" ||
        location.pathname === "/SabresLineOptimizer";
    const isSoftballActive =
        location.pathname === "/Softball" ||
        location.pathname === "/SoftballLineupBuilder" ||
        location.pathname === "/SoftballOdds" ||
        location.pathname === "/SoftballOpeningDayOdds";

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur">
                <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
                    <Link
                        to="/"
                        className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-slate-100"
                    >
                        <span className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/5">
                            <img
                                src={logo}
                                alt="WNYSportsNet logo"
                                className="h-full w-full object-cover"
                            />
                        </span>
                        WNYSportsNet
                    </Link>

                    <div className="flex flex-wrap items-center gap-3">
                        <Link to="/Bills" className={navLinkClass(isBillsActive)}>
                            Bills
                        </Link>
                        <Link to="/Sabres" className={navLinkClass(isSabresActive)}>
                            Sabres
                        </Link>
                        <Link to="/Softball" className={navLinkClass(isSoftballActive)}>
                            Softball
                        </Link>
                    </div>
                </nav>
            </header>

            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/Bills" element={<BillsPage />} />
                <Route path="/Sabres" element={<SabresHubPage />} />
                <Route path="/Softball" element={<SoftballHubPage />} />
                <Route path="/BillsDepthChart" element={<DepthChartPage />} />
                <Route path="/SabresMagicNumber" element={<SabresPage />} />
                <Route path="/SabresCapRoster" element={<SabresCapRosterPage />} />
                <Route path="/SabresLineOptimizer" element={<SabresLineOptimizerPage />} />
                <Route path="/PlayImpactModel" element={<PlayImpactModelPage />} />
                <Route path="/SoftballLineupBuilder" element={<SoftballLineupBuilderPage />} />
                <Route path="/SoftballOdds" element={<SoftballOpeningDayOddsPage />} />
                <Route path="/SoftballOpeningDayOdds" element={<SoftballOpeningDayOddsPage />} />
                <Route path="/BracketRootingGuide" element={<BracketRootingGuidePage />} />
                <Route path="*" element={<HomePage />} />
            </Routes>
        </div>
    );
}
