import { Link, Route, Routes } from "react-router-dom";
import DepthChartPage from "./pages/DepthChartPage";
import SabresPage from "./pages/SabresMagicNumberPage";

export default function App() {
    return (
        <div>
            <nav style={{ padding: 12, display: "flex", gap: 12 }}>
                <Link to="/BillsDepthChart">NFL Depth Chart</Link>
                <Link to="/SabresMagicNumber">Sabres Magic</Link>
            </nav>

            <Routes>
                <Route path="/BillsDepthChart" element={<DepthChartPage />} />
                <Route path="/SabresMagicNumber" element={<SabresPage />} />
            </Routes>
        </div>
    );
}
