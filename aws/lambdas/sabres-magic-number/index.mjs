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

const clamp = (value, min, max) => {
  return Math.min(max, Math.max(min, value));
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

const formatApiDate = (dateValue) => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dateValue);
};

const addDays = (dateValue, daysToAdd) => {
  const nextDate = new Date(dateValue);
  nextDate.setUTCDate(nextDate.getUTCDate() + daysToAdd);
  return nextDate;
};

const teamLabel = (team) => {
  const place = text(team?.placeName);
  const common = text(team?.commonName);
  const abbrev = text(team?.abbrev);

  return [place, common].filter(Boolean).join(" ") || abbrev || "TBD";
};

const teamAbbrev = (team) => text(team?.abbrev).toUpperCase();
const fullTeamName = (team) => {
  const place = text(team?.placeName);
  const common = text(team?.commonName);
  return [place, common].filter(Boolean).join(" ");
};

const daysBetween = (firstDate, secondDate) => {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((secondDate - firstDate) / msPerDay);
};

function buildDifficulty(game, teamAbbrevValue, pointPctByAbbrev, teamMetricsByAbbrev, priorGameDate) {
  const home = teamAbbrev(game.homeTeam);
  const away = teamAbbrev(game.awayTeam);
  const isHome = home === teamAbbrevValue;
  const opponent = isHome ? game.awayTeam : game.homeTeam;
  const opponentAbbrev = isHome ? away : home;
  const opponentMetrics = teamMetricsByAbbrev.get(opponentAbbrev);

  const opponentOverall = typeof pointPctByAbbrev.get(opponentAbbrev) === "number"
    ? pointPctByAbbrev.get(opponentAbbrev)
    : null;
  const opponentRecent = opponentMetrics?.last10PointPct ?? null;
  const venueStrength = isHome
    ? opponentMetrics?.roadPointPct ?? null
    : opponentMetrics?.homePointPct ?? null;

  const gameDate = game.startTimeUTC ? new Date(game.startTimeUTC) : null;
  const isBackToBack = Boolean(
    priorGameDate && gameDate && daysBetween(priorGameDate, gameDate) <= 1
  );

  let rawScore = 50;

  if (typeof opponentOverall === "number") {
    rawScore += (opponentOverall - 0.5) * 50;
  }

  if (typeof opponentRecent === "number") {
    rawScore += (opponentRecent - 0.5) * 30;
  }

  if (typeof venueStrength === "number") {
    rawScore += (venueStrength - 0.5) * 20;
  }

  if (!isHome) {
    rawScore += 4;
  }

  if (isBackToBack) {
    rawScore += 7;
  }

  return {
    score: Math.round(clamp(rawScore, 0, 100)),
    isBackToBack,
    components: {
      opponentOverall: typeof opponentOverall === "number" ? Math.round(opponentOverall * 100) : null,
      opponentRecent: typeof opponentRecent === "number" ? Math.round(opponentRecent * 100) : null,
      venueStrength: typeof venueStrength === "number" ? Math.round(venueStrength * 100) : null,
      roadGame: !isHome,
      backToBack: isBackToBack,
    },
    opponent,
    opponentAbbrev,
    isHome,
  };
}

async function getNext3Opponents(abbrev, pointPctByAbbrev, teamMetricsByAbbrev) {
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

  let priorGameDate = null;

  return nextGames.map((game) => {
    const difficulty = buildDifficulty(
      game,
      abbrev,
      pointPctByAbbrev,
      teamMetricsByAbbrev,
      priorGameDate
    );
    priorGameDate = game.startTimeUTC ? new Date(game.startTimeUTC) : priorGameDate;

    return {
      date: game.startTimeUTC,
      dateLabel: formatDate(game.startTimeUTC),
      opponent: teamLabel(difficulty.opponent),
      venue: difficulty.isHome ? "vs" : "@",
      matchup: `${difficulty.isHome ? "vs" : "@"} ${teamLabel(difficulty.opponent)}`,
      difficulty: difficulty.score,
      difficultyBreakdown: difficulty.components,
    };
  });
}

function cloneTeam(team) {
  return {
    ...team,
  };
}

function recomputeSabresRace(eastTeams) {
  const east = eastTeams
    .map(cloneTeam)
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
    throw new Error("Buffalo Sabres not found in simulated standings");
  }

  const challengers = east
    .filter((team) => team.team !== TARGET_TEAM && team.maxPossiblePoints >= sabres.currentPoints)
    .sort((a, b) => {
      if (b.maxPossiblePoints !== a.maxPossiblePoints) {
        return b.maxPossiblePoints - a.maxPossiblePoints;
      }
      return b.currentPoints - a.currentPoints;
    });

  const eighthChallengerMax = challengers.length >= 8 ? challengers[7].maxPossiblePoints : 0;
  const clinchTarget = eighthChallengerMax + 1;
  const magicPointsNeeded = Math.max(0, clinchTarget - sabres.currentPoints);
  const threatTotal = challengers.reduce((sum, team) => sum + team.maxPossiblePoints, 0);

  return {
    sabres,
    clinchTarget,
    magicPointsNeeded,
    threatCount: challengers.length,
    threatTotal,
  };
}

function simulateGameOutcome(allTeams, homeAbbrev, awayAbbrev, outcome) {
  const teamsMap = new Map(allTeams.map((team) => [team.teamAbbrev, cloneTeam(team)]));
  const homeTeam = teamsMap.get(homeAbbrev);
  const awayTeam = teamsMap.get(awayAbbrev);

  if (!homeTeam || !awayTeam) {
    throw new Error(`Missing team data for ${homeAbbrev} vs ${awayAbbrev}`);
  }

  homeTeam.gamesPlayed += 1;
  awayTeam.gamesPlayed += 1;
  homeTeam.gamesRemaining = Math.max(0, TOTAL_GAMES - homeTeam.gamesPlayed);
  awayTeam.gamesRemaining = Math.max(0, TOTAL_GAMES - awayTeam.gamesPlayed);

  if (outcome === "home-reg") {
    homeTeam.currentPoints += 2;
  } else if (outcome === "home-ot") {
    homeTeam.currentPoints += 2;
    awayTeam.currentPoints += 1;
  } else if (outcome === "away-ot") {
    awayTeam.currentPoints += 2;
    homeTeam.currentPoints += 1;
  } else if (outcome === "away-reg") {
    awayTeam.currentPoints += 2;
  }

  homeTeam.maxPossiblePoints = homeTeam.currentPoints + homeTeam.gamesRemaining * 2;
  awayTeam.maxPossiblePoints = awayTeam.currentPoints + awayTeam.gamesRemaining * 2;

  const east = Array.from(teamsMap.values()).filter((team) => team.conference === "E");
  return recomputeSabresRace(east);
}

function outcomeLabel(outcome, homeName, awayName) {
  if (outcome === "home-reg") return `${homeName} win in regulation`;
  if (outcome === "home-ot") return `${homeName} win in OT/SO`;
  if (outcome === "away-ot") return `${awayName} win in OT/SO`;
  return `${awayName} win in regulation`;
}

function outcomeSortValue(result) {
  return [
    result.magicPointsNeeded,
    result.clinchTarget,
    result.threatCount,
    result.threatTotal,
  ];
}

function compareOutcomeResults(a, b) {
  const av = outcomeSortValue(a);
  const bv = outcomeSortValue(b);

  for (let i = 0; i < av.length; i += 1) {
    if (av[i] !== bv[i]) {
      return av[i] - bv[i];
    }
  }

  return 0;
}

async function getNightlyRootingGuide(todayDate, allTeams, baselineRace) {
  const targetDates = [todayDate, addDays(todayDate, 1)].map(formatApiDate);

  const guides = await Promise.all(
    targetDates.map(async (date) => {
      const response = await fetch(`${NHL_API_BASE}/v1/score/${date}`);
      if (!response.ok) {
        throw new Error(`Score fetch failed for ${date}: HTTP ${response.status}`);
      }

      const data = await response.json();
      const scheduleDate = Array.isArray(data.gameWeek)
        ? data.gameWeek.find((entry) => entry.date === date)
        : null;
      const games = Array.isArray(scheduleDate?.games) ? scheduleDate.games : Array.isArray(data.games) ? data.games : [];

      const modeledGames = games.map((game) => {
        const homeAbbrev = teamAbbrev(game.homeTeam);
        const awayAbbrev = teamAbbrev(game.awayTeam);
        const homeName = fullTeamName(game.homeTeam) || homeAbbrev;
        const awayName = fullTeamName(game.awayTeam) || awayAbbrev;

        const outcomes = [
          "home-reg",
          "home-ot",
          "away-ot",
          "away-reg",
        ].map((outcome) => {
          const result = simulateGameOutcome(allTeams, homeAbbrev, awayAbbrev, outcome);
          return {
            outcome,
            label: outcomeLabel(outcome, homeName, awayName),
            ...result,
          };
        });

        outcomes.sort(compareOutcomeResults);

        const best = outcomes[0];
        const worst = outcomes[outcomes.length - 1];
        const impact =
          baselineRace.magicPointsNeeded - best.magicPointsNeeded !== 0
            ? `${baselineRace.magicPointsNeeded - best.magicPointsNeeded > 0 ? "-" : "+"}${Math.abs(
                baselineRace.magicPointsNeeded - best.magicPointsNeeded
              )} magic points`
            : `${best.clinchTarget - baselineRace.clinchTarget > 0 ? "+" : ""}${
                best.clinchTarget - baselineRace.clinchTarget
              } clinch target`;

        return {
          gameId: game.id ?? `${date}-${homeAbbrev}-${awayAbbrev}`,
          startTimeUTC: game.startTimeUTC ?? null,
          matchup: `${awayName} @ ${homeName}`,
          homeTeam: {
            name: homeName,
            abbrev: homeAbbrev,
          },
          awayTeam: {
            name: awayName,
            abbrev: awayAbbrev,
          },
          recommendedOutcome: best.label,
          impact,
          reasoning:
            compareOutcomeResults(best, worst) === 0
              ? "This game is close to neutral for Buffalo."
              : `This result gives Buffalo the lowest simulated playoff pressure from this game.`,
          bestCase: {
            outcome: best.outcome,
            label: best.label,
            magicPointsNeeded: best.magicPointsNeeded,
            clinchTarget: best.clinchTarget,
          },
          worstCase: {
            outcome: worst.outcome,
            label: worst.label,
            magicPointsNeeded: worst.magicPointsNeeded,
            clinchTarget: worst.clinchTarget,
          },
          relevantToSabres:
            homeAbbrev === "BUF" ||
            awayAbbrev === "BUF" ||
            baselineRace.sabres.teamAbbrev === "BUF" ||
            allTeams.some(
              (team) =>
                team.teamAbbrev === homeAbbrev || team.teamAbbrev === awayAbbrev
            ),
        };
      });

      modeledGames.sort((a, b) => {
        if (a.bestCase.magicPointsNeeded !== b.bestCase.magicPointsNeeded) {
          return a.bestCase.magicPointsNeeded - b.bestCase.magicPointsNeeded;
        }
        return a.matchup.localeCompare(b.matchup);
      });

      return {
        date,
        label: formatDate(`${date}T12:00:00Z`),
        games: modeledGames,
      };
    })
  );

  return guides;
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
      const homePointPct = pointPct(team.homePoints ?? 0, team.homeGamesPlayed ?? 0);
      const roadPointPct = pointPct(team.roadPoints ?? 0, team.roadGamesPlayed ?? 0);
      const last10PointPct = pointPct(team.l10Points ?? 0, team.l10GamesPlayed ?? 0);

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
        homePointPct,
        roadPointPct,
        last10PointPct,
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
    const teamMetricsByAbbrev = new Map(
      teams.map((team) => [
        team.teamAbbrev,
        {
          homePointPct: team.homePointPct,
          roadPointPct: team.roadPointPct,
          last10PointPct: team.last10PointPct,
        },
      ])
    );

    const competitorsBase = east.filter(
      (team) => team.team !== TARGET_TEAM && team.maxPossiblePoints >= sabres.currentPoints
    );

    const competitors = await Promise.all(
      competitorsBase.map(async (team) => {
        let next3Opponents = [];

        try {
          next3Opponents = await getNext3Opponents(
            team.teamAbbrev,
            pointPctByAbbrev,
            teamMetricsByAbbrev
          );
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

    const baselineRace = recomputeSabresRace(east);
    const nightlyRootingGuide = await getNightlyRootingGuide(now, teams, baselineRace);

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
          clinchTarget: baselineRace.clinchTarget,
          magicPointsNeeded: baselineRace.magicPointsNeeded,
        },
        competitors,
        nightlyRootingGuide,
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
