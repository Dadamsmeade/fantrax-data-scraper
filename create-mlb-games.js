// fetch-mlb-games.js
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs-extra');

// Configuration
const DB_PATH = path.join(__dirname, 'data/db/fantrax.db');
const DEBUG_DIR = path.join(__dirname, 'data/debug');
fs.ensureDirSync(DEBUG_DIR);

// List of seasons to fetch - matches your index.js file
const SEASONS = [
    { year: '2024', leagueId: '413usx30ls6bwvoj' },
    { year: '2023', leagueId: 'fa79oxi9ld3k0iqz' },
    { year: '2022', leagueId: '13e6yr1okxw9m4bb' },
    { year: '2021', leagueId: 'kcog4xfdkl9q0rs8' },
    { year: '2020', leagueId: 'o4x7hu98k6fgewdh' },
    { year: '2019', leagueId: 'qlf1p1hnjow4nx9t' },
    { year: '2018', leagueId: 'u6yaky2bjcplrw14' },
    { year: '2017', leagueId: 'apl5cn2ciyuis67t' }
];

// Configure which seasons to fetch data for
const YEARS_TO_FETCH = ['2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017']; // All seasons

/**
 * Fetch MLB games for a specific season
 * @param {string} season - Season year (e.g., '2024')
 * @returns {Promise<Array>} List of MLB games for the season
 */
async function fetchSeasonGames(season) {
    console.log(`Fetching MLB games for ${season} season...`);

    try {
        // Build URL for MLB Stats API
        const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${season}`;
        console.log(`API URL: ${url}`);

        // Make the request
        const response = await axios.get(url);

        // Save raw response for debugging
        const debugFile = path.join(DEBUG_DIR, `mlb-games-${season}.json`);
        await fs.writeJson(debugFile, response.data, { spaces: 2 });

        // Process the data to extract games
        const games = [];

        // Verify data structure
        if (!response.data || !response.data.dates) {
            console.log(`No valid data returned for ${season} season`);
            return [];
        }

        // Loop through each date
        for (const date of response.data.dates) {
            // Loop through each game on this date
            if (date.games && Array.isArray(date.games)) {
                for (const game of date.games) {
                    // Only include regular season games
                    if (game.gameType === 'R') {
                        games.push({
                            gamePk: game.gamePk,
                            season: game.season,
                            officialDate: game.officialDate,
                            gameType: game.gameType,
                            abstractGameState: game.status ? game.status.abstractGameState : null,
                            dayNight: game.dayNight,
                            homeTeamId: game.teams.home.team.id,
                            awayTeamId: game.teams.away.team.id,
                            homeTeamScore: game.teams.home.score,
                            awayTeamScore: game.teams.away.score,
                            venueId: game.venue ? game.venue.id : null,
                            venueName: game.venue ? game.venue.name : null
                        });
                    }
                }
            }
        }

        console.log(`Found ${games.length} regular season MLB games for ${season}`);
        return games;
    } catch (error) {
        console.error(`Error fetching MLB games for ${season}:`, error.message);
        return [];
    }
}

/**
 * Save MLB games to the database
 * @param {sqlite.Database} db - Database connection
 * @param {Array} games - List of MLB games to save
 * @returns {Promise<number>} Number of games saved
 */
async function saveGamesToDatabase(db, games) {
    console.log(`Saving ${games.length} MLB games to database...`);

    try {
        // Begin transaction
        await db.run('BEGIN TRANSACTION');

        let savedCount = 0;
        let errorCount = 0;

        // Process each game
        for (const game of games) {
            try {
                // Check if game already exists
                const existingGame = await db.get('SELECT game_pk FROM mlb_games WHERE game_pk = ?', [game.gamePk]);

                if (existingGame) {
                    // Update existing game
                    await db.run(`
                        UPDATE mlb_games 
                        SET season = ?, official_date = ?, game_type = ?, 
                            abstract_game_state = ?, day_night = ?,
                            home_team_id = ?, away_team_id = ?,
                            home_team_score = ?, away_team_score = ?,
                            venue_id = ?, venue_name = ?
                        WHERE game_pk = ?
                    `, [
                        game.season, game.officialDate, game.gameType,
                        game.abstractGameState, game.dayNight,
                        game.homeTeamId, game.awayTeamId,
                        game.homeTeamScore, game.awayTeamScore,
                        game.venueId, game.venueName,
                        game.gamePk
                    ]);
                } else {
                    // Insert new game
                    await db.run(`
                        INSERT INTO mlb_games (
                            game_pk, season, official_date, game_type,
                            abstract_game_state, day_night,
                            home_team_id, away_team_id,
                            home_team_score, away_team_score,
                            venue_id, venue_name
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        game.gamePk, game.season, game.officialDate, game.gameType,
                        game.abstractGameState, game.dayNight,
                        game.homeTeamId, game.awayTeamId,
                        game.homeTeamScore, game.awayTeamScore,
                        game.venueId, game.venueName
                    ]);
                }

                savedCount++;

                // Log progress for large datasets
                if (savedCount % 500 === 0) {
                    console.log(`Processed ${savedCount}/${games.length} games...`);
                }
            } catch (error) {
                console.error(`Error saving game ${game.gamePk}:`, error.message);
                errorCount++;
            }
        }

        // Commit transaction
        await db.run('COMMIT');

        console.log(`Successfully saved ${savedCount} MLB games (${errorCount} errors)`);
        return savedCount;
    } catch (error) {
        // Rollback on error
        try {
            await db.run('ROLLBACK');
        } catch (rollbackError) {
            console.error('Error during rollback:', rollbackError.message);
        }

        console.error('Error saving MLB games to database:', error.message);
        throw error;
    }
}

/**
 * Main function to run the MLB games fetching process
 */
async function main() {
    try {
        console.log('Starting MLB games fetch process...');

        // Open database connection
        const db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        console.log('Database connection established');

        // Check if MLB games table exists
        const tableCheck = await db.get(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='mlb_games'
        `);

        if (!tableCheck) {
            console.error('MLB games table does not exist. Please run apply-mlb-games-schema.js first.');
            await db.close();
            return;
        }

        // Filter seasons based on YEARS_TO_FETCH
        const seasonsToFetch = YEARS_TO_FETCH.length > 0
            ? SEASONS.filter(season => YEARS_TO_FETCH.includes(season.year))
            : SEASONS;

        console.log(`Will fetch MLB games for ${seasonsToFetch.length} seasons:`,
            seasonsToFetch.map(s => s.year).join(', '));

        // Process each season
        let totalGamesSaved = 0;

        for (const season of seasonsToFetch) {
            // Fetch games for this season
            const games = await fetchSeasonGames(season.year);

            if (games.length > 0) {
                // Save games to database
                const savedCount = await saveGamesToDatabase(db, games);
                totalGamesSaved += savedCount;
            }

            // Add a delay between seasons to avoid rate limiting
            if (season !== seasonsToFetch[seasonsToFetch.length - 1]) {
                console.log('Waiting 1 second before fetching next season...');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`Total MLB games saved across all seasons: ${totalGamesSaved}`);

        // Close database connection
        await db.close();
        console.log('Database connection closed');

    } catch (error) {
        console.error('Error in main process:', error);
        process.exit(1);
    }
}

// Run the script
main().catch(console.error);