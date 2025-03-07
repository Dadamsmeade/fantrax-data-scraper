// Create a file like migrate-schema.js in your project root
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

async function migrateDatabase() {
    try {
        // Open the database
        const db = await open({
            filename: path.join(__dirname, 'data/db/fantrax.db'),
            driver: sqlite3.Database
        });

        console.log('Starting database migration...');

        // Begin transaction
        await db.run('BEGIN TRANSACTION');

        try {
            // Check if points_behind_leader column already exists
            const columns = await db.all("PRAGMA table_info(season_stats)");
            const pointsBehindLeaderExists = columns.some(col => col.name === 'points_behind_leader');

            if (!pointsBehindLeaderExists) {
                console.log('Renaming column projected_budget_left to points_behind_leader...');

                // SQLite doesn't support direct column renames, so we need to:
                // 1. Create a new table with the correct schema
                await db.exec(`
          CREATE TABLE season_stats_new (
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
            points_behind_leader REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (season_id) REFERENCES seasons (id),
            FOREIGN KEY (team_id) REFERENCES teams (id),
            UNIQUE (season_id, team_id)
          );
        `);

                // 2. Copy data from old table to new table
                await db.exec(`
          INSERT INTO season_stats_new 
          SELECT 
            id, season_id, team_id, fantasy_points, adjustments, total_points, 
            fantasy_points_per_game, games_played, hitting_points, team_pitching_points, 
            waiver_position, projected_budget_left, created_at, updated_at
          FROM season_stats;
        `);

                // 3. Drop the old table
                await db.exec('DROP TABLE season_stats;');

                // 4. Rename the new table to the original name
                await db.exec('ALTER TABLE season_stats_new RENAME TO season_stats;');

                console.log('Column renamed successfully');
            } else {
                console.log('Column points_behind_leader already exists');
            }

            // Commit transaction
            await db.run('COMMIT');
            console.log('Migration completed successfully');
        } catch (error) {
            // Rollback in case of error
            await db.run('ROLLBACK');
            console.error('Migration failed:', error);
            throw error;
        } finally {
            await db.close();
        }
    } catch (err) {
        console.error('Database error:', err);
    }
}

// Run the migration
migrateDatabase();