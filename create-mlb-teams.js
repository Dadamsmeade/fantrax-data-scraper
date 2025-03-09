// create-mlb-teams.js
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs-extra');
const axios = require('axios');

// Configuration
const DB_PATH = path.join(__dirname, 'data/db/fantrax.db');
const SCHEMA_FILE = path.join(__dirname, 'mlb_teams-schema.sql');
const MLB_API_URL = 'https://statsapi.mlb.com/api/v1/teams?sportId=1&season=2024';

async function createMlbTeamsTable() {
    try {
        console.log('Opening database connection...');
        const db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        // Read schema from file or create it inline if needed
        let schemaSQL;
        try {
            schemaSQL = fs.readFileSync(SCHEMA_FILE, 'utf8');
            console.log('Read schema from file');
        } catch (fileError) {
            console.log('Schema file not found, using inline schema');
            schemaSQL = `
                CREATE TABLE IF NOT EXISTS mlb_teams (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    abbreviation TEXT,
                    short_name TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                
                CREATE INDEX IF NOT EXISTS idx_mlb_teams_name ON mlb_teams(name);
                CREATE INDEX IF NOT EXISTS idx_mlb_teams_abbr ON mlb_teams(abbreviation);
                
                CREATE TRIGGER IF NOT EXISTS update_mlb_teams_timestamp
                AFTER UPDATE ON mlb_teams
                BEGIN
                    UPDATE mlb_teams SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END;
            `;
        }

        // Begin transaction
        await db.run('BEGIN TRANSACTION');

        try {
            // Execute schema
            console.log('Creating mlb_teams table...');
            await db.exec(schemaSQL);

            // Fetch data from MLB Stats API
            console.log('Fetching team data from MLB Stats API...');
            let teamsData;

            try {
                const response = await axios.get(MLB_API_URL);
                teamsData = response.data.teams;
                console.log(`Retrieved data for ${teamsData.length} MLB teams`);
            } catch (apiError) {
                console.log('Error fetching from API, using provided data');
                // Use the data provided in the request if API call fails
                const jsonData = fs.readFileSync(path.join(__dirname, 'data/mlb_teams.json'), 'utf8');
                const parsed = JSON.parse(jsonData);
                teamsData = parsed.teams;
                console.log(`Using provided data for ${teamsData.length} MLB teams`);
            }

            // Clear existing data (optional)
            console.log('Clearing existing data from mlb_teams table...');
            await db.run('DELETE FROM mlb_teams');

            // Insert team data
            console.log('Inserting team data...');
            let insertedCount = 0;

            for (const team of teamsData) {

                // special cases for Chicago teams since Fantrax labels them differently
                if (team.name === 'Chicago White Sox')
                    team.shortName = 'Chicago Sox';

                if (team.name === 'Chicago Cubs')
                    team.shortName = 'Chicago';

                await db.run(`
                    INSERT INTO mlb_teams (id, name, abbreviation, short_name) 
                    VALUES (?, ?, ?, ?)
                `, [
                    team.id,
                    team.name,
                    team.abbreviation,
                    team.shortName
                ]);
                insertedCount++;
            }

            console.log(`Inserted ${insertedCount} MLB teams into database`);

            // Show sample data
            console.log('\nSample data:');
            const samples = await db.all('SELECT * FROM mlb_teams LIMIT 5');
            console.table(samples);

            // Commit transaction
            await db.run('COMMIT');
            console.log('Table creation and data import completed successfully');
        } catch (error) {
            // Rollback on error
            await db.run('ROLLBACK');
            console.error('Error creating table or importing data:', error);
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
createMlbTeamsTable().catch(console.error);