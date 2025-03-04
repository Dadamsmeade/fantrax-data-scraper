const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs-extra');

// Database configuration
const DB_DIR = path.join(__dirname, '../../data/db');
const DB_PATH = path.join(DB_DIR, 'fantrax.db');

// Ensure database directory exists
fs.ensureDirSync(DB_DIR);

/**
 * Initialize the database connection and create tables if they don't exist
 * @returns {Promise<sqlite.Database>} Database connection
 */
async function initializeDatabase() {
    console.log('Initializing database connection...');

    try {
        // Open the database (creates it if it doesn't exist)
        const db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        console.log(`Connected to database at ${DB_PATH}`);

        // Enable foreign keys support
        await db.run('PRAGMA foreign_keys = ON;');

        // Create the seasons table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS seasons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                year TEXT NOT NULL,
                league_id TEXT UNIQUE NOT NULL,
                name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create the teams table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS teams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_id TEXT NOT NULL,
                season_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                icon_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (season_id) REFERENCES seasons (id),
                UNIQUE (team_id, season_id)
            );
        `);

        // Create the schedule table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS schedule (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                season_id INTEGER NOT NULL,
                period_number TEXT NOT NULL,
                period_type TEXT NOT NULL,
                date_range TEXT,
                away_team_id INTEGER NOT NULL,
                home_team_id INTEGER NOT NULL,
                matchup_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (season_id) REFERENCES seasons (id),
                FOREIGN KEY (away_team_id) REFERENCES teams (id),
                FOREIGN KEY (home_team_id) REFERENCES teams (id),
                UNIQUE (season_id, period_number, away_team_id, home_team_id)
            );
        `);

        // Create triggers to update the updated_at timestamp
        await db.exec(`
            -- Season update trigger
            CREATE TRIGGER IF NOT EXISTS update_season_timestamp
            AFTER UPDATE ON seasons
            BEGIN
                UPDATE seasons SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END;
            
            -- Team update trigger
            CREATE TRIGGER IF NOT EXISTS update_team_timestamp
            AFTER UPDATE ON teams
            BEGIN
                UPDATE teams SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END;
            
            -- Schedule update trigger
            CREATE TRIGGER IF NOT EXISTS update_schedule_timestamp
            AFTER UPDATE ON schedule
            BEGIN
                UPDATE schedule SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
            END;
        `);

        console.log('Database initialized successfully');
        return db;
    } catch (error) {
        console.error('Error initializing database:', error);
        throw error;
    }
}

/**
 * Run a query within a transaction
 * @param {sqlite.Database} db - Database connection
 * @param {Function} callback - Callback function to run within transaction
 * @returns {Promise<any>} Result of the callback
 */
async function withTransaction(db, callback) {
    let transactionStarted = false;

    try {
        // Start transaction
        await db.run('BEGIN TRANSACTION');
        transactionStarted = true;

        // Run callback
        const result = await callback();

        // Commit transaction
        await db.run('COMMIT');
        transactionStarted = false;

        return result;
    } catch (error) {
        // Only try to rollback if we actually started the transaction
        if (transactionStarted) {
            try {
                await db.run('ROLLBACK');
            } catch (rollbackError) {
                console.error('Error during transaction rollback:', rollbackError);
                // Don't throw the rollback error, we'll throw the original error
            }
        }

        throw error;
    }
}

module.exports = {
    initializeDatabase,
    withTransaction,
    DB_PATH
};