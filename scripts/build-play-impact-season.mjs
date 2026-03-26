import { copyFileSync, createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const seasonArg = process.argv[2];
const season = Number(seasonArg ?? "2024");

if (!Number.isInteger(season) || season < 1999 || season > 2100) {
    console.error("Usage: node scripts/build-play-impact-season.mjs <season>");
    process.exit(1);
}

const sourceUrl = `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv`;
const outputDir = resolve(projectRoot, "data", "play-impact");
const publicOutputDir = resolve(projectRoot, "public", "play-impact");
const outputCsvPath = resolve(outputDir, `play_by_play_${season}_impact_foundation.csv`);
const outputOneScoreCsvPath = resolve(
    outputDir,
    `play_by_play_${season}_impact_foundation.one_score.csv`
);
const outputQualifyingSacksCsvPath = resolve(
    outputDir,
    `play_by_play_${season}_impact_foundation.q4_one_score_sacks.csv`
);
const outputSummaryPath = resolve(outputDir, `play_by_play_${season}_impact_foundation.summary.json`);
const publicQualifyingSacksCsvPath = resolve(
    publicOutputDir,
    `play_by_play_${season}_impact_foundation.q4_one_score_sacks.csv`
);
const publicSummaryPath = resolve(
    publicOutputDir,
    `play_by_play_${season}_impact_foundation.summary.json`
);
const ONE_SCORE_MARGIN = 8;

mkdirSync(outputDir, { recursive: true });
mkdirSync(publicOutputDir, { recursive: true });

function safeText(value) {
    return value?.trim() ?? "";
}

function parseNumber(value) {
    const trimmed = safeText(value);
    if (!trimmed) {
        return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeHeader(value) {
    return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function normalizeDefenderToken(value) {
    return value.trim().replace(/\.$/, "");
}

function extractSackDefenders(description) {
    const defenders = new Set();

    const splitMatch = description.match(/sack split by ([^)]+)\)/i);
    if (splitMatch) {
        for (const token of splitMatch[1].split(/\sand\s/i)) {
            const cleaned = normalizeDefenderToken(token);
            if (cleaned) {
                defenders.add(cleaned);
            }
        }
    }

    const parenMatches = [...description.matchAll(/\(([^)]+)\)/g)];
    for (const match of parenMatches) {
        const content = match[1];
        if (/shotgun|no huddle|pass|ob/i.test(content)) {
            continue;
        }

        for (const token of content.split(/\sand\s|,\s*/i)) {
            const cleaned = normalizeDefenderToken(token);
            if (/^\d+-/.test(cleaned)) {
                defenders.add(cleaned);
            }
        }
    }

    return [...defenders];
}

function toCsvCell(value) {
    const text = value == null ? "" : String(value);
    if (/[",\n\r]/.test(text)) {
        return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
}

function createCsvStreamParser(onRow) {
    let current = "";
    let row = [];
    let inQuotes = false;

    function pushCell() {
        row.push(current.trim());
        current = "";
    }

    function pushRow() {
        pushCell();
        if (row.some((cell) => cell.length > 0)) {
            onRow(row);
        }
        row = [];
    }

    return {
        write(chunk) {
            for (let index = 0; index < chunk.length; index += 1) {
                const char = chunk[index];
                const next = chunk[index + 1];

                if (char === '"') {
                    if (inQuotes && next === '"') {
                        current += '"';
                        index += 1;
                    } else {
                        inQuotes = !inQuotes;
                    }
                    continue;
                }

                if (char === "," && !inQuotes) {
                    pushCell();
                    continue;
                }

                if ((char === "\n" || char === "\r") && !inQuotes) {
                    if (char === "\r" && next === "\n") {
                        index += 1;
                    }
                    pushRow();
                    continue;
                }

                current += char;
            }
        },
        finish() {
            if (current.length > 0 || row.length > 0) {
                pushRow();
            }
        },
    };
}

const outputColumns = [
    "game_id",
    "play_id",
    "season",
    "week",
    "season_type",
    "qtr",
    "down",
    "ydstogo",
    "game_seconds_remaining",
    "score_differential",
    "posteam",
    "defteam",
    "play_type",
    "desc",
    "is_sack",
    "win_probability_before",
    "win_probability_after",
    "wp_delta_offense",
    "wp",
    "def_wp",
    "home_wp",
    "away_wp",
    "wpa",
];

async function main() {
    console.log(`Downloading play-by-play season ${season} from nflverse...`);
    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Failed to load ${sourceUrl} (${response.status}).`);
    }

    const csvWriter = createWriteStream(outputCsvPath, { encoding: "utf8" });
    const oneScoreCsvWriter = createWriteStream(outputOneScoreCsvPath, { encoding: "utf8" });
    const qualifyingSacksCsvWriter = createWriteStream(outputQualifyingSacksCsvPath, {
        encoding: "utf8",
    });
    csvWriter.write(`${outputColumns.join(",")}\n`);
    oneScoreCsvWriter.write(`${outputColumns.join(",")}\n`);
    qualifyingSacksCsvWriter.write(`${outputColumns.join(",")}\n`);

    const summary = {
        season,
        sourceUrl,
        generatedAt: new Date().toISOString(),
        notes: [
            "One-score is defined at the play level as absolute score differential less than or equal to 8.",
            "win_probability_after is derived as offensive wp + wpa clipped to [0, 1].",
            "Offense perspective is canonical: posteam is treated as the offense, wp is offense win probability before the play, and wp_delta_offense = win_probability_after - win_probability_before.",
        ],
        filters: {
            oneScore: {
                appliedAt: "play",
                absoluteScoreDifferentialLte: ONE_SCORE_MARGIN,
            },
            qualifyingSacks: {
                appliedAt: "play",
                quarterEquals: 4,
                absoluteScoreDifferentialLte: ONE_SCORE_MARGIN,
                playType: "sack",
                perspective: "offense",
                wpDeltaFormula: "win_probability_after - win_probability_before",
            },
        },
        rowCount: 0,
        gameCount: 0,
        oneScoreRowCount: 0,
        qualifyingSackRowCount: 0,
        qualifyingSackSummary: {
            qualifyingPlayCount: 0,
            averageWpDeltaOffense: null,
            medianWpDeltaOffense: null,
        },
        topSackLeaders: [],
        rowsWithWp: 0,
        rowsWithDerivedWpAfter: 0,
        sackCount: 0,
        requiredFields: [
            "game_id",
            "play_id",
            "qtr",
            "score_differential",
            "is_sack",
            "win_probability_before",
            "win_probability_after",
            "wp_delta_offense",
        ],
        validationSample: [],
    };

    const gameIds = new Set();
    const qualifyingWpDeltas = [];
    const defenderCounts = new Map();
    let headers = null;
    let indexes = null;
    let rowCount = 0;

    const parser = createCsvStreamParser((row) => {
        if (!headers) {
            headers = row.map(normalizeHeader);
            indexes = Object.fromEntries(headers.map((header, index) => [header, index]));

            const requiredInputColumns = [
                "game_id",
                "play_id",
                "qtr",
                "score_differential",
                "play_type",
                "desc",
                "wp",
                "wpa",
            ];

            const missingColumns = requiredInputColumns.filter(
                (column) => !Object.hasOwn(indexes, column)
            );

            if (missingColumns.length > 0) {
                throw new Error(`Missing required input columns: ${missingColumns.join(", ")}.`);
            }
            return;
        }

        const gameId = safeText(row[indexes.game_id]);
        const playId = safeText(row[indexes.play_id]);
        const playType = safeText(row[indexes.play_type]);
        const description = safeText(row[indexes.desc]);
        const wp = parseNumber(row[indexes.wp]);
        const wpa = parseNumber(row[indexes.wpa]);
        const winProbabilityAfter =
            wp != null && wpa != null ? Math.max(0, Math.min(1, wp + wpa)) : null;
        const wpDeltaOffense =
            wp != null && winProbabilityAfter != null ? winProbabilityAfter - wp : null;
        const isSack = playType === "sack" || /\bsacked\b/i.test(description);

        const outputRow = {
            game_id: gameId,
            play_id: playId,
            season: safeText(row[indexes.season]),
            week: safeText(row[indexes.week]),
            season_type: safeText(row[indexes.season_type]),
            qtr: safeText(row[indexes.qtr]),
            down: safeText(row[indexes.down]),
            ydstogo: safeText(row[indexes.ydstogo]),
            game_seconds_remaining: safeText(row[indexes.game_seconds_remaining]),
            score_differential: safeText(row[indexes.score_differential]),
            posteam: safeText(row[indexes.posteam]),
            defteam: safeText(row[indexes.defteam]),
            play_type: playType,
            desc: description,
            is_sack: isSack ? "true" : "false",
            win_probability_before: wp == null ? "" : wp,
            win_probability_after: winProbabilityAfter == null ? "" : winProbabilityAfter,
            wp_delta_offense: wpDeltaOffense == null ? "" : wpDeltaOffense,
            wp: wp == null ? "" : wp,
            def_wp: safeText(row[indexes.def_wp]),
            home_wp: safeText(row[indexes.home_wp]),
            away_wp: safeText(row[indexes.away_wp]),
            wpa: wpa == null ? "" : wpa,
        };

        csvWriter.write(
            `${outputColumns.map((column) => toCsvCell(outputRow[column])).join(",")}\n`
        );

        if (outputRow.score_differential !== "") {
            const scoreDifferential = Number(outputRow.score_differential);
            if (Math.abs(scoreDifferential) <= ONE_SCORE_MARGIN) {
                oneScoreCsvWriter.write(
                    `${outputColumns.map((column) => toCsvCell(outputRow[column])).join(",")}\n`
                );
                summary.oneScoreRowCount += 1;

                if (safeText(outputRow.qtr) === "4" && outputRow.is_sack === "true" && outputRow.wp_delta_offense !== "") {
                    qualifyingSacksCsvWriter.write(
                        `${outputColumns.map((column) => toCsvCell(outputRow[column])).join(",")}\n`
                    );
                    summary.qualifyingSackRowCount += 1;

                    if (summary.validationSample.length < 10) {
                        summary.validationSample.push({
                            game_id: outputRow.game_id,
                            play_id: outputRow.play_id,
                            posteam: outputRow.posteam,
                            qtr: outputRow.qtr,
                            score_differential: outputRow.score_differential,
                            is_sack: outputRow.is_sack,
                            win_probability_before: outputRow.win_probability_before,
                            win_probability_after: outputRow.win_probability_after,
                            wp_delta_offense: outputRow.wp_delta_offense,
                            desc: outputRow.desc,
                        });
                    }

                    qualifyingWpDeltas.push(Number(outputRow.wp_delta_offense));
                    for (const defender of extractSackDefenders(outputRow.desc)) {
                        defenderCounts.set(defender, (defenderCounts.get(defender) ?? 0) + 1);
                    }
                }
            }
        }

        rowCount += 1;
        if (gameId) {
            gameIds.add(gameId);
        }
        if (wp != null) {
            summary.rowsWithWp += 1;
        }
        if (winProbabilityAfter != null) {
            summary.rowsWithDerivedWpAfter += 1;
        }
        if (isSack) {
            summary.sackCount += 1;
        }

        if (rowCount % 10000 === 0) {
            console.log(`Processed ${rowCount.toLocaleString()} plays...`);
        }
    });

    if (!response.body) {
        parser.write(await response.text());
        parser.finish();
    } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            parser.write(decoder.decode(value, { stream: true }));
        }

        parser.write(decoder.decode());
        parser.finish();
    }

    await new Promise((resolveStream, rejectStream) => {
        csvWriter.end((error) => {
            if (error) {
                rejectStream(error);
                return;
            }
            resolveStream();
        });
    });

    await new Promise((resolveStream, rejectStream) => {
        oneScoreCsvWriter.end((error) => {
            if (error) {
                rejectStream(error);
                return;
            }
            resolveStream();
        });
    });

    await new Promise((resolveStream, rejectStream) => {
        qualifyingSacksCsvWriter.end((error) => {
            if (error) {
                rejectStream(error);
                return;
            }
            resolveStream();
        });
    });

    summary.rowCount = rowCount;
    summary.gameCount = gameIds.size;
    summary.qualifyingSackSummary.qualifyingPlayCount = summary.qualifyingSackRowCount;

    if (qualifyingWpDeltas.length > 0) {
        const average =
            qualifyingWpDeltas.reduce((sum, value) => sum + value, 0) / qualifyingWpDeltas.length;
        const sorted = [...qualifyingWpDeltas].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        const median =
            sorted.length % 2 === 0
                ? (sorted[middle - 1] + sorted[middle]) / 2
                : sorted[middle];

        summary.qualifyingSackSummary.averageWpDeltaOffense = average;
        summary.qualifyingSackSummary.medianWpDeltaOffense = median;
    }

    summary.topSackLeaders = [...defenderCounts.entries()]
        .map(([defender, sacks]) => ({ defender, sacks }))
        .sort((left, right) => right.sacks - left.sacks || left.defender.localeCompare(right.defender))
        .slice(0, 10);

    writeFileSync(outputSummaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    writeFileSync(publicSummaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    copyFileSync(outputQualifyingSacksCsvPath, publicQualifyingSacksCsvPath);

    console.log(`Wrote ${outputCsvPath}`);
    console.log(`Wrote ${outputOneScoreCsvPath}`);
    console.log(`Wrote ${outputQualifyingSacksCsvPath}`);
    console.log(`Wrote ${outputSummaryPath}`);
    console.log(`Published ${publicQualifyingSacksCsvPath}`);
    console.log(`Published ${publicSummaryPath}`);
    console.log(
        `Validated ${summary.rowCount.toLocaleString()} rows across ${summary.gameCount.toLocaleString()} games.`
    );
    console.log(`One-score filtered output contains ${summary.oneScoreRowCount.toLocaleString()} plays.`);
    console.log(
        `Fourth-quarter one-score sack output contains ${summary.qualifyingSackRowCount.toLocaleString()} plays.`
    );
    console.log(
        `Average wp_delta_offense: ${
            summary.qualifyingSackSummary.averageWpDeltaOffense == null
                ? "n/a"
                : summary.qualifyingSackSummary.averageWpDeltaOffense.toFixed(6)
        }`
    );
    console.log(
        `Median wp_delta_offense: ${
            summary.qualifyingSackSummary.medianWpDeltaOffense == null
                ? "n/a"
                : summary.qualifyingSackSummary.medianWpDeltaOffense.toFixed(6)
        }`
    );
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
