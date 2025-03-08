require('dotenv').config();
const { setupBrowser, setupPage } = require('./utils/browser');
const { authenticateFantrax } = require('./auth');
const { scrapeSchedule } = require('./scrapers/schedule');
const { scrapeStandings } = require('./scrapers/standings');
const { scrapeSeasonStats } = require('./scrapers/season-stats');
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
const YEARS_TO_SCRAPE = ['2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', ]; // Example: only scrape 2024 and 2023

// Choose which data types to scrape
const DATA_TYPES = {
    SCHEDULE: true,     // Scrape schedule data
    STANDINGS: true,    // Scrape standings data
    SEASON_STATS: true  // Scrape season stats data
};

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
    console.log('Data types to scrape:',
        Object.entries(DATA_TYPES)
            .filter(([_, enabled]) => enabled)
            .map(([type]) => type)
            .join(', ')
    );

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

            // Get season from database or create it if it doesn't exist
            const dbSeason = await ensureSeasonExists(season.year, season.leagueId);
            const seasonId = dbSeason.id;

            // Scrape and save schedule data
            if (DATA_TYPES.SCHEDULE) {
                await processScheduleData(page, season, seasonId);
            }

            // Scrape and save standings data
            if (DATA_TYPES.STANDINGS) {
                await processStandingsData(page, season, seasonId);
            }

            // Scrape and save season stats data
            if (DATA_TYPES.SEASON_STATS) {
                await processSeasonStatsData(page, season, seasonId);
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
 * Ensures a season exists in the database and returns it
 * @param {string} year - Season year
 * @param {string} leagueId - Fantrax league ID
 * @returns {Promise<Object>} - The season object
 */
async function ensureSeasonExists(year, leagueId) {
    // Check if season already exists
    let season = await dbService.seasons.getSeasonByLeagueId(leagueId);

    if (!season) {
        // Create new season
        season = await dbService.seasons.upsertSeason({
            year,
            leagueId,
            name: `${year} Season`
        });
        console.log(`Created new season: ${year} (ID: ${season.id})`);
    } else {
        console.log(`Using existing season: ${season.year} (ID: ${season.id})`);
    }

    return season;
}

/**
 * Process schedule data for a season
 * @param {Page} page - Puppeteer page object
 * @param {Object} season - Season object
 * @param {number} seasonId - Season database ID
 */
async function processScheduleData(page, season, seasonId) {
    console.log(`Scraping schedule for ${season.year} season...`);
    try {
        const scheduleData = await scrapeSchedule(page, season.leagueId);

        if (scheduleData.length === 0) {
            console.warn(`No schedule data found for ${season.year} season`);
            return;
        }

        // Save schedule data to database
        console.log(`Saving ${scheduleData.length} matchups to database...`);
        const result = await dbService.saveScheduleData(
            scheduleData,
            season.year,
            season.leagueId
        );

        console.log(`Database update complete for ${season.year} schedule`);
        console.log(`Saved ${result.teams} teams and ${result.matchups} matchups`);

    } catch (error) {
        console.error(`Error processing schedule for ${season.year} season:`, error.message);
    }
}

/**
 * Process standings data for a season
 * @param {Page} page - Puppeteer page object
 * @param {Object} season - Season object
 * @param {number} seasonId - Season database ID
 */
async function processStandingsData(page, season, seasonId) {
    console.log(`Scraping standings for ${season.year} season...`);
    try {
        const standingsData = await scrapeStandings(page, season.leagueId);

        if (standingsData.length === 0) {
            console.warn(`No standings data found for ${season.year} season`);
            return;
        }

        // Save standings data to database
        console.log(`Saving ${standingsData.length} standings to database...`);
        const result = await dbService.saveStandingsData(standingsData, seasonId);

        console.log(`Database update complete for ${season.year} standings`);
        console.log(`Saved ${result.saved} team standings`);

    } catch (error) {
        console.error(`Error processing standings for ${season.year} season:`, error.message);
    }
}

/**
 * Process season stats data for a season
 * @param {Page} page - Puppeteer page object
 * @param {Object} season - Season object
 * @param {number} seasonId - Season database ID
 */
async function processSeasonStatsData(page, season, seasonId) {
    console.log(`Scraping season stats for ${season.year} season...`);
    try {
        const statsData = await scrapeSeasonStats(page, season.leagueId);

        if (!statsData.seasonStats || statsData.seasonStats.length === 0) {
            console.warn(`No season stats data found for ${season.year} season`);
            return;
        }

        // Save season stats data to database
        console.log(`Saving stats data to database: ${statsData.seasonStats.length} season stats, ${statsData.hittingStats.length} hitting stats, ${statsData.pitchingStats.length} pitching stats`);

        const result = await dbService.saveSeasonStatsData(statsData, seasonId);

        console.log(`Database update complete for ${season.year} stats`);
        console.log(`Saved ${result.seasonStats} season stats, ${result.hittingStats} hitting stats, and ${result.pitchingStats} pitching stats`);

    } catch (error) {
        console.error(`Error processing season stats for ${season.year} season:`, error.message);
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

/**
 * Query helper function to get standings data from the database
 * @param {string} year - Season year to query
 * @returns {Promise<Array>} Standings data for the season
 */
async function getStandingsForSeason(year) {
    try {
        await dbService.initialize();

        // Get season by year
        const season = await dbService.seasons.getSeasonByYear(year);

        if (!season) {
            console.error(`Season ${year} not found in database`);
            return [];
        }

        // Get standings for season
        const standings = await dbService.standings.getStandingsBySeason(season.id);
        console.log(`Retrieved ${standings.length} standings for season ${year}`);

        return standings;
    } catch (error) {
        console.error(`Error retrieving standings for season ${year}:`, error);
        throw error;
    } finally {
        await dbService.close();
    }
}

/**
 * Query helper function to get season stats data from the database
 * @param {string} year - Season year to query
 * @returns {Promise<Object>} Season stats data for the season
 */
async function getStatsForSeason(year) {
    try {
        await dbService.initialize();

        // Get season by year
        const season = await dbService.seasons.getSeasonByYear(year);

        if (!season) {
            console.error(`Season ${year} not found in database`);
            return { seasonStats: [], hittingStats: [], pitchingStats: [] };
        }

        // Get all stats for season
        const seasonStats = await dbService.seasonStats.getStatsBySeason(season.id);
        const hittingStats = await dbService.hittingStats.getStatsBySeason(season.id);
        const pitchingStats = await dbService.pitchingStats.getStatsBySeason(season.id);

        console.log(`Retrieved stats for season ${year}: ${seasonStats.length} season stats, ${hittingStats.length} hitting stats, ${pitchingStats.length} pitching stats`);

        return { seasonStats, hittingStats, pitchingStats };
    } catch (error) {
        console.error(`Error retrieving stats for season ${year}:`, error);
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
    getScheduleForSeason,
    getStandingsForSeason,
    getStatsForSeason
};