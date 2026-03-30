export type OpeningDayOddsGame = {
    game_id: string;
    season: number;
    date: string;
    display_date: string;
    neutral_site: boolean;
    home_team: string;
    away_team: string;
    home_projected_runs: number;
    away_projected_runs: number;
    total_runs: number;
    home_win_probability: number;
    away_win_probability: number;
    home_moneyline: string;
    away_moneyline: string;
    favorite: string;
    spread_like_line: string;
    confidence_tier: string;
    home_team_rating: string;
    away_team_rating: string;
};

export type OpeningDayOddsBoard = {
    generated_at: string;
    season: number;
    board_title: string;
    board_subtitle: string;
    data_source: string;
    caveat: string;
    games: OpeningDayOddsGame[];
};

export async function loadOpeningDayOddsBoard(season: number): Promise<OpeningDayOddsBoard> {
    const response = await fetch(`/softball/opening-day-odds-${season}.json`, {
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`Opening day odds for ${season} were not found.`);
    }

    return response.json() as Promise<OpeningDayOddsBoard>;
}
