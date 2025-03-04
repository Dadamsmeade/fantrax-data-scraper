require('dotenv').config();
const { setupBrowser, setupPage } = require('./utils/browser');
const { authenticateFantrax } = require('./auth');
const { scrapeSchedule } = require('./scrapers/schedule');
const dbService = require('./database');

// Configuration
const USERNAME = process.env.FANTRAX_USERNAME;
const PASSWORD = process.env.FANTRAX_PASSWORD;

// League IDs for each season
// Each season in Fantrax has its own unique league ID
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

// Select which seasons to scrape
// Set to empty array to scrape all seasons
const YEARS_TO_SCRAPE = ['2024', '2023']; // Example: only scrape 2024 and 2023

// Filter seasons based on YEARS_TO_SCRAPE
const seasonsToScrape = YEARS_TO_SCRAPE.length > 0
    ? SEASONS.filter(season => YEARS_TO_SCRAPE.includes(season.year))
    : SEASONS;

/**
 * Main function to run the scraper
 */
async function main() {
    // Validate credentials
    if (!USERNAME || !PASSWORD) {
        console.error('Error: Fantrax credentials are required.');
        console.error('Please set FANTRAX_USERNAME and FANTRAX_PASSWORD in your .env file.');
        process.exit(1);
    }

    console.log(`Starting Fantrax data scraper for ${seasonsToScrape.length} season(s)...`);
    console.log('Seasons to scrape:', seasonsToScrape.map(s => s.year).join(', '));

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

        // Process each season
        for (const season of seasonsToScrape) {
            console.log(`\n=== Processing season: ${season.year} (League ID: ${season.leagueId}) ===\n`);

            // Scrape league schedule
            console.log(`Scraping schedule for ${season.year} season...`);
            try {
                const scheduleData = await scrapeSchedule(page, season.leagueId);

                if (scheduleData.length === 0) {
                    console.warn(`No schedule data found for ${season.year} season`);
                    continue;
                }

                // Save schedule data to database
                console.log(`Saving ${scheduleData.length} matchups to database...`);
                const result = await dbService.saveScheduleData(
                    scheduleData,
                    season.year,
                    season.leagueId
                );

                console.log(`Database update complete for ${season.year} season`);
                console.log(`Saved ${result.teams} teams and ${result.matchups} matchups`);

            } catch (error) {
                console.error(`Error processing ${season.year} season:`, error.message);
                console.log('Continuing with next season...');
                continue; // Continue with next season even if this one fails
            }
        }

        console.log('\n=== All scraping tasks completed successfully! ===\n');

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
 * Query helper function to get schedule data from the database
 * @param {string} year - Season year to query
 * @returns {Promise<Array>} Schedule data for the season
 */
async function getScheduleForSeason(year) {
    try {
        await dbService.initialize();

        // Get season by year
        const season = await dbService.seasons.getSeasonByYear(year);

        if (!season) {
            console.error(`Season ${year} not found in database`);
            return [];
        }

        // Get schedule for season
        const schedule = await dbService.schedule.getScheduleBySeason(season.id);
        console.log(`Retrieved ${schedule.length} matchups for season ${year}`);

        return schedule;
    } catch (error) {
        console.error(`Error retrieving schedule for season ${year}:`, error);
        throw error;
    } finally {
        await dbService.close();
    }
}

// Run the main function when executed directly
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}

module.exports = {
    main,
    getScheduleForSeason
};