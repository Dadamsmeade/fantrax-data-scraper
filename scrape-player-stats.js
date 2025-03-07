// A script to scrape player stats for a specific date or date range
const { setupBrowser, setupPage } = require('./src/utils/browser');
const { authenticateFantrax } = require('./src/auth');
const { scrapePlayerStats, scrapeDailyPlayerStats } = require('./src/scrapers/player-stats');
const dbService = require('./src/database');
require('dotenv').config();

// Configuration - load from .env file
const USERNAME = process.env.FANTRAX_USERNAME;
const PASSWORD = process.env.FANTRAX_PASSWORD;

// Specify the league and date to scrape
const LEAGUE_ID = 'apl5cn2ciyuis67t'; // 2017 season
const TEAM_ID = '6kavltp6iyus60pl';   // Smooth Sailing team ID
const DATE = '2017-04-02';            // Opening day

/**
 * Generate a date range array
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Array<string>} Array of dates in YYYY-MM-DD format
 */
function generateDateRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dates = [];

    // Clone start date to avoid modifying it
    let currentDate = new Date(start);

    // Loop until currentDate is later than end date
    while (currentDate <= end) {
        dates.push(currentDate.toISOString().split('T')[0]); // Format as YYYY-MM-DD
        currentDate.setDate(currentDate.getDate() + 1); // Move to next day
    }

    return dates;
}

/**
 * Scrape player stats for a single team on a single date
 */
async function scrapeSingleTeam() {
    // Validate credentials
    if (!USERNAME || !PASSWORD) {
        console.error('Error: Fantrax credentials are required.');
        console.error('Please set FANTRAX_USERNAME and FANTRAX_PASSWORD in your .env file.');
        process.exit(1);
    }

    let browser;
    let page;

    try {
        // Initialize database
        await dbService.initialize();
        console.log('Database service initialized');

        // Setup browser and page
        browser = await setupBrowser();
        page = await setupPage(browser);

        // Authenticate with Fantrax
        const authSuccess = await authenticateFantrax(page, USERNAME, PASSWORD);

        if (!authSuccess) {
            throw new Error('Authentication failed. Please check your credentials.');
        }

        // Get the season from the database
        const season = await dbService.seasons.getSeasonByLeagueId(LEAGUE_ID);
        if (!season) {
            throw new Error(`Season with league ID ${LEAGUE_ID} not found in database.`);
        }

        console.log(`Scraping player stats for team ${TEAM_ID} on ${DATE}`);

        // Scrape player stats for the specified team and date
        const playerStats = await scrapePlayerStats(page, LEAGUE_ID, TEAM_ID, DATE);

        console.log('Player stats retrieved. Saving to database...');

        // Save player stats to database
        await dbService.savePlayerDailyStats([playerStats], DATE, season.id);

        console.log('Player stats saved successfully!');

    } catch (error) {
        console.error('Error during scraping:', error);
    } finally {
        // Close the browser
        if (browser) {
            console.log('Closing browser...');
            await browser.close();
        }

        // Close database connection
        await dbService.close();
    }
}

/**
 * Scrape player stats for all teams in a league for a date range
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 */
async function scrapeAllTeamsDateRange(startDate, endDate) {
    // Validate credentials
    if (!USERNAME || !PASSWORD) {
        console.error('Error: Fantrax credentials are required.');
        console.error('Please set FANTRAX_USERNAME and FANTRAX_PASSWORD in your .env file.');
        process.exit(1);
    }

    let browser;
    let page;

    try {
        // Initialize database
        await dbService.initialize();
        console.log('Database service initialized');

        // Setup browser and page
        browser = await setupBrowser();
        page = await setupPage(browser);

        // Authenticate with Fantrax
        const authSuccess = await authenticateFantrax(page, USERNAME, PASSWORD);

        if (!authSuccess) {
            throw new Error('Authentication failed. Please check your credentials.');
        }

        // Get the season from the database
        const season = await dbService.seasons.getSeasonByLeagueId(LEAGUE_ID);
        if (!season) {
            throw new Error(`Season with league ID ${LEAGUE_ID} not found in database.`);
        }

        // Get all teams for this season
        const teams = await dbService.teams.getTeamsBySeason(season.id);
        console.log(`Found ${teams.length} teams for season ${season.year}`);

        // Format teams for scraping
        const teamsForScraping = teams.map(team => ({
            id: team.team_id,  // Use Fantrax ID
            name: team.name
        }));

        // Generate date range
        const dates = generateDateRange(startDate, endDate);
        console.log(`Scraping stats for ${dates.length} days`);

        // Process each date
        for (const date of dates) {
            console.log(`\n=== Processing date: ${date} ===\n`);

            // Scrape player stats for all teams on this date
            const allTeamStats = await scrapeDailyPlayerStats(page, LEAGUE_ID, date, teamsForScraping);

            console.log(`Stats retrieved for ${allTeamStats.length} teams. Saving to database...`);

            // Save all team stats to database
            await dbService.savePlayerDailyStats(allTeamStats, date, season.id);

            console.log(`Stats for ${date} saved successfully!`);

            // Add a small delay between dates to avoid rate limiting
            await page.waitForTimeout(2000);
        }

        console.log('\n=== All player stats scraping completed successfully! ===\n');

    } catch (error) {
        console.error('Error during scraping:', error);
    } finally {
        // Close the browser
        if (browser) {
            console.log('Closing browser...');
            await browser.close();
        }

        // Close database connection
        await dbService.close();
    }
}

// Run the script based on command line arguments
if (require.main === module) {
    // Process command line arguments
    const args = process.argv.slice(2);

    if (args.length === 0) {
        // Default: scrape single team
        scrapeSingleTeam().catch(console.error);
    } else if (args.length === 2) {
        // If two arguments provided, treat as start and end dates
        const [startDate, endDate] = args;
        scrapeAllTeamsDateRange(startDate, endDate).catch(console.error);
    } else {
        console.log('Usage:');
        console.log('  node scrape-player-stats.js                       - Scrape a single team on a single date');
        console.log('  node scrape-player-stats.js YYYY-MM-DD YYYY-MM-DD - Scrape all teams for a date range');
    }
}

module.exports = {
    scrapeSingleTeam,
    scrapeAllTeamsDateRange
};