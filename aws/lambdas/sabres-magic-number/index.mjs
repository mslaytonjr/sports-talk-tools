const TOTAL_GAMES = 82;
const TARGET_TEAM = "Buffalo Sabres";
const TARGET_TEAM_ABBREV = "BUF";
const NHL_API_BASE = "https://api-web.nhle.com";
const MAX_COMBO_GAMES = 5;
const MAX_COMBO_BRANCHES = 4096;
const MAX_CLINCH_COMBO_GAMES = 6;
const OBJECTIVES = {
  makePlayoffs: {
    key: "makePlayoffs",
    title: "Make Playoffs",
    description: "Finish top 3 in the Atlantic or claim one of the 2 Eastern Conference wild cards.",
    cutoffIndex: 7,
    isCompetitor: (team, sabres) =>
      team.team !== TARGET_TEAM && team.conference === sabres.conference,
  },
  topThreeDivision: {
    key: "topThreeDivision",
    title: "Top 3 In Division",
    description: "Finish in the top 3 of the Atlantic Division.",
    cutoffIndex: 2,
    isCompetitor: (team, sabres) =>
      team.team !== TARGET_TEAM && team.division === sabres.division,
  },
  winDivision: {
    key: "winDivision",
    title: "Win Division",
    description: "Finish first in the Sabres' division.",
    cutoffIndex: 0,
    isCompetitor: (team, sabres) =>
      team.team !== TARGET_TEAM && team.division === sabres.division,
  },
  winConference: {
    key: "winConference",
    title: "Win Conference",
    description: "Finish first in the Eastern Conference.",
    cutoffIndex: 0,
    isCompetitor: (team, sabres) =>
      team.team !== TARGET_TEAM && team.conference === sabres.conference,
  },
};

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

function compareStandingsOrder(a, b) {
  if ((b.maxPossiblePoints ?? 0) !== (a.maxPossiblePoints ?? 0)) {
    return (b.maxPossiblePoints ?? 0) - (a.maxPossiblePoints ?? 0);
  }

  if (b.currentPoints !== a.currentPoints) {
    return b.currentPoints - a.currentPoints;
  }

  const aRw = a.tiebreakStats?.regulationWins ?? -1;
  const bRw = b.tiebreakStats?.regulationWins ?? -1;
  if (bRw !== aRw) {
    return bRw - aRw;
  }

  const aRow = a.tiebreakStats?.rowWins ?? -1;
  const bRow = b.tiebreakStats?.rowWins ?? -1;
  if (bRow !== aRow) {
    return bRow - aRow;
  }

  const aWins = a.tiebreakStats?.totalWins ?? -1;
  const bWins = b.tiebreakStats?.totalWins ?? -1;
  if (bWins !== aWins) {
    return bWins - aWins;
  }

  return a.team.localeCompare(b.team);
}

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

const getEasternTimeParts = (dateValue) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(dateValue);

  return {
    weekday: parts.find((part) => part.type === "weekday")?.value ?? "Mon",
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? "0"),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? "0"),
  };
};

const getDynamicCacheControl = (dateValue) => {
  const { weekday, hour, minute } = getEasternTimeParts(dateValue);
  const currentMinutes = hour * 60 + minute;
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  const quietWindowStart = 4 * 60;
  const liveWindowStart = isWeekend ? 15 * 60 + 30 : 19 * 60;

  if (currentMinutes >= quietWindowStart && currentMinutes < liveWindowStart) {
    const secondsUntilLiveWindow = Math.max(300, (liveWindowStart - currentMinutes) * 60);
    const staleWhileRevalidate = Math.min(1800, Math.max(300, Math.floor(secondsUntilLiveWindow / 4)));
    return `public, max-age=${secondsUntilLiveWindow}, stale-while-revalidate=${staleWhileRevalidate}`;
  }

  return "public, max-age=360, stale-while-revalidate=120";
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

const getRowWins = (team) => {
  if (typeof team.regulationPlusOtWins === "number") {
    return team.regulationPlusOtWins;
  }

  if (typeof team.regulationWins === "number" && typeof team.overtimeWins === "number") {
    return team.regulationWins + team.overtimeWins;
  }

  if (typeof team.regulationWins === "number" && typeof team.otWins === "number") {
    return team.regulationWins + team.otWins;
  }

  return null;
};

const buildTiebreakStats = (team) => ({
  regulationWins: typeof team.regulationWins === "number" ? team.regulationWins : null,
  rowWins: getRowWins(team),
  totalWins: typeof team.wins === "number" ? team.wins : null,
});

const getMaxTiebreakStats = (team) => ({
  regulationWins:
    typeof team.tiebreakStats?.regulationWins === "number"
      ? team.tiebreakStats.regulationWins + team.gamesRemaining
      : null,
  rowWins:
    typeof team.tiebreakStats?.rowWins === "number"
      ? team.tiebreakStats.rowWins + team.gamesRemaining
      : null,
  totalWins:
    typeof team.tiebreakStats?.totalWins === "number"
      ? team.tiebreakStats.totalWins + team.gamesRemaining
      : null,
});

function getClinchTiebreakStatus(sabres, challenger) {
  const comparisons = [
    {
      key: "regulationWins",
      label: "RW",
      sabresValue: sabres.tiebreakStats?.regulationWins,
      challengerMax: getMaxTiebreakStats(challenger).regulationWins,
    },
    {
      key: "rowWins",
      label: "ROW",
      sabresValue: sabres.tiebreakStats?.rowWins,
      challengerMax: getMaxTiebreakStats(challenger).rowWins,
    },
    {
      key: "totalWins",
      label: "W",
      sabresValue: sabres.tiebreakStats?.totalWins,
      challengerMax: getMaxTiebreakStats(challenger).totalWins,
    },
  ];

  for (const comparison of comparisons) {
    if (
      typeof comparison.sabresValue !== "number" ||
      typeof comparison.challengerMax !== "number"
    ) {
      return {
        sabresHasClinchableEdge: false,
        winningMetric: null,
        label: "Tiebreaker not yet clinched",
      };
    }

    if (comparison.sabresValue > comparison.challengerMax) {
      return {
        sabresHasClinchableEdge: true,
        winningMetric: comparison.key,
        label: `Sabres clinch tie on ${comparison.label}`,
      };
    }

    if (comparison.sabresValue < comparison.challengerMax) {
      return {
        sabresHasClinchableEdge: false,
        winningMetric: null,
        label: "Tiebreaker not yet clinched",
      };
    }
  }

  return {
    sabresHasClinchableEdge: false,
    winningMetric: null,
    label: "Tiebreaker not yet clinched",
  };
}

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
    tiebreakStats: team.tiebreakStats ? { ...team.tiebreakStats } : null,
  };
}

function applyOutcomeToTeamsMap(teamsMap, homeAbbrev, awayAbbrev, outcome) {
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
    if (typeof homeTeam.tiebreakStats?.regulationWins === "number") {
      homeTeam.tiebreakStats.regulationWins += 1;
    }
    if (typeof homeTeam.tiebreakStats?.rowWins === "number") {
      homeTeam.tiebreakStats.rowWins += 1;
    }
    if (typeof homeTeam.tiebreakStats?.totalWins === "number") {
      homeTeam.tiebreakStats.totalWins += 1;
    }
  } else if (outcome === "home-ot") {
    homeTeam.currentPoints += 2;
    awayTeam.currentPoints += 1;
    if (typeof homeTeam.tiebreakStats?.rowWins === "number") {
      homeTeam.tiebreakStats.rowWins += 1;
    }
    if (typeof homeTeam.tiebreakStats?.totalWins === "number") {
      homeTeam.tiebreakStats.totalWins += 1;
    }
  } else if (outcome === "away-ot") {
    awayTeam.currentPoints += 2;
    homeTeam.currentPoints += 1;
    if (typeof awayTeam.tiebreakStats?.rowWins === "number") {
      awayTeam.tiebreakStats.rowWins += 1;
    }
    if (typeof awayTeam.tiebreakStats?.totalWins === "number") {
      awayTeam.tiebreakStats.totalWins += 1;
    }
  } else if (outcome === "away-reg") {
    awayTeam.currentPoints += 2;
    if (typeof awayTeam.tiebreakStats?.regulationWins === "number") {
      awayTeam.tiebreakStats.regulationWins += 1;
    }
    if (typeof awayTeam.tiebreakStats?.rowWins === "number") {
      awayTeam.tiebreakStats.rowWins += 1;
    }
    if (typeof awayTeam.tiebreakStats?.totalWins === "number") {
      awayTeam.tiebreakStats.totalWins += 1;
    }
  }

  homeTeam.maxPossiblePoints = homeTeam.currentPoints + homeTeam.gamesRemaining * 2;
  awayTeam.maxPossiblePoints = awayTeam.currentPoints + awayTeam.gamesRemaining * 2;
}

function computeObjectiveRace(allTeams, objective) {
  const teams = allTeams
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

  const sabres = teams.find((team) => team.team === TARGET_TEAM);
  if (!sabres) {
    throw new Error(`Buffalo Sabres not found in ${objective.key} simulation`);
  }

  const eligibleCompetitors = teams
    .filter((team) => objective.isCompetitor(team, sabres))
    .map((team) => {
      const tiebreakStatus = getClinchTiebreakStatus(sabres, team);
      return {
        ...team,
        tiebreakStatus,
        thresholdPoints: team.maxPossiblePoints + (tiebreakStatus.sabresHasClinchableEdge ? 0 : 1),
      };
    });

  const sortByThreat = (left, right) => {
    if (right.thresholdPoints !== left.thresholdPoints) {
      return right.thresholdPoints - left.thresholdPoints;
    }
    return right.currentPoints - left.currentPoints;
  };

  let challengers = eligibleCompetitors
    .filter((team) => team.thresholdPoints > sabres.currentPoints)
    .sort(sortByThreat);
  let thresholdMax =
    challengers.length > objective.cutoffIndex
      ? challengers[objective.cutoffIndex].thresholdPoints
      : 0;

  if (objective.key === "makePlayoffs") {
    const conferenceByDivision = new Map();
    for (const team of eligibleCompetitors) {
      if (
        team.conference !== sabres.conference ||
        team.thresholdPoints <= sabres.currentPoints
      ) {
        continue;
      }
      const list = conferenceByDivision.get(team.division) ?? [];
      list.push(team);
      conferenceByDivision.set(team.division, list);
    }

    const playoffField = [];
    const playoffFieldAbbrevs = new Set();
    for (const divisionTeams of conferenceByDivision.values()) {
      divisionTeams
        .slice()
        .sort(sortByThreat)
        .slice(0, 3)
        .forEach((team) => {
          playoffField.push(team);
          playoffFieldAbbrevs.add(team.teamAbbrev);
        });
    }

    const wildcardChallengers = eligibleCompetitors
      .filter(
        (team) =>
          team.conference === sabres.conference &&
          team.thresholdPoints > sabres.currentPoints &&
          !playoffFieldAbbrevs.has(team.teamAbbrev)
      )
      .sort(sortByThreat)
      .slice(0, 2);

    challengers = [...playoffField, ...wildcardChallengers].sort(sortByThreat);
    thresholdMax =
      challengers.length > objective.cutoffIndex
        ? challengers[objective.cutoffIndex].thresholdPoints
        : 0;
  }

  const clinchTarget = thresholdMax;
  const magicPointsNeeded = Math.max(0, clinchTarget - sabres.currentPoints);
  const threatTotal = challengers.reduce((sum, team) => sum + team.maxPossiblePoints, 0);

  return {
    objective: objective.key,
    sabres,
    clinchTarget,
    magicPointsNeeded,
    threatCount: challengers.length,
    threatTotal,
    challengers,
  };
}

function buildPlayoffDisplayOrder(allTeams, sabres) {
  const eastTeams = allTeams
    .filter((team) => team.conference === sabres.conference)
    .slice()
    .sort(compareStandingsOrder);

  const atlantic = eastTeams.filter((team) => team.division === "A").slice().sort(compareStandingsOrder);
  const metro = eastTeams.filter((team) => team.division === "M").slice().sort(compareStandingsOrder);

  const topAtlantic = atlantic.slice(0, 3).map((team, index) => ({
    teamAbbrev: team.teamAbbrev,
    sortGroup: 1,
    sortIndex: index + 1,
    label: `Atlantic ${index + 1}`,
  }));
  const topMetro = metro.slice(0, 3).map((team, index) => ({
    teamAbbrev: team.teamAbbrev,
    sortGroup: 2,
    sortIndex: index + 1,
    label: `Metro ${index + 1}`,
  }));

  const autoBidAbbrevs = new Set([
    ...topAtlantic.map((team) => team.teamAbbrev),
    ...topMetro.map((team) => team.teamAbbrev),
  ]);

  const wildCards = eastTeams
    .filter((team) => !autoBidAbbrevs.has(team.teamAbbrev))
    .slice()
    .sort(compareStandingsOrder)
    .map((team, index) => ({
      teamAbbrev: team.teamAbbrev,
      sortGroup: index < 2 ? 3 : 4,
      sortIndex: index < 2 ? index + 1 : index - 1,
      label: index < 2 ? `Wild Card ${index + 1}` : `Chasing ${index - 1}`,
    }));

  return new Map(
    [...topAtlantic, ...topMetro, ...wildCards].map((team) => [
      team.teamAbbrev,
      {
        playoffDisplayGroup: team.sortGroup,
        playoffDisplayIndex: team.sortIndex,
        playoffDisplayLabel: team.label,
      },
    ])
  );
}

function getPlayoffPictureAbbrevs(allTeams, sabres, limit = 10) {
  return new Set(
    Array.from(buildPlayoffDisplayOrder(allTeams, sabres).keys()).slice(0, limit)
  );
}

function simulateGameOutcome(allTeams, homeAbbrev, awayAbbrev, outcome, objective) {
  const teamsMap = new Map(allTeams.map((team) => [team.teamAbbrev, cloneTeam(team)]));
  applyOutcomeToTeamsMap(teamsMap, homeAbbrev, awayAbbrev, outcome);
  return computeObjectiveRace(Array.from(teamsMap.values()), objective);
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

async function loadNightlyScoreboards(todayDate) {
  const targetDates = [todayDate, addDays(todayDate, 1)].map(formatApiDate);

  return Promise.all(
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

      return {
        date,
        label: formatDate(`${date}T12:00:00Z`),
        games,
      };
    })
  );
}

function isRelevantNightlyGame(game, conferenceByAbbrev, challengerAbbrevs, focusAbbrevs = null) {
  const homeAbbrev = teamAbbrev(game.homeTeam);
  const awayAbbrev = teamAbbrev(game.awayTeam);
  const homeConference = conferenceByAbbrev.get(homeAbbrev) ?? "";
  const awayConference = conferenceByAbbrev.get(awayAbbrev) ?? "";

  if (homeConference === "W" && awayConference === "W") {
    return false;
  }

  if (homeAbbrev === TARGET_TEAM_ABBREV || awayAbbrev === TARGET_TEAM_ABBREV) {
    return true;
  }

  if (
    focusAbbrevs &&
    (focusAbbrevs.has(homeAbbrev) || focusAbbrevs.has(awayAbbrev))
  ) {
    return true;
  }

  return challengerAbbrevs.has(homeAbbrev) || challengerAbbrevs.has(awayAbbrev);
}

function getComboGames(
  scoreboard,
  allTeams,
  challengerAbbrevs,
  focusAbbrevs = null,
  maxGames = MAX_COMBO_GAMES
) {
  const conferenceByAbbrev = new Map(
    allTeams.map((team) => [team.teamAbbrev, team.conference])
  );

  return scoreboard.games
    .filter((game) =>
      isRelevantNightlyGame(game, conferenceByAbbrev, challengerAbbrevs, focusAbbrevs)
    )
    .map((game) => {
      const homeAbbrev = teamAbbrev(game.homeTeam);
      const awayAbbrev = teamAbbrev(game.awayTeam);
      const challengerRelevance =
        (challengerAbbrevs.has(homeAbbrev) ? 1 : 0) +
        (challengerAbbrevs.has(awayAbbrev) ? 1 : 0);
      const focusRelevance =
        focusAbbrevs
          ? (focusAbbrevs.has(homeAbbrev) ? 1 : 0) + (focusAbbrevs.has(awayAbbrev) ? 1 : 0)
          : 0;
      const sabresRelevance =
        homeAbbrev === TARGET_TEAM_ABBREV || awayAbbrev === TARGET_TEAM_ABBREV ? 1 : 0;
      const relevance = sabresRelevance * 100 + challengerRelevance * 10 + focusRelevance;
      return { game, relevance };
    })
    .sort((left, right) => {
      if (right.relevance !== left.relevance) {
        return right.relevance - left.relevance;
      }
      return (left.game.startTimeUTC ?? "").localeCompare(right.game.startTimeUTC ?? "");
    })
    .slice(0, maxGames)
    .map((entry) => entry.game);
}

function getBestNightCombo(scoreboard, allTeams, baselineRace, objective) {
  const sabres = baselineRace.sabres;
  const challengerAbbrevs = new Set(
    baselineRace.challengers.map((team) => team.teamAbbrev)
  );
  if (challengerAbbrevs.size === 0) {
    return null;
  }

  const focusAbbrevs =
    objective.key === "makePlayoffs" ? getPlayoffPictureAbbrevs(allTeams, sabres) : null;
  const comboGames = getComboGames(
    scoreboard,
    allTeams,
    challengerAbbrevs,
    focusAbbrevs
  );
  if (comboGames.length === 0) {
    return null;
  }
  if (4 ** comboGames.length > MAX_COMBO_BRANCHES) {
    return null;
  }

  const outcomes = ["home-reg", "home-ot", "away-ot", "away-reg"];
  let best = null;
  let worst = null;

  function visit(index, teamsMap, chosenOutcomes) {
    if (index >= comboGames.length) {
      const result = computeObjectiveRace(Array.from(teamsMap.values()), objective);
      const payload = {
        ...result,
        outcomes: [...chosenOutcomes],
      };

      if (!best || compareOutcomeResults(payload, best) < 0) {
        best = payload;
      }
      if (!worst || compareOutcomeResults(payload, worst) > 0) {
        worst = payload;
      }
      return;
    }

    const game = comboGames[index];
    const homeAbbrev = teamAbbrev(game.homeTeam);
    const awayAbbrev = teamAbbrev(game.awayTeam);
    const homeName = fullTeamName(game.homeTeam) || homeAbbrev;
    const awayName = fullTeamName(game.awayTeam) || awayAbbrev;

    for (const outcome of outcomes) {
      const nextTeamsMap = new Map(
        Array.from(teamsMap.entries()).map(([abbrev, team]) => [abbrev, cloneTeam(team)])
      );
      applyOutcomeToTeamsMap(nextTeamsMap, homeAbbrev, awayAbbrev, outcome);
      chosenOutcomes.push({
        gameId: game.id ?? `${scoreboard.date}-${homeAbbrev}-${awayAbbrev}`,
        matchup: `${awayName} @ ${homeName}`,
        outcome,
        label: outcomeLabel(outcome, homeName, awayName),
      });
      visit(index + 1, nextTeamsMap, chosenOutcomes);
      chosenOutcomes.pop();
    }
  }

  visit(
    0,
    new Map(allTeams.map((team) => [team.teamAbbrev, cloneTeam(team)])),
    []
  );

  if (!best || !worst) {
    return null;
  }

  return {
    games_considered: comboGames.length,
    best_case: {
      magicPointsNeeded: best.magicPointsNeeded,
      clinchTarget: best.clinchTarget,
      outcomes: best.outcomes,
      impact:
        baselineRace.magicPointsNeeded !== best.magicPointsNeeded
          ? `${baselineRace.magicPointsNeeded - best.magicPointsNeeded > 0 ? "-" : "+"}${Math.abs(
              baselineRace.magicPointsNeeded - best.magicPointsNeeded
            )} magic points`
          : `${best.clinchTarget - baselineRace.clinchTarget > 0 ? "+" : ""}${
              best.clinchTarget - baselineRace.clinchTarget
            } clinch target`,
    },
    worst_case: {
      magicPointsNeeded: worst.magicPointsNeeded,
      clinchTarget: worst.clinchTarget,
      outcomes: worst.outcomes,
    },
  };
}

function getClinchScenariosForDay(scoreboard, allTeams, baselineRace, objective) {
  if (baselineRace.magicPointsNeeded === 0) {
    return {
      canClinchToday: true,
      conditions: [],
      message: "Already clinched",
    };
  }

  const sabres = baselineRace.sabres;
  const challengerAbbrevs = new Set(
    baselineRace.challengers.map((team) => team.teamAbbrev)
  );
  const focusAbbrevs =
    objective.key === "makePlayoffs" ? getPlayoffPictureAbbrevs(allTeams, sabres) : null;
  const comboGames = getComboGames(
    scoreboard,
    allTeams,
    challengerAbbrevs,
    focusAbbrevs,
    MAX_CLINCH_COMBO_GAMES
  );

  if (comboGames.length === 0) {
    return {
      canClinchToday: false,
      conditions: [],
      message: "Can't clinch today",
    };
  }
  if (4 ** comboGames.length > MAX_COMBO_BRANCHES) {
    return {
      canClinchToday: false,
      conditions: [],
      message: "Can't clinch today",
    };
  }

  const outcomes = ["home-reg", "home-ot", "away-ot", "away-reg"];
  let clinchingScenario = null;

  const serializeOutcomes = (values) => values.slice().sort().join("|");
  const conditionLabel = (game, allowedOutcomes) => {
    const homeName = fullTeamName(game.homeTeam) || teamAbbrev(game.homeTeam);
    const awayName = fullTeamName(game.awayTeam) || teamAbbrev(game.awayTeam);
    const key = serializeOutcomes(allowedOutcomes);

    if (key === "away-ot|away-reg") return `${awayName} win`;
    if (key === "home-ot|home-reg") return `${homeName} win`;
    if (key === "away-ot|away-reg|home-ot") return `${awayName} get at least 1 point`;
    if (key === "away-ot|home-ot|home-reg") return `${homeName} get at least 1 point`;
    if (key === "away-ot|home-ot") return `${awayName} and ${homeName} both get a point`;
    if (key === "away-reg") return `${awayName} win in regulation`;
    if (key === "away-ot") return `${awayName} win in OT/SO`;
    if (key === "home-reg") return `${homeName} win in regulation`;
    if (key === "home-ot") return `${homeName} win in OT/SO`;
    return `${awayName} @ ${homeName}: ${allowedOutcomes.join(", ")}`;
  };

  const getAllowedOutcomes = (selectedOutcome) => {
    if (selectedOutcome === "home-reg") {
      return [
        ["home-reg"],
        ["home-reg", "home-ot"],
        ["home-reg", "home-ot", "away-ot"],
      ];
    }
    if (selectedOutcome === "home-ot") {
      return [
        ["home-ot"],
        ["home-reg", "home-ot"],
        ["away-ot", "home-ot"],
        ["home-reg", "home-ot", "away-ot"],
        ["away-ot", "away-reg", "home-ot"],
      ];
    }
    if (selectedOutcome === "away-ot") {
      return [
        ["away-ot"],
        ["away-ot", "away-reg"],
        ["away-ot", "home-ot"],
        ["home-reg", "home-ot", "away-ot"],
        ["away-ot", "away-reg", "home-ot"],
      ];
    }
    return [
      ["away-reg"],
      ["away-ot", "away-reg"],
      ["away-ot", "away-reg", "home-ot"],
    ];
  };

  const clinchesWithScenario = (scenario) => {
    const teamsMap = new Map(allTeams.map((team) => [team.teamAbbrev, cloneTeam(team)]));
    for (let index = 0; index < comboGames.length; index += 1) {
      const game = comboGames[index];
      const homeAbbrev = teamAbbrev(game.homeTeam);
      const awayAbbrev = teamAbbrev(game.awayTeam);
      applyOutcomeToTeamsMap(teamsMap, homeAbbrev, awayAbbrev, scenario[index]);
    }
    return computeObjectiveRace(Array.from(teamsMap.values()), objective).magicPointsNeeded === 0;
  };

  function visit(index, teamsMap, chosenOutcomes) {
    if (clinchingScenario) {
      return;
    }
    if (index >= comboGames.length) {
      const result = computeObjectiveRace(Array.from(teamsMap.values()), objective);
      if (result.magicPointsNeeded === 0) {
        clinchingScenario = [...chosenOutcomes];
      }
      return;
    }

    const game = comboGames[index];
    const homeAbbrev = teamAbbrev(game.homeTeam);
    const awayAbbrev = teamAbbrev(game.awayTeam);
    const homeName = fullTeamName(game.homeTeam) || homeAbbrev;
    const awayName = fullTeamName(game.awayTeam) || awayAbbrev;

    for (const outcome of outcomes) {
      const nextTeamsMap = new Map(
        Array.from(teamsMap.entries()).map(([abbrev, team]) => [abbrev, cloneTeam(team)])
      );
      applyOutcomeToTeamsMap(nextTeamsMap, homeAbbrev, awayAbbrev, outcome);
      chosenOutcomes.push({
        outcome,
      });
      visit(index + 1, nextTeamsMap, chosenOutcomes);
      chosenOutcomes.pop();
    }
  }

  visit(
    0,
    new Map(allTeams.map((team) => [team.teamAbbrev, cloneTeam(team)])),
    []
  );

  if (!clinchingScenario) {
    return {
      canClinchToday: false,
      conditions: [],
      message: "Can't clinch today",
    };
  }

  const conditions = [];
  for (let index = 0; index < clinchingScenario.length; index += 1) {
    const selectedOutcome = clinchingScenario[index];
    let bestAllowed = [selectedOutcome];

    for (const allowedOutcomes of getAllowedOutcomes(selectedOutcome)) {
      const candidateScenario = [...clinchingScenario];
      let allAllowedStillClinch = true;

      for (const possibleOutcome of allowedOutcomes) {
        candidateScenario[index] = possibleOutcome;
        if (!clinchesWithScenario(candidateScenario)) {
          allAllowedStillClinch = false;
          break;
        }
      }

      if (allAllowedStillClinch) {
        bestAllowed = allowedOutcomes;
      } else {
        break;
      }
    }

    if (bestAllowed.length === 4) {
      continue;
    }

    const label = conditionLabel(comboGames[index], bestAllowed);
    if (label) {
      conditions.push(label);
    }
  }

  return {
    canClinchToday: true,
    conditions,
    message: "Can clinch today if:",
  };
}

function getNightlyRootingGuide(scoreboards, allTeams, baselineRace, objective) {
  const sabres = baselineRace.sabres;
  const conferenceByAbbrev = new Map(
    allTeams.map((team) => [team.teamAbbrev, team.conference])
  );
  const challengerAbbrevs = new Set(
    baselineRace.challengers.map((team) => team.teamAbbrev)
  );
  const focusAbbrevs =
    objective.key === "makePlayoffs" ? getPlayoffPictureAbbrevs(allTeams, sabres) : null;

  return scoreboards.map((scoreboard) => {
      const modeledGames = scoreboard.games
        .filter((game) =>
          isRelevantNightlyGame(game, conferenceByAbbrev, challengerAbbrevs, focusAbbrevs)
        )
        .map((game) => {
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
          const result = simulateGameOutcome(allTeams, homeAbbrev, awayAbbrev, outcome, objective);
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
          gameId: game.id ?? `${scoreboard.date}-${homeAbbrev}-${awayAbbrev}`,
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
        };
      });

      modeledGames.sort((a, b) => {
        if (a.bestCase.magicPointsNeeded !== b.bestCase.magicPointsNeeded) {
          return a.bestCase.magicPointsNeeded - b.bestCase.magicPointsNeeded;
        }
        return a.matchup.localeCompare(b.matchup);
      });

      return {
        date: scoreboard.date,
        label: scoreboard.label,
        clinchScenarios:
          objective.key === "makePlayoffs"
            ? getClinchScenariosForDay(scoreboard, allTeams, baselineRace, objective)
            : null,
        bestNightCombo: getBestNightCombo(scoreboard, allTeams, baselineRace, objective),
        games: modeledGames,
      };
    });
}

export const handler = async () => {
  try {
    const now = new Date();
    const cacheControl = getDynamicCacheControl(now);
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
        division: team.divisionAbbrev ?? "",
        currentPoints: pts,
        gamesPlayed: gp,
        gamesRemaining,
        maxPossiblePoints: pts + gamesRemaining * 2,
        trendLast10: formatLast10(team),
        regulationOvertimeSplit: formatSplit(team),
        tiebreakStats: buildTiebreakStats(team),
        pointPct: pointPct(pts, gp),
        homePointPct,
        roadPointPct,
        last10PointPct,
      };
    });

    const sabres = teams.find((team) => team.team === TARGET_TEAM);
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

    const eastCompetitorsBase = teams.filter(
      (team) =>
        team.team !== TARGET_TEAM &&
        team.conference === sabres.conference &&
        team.maxPossiblePoints >= sabres.currentPoints
    );

    const competitors = await Promise.all(
      eastCompetitorsBase.map(async (team) => {
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
          teamKey: team.teamAbbrev,
          team: team.team,
          teamAbbrev: team.teamAbbrev,
          conference: team.conference,
          division: team.division,
          currentPoints: team.currentPoints,
          gamesRemaining: team.gamesRemaining,
          maxPossiblePoints: team.maxPossiblePoints,
          tiebreakStatus: team.tiebreakStatus ?? {
            sabresHasClinchableEdge: false,
            winningMetric: null,
            label: "Tiebreaker not yet clinched",
          },
          thresholdPoints: team.thresholdPoints ?? team.maxPossiblePoints + 1,
          next3Opponents,
          regulationOvertimeSplit: team.regulationOvertimeSplit,
          trendLast10: team.trendLast10,
          difficultyScore,
        };
      })
    );
    const competitorMap = new Map(
      competitors.map((team) => [team.teamAbbrev, team])
    );

    const nightlyScoreboards = await loadNightlyScoreboards(now);

    const objectiveEntries = await Promise.all(
      Object.values(OBJECTIVES).map(async (objective) => {
        const baselineRace = computeObjectiveRace(teams, objective);
        const isClinched = baselineRace.magicPointsNeeded === 0;
        const playoffDisplayOrder =
          objective.key === "makePlayoffs" ? buildPlayoffDisplayOrder(teams, sabres) : null;
        const raceChallengerMap = new Map(
          baselineRace.challengers.map((team) => [team.teamAbbrev, team])
        );
        const competitorSource =
          objective.key === "makePlayoffs"
            ? eastCompetitorsBase
            : baselineRace.challengers;
        const objectiveCompetitors = competitorSource
          .map((team) => {
            const competitor = competitorMap.get(team.teamAbbrev);
            if (!competitor) {
              return null;
            }
            const challenger = raceChallengerMap.get(team.teamAbbrev);

            return {
              ...competitor,
              tiebreakStatus: challenger?.tiebreakStatus ?? competitor.tiebreakStatus,
              thresholdPoints: challenger?.thresholdPoints ?? competitor.thresholdPoints,
              playoffDisplayLabel:
                objective.key === "makePlayoffs"
                  ? playoffDisplayOrder?.get(team.teamAbbrev)?.playoffDisplayLabel ?? null
                  : null,
              playoffDisplayGroup:
                objective.key === "makePlayoffs"
                  ? playoffDisplayOrder?.get(team.teamAbbrev)?.playoffDisplayGroup ?? null
                  : null,
              playoffDisplayIndex:
                objective.key === "makePlayoffs"
                  ? playoffDisplayOrder?.get(team.teamAbbrev)?.playoffDisplayIndex ?? null
                  : null,
            };
          })
          .filter(Boolean)
          .sort((left, right) => {
            if (objective.key === "makePlayoffs") {
              const leftGroup = left.playoffDisplayGroup ?? 99;
              const rightGroup = right.playoffDisplayGroup ?? 99;
              if (leftGroup !== rightGroup) {
                return leftGroup - rightGroup;
              }

              const leftIndex = left.playoffDisplayIndex ?? 99;
              const rightIndex = right.playoffDisplayIndex ?? 99;
              if (leftIndex !== rightIndex) {
                return leftIndex - rightIndex;
              }
            }

            if ((right.thresholdPoints ?? 0) !== (left.thresholdPoints ?? 0)) {
              return (right.thresholdPoints ?? 0) - (left.thresholdPoints ?? 0);
            }

            return (right.currentPoints ?? 0) - (left.currentPoints ?? 0);
          });
        const shouldSuppressDetail = objective.key === "makePlayoffs" && isClinched;
        const nightlyRootingGuide = shouldSuppressDetail
          ? []
          : getNightlyRootingGuide(
              nightlyScoreboards,
              teams,
              baselineRace,
              objective
            );

        return [
          objective.key,
          {
            key: objective.key,
            title: objective.title,
            description: objective.description,
            sabres: {
              currentPoints: sabres.currentPoints,
              gamesPlayed: sabres.gamesPlayed,
              gamesRemaining: sabres.gamesRemaining,
              maxPossiblePoints: sabres.maxPossiblePoints,
              clinchTarget: baselineRace.clinchTarget,
              magicPointsNeeded: baselineRace.magicPointsNeeded,
              isClinched,
            },
            competitors: shouldSuppressDetail ? [] : objectiveCompetitors,
            nightlyRootingGuide,
          },
        ];
      })
    );
    const objectives = Object.fromEntries(objectiveEntries);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": cacheControl,
      },
      body: JSON.stringify({
        asOf: date,
        defaultObjective: "makePlayoffs",
        objectives,
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
