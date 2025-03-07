// simplify-players-table.js
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data/db/fantrax.db');

async function simplifyPlayersTable() {
    try {
        console.log('Opening database connection...');
        const db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        console.log('===== SIMPLIFYING PLAYERS TABLE =====');

        // Get current count of all player records
        const totalCount = await db.get('SELECT COUNT(*) as count FROM players');
        console.log(`Current record count: ${totalCount.count}`);

        // Count distinct player IDs
        const distinctCount = await db.get('SELECT COUNT(DISTINCT id) as count FROM players');
        console.log(`Distinct player IDs: ${distinctCount.count}`);

        // Start the simplification process
        console.log('\nStarting simplification process...');
        await db.run('BEGIN EXCLUSIVE TRANSACTION');

        try {
            // Step 1: Rename the current table to a backup
            console.log('Step 1: Renaming current table to players_old...');
            await db.run('ALTER TABLE players RENAME TO players_old');

            // Step 2: Create a new, simplified table with a single player ID as primary key
            // Removed position-related columns as requested
            console.log('Step 2: Creating new simplified players table...');
            await db.run(`
                CREATE TABLE players (
                    id INTEGER PRIMARY KEY,
                    full_name TEXT NOT NULL,
                    first_name TEXT,
                    last_name TEXT,
                    birth_date DATE,
                    birth_city TEXT, 
                    birth_country TEXT,
                    birth_state_province TEXT,
                    height TEXT,
                    weight INTEGER,
                    mlb_debut_date DATE,
                    bat_side TEXT,
                    pitch_hand TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Step 3: Insert one record per player ID, using the most recent season's data
            // Removed position-related columns from the insert
            console.log('Step 3: Inserting one record per player...');
            const insertResult = await db.run(`
                INSERT INTO players (
                    id, full_name, first_name, last_name, birth_date,
                    birth_city, birth_country, birth_state_province, height, weight,
                    mlb_debut_date, bat_side, pitch_hand
                )
                SELECT 
                    p.id, p.full_name, p.first_name, p.last_name, p.birth_date,
                    p.birth_city, p.birth_country, p.birth_state_province, p.height, p.weight,
                    p.mlb_debut_date, p.bat_side, p.pitch_hand
                FROM players_old p
                INNER JOIN (
                    SELECT id, MAX(season) AS max_season
                    FROM players_old
                    GROUP BY id
                ) latest ON p.id = latest.id AND p.season = latest.max_season
            `);

            console.log(`Inserted ${insertResult.changes} player records into new table`);

            // Step 4: Create indexes for efficient queries
            console.log('Step 4: Creating indexes...');
            await db.run('CREATE INDEX idx_players_name ON players(full_name)');

            // Step 5: Create trigger for updated_at
            console.log('Step 5: Creating update trigger...');
            await db.run(`
                CREATE TRIGGER update_players_timestamp
                AFTER UPDATE ON players
                BEGIN
                    UPDATE players SET updated_at = CURRENT_TIMESTAMP 
                    WHERE id = NEW.id;
                END
            `);

            // Verify the new table has the expected record count
            const newCount = await db.get('SELECT COUNT(*) as count FROM players');

            if (newCount.count !== distinctCount.count) {
                console.warn(`⚠️ WARNING: New player count (${newCount.count}) differs from expected (${distinctCount.count})`);

                // If there's a major discrepancy, roll back
                if (Math.abs(newCount.count - distinctCount.count) > 100) {
                    console.error('❌ Major discrepancy in player counts. Rolling back changes.');
                    await db.run('ROLLBACK');
                    console.log('Changes rolled back.');
                    return;
                }
            }

            // Step 6: Drop the old table (or keep it for reference)
            const keepOldTable = false; // Change to true if you want to keep the old table

            if (keepOldTable) {
                console.log('Step 6: Keeping old table for reference.');
            } else {
                console.log('Step 6: Dropping old table...');
                await db.run('DROP TABLE players_old');
            }

            // Commit changes
            await db.run('COMMIT');
            console.log('\n✅ Players table simplification completed successfully!');

            // Final counts
            const finalPlayerCount = await db.get('SELECT COUNT(*) as count FROM players');

            console.log(`\nFinal count: ${finalPlayerCount.count} unique players`);

            // Show sample data
            const samplePlayers = await db.all(`
                SELECT id, full_name, bat_side, pitch_hand 
                FROM players 
                LIMIT 5
            `);

            console.log('\nSample player records:');
            console.table(samplePlayers);

        } catch (error) {
            // Rollback on error
            await db.run('ROLLBACK');
            console.error('❌ ERROR:', error);
            console.log('Changes rolled back.');

            // Try to recover if the new table exists but the old one doesn't
            const newTableExists = await db.get(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='players'
            `);

            const oldTableExists = await db.get(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='players_old'
            `);

            if (!newTableExists && oldTableExists) {
                console.log('Attempting recovery: renaming players_old back to players...');
                await db.run('ALTER TABLE players_old RENAME TO players');
            }
        }

        await db.close();
        console.log('Database connection closed');
    } catch (error) {
        console.error('\nUNEXPECTED ERROR:', error);
        process.exit(1);
    }
}

// Run the script
simplifyPlayersTable().catch(console.error);