// clear-roster-data.js
// A script to clear data from the rosters table in the database

const dbService = require('./src/database');
const readline = require('readline');

// Create interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/**
 * Clear roster data from the database
 * @param {Array} seasonYears - Array of season years to clear, empty for all seasons
 */
async function clearRosterData(seasonYears = []) {
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

        // Get roster counts for each season
        const seasonRosterCounts = [];
        for (const season of seasonsToProcess) {
            const count = await dbService.db.get(
                'SELECT COUNT(*) as count FROM rosters WHERE season_id = ?',
                [season.id]
            );
            seasonRosterCounts.push({
                season: season,
                count: count.count
            });
        }

        console.log(`\nWill clear roster data for the following seasons:`);
        seasonRosterCounts.forEach(item => {
            console.log(`- ${item.season.year} (ID: ${item.season.id}, League ID: ${item.season.league_id}): ${item.count} roster entries`);
        });

        // Ask for confirmation
        const confirmation = await askQuestion('\nAre you sure you want to clear this roster data? This cannot be undone. (yes/no): ');
        if (confirmation.toLowerCase() !== 'yes') {
            console.log('Operation cancelled.');
            return;
        }

        // Process each season
        let totalDeleted = 0;
        for (const item of seasonRosterCounts) {
            console.log(`\nClearing roster data for season ${item.season.year}...`);

            // Delete roster data
            const deleted = await dbService.rosters.deleteSeasonRosters(item.season.id);
            totalDeleted += deleted;

            console.log(`Deleted ${deleted} roster entries for season ${item.season.year}`);
        }

        console.log(`\nOperation completed successfully. Deleted a total of ${totalDeleted} roster entries.`);
    } catch (error) {
        console.error('Error clearing roster data:', error);
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
 * Helper function to clear roster data for specific periods within a season
 * @param {string} year - Season year
 * @param {Array} periodNumbers - Array of period numbers to clear
 */
async function clearRosterDataForPeriods(year, periodNumbers) {
    try {
        console.log('Starting database connection...');
        await dbService.initialize();
        console.log('Database connection established');

        // Get season by year
        const season = await dbService.seasons.getSeasonByYear(year);
        if (!season) {
            console.log(`Season ${year} not found in the database.`);
            return;
        }

        // Get all teams for this season
        const teams = await dbService.teams.getTeamsBySeason(season.id);
        if (teams.length === 0) {
            console.log(`No teams found for season ${year}.`);
            return;
        }

        let totalDeleted = 0;

        // Process each period number
        for (const periodNumber of periodNumbers) {
            let periodDeleted = 0;

            // Process each team
            for (const team of teams) {
                const deleted = await dbService.rosters.deleteTeamPeriodRosters(team.id, periodNumber);
                periodDeleted += deleted;
            }

            console.log(`Deleted ${periodDeleted} roster entries for period ${periodNumber} in season ${year}`);
            totalDeleted += periodDeleted;
        }

        console.log(`\nOperation completed successfully. Deleted a total of ${totalDeleted} roster entries.`);
    } catch (error) {
        console.error('Error clearing roster data for periods:', error);
    } finally {
        await dbService.close();
        rl.close();
    }
}

/**
 * Main function to run the script
 */
async function main() {
    try {
        console.log('=== ROSTER DATA CLEARING UTILITY ===\n');

        // Ask what type of clearing to perform
        const clearType = await askQuestion('What would you like to clear?\n1. All roster data for entire seasons\n2. Roster data for specific periods\nEnter your choice (1 or 2): ');

        if (clearType === '1') {
            // Clear entire seasons
            const clearAllSeasons = await askQuestion('\nDo you want to clear roster data for ALL seasons? (yes/no): ');

            if (clearAllSeasons.toLowerCase() === 'yes') {
                await clearRosterData();
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

                await clearRosterData(years);
            }
        } else if (clearType === '2') {
            // Clear specific periods
            console.log('\nClearing roster data for specific periods...');

            const yearInput = await askQuestion('Enter the season year: ');
            const year = yearInput.trim();

            const periodsInput = await askQuestion('Enter the period numbers to clear, separated by commas (e.g., 1,2,3): ');
            const periods = periodsInput.split(',')
                .map(p => p.trim())
                .filter(p => /^\d+$/.test(p))
                .map(p => parseInt(p, 10));

            if (periods.length === 0) {
                console.log('No valid period numbers entered. Operation cancelled.');
                rl.close();
                return;
            }

            console.log(`Will clear roster data for periods ${periods.join(', ')} in season ${year}`);
            const confirmation = await askQuestion('Are you sure? (yes/no): ');

            if (confirmation.toLowerCase() === 'yes') {
                await clearRosterDataForPeriods(year, periods);
            } else {
                console.log('Operation cancelled.');
            }
        } else {
            console.log('Invalid choice. Operation cancelled.');
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

module.exports = { clearRosterData, clearRosterDataForPeriods };