const { takeScreenshot } = require('../utils/browser');
const { FANTRAX_BASE_URL } = require('../auth');
const fs = require('fs-extra');
const path = require('path');

/**
 * Scrapes the season stats data for a league
 * @param {Page} page - Puppeteer page object
 * @param {string} leagueId - Fantrax league ID 
 * @returns {Promise<Object>} - Object containing season stats, hitting stats, and pitching stats
 */
async function scrapeSeasonStats(page, leagueId) {
    console.log(`Scraping season stats for league: ${leagueId}`);

    // Add this before your page.evaluate() calls
    page.on('console', msg => {
        console.log(`BROWSER: ${msg.text()}`);
    });

    try {
        // Navigate to the season stats page
        const url = `${FANTRAX_BASE_URL}/fantasy/league/${leagueId}/standings;view=SEASON_STATS`;
        console.log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Add a delay to ensure Angular has time to render components
        console.log('Waiting for season stats page to fully render...');
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 20000)));

        // Wait for any tabs to be available and click on the Season Stats tab if needed
        try {
            // Wait for tab elements to be available
            const tabsAvailable = await page.evaluate(() => {
                const tabs = document.querySelectorAll('.tabs__item');
                return tabs.length > 0;
            });

            if (tabsAvailable) {
                console.log('Tabs found, checking if we need to click the Season Stats tab');
                // Check if we need to click on the Season Stats tab
                const needToClick = await page.evaluate(() => {
                    const tabs = Array.from(document.querySelectorAll('.tabs__item'));
                    const seasonStatsTab = tabs.find(tab => tab.textContent.trim().includes('Season Stats'));
                    if (seasonStatsTab && !seasonStatsTab.classList.contains('tabs__item--selected')) {
                        return true;
                    }
                    return false;
                });

                if (needToClick) {
                    console.log('Clicking on Season Stats tab');
                    await page.evaluate(() => {
                        const tabs = Array.from(document.querySelectorAll('.tabs__item'));
                        const seasonStatsTab = tabs.find(tab => tab.textContent.trim().includes('Season Stats'));
                        if (seasonStatsTab) {
                            seasonStatsTab.click();
                        }
                    });

                    // Wait for tab content to load
                    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 2000)));
                }
            }
        } catch (tabError) {
            console.warn('Warning: Error when checking tabs:', tabError.message);
        }

        // Wait for specific elements that indicate the stats table is loaded
        console.log('Checking for stats table elements...');
        try {
            // Wait for team rows to be present
            await page.waitForSelector('.ultimate-table section > aside > td', { timeout: 5000 });
            console.log('Found team rows in stats table');

            // Wait for data cells to be populated
            await page.waitForSelector('.ultimate-table > section > div > table > tr > td', { timeout: 5000 });
            console.log('Found data cells in stats table');
        } catch (waitError) {
            console.warn('Warning: Timed out waiting for stats table elements. Will try to extract data anyway.', waitError.message);
        }

        // Take a screenshot
        await takeScreenshot(page, 'season-stats-page');

        // Save the HTML content for debugging
        const content = await page.content();
        const debugDir = path.join(__dirname, '../../data/debug');
        fs.ensureDirSync(debugDir);
        await fs.writeFile(path.join(debugDir, `season-stats-page-${leagueId}.html`), content);
        console.log('Saved HTML content for debugging');

        // Log some DOM stats to help debug rendering issues
        const domStats = await page.evaluate(() => {
            const tables = document.querySelectorAll('.ultimate-table');
            return {
                teamRows: tables[0].querySelectorAll('section > aside > td').length,
                dataRows: tables[0].querySelectorAll('section > div > table > tr').length,
                dataCells: tables[0].querySelectorAll('section > div > table > tr > td').length,
                tableHeaders: tables[0].querySelectorAll('header th').length
            };
        });
        console.log('DOM Statistics:', domStats);

        // Extract season stats data using page.evaluate with updated selectors for the Angular structure
        const stats = await page.evaluate(() => {

            const tables = document.querySelectorAll('.ultimate-table');

            // Helper to parse numeric values
            const parseNumeric = (text) => {
                if (!text) return 0;
                text = text.trim().replace(/,/g, '');
                return parseFloat(text) || 0;
            };

            // Helper to safely get text from an element
            const safeText = (element) => {
                if (!element) return '';
                return element.textContent.trim();
            };

            // Find all team rows in the standings table for Season Stats view
            const findTeamRows = () => {
                // Look for team info in the side column
                return Array.from(tables[0].querySelectorAll('section > aside > td'));
            };

            // Extract season stats from the Angular structure
            const extractSeasonStats = () => {
                const seasonStats = [];
                const teamRows = findTeamRows();

                if (teamRows.length === 0) {
                    console.error('No team rows found in season stats table');
                    return seasonStats;
                }

                console.log(`Found ${teamRows.length} team rows for season stats`);

                // Process each team row
                for (let i = 0; i < teamRows.length; i++) {
                    try {
                        const teamRow = teamRows[i];

                        // Get team name and ID from the link
                        const teamLink = teamRow.querySelector('a[href*="teamId="]');
                        if (!teamLink) {
                            console.warn(`No team link found in row ${i + 1}`);
                            continue;
                        }

                        const href = teamLink.getAttribute('href');
                        const teamIdMatch = href.match(/teamId=([^&;]+)/);
                        if (!teamIdMatch) {
                            console.warn(`No teamId found in href: ${href}`);
                            continue;
                        }

                        const teamId = teamIdMatch[1];
                        const teamName = teamLink.textContent.trim();

                        console.log(`Processing team: ${teamName} (${teamId})`);

                        // Find corresponding data cells
                        const dataRowCells = Array.from(tables[0].querySelectorAll(`section > div > table > tr:nth-child(${i + 1}) > td`));

                        // Check for number of cells and log what we found
                        console.log(`Found ${dataRowCells.length} data cells for team ${teamName}`);

                        // Get headers to understand column order
                        const headers = Array.from(tables[0].querySelectorAll('header ._ut__head th')).map(th => th.textContent.trim());
                        console.log(`Found ${headers.length} headers: ${headers.join(', ')}`);

                        // Default values if cells aren't found
                        let fantasyPoints = 0;
                        let adjustments = 0;
                        let totalPoints = 0;
                        let fantasyPointsPerGame = 0;
                        let gamesPlayed = 0;
                        let hittingPoints = 0;
                        let teamPitchingPoints = 0;
                        let waiverPosition = 0;
                        let pointsBehindLeader = 0;

                        // Try to extract data from cells based on what's available
                        if (dataRowCells.length > 0) {
                            // Look for specific column indices based on headers if available
                            let fptsIndex = headers.findIndex(h => h.includes('FPts'));
                            let adjIndex = headers.findIndex(h => h.includes('Adj'));
                            let totalIndex = headers.findIndex(h => h.includes('Total'));
                            let fpgIndex = headers.findIndex(h => h.includes('FP/G'));
                            let gpIndex = headers.findIndex(h => h.includes('GP'));
                            let hitIndex = headers.findIndex(h => h.includes('Hit'));
                            let tpIndex = headers.findIndex(h => h.includes('TP'));
                            let wwIndex = headers.findIndex(h => h.includes('WW'));
                            let pblIndex = headers.findIndex(h => h.includes('PBL'));

                            // If header detection doesn't work, use these default indices
                            if (fptsIndex === -1) fptsIndex = 0;
                            if (adjIndex === -1) adjIndex = 1;
                            if (totalIndex === -1) totalIndex = 2;
                            if (fpgIndex === -1) fpgIndex = 3;
                            if (gpIndex === -1) gpIndex = 4;
                            if (hitIndex === -1) hitIndex = 5;
                            if (tpIndex === -1) tpIndex = 6;
                            if (wwIndex === -1) wwIndex = 7;
                            if (pblIndex === -1) pblIndex = 8;

                            console.log("INDECES: ", parseNumeric(safeText(dataRowCells[fptsIndex])));

                            // Extract values with safeguards
                            if (fptsIndex >= 0 && fptsIndex < dataRowCells.length) {
                                fantasyPoints = parseNumeric(safeText(dataRowCells[fptsIndex]));
                            }

                            if (adjIndex >= 0 && adjIndex < dataRowCells.length) {
                                adjustments = parseNumeric(safeText(dataRowCells[adjIndex]));
                            }

                            if (totalIndex >= 0 && totalIndex < dataRowCells.length) {
                                totalPoints = parseNumeric(safeText(dataRowCells[totalIndex]));
                            }

                            if (fpgIndex >= 0 && fpgIndex < dataRowCells.length) {
                                fantasyPointsPerGame = parseNumeric(safeText(dataRowCells[fpgIndex]));
                            }

                            if (gpIndex >= 0 && gpIndex < dataRowCells.length) {
                                gamesPlayed = parseInt(safeText(dataRowCells[gpIndex])) || 0;
                            }

                            if (hitIndex >= 0 && hitIndex < dataRowCells.length) {
                                hittingPoints = parseNumeric(safeText(dataRowCells[hitIndex]));
                            }

                            if (tpIndex >= 0 && tpIndex < dataRowCells.length) {
                                teamPitchingPoints = parseNumeric(safeText(dataRowCells[tpIndex]));
                            }

                            if (wwIndex >= 0 && wwIndex < dataRowCells.length) {
                                waiverPosition = parseInt(safeText(dataRowCells[wwIndex])) || 0;
                            }

                            if (dataRowCells.length > 8) {
                                pointsBehindLeader = parseNumeric(safeText(dataRowCells[pblIndex])) || 0;
                            }
                        }

                        console.log(`Stats: FPts=${fantasyPoints}, FP/G=${fantasyPointsPerGame}, GP=${gamesPlayed}`);

                        seasonStats.push({
                            teamId,
                            teamName,
                            fantasyPoints,
                            adjustments,
                            totalPoints,
                            fantasyPointsPerGame,
                            gamesPlayed,
                            hittingPoints,
                            teamPitchingPoints,
                            waiverPosition,
                            pointsBehindLeader
                        });
                    } catch (error) {
                        console.error(`Error processing team row ${i}:`, error.message);
                    }
                }

                return seasonStats;
            };

            // The hitting and pitching stats would require navigating to different tabs
            // For now, we'll return empty arrays

            // Return all the stats data
            return {
                seasonStats: extractSeasonStats(),
                hittingStats: [],
                pitchingStats: []
            };
        });

        console.log(`Scraped stats data: ${stats.seasonStats.length} season stats, ${stats.hittingStats.length} hitting stats, ${stats.pitchingStats.length} pitching stats`);

        // Log sample data if available
        if (stats.seasonStats.length > 0) {
            console.log('Sample data from first team:', JSON.stringify(stats.seasonStats[0], null, 2));
        }

        return stats;
    } catch (error) {
        console.error('Error scraping season stats:', error);
        throw error;
    }
}

module.exports = {
    scrapeSeasonStats
};