// apply-batter-game-stats-schema.js
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs-extra');

// Configuration
const DB_PATH = path.join(__dirname, 'data/db/fantrax.db');
const SCHEMA_FILE = path.join(__dirname, 'batter_game_stats-schema.sql');

async function applyBatterGameStatsSchema() {
    try {
        console.log('Opening database connection...');
        const db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        console.log('Applying batter game stats schema...');

        // Read schema from file
        const schemaSQL = fs.readFileSync(SCHEMA_FILE, 'utf8');

        // Begin transaction
        await db.run('BEGIN TRANSACTION');

        try {
            // Execute schema
            await db.exec(schemaSQL);

            // Commit transaction
            await db.run('COMMIT');
            console.log('Batter game stats schema applied successfully');
        } catch (error) {
            // Rollback in case of error
            await db.run('ROLLBACK');
            console.error('Error applying schema:', error);
            throw error;
        }

        await db.close();
        console.log('Database connection closed');
    } catch (err) {
        console.error('Database error:', err);
        process.exit(1);
    }
}

// Run the function
applyBatterGameStatsSchema().catch(console.error);