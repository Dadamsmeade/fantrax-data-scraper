-- Table to store daily player statistics
CREATE TABLE IF NOT EXISTS player_daily_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    player_id INTEGER NOT NULL,        -- Reference to player ID from Fantrax
    mlb_team TEXT,                     -- MLB team abbreviation (NYY, BOS, etc.)
    fantasy_team_id INTEGER,           -- Reference to fantasy team in your system
    season_id INTEGER,                 -- Reference to season
    period_number INTEGER,             -- Scoring period number
    position_played TEXT,              -- Position the player was slotted in (C, 1B, etc.)
    active INTEGER,                    -- 1 if in active lineup, 0 if on bench
    
    -- Hitting stats
    ab INTEGER DEFAULT 0,              -- At bats
    h INTEGER DEFAULT 0,               -- Hits
    r INTEGER DEFAULT 0,               -- Runs
    singles INTEGER DEFAULT 0,
    doubles INTEGER DEFAULT 0, 
    triples INTEGER DEFAULT 0,
    hr INTEGER DEFAULT 0,              -- Home runs
    rbi INTEGER DEFAULT 0,             -- RBIs
    bb INTEGER DEFAULT 0,              -- Walks
    sb INTEGER DEFAULT 0,              -- Stolen bases
    cs INTEGER DEFAULT 0,              -- Caught stealing
    
    -- Pitching stats
    wins INTEGER DEFAULT 0,
    innings_pitched TEXT,              -- Stored as text like "6.1" for 6⅓ innings
    ip_outs INTEGER DEFAULT 0,         -- Innings pitched converted to outs (for calculations)
    er INTEGER DEFAULT 0,              -- Earned runs
    hits_allowed INTEGER DEFAULT 0,    -- Hits allowed
    bb_allowed INTEGER DEFAULT 0,      -- Walks allowed
    k INTEGER DEFAULT 0,               -- Strikeouts
    h_plus_bb INTEGER DEFAULT 0,       -- Hits plus walks (WHIP component)
    
    -- Fantasy points
    fantasy_points REAL DEFAULT 0,     -- Calculated fantasy points
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(date, player_id, fantasy_team_id)
);

-- Table to store daily team totals
CREATE TABLE IF NOT EXISTS fantasy_team_daily_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    fantasy_team_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL,
    period_number INTEGER,
    
    -- Aggregated hitting stats
    at_bats INTEGER DEFAULT 0,
    hits INTEGER DEFAULT 0,
    runs INTEGER DEFAULT 0,
    singles INTEGER DEFAULT 0,
    doubles INTEGER DEFAULT 0,
    triples INTEGER DEFAULT 0,
    home_runs INTEGER DEFAULT 0,
    rbis INTEGER DEFAULT 0,
    walks INTEGER DEFAULT 0,
    stolen_bases INTEGER DEFAULT 0,
    caught_stealing INTEGER DEFAULT 0,
    
    -- Aggregated pitching stats
    wins INTEGER DEFAULT 0,
    innings_pitched_outs INTEGER DEFAULT 0,
    earned_runs INTEGER DEFAULT 0,
    hits_plus_walks INTEGER DEFAULT 0,
    strikeouts INTEGER DEFAULT 0,
    
    -- Fantasy points
    hitting_points REAL DEFAULT 0,
    pitching_points REAL DEFAULT 0,
    total_points REAL DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(date, fantasy_team_id)
);

-- Table to store matchup results per day
CREATE TABLE IF NOT EXISTS matchup_daily_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    season_id INTEGER NOT NULL,
    period_number INTEGER NOT NULL,
    matchup_id TEXT,
    
    away_team_id INTEGER NOT NULL,
    home_team_id INTEGER NOT NULL,
    away_points REAL DEFAULT 0,
    home_points REAL DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(date, away_team_id, home_team_id)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_player_stats_date ON player_daily_stats(date);
CREATE INDEX IF NOT EXISTS idx_player_stats_player ON player_daily_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_team ON player_daily_stats(fantasy_team_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_season_period ON player_daily_stats(season_id, period_number);

CREATE INDEX IF NOT EXISTS idx_team_stats_date ON fantasy_team_daily_stats(date);
CREATE INDEX IF NOT EXISTS idx_team_stats_team ON fantasy_team_daily_stats(fantasy_team_id);
CREATE INDEX IF NOT EXISTS idx_team_stats_season_period ON fantasy_team_daily_stats(season_id, period_number);

CREATE INDEX IF NOT EXISTS idx_matchup_date ON matchup_daily_results(date);
CREATE INDEX IF NOT EXISTS idx_matchup_period ON matchup_daily_results(season_id, period_number);
CREATE INDEX IF NOT EXISTS idx_matchup_teams ON matchup_daily_results(away_team_id, home_team_id);