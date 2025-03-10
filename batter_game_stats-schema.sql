-- Create table for MLB batter game statistics
CREATE TABLE IF NOT EXISTS batter_game_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_pk INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    player_name TEXT NOT NULL,
    team_id INTEGER NOT NULL,
    team_name TEXT,
    game_date TEXT,
    
    -- Basic counting stats
    games_played INTEGER,
    plate_appearances INTEGER,
    at_bats INTEGER,
    runs INTEGER,
    hits INTEGER,
    doubles INTEGER,
    triples INTEGER,
    home_runs INTEGER,
    rbi INTEGER,
    stolen_bases INTEGER,
    caught_stealing INTEGER,
    
    -- Plate discipline
    base_on_balls INTEGER,
    intentional_walks INTEGER,
    strikeouts INTEGER,
    hit_by_pitch INTEGER,
    
    -- Other batting events
    sac_flies INTEGER,
    sac_bunts INTEGER,
    ground_into_double_play INTEGER,
    ground_into_triple_play INTEGER,
    
    -- Batted ball types
    fly_outs INTEGER,
    ground_outs INTEGER,
    pop_outs INTEGER,
    line_outs INTEGER,
    air_outs INTEGER,
    
    -- Summary stats from API
    batting_summary TEXT,

    -- Calculated stats
    avg TEXT,
    obp TEXT,
    slg TEXT,
    ops TEXT,
    total_bases INTEGER, 
    left_on_base INTEGER,
    at_bats_per_home_run TEXT,
    stolen_base_percentage TEXT,
    
    -- Meta info
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (game_pk) REFERENCES mlb_games(game_pk),
    UNIQUE (game_pk, player_id, team_id)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_batter_game_stats_game ON batter_game_stats(game_pk);
CREATE INDEX IF NOT EXISTS idx_batter_game_stats_player ON batter_game_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_batter_game_stats_team ON batter_game_stats(team_id);
CREATE INDEX IF NOT EXISTS idx_batter_game_stats_date ON batter_game_stats(game_date);

-- Create a trigger to update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_batter_game_stats_timestamp
AFTER UPDATE ON batter_game_stats
BEGIN
    UPDATE batter_game_stats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;