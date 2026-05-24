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
    projected_margin?: number;
    home_win_probability: number;
    away_win_probability: number;
    ml_home_win_probability?: number | null;
    ml_away_win_probability?: number | null;
    ml_favorite?: string;
    ml_prediction_delta?: number | null;
    home_moneyline: string;
    away_moneyline: string;
    favorite: string;
    spread_like_line: string;
    confidence_tier: string;
    home_team_rating: string;
    away_team_rating: string;
    status?: string;
    home_score?: number | null;
    away_score?: number | null;
    actual_winner?: string;
    predicted_winner?: string;
    prediction_correct?: boolean | null;
    actual_margin?: number | null;
    margin_error?: number | null;
    actual_total?: number | null;
    total_error?: number | null;
    box_score_url?: string;
};

export type OpeningDayOddsBoard = {
    generated_at: string;
    stats_last_scraped_at?: string;
    stats_through_date?: string;
    scraped_game_count?: number | string;
    season: number;
    board_title: string;
    board_subtitle: string;
    data_source: string;
    caveat: string;
    final_games?: number;
    correct_picks?: number;
    pick_accuracy?: number | null;
    games: OpeningDayOddsGame[];
};

export async function loadOpeningDayOddsBoard(season: number): Promise<OpeningDayOddsBoard> {
    const response = await fetch(`/softball/opening-day-odds-${season}.json`, {
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`Softball odds for ${season} were not found.`);
    }

    return response.json() as Promise<OpeningDayOddsBoard>;
}
