import { Link, Route, Routes } from "react-router-dom";
import DepthChartPage from "./pages/DepthChartPage";
import SabresPage from "./pages/SabresMagicNumberPage";

export default function App() {
    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <nav className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
                <Link
                    to="/BillsDepthChart"
                    className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                    Bills Depth Chart
                </Link>
                <Link
                    to="/SabresMagicNumber"
                    className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
                >
                    Sabres Magic
                </Link>
            </nav>

            <Routes>
                <Route path="/BillsDepthChart" element={<DepthChartPage />} />
                <Route path="/SabresMagicNumber" element={<SabresPage />} />
            </Routes>
        </div>
    );
}
