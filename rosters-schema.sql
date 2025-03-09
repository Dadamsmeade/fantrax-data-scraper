-- Create a table for storing roster information
CREATE TABLE IF NOT EXISTS rosters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id INTEGER NOT NULL,              -- Foreign key to seasons table
    team_id INTEGER NOT NULL,                -- Foreign key to teams table (fantasy team)
    period_number INTEGER NOT NULL,          -- Scoring period number (e.g., 1 for "Apr 2 - Apr 9")
    player_id INTEGER,                       -- Foreign key to your MLB players table (could be NULL until matched)
    position_code TEXT NOT NULL,             -- Position code (C, 1B, 2B, 3B, SS, OF, UT, TmP, Res, IR)
    roster_slot INTEGER NOT NULL,            -- Slot number within position (e.g., OF1, OF2, OF3 or Res1, Res2)
    is_active BOOLEAN NOT NULL,              -- Whether player is in active lineup (not on bench)
    player_name TEXT NOT NULL,               -- Player name from Fantrax (for reference)
    player_name_normalized TEXT,             -- Normalized player name (for matching with players table)
    mlb_team TEXT,                           -- MLB team abbreviation
    bat_side TEXT,                           -- Batting handedness (L, R, S for switch)
    fantrax_player_id TEXT,                  -- Fantrax's player ID (for reference only)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (season_id) REFERENCES seasons(id),
    FOREIGN KEY (team_id) REFERENCES teams(id),
    FOREIGN KEY (player_id) REFERENCES players(id),
    UNIQUE (season_id, team_id, period_number, position_code, roster_slot)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_rosters_lookup ON rosters(season_id, team_id, period_number);
CREATE INDEX IF NOT EXISTS idx_rosters_player ON rosters(player_id, season_id);
CREATE INDEX IF NOT EXISTS idx_rosters_name ON rosters(player_name_normalized);

-- Create a trigger to update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_rosters_timestamp
AFTER UPDATE ON rosters
BEGIN
    UPDATE rosters SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;