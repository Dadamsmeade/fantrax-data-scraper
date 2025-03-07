// rebuild-players-table.js
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs-extra');

const DB_PATH = path.join(__dirname, 'data/db/fantrax.db');

async function rebuildPlayersTable() {
    try {
        console.log('Opening database connection...');
        const db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        console.log('Starting players table rebuild...');

        await db.run('BEGIN TRANSACTION');

        try {
            // First check if we have duplicates
            const duplicates = await db.all(`
                SELECT id, season, COUNT(*) as count
                FROM players
                GROUP BY id, season
                HAVING COUNT(*) > 1
            `);

            if (duplicates.length > 0) {
                console.log(`Found ${duplicates.length} duplicate player+season combinations:`);
                for (const dup of duplicates.slice(0, 5)) {
                    console.log(`  Player ID ${dup.id} Season ${dup.season}: ${dup.count} entries`);
                }
                if (duplicates.length > 5) {
                    console.log(`  ... and ${duplicates.length - 5} more`);
                }
            } else {
                console.log('No duplicate player+season combinations found.');
            }

            // Create a temporary table with the same structure but enforced constraints
            console.log('Creating temporary players table...');
            await db.run(`
                CREATE TABLE players_new (
                    id INTEGER,
                    full_name TEXT NOT NULL,
                    first_name TEXT,
                    last_name TEXT,
                    birth_date DATE,
                    birth_city TEXT, 
                    birth_country TEXT,
                    birth_state_province TEXT,
                    height TEXT,
                    weight INTEGER,
                    active BOOLEAN,
                    team_id INTEGER,
                    team_name TEXT,
                    position_code TEXT,
                    position_name TEXT,
                    position_type TEXT,
                    mlb_debut_date DATE,
                    bat_side TEXT,
                    pitch_hand TEXT,
                    season INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id, season)
                )
            `);

            // Copy data from old table to new table, avoiding duplicates
            console.log('Copying unique player data to new table...');
            const copied = await db.run(`
                INSERT INTO players_new
                SELECT * FROM players
                GROUP BY id, season
            `);

            console.log(`Copied ${copied.changes} unique player records to new table`);

            // Drop the old table and rename the new one
            console.log('Dropping old players table...');
            await db.run('DROP TABLE players');

            console.log('Renaming new table to players...');
            await db.run('ALTER TABLE players_new RENAME TO players');

            // Recreate indexes
            console.log('Recreating indexes...');
            await db.run('CREATE INDEX IF NOT EXISTS idx_players_season ON players(season)');
            await db.run('CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id, season)');
            await db.run('CREATE INDEX IF NOT EXISTS idx_players_name ON players(full_name, season)');
            await db.run('CREATE INDEX IF NOT EXISTS idx_players_active ON players(active, season)');

            // Recreate trigger
            console.log('Recreating update trigger...');
            await db.run(`
                CREATE TRIGGER IF NOT EXISTS update_players_timestamp
                AFTER UPDATE ON players
                BEGIN
                    UPDATE players SET updated_at = CURRENT_TIMESTAMP 
                    WHERE id = NEW.id AND season = NEW.season;
                END
            `);

            await db.run('COMMIT');
            console.log('Players table rebuilt successfully with proper constraints');

            // Get the current count
            const countResult = await db.get('SELECT COUNT(*) as count FROM players');
            console.log(`Current player count: ${countResult.count}`);

        } catch (error) {
            await db.run('ROLLBACK');
            throw error;
        }

        await db.close();
        console.log('Database connection closed');
    } catch (error) {
        console.error('Error rebuilding players table:', error);
        process.exit(1);
    }
}

// Run the script
rebuildPlayersTable().catch(console.error);