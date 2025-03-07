// Apply player stats schema to the database
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs-extra');

async function applyPlayerStatsSchema() {
    try {
        // Open the database
        const db = await open({
            filename: path.join(__dirname, 'data/db/fantrax.db'),
            driver: sqlite3.Database
        });

        console.log('Connected to database. Applying player stats schema...');

        // Read the SQL file
        const schemaSQL = fs.readFileSync(
            path.join(__dirname, 'player-stats-schema.sql'),
            'utf8'
        );

        // Begin transaction
        await db.run('BEGIN TRANSACTION');

        try {
            // Execute the schema SQL
            await db.exec(schemaSQL);

            // Commit transaction
            await db.run('COMMIT');
            console.log('Player stats schema successfully applied!');
        } catch (error) {
            // Rollback in case of error
            await db.run('ROLLBACK');
            console.error('Error applying schema:', error);
            throw error;
        } finally {
            await db.close();
        }
    } catch (err) {
        console.error('Database error:', err);
        process.exit(1);
    }
}

// Run the function
applyPlayerStatsSchema();