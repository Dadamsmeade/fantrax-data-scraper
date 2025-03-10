-- Create table for MLB games data
CREATE TABLE IF NOT EXISTS mlb_games (
    game_pk INTEGER PRIMARY KEY,
    season TEXT NOT NULL,
    official_date TEXT NOT NULL,
    game_type TEXT NOT NULL,
    abstract_game_state TEXT,
    day_night TEXT,
    home_team_id INTEGER,
    away_team_id INTEGER,
    home_team_score INTEGER,
    away_team_score INTEGER,
    venue_id INTEGER,
    venue_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (home_team_id) REFERENCES mlb_teams(id),
    FOREIGN KEY (away_team_id) REFERENCES mlb_teams(id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_mlb_games_season ON mlb_games(season);
CREATE INDEX IF NOT EXISTS idx_mlb_games_date ON mlb_games(official_date);
CREATE INDEX IF NOT EXISTS idx_mlb_games_teams ON mlb_games(home_team_id, away_team_id);

-- Create a trigger to update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_mlb_games_timestamp
AFTER UPDATE ON mlb_games
BEGIN
    UPDATE mlb_games SET updated_at = CURRENT_TIMESTAMP WHERE game_pk = NEW.game_pk;
END;