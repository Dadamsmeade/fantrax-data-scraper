// normalized-mlb-players.js - Fetch MLB player data with accent normalization
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs-extra');

// Configuration
const DB_PATH = path.join(__dirname, 'data/db/fantrax.db');
const SEASONS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
const MLB_API_BASE_URL = 'https://statsapi.mlb.com/api/v1';
const SPORT_ID = 1; // MLB
const DEBUG_DIR = path.join(__dirname, 'data/debug');

// Ensure debug directory exists
fs.ensureDirSync(DEBUG_DIR);

// Function to normalize player names for better matching
function normalizePlayerName(name) {
    if (!name) return '';

    // Convert to lowercase and normalize Unicode
    let normalized = name.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''); // Remove diacritical marks

    // Remove common suffixes and prefixes
    normalized = normalized
        .replace(/\s+jr\.?$|\s+sr\.?$|\s+ii$|\s+iii$|\s+iv$/, '') // Remove suffixes like Jr., Sr., III
        .replace(/^the\s+/, ''); // Remove "The" prefix

    // Remove punctuation and ensure single spaces
    normalized = normalized
        .replace(/[.,''"\-]/g, '')  // Remove punctuation
        .replace(/\s+/g, ' ')      // Ensure single spaces
        .trim();                    // Remove leading/trailing spaces

    return normalized;
}

/**
 * Update the players table to add normalized name columns
 * @param {sqlite.Database} db - Database connection
 */
async function addNormalizedColumns(db) {
    try {
        console.log('Checking for normalized name columns...');

        // Check if the normalized name columns already exist
        const tableInfo = await db.all('PRAGMA table_info(players)');
        const hasNormalizedFullName = tableInfo.some(col => col.name === 'normalized_full_name');

        if (!hasNormalizedFullName) {
            console.log('Adding normalized name columns to players table...');

            // Add normalized name columns
            await db.run('ALTER TABLE players ADD COLUMN normalized_full_name TEXT');
            await db.run('ALTER TABLE players ADD COLUMN normalized_first_name TEXT');
            await db.run('ALTER TABLE players ADD COLUMN normalized_last_name TEXT');

            // Create index on normalized full name
            await db.run('CREATE INDEX idx_players_normalized_name ON players(normalized_full_name)');

            console.log('Normalized name columns added successfully');
        } else {
            console.log('Normalized name columns already exist');
        }
    } catch (error) {
        console.error('Error adding normalized columns:', error.message);
        throw error;
    }
}

/**
 * Fetch players for a specific season from the MLB Stats API
 * @param {number} season - Season year
 * @returns {Promise<Array>} - Array of player objects
 */
async function fetchPlayersForSeason(season) {
    try {
        console.log(`Fetching players for season ${season}...`);
        const url = `${MLB_API_BASE_URL}/sports/${SPORT_ID}/players?season=${season}`;
        const response = await axios.get(url);

        // Save the raw API response for debugging
        const debugFilePath = path.join(DEBUG_DIR, `mlb-players-${season}.json`);
        await fs.writeJson(debugFilePath, response.data, { spaces: 2 });

        if (response.data && response.data.people) {
            console.log(`Retrieved ${response.data.people.length} players for season ${season}`);
            return response.data.people;
        } else {
            console.log(`No player data found for season ${season}`);
            return [];
        }
    } catch (error) {
        console.error(`Error fetching players for season ${season}:`, error.message);
        return [];
    }
}

/**
 * Save unique players to the database with normalized names
 * @param {sqlite.Database} db - SQLite database connection
 * @param {Array} players - Array of player objects from all seasons
 * @returns {Promise<Object>} - Results of the save operation
 */
async function saveUniquePlayersToDatabase(db, players) {
    try {
        // Begin transaction for better performance
        await db.run('BEGIN TRANSACTION');

        // Create a map of player IDs to players - keeping the most recent data
        const playerMap = new Map();

        // Process all players
        for (const player of players) {
            // Skip if no player ID
            if (!player.id) continue;

            // If we already have this player, keep the most recent data
            if (playerMap.has(player.id)) {
                // Don't need to do anything as we're adding players by most recent season first
                continue;
            }

            // Add this player to our map
            playerMap.set(player.id, player);
        }

        console.log(`Found ${playerMap.size} unique players to insert`);

        // Insert all unique players
        let insertedCount = 0;
        let errorCount = 0;

        for (const player of playerMap.values()) {
            try {
                // Normalize name fields
                const normalizedFullName = normalizePlayerName(player.fullName);
                const normalizedFirstName = normalizePlayerName(player.firstName);
                const normalizedLastName = normalizePlayerName(player.lastName);

                // Log a sample of normalized names
                if (insertedCount < 5) {
                    console.log(`Name normalization example: "${player.fullName}" → "${normalizedFullName}"`);
                }

                await db.run(`
                    INSERT INTO players (
                        id, full_name, first_name, last_name, 
                        normalized_full_name, normalized_first_name, normalized_last_name,
                        birth_date, birth_city, birth_state_province, birth_country, 
                        height, weight, mlb_debut_date, bat_side, pitch_hand
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    player.id,
                    player.fullName,
                    player.firstName,
                    player.lastName,
                    normalizedFullName,
                    normalizedFirstName,
                    normalizedLastName,
                    player.birthDate,
                    player.birthCity,
                    player.birthStateProvince,
                    player.birthCountry,
                    player.height,
                    player.weight || null,
                    player.mlbDebutDate,
                    player.batSide?.code || null,
                    player.pitchHand?.code || null
                ]);

                insertedCount++;

                // Log progress every 500 players
                if (insertedCount % 500 === 0) {
                    console.log(`Inserted ${insertedCount} players...`);
                }
            } catch (error) {
                console.error(`Error inserting player ${player.fullName}:`, error.message);
                errorCount++;
            }
        }

        // Commit transaction
        await db.run('COMMIT');

        console.log(`\nPlayer import completed: ${insertedCount} players inserted, ${errorCount} errors`);

        return { insertedCount, errorCount };
    } catch (error) {
        // Rollback on error
        try {
            await db.run('ROLLBACK');
        } catch (rollbackError) {
            console.error('Error during rollback:', rollbackError.message);
        }

        console.error('Error saving players to database:', error.message);
        throw error;
    }
}

/**
 * Main function to execute the script
 */
async function main() {
    try {
        console.log('Opening database connection...');
        const db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        // Check if players table exists
        const tableCheck = await db.get(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='players'
        `);

        if (!tableCheck) {
            console.error('Error: Players table does not exist. Please run clean-slate-players.js first.');
            await db.close();
            return;
        }

        // Add normalized name columns to the table
        await addNormalizedColumns(db);

        // Verify table is empty or ask for confirmation
        const count = await db.get('SELECT COUNT(*) as count FROM players');
        if (count.count > 0) {
            console.log(`Players table already contains ${count.count} records.`);
            console.log('Please run clean-slate-players.js first to create a fresh table.');
            await db.close();
            return;
        }

        // Process all seasons in reverse order (newest first)
        let allPlayers = [];
        for (const season of SEASONS.slice().reverse()) {
            try {
                const players = await fetchPlayersForSeason(season);
                allPlayers = allPlayers.concat(players);

                // Add a small delay between API calls to avoid rate limiting
                if (season !== SEASONS[0]) {
                    console.log('Waiting before next API call...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (seasonError) {
                console.error(`Error processing season ${season}:`, seasonError.message);
                // Continue with the next season
            }
        }

        console.log(`\nFetched a total of ${allPlayers.length} player records from all seasons`);

        // Save unique players
        await saveUniquePlayersToDatabase(db, allPlayers);

        // Get final count of players
        const finalCount = await db.get('SELECT COUNT(*) as count FROM players');
        console.log(`Final player count in database: ${finalCount.count}`);

        // Show sample of normalized names
        console.log('\nSample player records with normalized names:');
        const samples = await db.all(`
            SELECT id, full_name, normalized_full_name, first_name, normalized_first_name, last_name, normalized_last_name
            FROM players
            WHERE full_name != normalized_full_name
            LIMIT 5
        `);

        if (samples.length > 0) {
            console.table(samples);
        } else {
            console.log('No examples of accent normalization found in the first 5 records.');
        }

        await db.close();
        console.log('Database connection closed');
    } catch (error) {
        console.error('Error in main process:', error);
        process.exit(1);
    }
}

// Run the script
main().catch(console.error);