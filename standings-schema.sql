-- Create standings table for win-loss records
CREATE TABLE IF NOT EXISTS standings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    rank INTEGER,
    wins INTEGER,
    losses INTEGER,
    ties INTEGER,
    win_percentage REAL,
    division_record TEXT,
    games_back REAL,
    waiver_position INTEGER,
    fantasy_points_for REAL,
    fantasy_points_against REAL,
    streak TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (season_id) REFERENCES seasons (id),
    FOREIGN KEY (team_id) REFERENCES teams (id),
    UNIQUE (season_id, team_id)
);

-- Create season_stats table for overall stats
CREATE TABLE IF NOT EXISTS season_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    fantasy_points REAL,
    adjustments REAL,
    total_points REAL,
    fantasy_points_per_game REAL,
    games_played INTEGER,
    hitting_points REAL,
    team_pitching_points REAL,
    waiver_position INTEGER,
    projected_budget_left REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (season_id) REFERENCES seasons (id),
    FOREIGN KEY (team_id) REFERENCES teams (id),
    UNIQUE (season_id, team_id)
);

-- Create hitting_stats table
CREATE TABLE IF NOT EXISTS hitting_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    runs INTEGER,
    singles INTEGER,
    doubles INTEGER,
    triples INTEGER,
    home_runs INTEGER,
    runs_batted_in INTEGER,
    walks INTEGER,
    stolen_bases INTEGER,
    caught_stealing INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (season_id) REFERENCES seasons (id),
    FOREIGN KEY (team_id) REFERENCES teams (id),
    UNIQUE (season_id, team_id)
);

-- Create pitching_stats table
CREATE TABLE IF NOT EXISTS pitching_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    wins INTEGER,
    innings_pitched TEXT,
    earned_runs INTEGER,
    hits_plus_walks INTEGER,
    strikeouts INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (season_id) REFERENCES seasons (id),
    FOREIGN KEY (team_id) REFERENCES teams (id),
    UNIQUE (season_id, team_id)
);

-- Add update triggers
CREATE TRIGGER IF NOT EXISTS update_standings_timestamp
AFTER UPDATE ON standings
BEGIN
    UPDATE standings SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_season_stats_timestamp
AFTER UPDATE ON season_stats
BEGIN
    UPDATE season_stats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_hitting_stats_timestamp
AFTER UPDATE ON hitting_stats
BEGIN
    UPDATE hitting_stats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_pitching_stats_timestamp
AFTER UPDATE ON pitching_stats
BEGIN
    UPDATE pitching_stats SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;