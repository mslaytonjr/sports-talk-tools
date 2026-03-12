import { Link, Route, Routes, useLocation } from "react-router-dom";
import DepthChartPage from "./pages/DepthChartPage";
import SabresPage from "./pages/SabresMagicNumberPage";
import logo from "./assets/wny-sports-net-logo.png";

function HomePage() {
    return (
        <main className="landing-shell px-4 py-10 sm:px-6 lg:px-8">
            <section className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-6xl flex-col items-center justify-center">
                <div className="landing-grid w-full items-center gap-10">
                    <div className="order-2 space-y-6 text-center lg:order-1 lg:text-left">
                        <div className="space-y-3">
                            <div className="landing-kicker">Western New York Sports Network</div>
                            <h1 className="landing-title">
                                Built for Buffalo fans who want the scoreboard behind the scoreboard.
                            </h1>
                            <p className="mx-auto max-w-2xl text-sm leading-7 text-slate-300 lg:mx-0 sm:text-base">
                                WNYSportsNet brings live race tracking, roster context, and nightly
                                playoff pressure into one home base. It should feel closer to a
                                regional sports network control room than a utility menu.
                            </p>
                        </div>

                        <div className="landing-strip">
                            <div className="landing-strip-item">
                                <span className="landing-strip-label">Coverage</span>
                                <span className="landing-strip-value">Bills + Sabres</span>
                            </div>
                            <div className="landing-strip-item">
                                <span className="landing-strip-label">Focus</span>
                                <span className="landing-strip-value">Playoff race and roster intel</span>
                            </div>
                            <div className="landing-strip-item">
                                <span className="landing-strip-label">Updated</span>
                                <span className="landing-strip-value">Game day ready</span>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <Link to="/BillsDepthChart" className="landing-card group">
                                <div className="landing-card-label">Featured Coverage</div>
                                <div className="landing-card-title">Bills Depth Chart</div>
                                <p className="landing-card-copy">
                                    Position groups, roster structure, and field-level alignment for
                                    quick scan depth chart viewing.
                                </p>
                                <div className="landing-card-action">Enter Bills coverage</div>
                            </Link>

                            <Link to="/SabresMagicNumber" className="landing-card group">
                                <div className="landing-card-label">Featured Coverage</div>
                                <div className="landing-card-title">Sabres Magic Number</div>
                                <p className="landing-card-copy">
                                    Playoff math, division chase, conference race, and nightly
                                    rooting guidance built around what helps Buffalo most.
                                </p>
                                <div className="landing-card-action">Enter Sabres coverage</div>
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

export default function App() {
    const location = useLocation();

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur">
                <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
                    <Link
                        to="/"
                        className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-slate-100"
                    >
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5">
                            W
                        </span>
                        WNYSportsNet
                    </Link>

                    <div className="flex flex-wrap items-center gap-3">
                        <Link
                            to="/BillsDepthChart"
                            className={[
                                "rounded-full border px-4 py-2 text-sm font-medium transition",
                                location.pathname === "/BillsDepthChart"
                                    ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                                    : "border-white/15 bg-white/5 text-white hover:bg-white/10",
                            ].join(" ")}
                        >
                            Bills Depth Chart
                        </Link>
                        <Link
                            to="/SabresMagicNumber"
                            className={[
                                "rounded-full border px-4 py-2 text-sm font-medium transition",
                                location.pathname === "/SabresMagicNumber"
                                    ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                                    : "border-white/15 bg-white/5 text-white hover:bg-white/10",
                            ].join(" ")}
                        >
                            Sabres Magic
                        </Link>
                    </div>
                </nav>
            </header>

            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/BillsDepthChart" element={<DepthChartPage />} />
                <Route path="/SabresMagicNumber" element={<SabresPage />} />
                <Route path="*" element={<HomePage />} />
            </Routes>
        </div>
    );
}
