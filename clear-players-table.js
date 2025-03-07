// clean-slate-players-normalized.js
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data/db/fantrax.db');

async function createCleanPlayersTable() {
    try {
        console.log('Opening database connection...');
        const db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        console.log('===== CREATING CLEAN PLAYERS TABLE WITH NORMALIZED NAMES =====');

        // Start with a fresh transaction
        await db.run('BEGIN EXCLUSIVE TRANSACTION');

        try {
            // Step 1: Drop the existing players table
            console.log('Step 1: Dropping existing players table if it exists...');
            await db.run('DROP TABLE IF EXISTS players');

            // Step 2: Create a new, clean players table with normalized name columns
            console.log('Step 2: Creating new players table with normalized name columns...');
            await db.run(`
                CREATE TABLE players (
                    id INTEGER PRIMARY KEY,
                    full_name TEXT NOT NULL,
                    first_name TEXT,
                    last_name TEXT,
                    normalized_full_name TEXT,
                    normalized_first_name TEXT,
                    normalized_last_name TEXT,
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

            // Step 3: Create indexes for efficient queries
            console.log('Step 3: Creating indexes...');
            await db.run('CREATE INDEX idx_players_name ON players(full_name)');
            await db.run('CREATE INDEX idx_players_normalized_name ON players(normalized_full_name)');
            await db.run('CREATE INDEX idx_players_first_last ON players(first_name, last_name)');
            await db.run('CREATE INDEX idx_players_normalized_first_last ON players(normalized_first_name, normalized_last_name)');

            // Step 4: Create trigger for updated_at
            console.log('Step 4: Creating update trigger...');
            await db.run(`
                CREATE TRIGGER update_players_timestamp
                AFTER UPDATE ON players
                BEGIN
                    UPDATE players SET updated_at = CURRENT_TIMESTAMP 
                    WHERE id = NEW.id;
                END
            `);

            // Commit the transaction
            await db.run('COMMIT');
            console.log('\n✅ Clean players table created successfully with normalized name columns!');

            // Verify table structure
            const tableInfo = await db.all('PRAGMA table_info(players)');
            console.log('\nNew players table structure:');
            tableInfo.forEach(col => {
                console.log(`- ${col.name}: ${col.type}${col.pk ? ' (PRIMARY KEY)' : ''}`);
            });

            // Count player records
            const count = await db.get('SELECT COUNT(*) as count FROM players');
            console.log(`\nCurrent player count: ${count.count} (should be 0)`);

            // Show instructions for populating the table
            console.log('\nTo populate this table with MLB players, run:');
            console.log('node normalized-mlb-players.js');

        } catch (error) {
            // Rollback on error
            await db.run('ROLLBACK');
            console.error('❌ ERROR:', error);
            console.log('Changes rolled back.');
        }

        await db.close();
        console.log('Database connection closed');
    } catch (error) {
        console.error('\nUNEXPECTED ERROR:', error);
        process.exit(1);
    }
}

// Run the script
createCleanPlayersTable().catch(console.error);