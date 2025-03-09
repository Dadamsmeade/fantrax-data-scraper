// clear-schedule-data.js
// A script to clear data from the schedule table in the database

const dbService = require('./src/database');
const readline = require('readline');

// Create interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/**
 * Clear schedule data from the database
 * @param {Array} seasonYears - Array of season years to clear, empty for all seasons
 */
async function clearScheduleData(seasonYears = []) {
    try {
        console.log('Starting database connection...');
        await dbService.initialize();
        console.log('Database connection established');

        // Get all seasons
        const seasons = await dbService.seasons.getAllSeasons();
        console.log(`Found ${seasons.length} seasons in the database`);

        if (seasons.length === 0) {
            console.log('No seasons found in the database.');
            return;
        }

        // Filter seasons if specific years provided
        const seasonsToProcess = seasonYears.length > 0
            ? seasons.filter(season => seasonYears.includes(season.year))
            : seasons;

        if (seasonsToProcess.length === 0) {
            console.log('No matching seasons found for the specified years.');
            return;
        }

        console.log(`\nWill clear schedule data for the following seasons:`);
        seasonsToProcess.forEach(season => {
            console.log(`- ${season.year} (ID: ${season.id}, League ID: ${season.league_id})`);
        });

        // Ask for confirmation
        const confirmation = await askQuestion('\nAre you sure you want to clear this schedule data? This cannot be undone. (yes/no): ');
        if (confirmation.toLowerCase() !== 'yes') {
            console.log('Operation cancelled.');
            return;
        }

        // Process each season
        let totalDeleted = 0;
        for (const season of seasonsToProcess) {
            console.log(`\nClearing schedule data for season ${season.year}...`);

            // Delete schedule data
            const deleted = await dbService.schedule.deleteSeasonSchedule(season.id);
            totalDeleted += deleted;

            console.log(`Deleted ${deleted} matchups for season ${season.year}`);
        }

        console.log(`\nOperation completed successfully. Deleted a total of ${totalDeleted} matchups.`);
    } catch (error) {
        console.error('Error clearing schedule data:', error);
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
 * Main function to run the script
 */
async function main() {
    try {
        console.log('=== SCHEDULE DATA CLEARING UTILITY ===\n');

        // Ask whether to clear all seasons or specific ones
        const clearAllSeasons = await askQuestion('Do you want to clear schedule data for ALL seasons? (yes/no): ');

        if (clearAllSeasons.toLowerCase() === 'yes') {
            await clearScheduleData();
        } else {
            console.log('\nPlease enter the years of the seasons you want to clear, separated by commas.');
            console.log('For example: 2023,2024');

            const yearsInput = await askQuestion('Years to clear: ');
            const years = yearsInput.split(',').map(year => year.trim());

            if (years.length === 0 || (years.length === 1 && years[0] === '')) {
                console.log('No valid years entered. Operation cancelled.');
                rl.close();
                return;
            }

            await clearScheduleData(years);
        }
    } catch (error) {
        console.error('Unhandled error:', error);
    } finally {
        if (rl.listenerCount('line') > 0) {
            rl.close();
        }
    }
}

// Run the script
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { clearScheduleData };