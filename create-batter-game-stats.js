// fetch-batter-game-stats.js
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs-extra');
const dbService = require('./src/database');

// Configure filtering for specific seasons or date ranges
const SEASONS = ['2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017']; // Default to all seasons
const START_DATE = null; // Optional: filter by start date in YYYY-MM-DD format
const END_DATE = null; // Optional: filter by end date in YYYY-MM-DD format

// Configuration
const DEBUG_DIR = path.join(__dirname, 'data/debug');
fs.ensureDirSync(DEBUG_DIR);

// Configuration for API request rate limiting
const BATCH_SIZE = 25; // Process games in batches of this size
const DELAY_BETWEEN_REQUESTS = 1000; // 1 second delay between API requests
const DELAY_BETWEEN_BATCHES = 5000; // 5 second delay between batches

/**
 * Fetch boxscore data for a specific game
 * @param {number} gamePk - MLB game ID
 * @returns {Promise<Object>} Boxscore data for the game
 */
async function fetchBoxscore(gamePk) {
    console.log(`Fetching boxscore for game ${gamePk}...`);

    try {
        // Build URL for MLB Stats API
        const url = `https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`;

        // Make the request
        const response = await axios.get(url);

        // Save raw response for debugging
        const debugFile = path.join(DEBUG_DIR, `boxscore-${gamePk}.json`);
        await fs.writeJson(debugFile, response.data, { spaces: 2 });

        return response.data;
    } catch (error) {
        console.error(`Error fetching boxscore for game ${gamePk}:`, error.message);
        return null;
    }
}

/**
 * Extract batter game stats from boxscore data
 * @param {Object} boxscore - Boxscore data from MLB Stats API
 * @param {number} gamePk - MLB game ID
 * @param {string} gameDate - Game date
 * @returns {Array<Object>} List of batter game stats
 */
function extractBatterStats(boxscore, gamePk, gameDate) {
    const batterStats = [];

    if (!boxscore || !boxscore.teams) {
        console.log(`No valid boxscore data for game ${gamePk}`);
        return batterStats;
    }

    // Process both home and away teams
    for (const side of ['away', 'home']) {
        const team = boxscore.teams[side];

        if (!team || !team.team || !team.players) {
            console.log(`No ${side} team data for game ${gamePk}`);
            continue;
        }

        const teamId = team.team.id;
        const teamName = team.team.name;

        // Get all batters for this team
        const batterIds = team.batters || [];

        for (const playerId of batterIds) {
            const playerKey = `ID${playerId}`;
            const playerData = team.players[playerKey];

            if (!playerData || !playerData.stats || !playerData.stats.batting) {
                // Player didn't have batting stats, might be a pitcher who didn't bat
                continue;
            }

            const batting = playerData.stats.batting;
            const person = playerData.person;

            // Check if this player actually batted in the game
            if (!batting.atBats && !batting.baseOnBalls && !batting.hitByPitch &&
                !batting.sacBunts && !batting.sacFlies) {
                // Player was on the roster but didn't actually hit
                continue;
            }

            // Build the stats object
            const stats = {
                gamePk,
                playerId: person.id,
                playerName: person.fullName,
                teamId,
                teamName,
                gameDate,

                // Basic counting stats
                gamesPlayed: batting.gamesPlayed || 0,
                plateAppearances: batting.plateAppearances || 0,
                atBats: batting.atBats || 0,
                runs: batting.runs || 0,
                hits: batting.hits || 0,
                doubles: batting.doubles || 0,
                triples: batting.triples || 0,
                homeRuns: batting.homeRuns || 0,
                rbi: batting.rbi || 0,
                stolenBases: batting.stolenBases || 0,
                caughtStealing: batting.caughtStealing || 0,

                // Plate discipline
                baseOnBalls: batting.baseOnBalls || 0,
                intentionalWalks: batting.intentionalWalks || 0,
                strikeouts: batting.strikeOuts || 0,
                hitByPitch: batting.hitByPitch || 0,

                // Other batting events
                sacFlies: batting.sacFlies || 0,
                sacBunts: batting.sacBunts || 0,
                groundIntoDoublePlay: batting.groundIntoDoublePlay || 0,
                groundIntoTriplePlay: batting.groundIntoTriplePlay || 0,

                // Batted ball types
                flyOuts: batting.flyOuts || 0,
                groundOuts: batting.groundOuts || 0,
                popOuts: batting.popOuts || 0,
                lineOuts: batting.lineOuts || 0,
                airOuts: batting.airOuts || 0,

                // Summary stats
                battingSummary: batting.summary || '',

                // Calculated stats
                avg: batting.avg || '.000',
                obp: batting.obp || '.000',
                slg: batting.slg || '.000',
                ops: batting.ops || '.000',
                totalBases: batting.totalBases || 0,
                leftOnBase: batting.leftOnBase || 0,
                atBatsPerHomeRun: batting.atBatsPerHomeRun || '-',
                stolenBasePercentage: batting.stolenBasePercentage || '-'
            };

            batterStats.push(stats);
        }
    }

    return batterStats;
}

/**
 * Process a batch of games and save batter stats to the database
 * @param {Array<Object>} games - List of games to process
 * @returns {Promise<number>} Number of games processed
 */
async function processBatch(games) {
    let processedCount = 0;

    for (const game of games) {
        try {
            // First check if we already have batter stats for this game
            const hasStats = await dbService.batterGameStats.hasStatsForGame(game.game_pk);

            if (hasStats) {
                console.log(`Game ${game.game_pk} already has batter stats. Skipping.`);
                processedCount++;
                continue;
            }

            // Fetch boxscore data
            const boxscore = await fetchBoxscore(game.game_pk);

            if (!boxscore) {
                console.log(`Unable to get boxscore data for game ${game.game_pk}. Skipping.`);
                continue;
            }

            // Extract batter stats
            const batterStats = extractBatterStats(boxscore, game.game_pk, game.official_date);

            if (batterStats.length === 0) {
                console.log(`No batter stats found for game ${game.game_pk}.`);
                continue;
            }

            console.log(`Saving ${batterStats.length} batter stats for game ${game.game_pk}`);

            // Save batter stats to database
            const savedCount = await dbService.batterGameStats.bulkUpsertBatterGameStats(batterStats);

            console.log(`Saved ${savedCount} batter stats for game ${game.game_pk}`);
            processedCount++;

            // Add a brief delay between API requests
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
        } catch (error) {
            console.error(`Error processing game ${game.game_pk}:`, error.message);
        }
    }

    return processedCount;
}

/**
 * Main function to run the batter stats fetching process
 */
async function main() {
    try {
        console.log('Starting batter game stats fetch process...');

        // Initialize database service
        await dbService.initialize();
        console.log('Database connection established');

        // Build the query to get games from mlb_games table
        let query = 'SELECT * FROM mlb_games WHERE game_type = "R"';
        const params = [];

        // Add season filter if specified
        if (SEASONS && SEASONS.length > 0) {
            query += ' AND season IN (' + SEASONS.map(() => '?').join(',') + ')';
            params.push(...SEASONS);
        }

        // Add date range filter if specified
        if (START_DATE) {
            query += ' AND official_date >= ?';
            params.push(START_DATE);
        }

        if (END_DATE) {
            query += ' AND official_date <= ?';
            params.push(END_DATE);
        }

        // Add sorting
        query += ' ORDER BY official_date';

        // Get all matching games
        const games = await dbService.db.all(query, params);

        console.log(`Found ${games.length} MLB games matching the criteria`);

        // Count games that already have batter stats
        let gamesWithStats = 0;
        for (const game of games.slice(0, 100)) { // Check a sample of games for efficiency
            const hasStats = await dbService.batterGameStats.hasStatsForGame(game.game_pk);
            if (hasStats) {
                gamesWithStats++;
            }
        }

        const estimatedGamesWithStats = Math.round((gamesWithStats / 100) * games.length);
        console.log(`Approximately ${estimatedGamesWithStats} games already have batter stats`);

        // Process games in batches
        const totalBatches = Math.ceil(games.length / BATCH_SIZE);
        let totalProcessed = 0;

        for (let i = 0; i < games.length; i += BATCH_SIZE) {
            const batch = games.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

            console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} games)...`);

            const processedCount = await processBatch(batch);
            totalProcessed += processedCount;

            console.log(`Completed batch ${batchNumber}/${totalBatches}. Total processed: ${totalProcessed}/${games.length}`);

            // Wait between batches to avoid overloading the API
            if (i + BATCH_SIZE < games.length) {
                console.log(`Waiting ${DELAY_BETWEEN_BATCHES / 1000} seconds before next batch...`);
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
            }
        }

        console.log(`\nBatter game stats fetching completed. Processed ${totalProcessed}/${games.length} games.`);

    } catch (error) {
        console.error('Error in main process:', error);
    } finally {
        // Close database connection
        await dbService.close();
        console.log('Database connection closed');
    }
}

// Run the script if executed directly
if (require.main === module) {
    main().catch(err => {
        console.error('Fatal error:', err);
        process.exit(1);
    });
}

module.exports = {
    fetchBoxscore,
    extractBatterStats,
    processBatch,
    main
};