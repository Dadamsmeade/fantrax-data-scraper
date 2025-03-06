const { takeScreenshot } = require('../utils/browser');
const { FANTRAX_BASE_URL } = require('../auth');
const fs = require('fs-extra');
const path = require('path');

/**
 * Scrapes the standings data for a league
 * @param {Page} page - Puppeteer page object
 * @param {string} leagueId - Fantrax league ID 
 * @returns {Promise<Array>} - Array of standings data
 */
async function scrapeStandings(page, leagueId) {
    console.log(`Scraping standings for league: ${leagueId}`);

    try {
        // Navigate to the standings page
        const url = `${FANTRAX_BASE_URL}/fantasy/league/${leagueId}/standings;view=COMBINED`;
        console.log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Add a delay to ensure page has time to render completely
        console.log('Waiting for page to fully render...');
        await page.waitForTimeout(3000);

        // Take a screenshot
        await takeScreenshot(page, 'standings-page');

        // Save the HTML content for debugging
        const content = await page.content();
        const debugDir = path.join(__dirname, '../../data/debug');
        fs.ensureDirSync(debugDir);
        await fs.writeFile(path.join(debugDir, `standings-page-${leagueId}.html`), content);
        console.log('Saved HTML content for debugging');

        // First, check if we can find the table structure
        const tableExists = await page.evaluate(() => {
            return !!document.querySelector('.ultimate-table');
        });

        if (!tableExists) {
            console.error('Could not find standings table on the page');
            return [];
        }

        console.log('Found standings table, extracting data...');

        // Extract standings data
        const standingsData = await page.evaluate(() => {
            // Initialize array to hold standings data
            const standings = [];

            // Helper function to safely extract text content
            const getText = (element) => element ? element.textContent.trim() : '';

            // Helper function to safely parse numbers
            const parseNumber = (text, defaultValue = 0) => {
                if (!text) return defaultValue;
                const cleaned = text.replace(/,/g, '');
                const parsed = parseFloat(cleaned);
                return isNaN(parsed) ? defaultValue : parsed;
            };

            try {
                // Find team container - typically the aside section in the ultimate table
                const teamContainer = document.querySelector('.ultimate-table section aside');
                if (!teamContainer) {
                    console.error('Could not find team container');
                    return standings;
                }

                // Find all team rows (TD elements that contain team links)
                const teamRows = Array.from(teamContainer.querySelectorAll('td')).filter(td =>
                    td.querySelector('a[href*="teamId="]')
                );

                console.log(`Found ${teamRows.length} team rows`);

                // Find data table (where the stats are)
                const dataTable = document.querySelector('.ultimate-table > section > div > table');
                if (!dataTable) {
                    console.error('Could not find data table');
                    return standings;
                }

                // Find data rows
                const dataRows = Array.from(dataTable.querySelectorAll('tr'));
                console.log(`Found ${dataRows.length} data rows`);

                // Process each team
                teamRows.forEach((teamRow, index) => {
                    try {
                        // Extract rank
                        const rankElement = teamRow.querySelector('b');
                        const rank = getText(rankElement);

                        // Extract team info
                        const teamLink = teamRow.querySelector('a[href*="teamId="]');
                        if (!teamLink) return;

                        const teamName = getText(teamLink);
                        const href = teamLink.getAttribute('href');
                        const teamIdMatch = href.match(/teamId=([^&;]+)/);
                        const teamId = teamIdMatch ? teamIdMatch[1] : '';

                        console.log(`Processing team: ${teamName} (${teamId}), rank: ${rank}`);

                        // Create basic team object - we'll add stats later
                        const team = {
                            teamId,
                            teamName,
                            rank: parseInt(rank) || 0
                        };

                        // Extract stats if we have matching data row
                        if (index < dataRows.length) {
                            const dataRow = dataRows[index];
                            const cells = Array.from(dataRow.querySelectorAll('td'));

                            if (cells.length >= 10) {
                                // Basic stats - add more as needed
                                team.wins = parseInt(getText(cells[0])) || 0;
                                team.losses = parseInt(getText(cells[1])) || 0;
                                team.ties = parseInt(getText(cells[2])) || 0;

                                const winPctText = getText(cells[3]);
                                team.winPercentage = parseNumber(winPctText);

                                team.divisionRecord = getText(cells[4]);
                                team.gamesBack = parseNumber(getText(cells[5]));
                                team.waiverPosition = parseInt(getText(cells[6])) || 0;
                                team.fantasyPointsFor = parseNumber(getText(cells[7]));
                                team.fantasyPointsAgainst = parseNumber(getText(cells[8]));
                                team.streak = getText(cells[9]);
                            }
                        }

                        standings.push(team);
                    } catch (error) {
                        console.error(`Error processing team row ${index}:`, error.message);
                    }
                });

                // Sort by rank for consistency
                return standings.sort((a, b) => a.rank - b.rank);
            } catch (error) {
                console.error('Error extracting standings data:', error.message);
                return standings;
            }
        });

        console.log(`Extracted standings for ${standingsData.length} teams`);

        // Log a sample for verification
        if (standingsData.length > 0) {
            console.log('First team data:', JSON.stringify(standingsData[0], null, 2));
        }

        return standingsData;
    } catch (error) {
        console.error('Error scraping standings:', error);
        throw error;
    }
}

module.exports = {
    scrapeStandings
};