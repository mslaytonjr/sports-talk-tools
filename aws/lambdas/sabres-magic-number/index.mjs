const TOTAL_GAMES = 82;
const TARGET_TEAM = "Buffalo Sabres";
const NHL_API_BASE = "https://api-web.nhle.com";
const MAX_COMBO_GAMES = 8;
const OBJECTIVES = {
  makePlayoffs: {
    key: "makePlayoffs",
    title: "Make Playoffs",
    description: "Finish top 3 in the Atlantic or claim one of the 2 Eastern Conference wild cards.",
    cutoffIndex: 7,
    isCompetitor: (team, sabres) =>
      team.team !== TARGET_TEAM && team.conference === sabres.conference,
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
    const divisionChallengers = eligibleCompetitors
      .filter(
        (team) =>
          team.division === sabres.division && team.thresholdPoints > sabres.currentPoints
      )
      .sort(sortByThreat);
    const divisionTarget =
      divisionChallengers.length > 2 ? divisionChallengers[2].thresholdPoints : 0;

    const conferenceByDivision = new Map();
    for (const team of eligibleCompetitors) {
      if (team.conference !== sabres.conference) {
        continue;
      }
      const list = conferenceByDivision.get(team.division) ?? [];
      list.push(team);
      conferenceByDivision.set(team.division, list);
    }

    const autoBidTeams = new Set();
    for (const divisionTeams of conferenceByDivision.values()) {
      divisionTeams
        .slice()
        .sort(sortByThreat)
        .slice(0, 3)
        .forEach((team) => autoBidTeams.add(team.teamAbbrev));
    }

    const wildcardChallengers = eligibleCompetitors
      .filter(
        (team) =>
          team.conference === sabres.conference &&
          !autoBidTeams.has(team.teamAbbrev) &&
          team.thresholdPoints > sabres.currentPoints
      )
      .sort(sortByThreat);
    const wildcardTarget =
      wildcardChallengers.length > 1 ? wildcardChallengers[1].thresholdPoints : 0;

    const positiveTargets = [divisionTarget, wildcardTarget].filter((value) => value > 0);
    thresholdMax = positiveTargets.length > 0 ? Math.min(...positiveTargets) : 0;

    const challengerMap = new Map();
    [...divisionChallengers, ...wildcardChallengers].forEach((team) => {
      if (!challengerMap.has(team.teamAbbrev)) {
        challengerMap.set(team.teamAbbrev, team);
      }
    });
    challengers = [...challengerMap.values()].sort(sortByThreat);
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

function getComboGames(scoreboard, allTeams, sabresConference) {
  const conferenceByAbbrev = new Map(
    allTeams.map((team) => [team.teamAbbrev, team.conference])
  );
  const challengerAbbrevs = new Set(
    allTeams
      .filter((team) => team.team !== TARGET_TEAM && team.conference === sabresConference)
      .map((team) => team.teamAbbrev)
  );

  return scoreboard.games
    .filter((game) => {
      const homeConference = conferenceByAbbrev.get(teamAbbrev(game.homeTeam)) ?? "";
      const awayConference = conferenceByAbbrev.get(teamAbbrev(game.awayTeam)) ?? "";
      return !(homeConference === "W" && awayConference === "W");
    })
    .map((game) => {
      const homeAbbrev = teamAbbrev(game.homeTeam);
      const awayAbbrev = teamAbbrev(game.awayTeam);
      const relevance =
        (challengerAbbrevs.has(homeAbbrev) ? 1 : 0) +
        (challengerAbbrevs.has(awayAbbrev) ? 1 : 0);
      return { game, relevance };
    })
    .sort((left, right) => {
      if (right.relevance !== left.relevance) {
        return right.relevance - left.relevance;
      }
      return (left.game.startTimeUTC ?? "").localeCompare(right.game.startTimeUTC ?? "");
    })
    .slice(0, MAX_COMBO_GAMES)
    .map((entry) => entry.game);
}

function getBestNightCombo(scoreboard, allTeams, baselineRace, objective) {
  const sabres = allTeams.find((team) => team.team === TARGET_TEAM);
  if (!sabres) {
    return null;
  }

  const comboGames = getComboGames(scoreboard, allTeams, sabres.conference);
  if (comboGames.length === 0) {
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

function getNightlyRootingGuide(scoreboards, allTeams, baselineRace, objective) {
  const conferenceByAbbrev = new Map(
    allTeams.map((team) => [team.teamAbbrev, team.conference])
  );

  return scoreboards.map((scoreboard) => {
      const modeledGames = scoreboard.games
        .filter((game) => {
          const homeAbbrev = teamAbbrev(game.homeTeam);
          const awayAbbrev = teamAbbrev(game.awayTeam);
          const homeConference = conferenceByAbbrev.get(homeAbbrev) ?? "";
          const awayConference = conferenceByAbbrev.get(awayAbbrev) ?? "";

          return !(homeConference === "W" && awayConference === "W");
        })
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
        const objectiveCompetitors = baselineRace.challengers
          .map((team) => {
            const competitor = competitorMap.get(team.teamAbbrev);
            if (!competitor) {
              return null;
            }

            return {
              ...competitor,
              tiebreakStatus: team.tiebreakStatus,
              thresholdPoints: team.thresholdPoints,
            };
          })
          .filter(Boolean);
        const nightlyRootingGuide = getNightlyRootingGuide(
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
            },
            competitors: objectiveCompetitors,
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
