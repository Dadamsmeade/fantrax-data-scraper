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

        // Take a screenshot
        await takeScreenshot(page, 'standings-page');

        // Save the HTML content for debugging
        const content = await page.content();
        const debugDir = path.join(__dirname, '../../data/debug');
        fs.ensureDirSync(debugDir);
        await fs.writeFile(path.join(debugDir, `standings-page-${leagueId}.html`), content);
        console.log('Saved HTML content for debugging');

        // Extract standings data using page.evaluate
        const standingsData = await page.evaluate(() => {
            const standings = [];

            // Find team rows in the standings table
            // Targeting the rows that have team information
            const rows = Array.from(document.querySelectorAll('tr'));

            for (const row of rows) {
                // Check if this row contains a team
                const teamElement = row.querySelector('a[href*="teamId="]');
                if (!teamElement) continue;

                // Extract team ID from href
                const teamIdMatch = teamElement.href.match(/teamId=([^&]+)/);
                if (!teamIdMatch) continue;

                const teamId = teamIdMatch[1];
                const teamName = teamElement.textContent.trim();

                // Find the rank
                const rankElement = row.querySelector('b');
                const rank = rankElement ? rankElement.textContent.trim() : '';

                // Get all cell data
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length < 9) continue; // Make sure we have all the cells we need

                // Map cells to data
                // The cell indices might need adjustment based on the actual HTML structure
                const winsElem = row.querySelector('td span[aria-describedby*="W"]');
                const lossesElem = row.querySelector('td span[aria-describedby*="L"]');
                const tiesElem = row.querySelector('td span[aria-describedby*="T"]');

                const wins = winsElem ? parseInt(winsElem.textContent.trim()) : 0;
                const losses = lossesElem ? parseInt(lossesElem.textContent.trim()) : 0;
                const ties = tiesElem ? parseInt(tiesElem.textContent.trim()) : 0;

                // Get remaining data
                // These selectors need to be adjusted based on actual HTML structure
                let winPct = '', divRecord = '', gamesBack = '', waiverPos = '', fptsFor = '', fptsAgainst = '', streak = '';

                // Try to find win percentage
                const winPctElem = row.querySelector('td:nth-child(4)');
                if (winPctElem) {
                    winPct = winPctElem.textContent.trim();
                }

                // Try to find division record
                const divRecordElem = row.querySelector('td:nth-child(5)');
                if (divRecordElem) {
                    divRecord = divRecordElem.textContent.trim();
                }

                // Try to find games back
                const gamesBackElem = row.querySelector('td:nth-child(6)');
                if (gamesBackElem) {
                    gamesBack = gamesBackElem.textContent.trim();
                }

                // Try to find waiver position
                const waiverPosElem = row.querySelector('td:nth-child(7)');
                if (waiverPosElem) {
                    waiverPos = waiverPosElem.textContent.trim();
                }

                // Try to find fantasy points for
                const fptsForElem = row.querySelector('td span[aria-describedby*="FPtsF"]');
                if (fptsForElem) {
                    fptsFor = fptsForElem.textContent.trim();
                }

                // Try to find fantasy points against
                const fptsAgainstElem = row.querySelector('td span[aria-describedby*="FPtsA"]');
                if (fptsAgainstElem) {
                    fptsAgainst = fptsAgainstElem.textContent.trim();
                }

                // Try to find streak
                const streakElem = row.querySelector('td:nth-child(10)');
                if (streakElem) {
                    streak = streakElem.textContent.trim();
                }

                standings.push({
                    teamId,
                    teamName,
                    rank,
                    wins,
                    losses,
                    ties,
                    winPercentage: parseFloat(winPct.replace('.', '0.').replace('%', '')) || 0,
                    divisionRecord: divRecord,
                    gamesBack: parseFloat(gamesBack) || 0,
                    waiverPosition: parseInt(waiverPos) || 0,
                    fantasyPointsFor: parseFloat(fptsFor.replace(',', '')) || 0,
                    fantasyPointsAgainst: parseFloat(fptsAgainst.replace(',', '')) || 0,
                    streak
                });
            }

            return standings;
        });

        console.log(`Scraped standings data for ${standingsData.length} teams`);
        return standingsData;
    } catch (error) {
        console.error('Error scraping standings:', error);
        throw error;
    }
}

module.exports = {
    scrapeStandings
};