export const NFLVERSE_PBP_URL = (season: number) =>
    `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv`;

export type PlayByPlayRow = {
    gameId: string;
    season: number | null;
    week: number | null;
    seasonType: string;
    qtr: number | null;
    down: number | null;
    ydstogo: number | null;
    gameSecondsRemaining: number | null;
    scoreDifferential: number | null;
    posteam: string;
    defteam: string;
    playType: string;
    desc: string;
    wp: number | null;
    defWp: number | null;
    homeWp: number | null;
    awayWp: number | null;
    wpa: number | null;
};

export type PlayByPlaySeason = {
    season: number;
    sourceUrl: string;
    rows: PlayByPlayRow[];
};

export type LoadProgress =
    | { stage: "starting"; message: string }
    | { stage: "downloading"; message: string; bytesLoaded: number; totalBytes: number | null }
    | { stage: "parsing"; message: string; rowsLoaded: number }
    | { stage: "complete"; message: string; rowsLoaded: number };

const SELECTED_COLUMNS = [
    "game_id",
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
    "wp",
    "def_wp",
    "home_wp",
    "away_wp",
    "wpa",
] as const;

type ColumnName = (typeof SELECTED_COLUMNS)[number];

function safeText(value: string | undefined) {
    return value?.trim() ?? "";
}

function parseNumber(value: string | undefined) {
    const trimmed = safeText(value);
    if (!trimmed) {
        return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeHeader(value: string) {
    return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function mapRow(row: string[], indexes: Record<ColumnName, number>): PlayByPlayRow {
    return {
        gameId: safeText(row[indexes.game_id]),
        season: parseNumber(row[indexes.season]),
        week: parseNumber(row[indexes.week]),
        seasonType: safeText(row[indexes.season_type]),
        qtr: parseNumber(row[indexes.qtr]),
        down: parseNumber(row[indexes.down]),
        ydstogo: parseNumber(row[indexes.ydstogo]),
        gameSecondsRemaining: parseNumber(row[indexes.game_seconds_remaining]),
        scoreDifferential: parseNumber(row[indexes.score_differential]),
        posteam: safeText(row[indexes.posteam]),
        defteam: safeText(row[indexes.defteam]),
        playType: safeText(row[indexes.play_type]),
        desc: safeText(row[indexes.desc]),
        wp: parseNumber(row[indexes.wp]),
        defWp: parseNumber(row[indexes.def_wp]),
        homeWp: parseNumber(row[indexes.home_wp]),
        awayWp: parseNumber(row[indexes.away_wp]),
        wpa: parseNumber(row[indexes.wpa]),
    };
}

function createCsvStreamParser(onRow: (row: string[]) => void) {
    let current = "";
    let row: string[] = [];
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
        write(chunk: string) {
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

export async function loadSeasonPlayByPlay(
    season: number,
    onProgress?: (progress: LoadProgress) => void
): Promise<PlayByPlaySeason> {
    const sourceUrl = NFLVERSE_PBP_URL(season);
    onProgress?.({
        stage: "starting",
        message: `Starting download for ${season} play-by-play data.`,
    });

    const response = await fetch(sourceUrl, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Failed to load ${season} play-by-play data (${response.status}).`);
    }

    const totalBytesHeader = response.headers.get("content-length");
    const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : null;
    const rows: PlayByPlayRow[] = [];
    let headers: string[] | null = null;
    let indexes: Record<ColumnName, number> | null = null;
    let rowsLoaded = 0;

    const consumeRow = (row: string[]) => {
        if (!headers) {
            headers = row.map(normalizeHeader);
            indexes = Object.fromEntries(
                SELECTED_COLUMNS.map((column) => [column, headers!.indexOf(column)])
            ) as Record<ColumnName, number>;

            const missingColumns = SELECTED_COLUMNS.filter((column) => indexes![column] === -1);
            if (missingColumns.length > 0) {
                throw new Error(
                    `Missing required play-by-play columns: ${missingColumns.join(", ")}.`
                );
            }
            return;
        }

        rows.push(mapRow(row, indexes!));
        rowsLoaded += 1;

        if (rowsLoaded % 2500 === 0) {
            onProgress?.({
                stage: "parsing",
                message: `Parsed ${rowsLoaded.toLocaleString()} plays.`,
                rowsLoaded,
            });
        }
    };

    if (!response.body) {
        const text = await response.text();
        const parser = createCsvStreamParser(consumeRow);
        parser.write(text);
        parser.finish();
    } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parser = createCsvStreamParser(consumeRow);
        let bytesLoaded = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            bytesLoaded += value.byteLength;
            onProgress?.({
                stage: "downloading",
                message: totalBytes
                    ? `Downloaded ${Math.round((bytesLoaded / totalBytes) * 100)}% of the season file.`
                    : `Downloaded ${Math.round(bytesLoaded / 1024 / 1024)} MB of the season file.`,
                bytesLoaded,
                totalBytes,
            });

            parser.write(decoder.decode(value, { stream: true }));
        }

        parser.write(decoder.decode());
        parser.finish();
    }

    onProgress?.({
        stage: "complete",
        message: `Loaded ${rowsLoaded.toLocaleString()} plays for ${season}.`,
        rowsLoaded,
    });

    return {
        season,
        sourceUrl,
        rows,
    };
}
