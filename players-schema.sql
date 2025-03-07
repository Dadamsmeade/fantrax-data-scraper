-- Schema for MLB Players table

CREATE TABLE IF NOT EXISTS players (
    id INTEGER,                           -- MLB player ID
    full_name TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    birth_date DATE,
    birth_city TEXT, 
    birth_country TEXT,
    birth_state_province TEXT,
    height TEXT,
    weight INTEGER,
    active BOOLEAN,                    -- Current team ID                     -- Current team name
    mlb_debut_date DATE,
    bat_side TEXT,                        -- L/R/S (Left, Right, Switch)
    pitch_hand TEXT,                      -- L/R (Left, Right)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, season)
);

-- Create update trigger for timestamps
CREATE TRIGGER IF NOT EXISTS update_players_timestamp
AFTER UPDATE ON players
BEGIN
    UPDATE players SET updated_at = CURRENT_TIMESTAMP 
    WHERE id = NEW.id
END;