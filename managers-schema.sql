-- Drop the managers table if it exists
DROP TABLE IF EXISTS managers;

-- Create the managers table
CREATE TABLE managers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    active_from INTEGER,      -- Year started in the league
    active_until INTEGER,     -- Year left the league (NULL if still active)
    email TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Check if manager_id column exists in teams table, add it if it doesn't
PRAGMA foreign_keys=off;
BEGIN TRANSACTION;

-- Create a temporary table with the structure we want
CREATE TEMPORARY TABLE teams_backup(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT NOT NULL,
    season_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    icon_url TEXT,
    manager_id INTEGER REFERENCES managers(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (season_id) REFERENCES seasons (id),
    UNIQUE (team_id, season_id)
);

-- Copy data from the current teams table to the backup
INSERT INTO teams_backup 
SELECT id, team_id, season_id, name, icon_url, 
       NULL as manager_id, -- Set all manager_id values to NULL initially
       created_at, updated_at 
FROM teams;

-- Drop the original table
DROP TABLE teams;

-- Create a new table with our desired structure
CREATE TABLE teams(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT NOT NULL,
    season_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    icon_url TEXT,
    manager_id INTEGER REFERENCES managers(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (season_id) REFERENCES seasons (id),
    UNIQUE (team_id, season_id)
);

-- Copy the data back
INSERT INTO teams SELECT * FROM teams_backup;

-- Drop the temporary table
DROP TABLE teams_backup;

COMMIT;
PRAGMA foreign_keys=on;

-- Create update trigger for managers table
CREATE TRIGGER update_manager_timestamp
AFTER UPDATE ON managers
BEGIN
    UPDATE managers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Insert the 11 managers with their active years
INSERT INTO managers (name, active_from, active_until) VALUES ('Marcus', 2017, NULL);
INSERT INTO managers (name, active_from, active_until) VALUES ('Danny', 2017, NULL);
INSERT INTO managers (name, active_from, active_until) VALUES ('Brennan', 2017, NULL);
INSERT INTO managers (name, active_from, active_until) VALUES ('Jake', 2017, NULL);
INSERT INTO managers (name, active_from, active_until) VALUES ('Justin', 2017, NULL);
INSERT INTO managers (name, active_from, active_until) VALUES ('Pat', 2017, NULL);
INSERT INTO managers (name, active_from, active_until) VALUES ('Ray', 2017, NULL);
INSERT INTO managers (name, active_from, active_until) VALUES ('Bjorn', 2017, NULL);
INSERT INTO managers (name, active_from, active_until) VALUES ('Bobby', 2017, NULL);
INSERT INTO managers (name, active_from, active_until) VALUES ('Ben', 2017, 2019);
INSERT INTO managers (name, active_from, active_until) VALUES ('AJ', 2020, NULL);