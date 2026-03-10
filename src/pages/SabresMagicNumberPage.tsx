import { useEffect, useState } from "react";

const TOTAL_GAMES = 82;
const TARGET_TEAM = "Buffalo Sabres";

type NhlStanding = {
    teamName: { default: string };
    conferenceAbbrev: string;
    gamesPlayed: number;
    points: number;
};

type TeamMax = {
    team: string;
    conference: string;
    gp: number;
    pts: number;
    gamesLeft: number;
    maxPoints: number;
};

type CatchTeamRow = {
    team: string;
    currentPoints: number;
    gamesLeft: number;
    maxPoints: number;
    canCatchSabresCurrentTotal: boolean;
    sabresPointsNeededToFinishAbove: number;
};

type SabresData = {
    currentPoints: number;
    gamesPlayed: number;
    gamesLeft: number;
    maxPossiblePoints: number;
    clinchTarget: number;
    magicPointsNeeded: number;
    catchRows: CatchTeamRow[];
};

function getLocalDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export default function SabresMagicNumberPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [data, setData] = useState<SabresData | null>(null);

    useEffect(() => {
        async function loadStandings() {
            try {
                setLoading(true);
                setError("");

                const nhlUrl = `/nhl-api/v1/standings/${getLocalDateString()}`;
                const response = await fetch(nhlUrl);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const json = await response.json();
                const standings: NhlStanding[] = json.standings ?? [];

                const teams: TeamMax[] = standings.map((team) => {
                    const gp = team.gamesPlayed;
                    const pts = team.points;
                    const gamesLeft = TOTAL_GAMES - gp;

                    return {
                        team: team.teamName.default,
                        conference: team.conferenceAbbrev,
                        gp,
                        pts,
                        gamesLeft,
                        maxPoints: pts + gamesLeft * 2,
                    };
                });

                const east = teams
                    .filter((t) => t.conference === "E")
                    .sort((a, b) => {
                        if (b.maxPoints !== a.maxPoints) return b.maxPoints - a.maxPoints;
                        if (b.pts !== a.pts) return b.pts - a.pts;
                        return a.team.localeCompare(b.team);
                    });

                const sabres = east.find((t) => t.team === TARGET_TEAM);

                if (!sabres) {
                    throw new Error("Buffalo Sabres not found in standings");
                }

                if (east.length < 9) {
                    throw new Error("Unexpected Eastern Conference standings data");
                }

                const catchRows: CatchTeamRow[] = east
                    .filter((t) => t.team !== TARGET_TEAM && t.maxPoints >= sabres.pts)
                    .map((t) => ({
                        team: t.team,
                        currentPoints: t.pts,
                        gamesLeft: t.gamesLeft,
                        maxPoints: t.maxPoints,
                        canCatchSabresCurrentTotal: t.maxPoints >= sabres.pts,
                        sabresPointsNeededToFinishAbove: t.maxPoints + 1,
                    }))
                    .sort((a, b) => {
                        if (b.maxPoints !== a.maxPoints) return b.maxPoints - a.maxPoints;
                        return b.currentPoints - a.currentPoints;
                    });

                const eastWithoutSabres = east.filter((t) => t.team !== TARGET_TEAM);

                const teamsThatCouldFinishAboveSabres = eastWithoutSabres
                    .filter((t) => t.maxPoints >= sabres.pts)
                    .sort((a, b) => {
                        if (b.maxPoints !== a.maxPoints) return b.maxPoints - a.maxPoints;
                        return b.pts - a.pts;
                    });

                // To guarantee staying above 9th, Buffalo must finish above the
                // 8th strongest challenger max total among the other East teams.
                const eighthChallengerMax =
                    teamsThatCouldFinishAboveSabres.length >= 8
                        ? teamsThatCouldFinishAboveSabres[7].maxPoints
                        : 0;

                const clinchTarget = eighthChallengerMax + 1;
                const magicPointsNeeded = Math.max(0, clinchTarget - sabres.pts);

                setData({
                    currentPoints: sabres.pts,
                    gamesPlayed: sabres.gp,
                    gamesLeft: sabres.gamesLeft,
                    maxPossiblePoints: sabres.maxPoints,
                    clinchTarget,
                    magicPointsNeeded,
                    catchRows,
                });
            } catch (e) {
                console.error("Failed to load standings:", e);
                setError(e instanceof Error ? e.message : "Failed to load standings");
            } finally {
                setLoading(false);
            }
        }

        loadStandings();
    }, []);

    if (loading) return <div style={{ padding: 20 }}>Loading...</div>;
    if (error) return <div style={{ padding: 20, color: "red" }}>{error}</div>;
    if (!data) return <div style={{ padding: 20 }}>No data available.</div>;

    return (
        <div style={{ padding: 20, fontFamily: "Arial, sans-serif" }}>
            <h1>Sabres Magic Number</h1>

            <div style={{ marginBottom: 24 }}>
                <p><strong>Current points:</strong> {data.currentPoints}</p>
                <p><strong>Games played:</strong> {data.gamesPlayed}</p>
                <p><strong>Games left:</strong> {data.gamesLeft}</p>
                <p><strong>Max possible points:</strong> {data.maxPossiblePoints}</p>
                <p><strong>Points needed to stay above 9th:</strong> {data.clinchTarget}</p>
                <p><strong>Magic points still needed:</strong> {data.magicPointsNeeded}</p>
            </div>

            <h2>Teams That Can Still Catch Buffalo</h2>

            <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 1100 }}>
                <thead>
                <tr>
                    <th style={thStyle}>Team</th>
                    <th style={thStyle}>Current Pts</th>
                    <th style={thStyle}>Games Left</th>
                    <th style={thStyle}>Max Pts</th>
                    <th style={thStyle}>Can Catch Sabres Now?</th>
                    <th style={thStyle}>Sabres Pts Needed to Finish Above</th>
                </tr>
                </thead>
                <tbody>
                {data.catchRows.map((row) => (
                    <tr key={row.team}>
                        <td style={tdStyle}>{row.team}</td>
                        <td style={tdStyle}>{row.currentPoints}</td>
                        <td style={tdStyle}>{row.gamesLeft}</td>
                        <td style={tdStyle}>{row.maxPoints}</td>
                        <td style={tdStyle}>{row.canCatchSabresCurrentTotal ? "Yes" : "No"}</td>
                        <td style={tdStyle}>{row.sabresPointsNeededToFinishAbove}</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}

const thStyle: React.CSSProperties = {
    textAlign: "left",
    borderBottom: "2px solid #ccc",
    padding: "8px",
};

const tdStyle: React.CSSProperties = {
    borderBottom: "1px solid #eee",
    padding: "8px",
};