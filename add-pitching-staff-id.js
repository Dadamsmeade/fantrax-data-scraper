// add-pitching-staff-id.js
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

// Database path
const DB_PATH = path.join(__dirname, 'data/db/fantrax.db');

async function addPitchingStaffIdColumn() {
    try {
        console.log('Opening database connection...');
        const db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        console.log('Starting migration to add pitching_staff_id column...');

        // Check if the column already exists
        const tableInfo = await db.all('PRAGMA table_info(rosters)');
        const columnExists = tableInfo.some(col => col.name === 'pitching_staff_id');

        if (columnExists) {
            console.log('Column pitching_staff_id already exists in rosters table');
        } else {
            // Begin transaction
            await db.run('BEGIN TRANSACTION');

            try {
                // Add the column
                console.log('Adding pitching_staff_id column to rosters table...');
                await db.run('ALTER TABLE rosters ADD COLUMN pitching_staff_id INTEGER REFERENCES mlb_teams(id)');

                // Create index
                console.log('Creating index on pitching_staff_id...');
                await db.run('CREATE INDEX idx_rosters_pitching_staff ON rosters(pitching_staff_id)');

                console.log('Column and index added successfully');

                // Commit transaction
                await db.run('COMMIT');
                console.log('Migration completed successfully');

            } catch (error) {
                // Rollback on error
                await db.run('ROLLBACK');
                console.error('Error during migration:', error);
                throw error;
            }
        }

        await db.close();
        console.log('Database connection closed');

    } catch (error) {
        console.error('Database error:', error);
        process.exit(1);
    }
}

// Run the migration
addPitchingStaffIdColumn().catch(console.error);