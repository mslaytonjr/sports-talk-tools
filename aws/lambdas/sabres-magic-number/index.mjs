const TOTAL_GAMES = 82;
const TARGET_TEAM = "Buffalo Sabres";
const NHL_API_BASE = "https://api-web.nhle.com";

const text = (value) => {
  if (!value) return "";
  return typeof value === "string" ? value : value.default ?? "";
};

const pointPct = (points = 0, gamesPlayed = 0) => {
  return gamesPlayed > 0 ? points / (gamesPlayed * 2) : null;
};

const formatLast10 = (team) => {
  if (
    typeof team.l10Wins !== "number" ||
    typeof team.l10Losses !== "number" ||
    typeof team.l10OtLosses !== "number"
  ) {
    return null;
  }

  return `${team.l10Wins}-${team.l10Losses}-${team.l10OtLosses}`;
};

const formatSplit = (team) => {
  const rw = typeof team.regulationWins === "number" ? team.regulationWins : null;
  const otw =
    typeof team.overtimeWins === "number"
      ? team.overtimeWins
      : typeof team.otWins === "number"
        ? team.otWins
        : typeof team.regulationPlusOtWins === "number" && rw !== null
          ? Math.max(0, team.regulationPlusOtWins - rw)
          : null;
  const otl = typeof team.otLosses === "number" ? team.otLosses : null;

  if (rw === null && otw === null && otl === null) {
    return null;
  }

  return {
    regulationWins: rw,
    overtimeWins: otw,
    overtimeLosses: otl,
    label: `RW ${rw ?? "—"} | OTW ${otw ?? "—"} | OTL ${otl ?? "—"}`,
  };
};

const formatDate = (dateValue) => {
  if (!dateValue) return "TBD";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(dateValue));
};

const teamLabel = (team) => {
  const place = text(team?.placeName);
  const common = text(team?.commonName);
  const abbrev = text(team?.abbrev);

  return [place, common].filter(Boolean).join(" ") || abbrev || "TBD";
};

const teamAbbrev = (team) => text(team?.abbrev).toUpperCase();

async function getNext3Opponents(abbrev, pointPctByAbbrev) {
  const resp = await fetch(`${NHL_API_BASE}/v1/club-schedule-season/${abbrev}/now`);
  if (!resp.ok) {
    throw new Error(`Schedule fetch failed for ${abbrev}: HTTP ${resp.status}`);
  }

  const data = await resp.json();
  const games = Array.isArray(data.games) ? data.games : [];
  const now = Date.now();

  const nextGames = games
    .filter((game) => game.startTimeUTC && new Date(game.startTimeUTC).getTime() >= now)
    .sort((a, b) => new Date(a.startTimeUTC).getTime() - new Date(b.startTimeUTC).getTime())
    .slice(0, 3);

  return nextGames.map((game) => {
    const home = teamAbbrev(game.homeTeam);
    const away = teamAbbrev(game.awayTeam);
    const isHome = home === abbrev;
    const opponent = isHome ? game.awayTeam : game.homeTeam;
    const opponentAbbrev = isHome ? away : home;
    const pct = pointPctByAbbrev.get(opponentAbbrev);
    const difficulty =
      typeof pct === "number"
        ? Math.round(Math.min(100, pct * 100 + (isHome ? 0 : 5)))
        : null;

    return {
      date: game.startTimeUTC,
      dateLabel: formatDate(game.startTimeUTC),
      opponent: teamLabel(opponent),
      venue: isHome ? "vs" : "@",
      matchup: `${isHome ? "vs" : "@"} ${teamLabel(opponent)}`,
      difficulty,
    };
  });
}

export const handler = async () => {
  try {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const date = `${yyyy}-${mm}-${dd}`;

    const standingsResp = await fetch(`${NHL_API_BASE}/v1/standings/${date}`);
    if (!standingsResp.ok) {
      throw new Error(`Standings fetch failed: HTTP ${standingsResp.status}`);
    }

    const standingsData = await standingsResp.json();
    const standings = Array.isArray(standingsData.standings) ? standingsData.standings : [];

    const teams = standings.map((team) => {
      const gp = team.gamesPlayed ?? 0;
      const pts = team.points ?? 0;
      const gamesRemaining = TOTAL_GAMES - gp;

      return {
        team: text(team.teamName),
        teamAbbrev: text(team.teamAbbrev).toUpperCase(),
        conference: team.conferenceAbbrev ?? "",
        currentPoints: pts,
        gamesPlayed: gp,
        gamesRemaining,
        maxPossiblePoints: pts + gamesRemaining * 2,
        trendLast10: formatLast10(team),
        regulationOvertimeSplit: formatSplit(team),
        pointPct: pointPct(pts, gp),
      };
    });

    const east = teams
      .filter((team) => team.conference === "E")
      .sort((a, b) => {
        if (b.maxPossiblePoints !== a.maxPossiblePoints) {
          return b.maxPossiblePoints - a.maxPossiblePoints;
        }
        if (b.currentPoints !== a.currentPoints) {
          return b.currentPoints - a.currentPoints;
        }
        return a.team.localeCompare(b.team);
      });

    const sabres = east.find((team) => team.team === TARGET_TEAM);
    if (!sabres) {
      throw new Error("Buffalo Sabres not found in standings");
    }

    const pointPctByAbbrev = new Map(
      teams
        .filter((team) => typeof team.pointPct === "number")
        .map((team) => [team.teamAbbrev, team.pointPct])
    );

    const competitorsBase = east.filter(
      (team) => team.team !== TARGET_TEAM && team.maxPossiblePoints >= sabres.currentPoints
    );

    const competitors = await Promise.all(
      competitorsBase.map(async (team) => {
        let next3Opponents = [];

        try {
          next3Opponents = await getNext3Opponents(team.teamAbbrev, pointPctByAbbrev);
        } catch (error) {
          console.error(`Failed to load schedule for ${team.teamAbbrev}`, error);
        }

        const validDifficulty = next3Opponents.filter(
          (game) => typeof game.difficulty === "number"
        );

        const difficultyScore = validDifficulty.length
          ? Math.round(
              validDifficulty.reduce((sum, game) => sum + game.difficulty, 0) /
                validDifficulty.length
            )
          : null;

        return {
          team: team.team,
          teamAbbrev: team.teamAbbrev,
          currentPoints: team.currentPoints,
          gamesRemaining: team.gamesRemaining,
          maxPossiblePoints: team.maxPossiblePoints,
          next3Opponents,
          regulationOvertimeSplit: team.regulationOvertimeSplit,
          trendLast10: team.trendLast10,
          difficultyScore,
        };
      })
    );

    const eastWithoutSabres = east.filter((team) => team.team !== TARGET_TEAM);
    const challengers = eastWithoutSabres
      .filter((team) => team.maxPossiblePoints >= sabres.currentPoints)
      .sort((a, b) => {
        if (b.maxPossiblePoints !== a.maxPossiblePoints) {
          return b.maxPossiblePoints - a.maxPossiblePoints;
        }
        return b.currentPoints - a.currentPoints;
      });

    const eighthChallengerMax = challengers.length >= 8 ? challengers[7].maxPossiblePoints : 0;
    const clinchTarget = eighthChallengerMax + 1;
    const magicPointsNeeded = Math.max(0, clinchTarget - sabres.currentPoints);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=180, stale-while-revalidate=60",
      },
      body: JSON.stringify({
        asOf: date,
        sabres: {
          currentPoints: sabres.currentPoints,
          gamesPlayed: sabres.gamesPlayed,
          gamesRemaining: sabres.gamesRemaining,
          maxPossiblePoints: sabres.maxPossiblePoints,
          clinchTarget,
          magicPointsNeeded,
        },
        competitors,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "max-age=10",
      },
      body: JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
    };
  }
};
