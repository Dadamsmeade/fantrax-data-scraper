// clear-batter-game-stats.js
// Script to clear data from the batter_game_stats table

const dbService = require('./src/database');
const readline = require('readline');

// Create interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/**
 * Clear batter game stats from the database
 * @param {Array} options - Object with filtering options
 * @param {Array} options.seasons - Array of season years to clear
 * @param {string} options.startDate - Start date to clear (YYYY-MM-DD)
 * @param {string} options.endDate - End date to clear (YYYY-MM-DD)
 * @param {Array} options.teamIds - Array of team IDs to clear
 */
async function clearBatterGameStats(options = {}) {
    try {
        console.log('Starting database connection...');
        await dbService.initialize();
        console.log('Database connection established');

        // Build the delete query
        let query = 'DELETE FROM batter_game_stats WHERE 1=1';
        const params = [];

        // Add season filter if specified
        if (options.seasons && options.seasons.length > 0) {
            // Get game_pk values for the specified seasons
            const gameQuery = 'SELECT game_pk FROM mlb_games WHERE season IN (' +
                options.seasons.map(() => '?').join(',') + ')';

            const games = await dbService.db.all(gameQuery, options.seasons);

            if (games.length === 0) {
                console.log('No games found for the specified seasons.');
                return 0;
            }

            query += ' AND game_pk IN (' + games.map(() => '?').join(',') + ')';
            params.push(...games.map(g => g.game_pk));
        }

        // Add date range filter if specified
        if (options.startDate) {
            query += ' AND game_date >= ?';
            params.push(options.startDate);
        }

        if (options.endDate) {
            query += ' AND game_date <= ?';
            params.push(options.endDate);
        }

        // Add team filter if specified
        if (options.teamIds && options.teamIds.length > 0) {
            query += ' AND team_id IN (' + options.teamIds.map(() => '?').join(',') + ')';
            params.push(...options.teamIds);
        }

        // Count records to be deleted
        const countQuery = query.replace('DELETE FROM', 'SELECT COUNT(*) as count FROM');
        const countResult = await dbService.db.get(countQuery, params);
        const count = countResult.count;

        if (count === 0) {
            console.log('No batter game stats found matching the criteria.');
            return 0;
        }

        console.log(`Found ${count} batter game stats matching the criteria.`);

        // Ask for confirmation
        const confirmation = await askQuestion(`Are you sure you want to delete ${count} batter game stats? This cannot be undone. (yes/no): `);
        if (confirmation.toLowerCase() !== 'yes') {
            console.log('Operation cancelled.');
            return 0;
        }

        // Execute the delete query
        console.log('Deleting batter game stats...');
        const result = await dbService.db.run(query, params);

        console.log(`Successfully deleted ${result.changes} batter game stats.`);
        return result.changes;
    } catch (error) {
        console.error('Error clearing batter game stats:', error);
        throw error;
    } finally {
        await dbService.close();
        rl.close();
    }
}

/**
 * Helper function to ask questions
 * @param {string} question - Question to ask
 * @returns {Promise<string>} - User's answer
 */
function askQuestion(question) {
    return new Promise(resolve => {
        rl.question(question, answer => {
            resolve(answer);
        });
    });
}

/**
 * Main function to run the script interactively
 */
async function main() {
    try {
        console.log('=== BATTER GAME STATS CLEARING UTILITY ===\n');

        // Ask what to clear
        const clearType = await askQuestion(
            'What would you like to clear?\n' +
            '1. All batter game stats\n' +
            '2. Stats for specific seasons\n' +
            '3. Stats for a date range\n' +
            '4. Stats for specific teams\n' +
            'Enter your choice (1-4): '
        );

        const options = {};

        if (clearType === '1') {
            // Clear all stats
            console.log('\nYou have chosen to clear ALL batter game stats.');
        } else if (clearType === '2') {
            // Clear stats for specific seasons
            const seasonsInput = await askQuestion('\nEnter the seasons to clear, separated by commas (e.g., 2023,2024): ');
            options.seasons = seasonsInput.split(',').map(s => s.trim());

            console.log(`You have chosen to clear batter game stats for seasons: ${options.seasons.join(', ')}`);
        } else if (clearType === '3') {
            // Clear stats for a date range
            options.startDate = await askQuestion('\nEnter start date (YYYY-MM-DD): ');
            options.endDate = await askQuestion('Enter end date (YYYY-MM-DD): ');

            console.log(`You have chosen to clear batter game stats from ${options.startDate} to ${options.endDate}`);
        } else if (clearType === '4') {
            // Clear stats for specific teams
            const teamIdsInput = await askQuestion('\nEnter team IDs to clear, separated by commas (e.g., 143,121): ');
            options.teamIds = teamIdsInput.split(',').map(s => parseInt(s.trim()));

            console.log(`You have chosen to clear batter game stats for team IDs: ${options.teamIds.join(', ')}`);
        } else {
            console.log('Invalid choice. Operation cancelled.');
            rl.close();
            return;
        }

        // Final confirmation
        const finalConfirm = await askQuestion('\nProceed with deletion? (yes/no): ');

        if (finalConfirm.toLowerCase() === 'yes') {
            await clearBatterGameStats(options);
        } else {
            console.log('Operation cancelled.');
        }
    } catch (error) {
        console.error('Unhandled error:', error);
    } finally {
        if (rl.listenerCount('line') > 0) {
            rl.close();
        }
    }
}

// Run the script if executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { clearBatterGameStats };