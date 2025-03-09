-- mlb_teams-schema.sql
CREATE TABLE IF NOT EXISTS mlb_teams (
    id INTEGER PRIMARY KEY, -- MLB team ID
    name TEXT NOT NULL,     -- Full team name (e.g., "Los Angeles Dodgers")
    abbreviation TEXT,      -- Team abbreviation (e.g., "LAD")
    short_name TEXT,        -- Short name (e.g., "LA Dodgers")
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups by name and abbreviation
CREATE INDEX IF NOT EXISTS idx_mlb_teams_name ON mlb_teams(name);
CREATE INDEX IF NOT EXISTS idx_mlb_teams_abbr ON mlb_teams(abbreviation);

-- Create a trigger to update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_mlb_teams_timestamp
AFTER UPDATE ON mlb_teams
BEGIN
    UPDATE mlb_teams SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;