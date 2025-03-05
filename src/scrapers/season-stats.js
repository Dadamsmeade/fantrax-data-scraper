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

    try {
        // Navigate to the season stats page
        const url = `${FANTRAX_BASE_URL}/fantasy/league/${leagueId}/standings;view=SEASON_STATS`;
        console.log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Take a screenshot
        await takeScreenshot(page, 'season-stats-page');

        // Save the HTML content for debugging
        const content = await page.content();
        const debugDir = path.join(__dirname, '../../data/debug');
        fs.ensureDirSync(debugDir);
        await fs.writeFile(path.join(debugDir, `season-stats-page-${leagueId}.html`), content);
        console.log('Saved HTML content for debugging');

        // Extract season stats data
        const stats = await page.evaluate(() => {
            // Helper function to extract data from tables
            const extractTableData = (selector, rowHandler) => {
                const tables = document.querySelectorAll(selector);
                if (!tables || tables.length === 0) return [];

                const data = [];

                for (const table of tables) {
                    const rows = table.querySelectorAll('tr');

                    for (const row of rows) {
                        const result = rowHandler(row);
                        if (result) data.push(result);
                    }
                }

                return data;
            };

            // Extract season stats (points-based summary)
            const seasonStats = extractTableData('.standings-table-wrapper--pointsbased1', (row) => {
                // Check if this row contains a team
                const teamElement = row.querySelector('a[href*="teamId="]');
                if (!teamElement) return null;

                // Extract team ID from href
                const teamIdMatch = teamElement.href.match(/teamId=([^&]+)/);
                if (!teamIdMatch) return null;

                const teamId = teamIdMatch[1];
                const teamName = teamElement.textContent.trim();

                // Find all cells
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length < 8) return null;

                // Extract numerical data from cells
                // Adjusting indices based on the HTML structure
                const fptsSpan = row.querySelector('td span[aria-describedby*="FPts"]');
                const adjustSpan = row.querySelector('td span[aria-describedby*="Adj"]');
                const totalSpan = row.querySelector('td span[aria-describedby*="Total"]');
                const fpgSpan = row.querySelector('td span[aria-describedby*="FP/G"]');

                const fpts = fptsSpan ? parseFloat(fptsSpan.textContent.trim().replace(',', '')) : 0;
                const adj = adjustSpan ? parseFloat(adjustSpan.textContent.trim().replace(',', '')) : 0;
                const total = totalSpan ? parseFloat(totalSpan.textContent.trim().replace(',', '')) : 0;
                const fpg = fpgSpan ? parseFloat(fpgSpan.textContent.trim()) : 0;

                // Additional stats
                const gpElement = cells[4];
                const hitElement = cells[5];
                const tpElement = cells[6];
                const wwElement = cells[7];
                const pblElement = cells.length > 8 ? cells[8] : null;

                return {
                    teamId,
                    teamName,
                    fantasyPoints: fpts,
                    adjustments: adj,
                    totalPoints: total,
                    fantasyPointsPerGame: fpg,
                    gamesPlayed: gpElement ? parseInt(gpElement.textContent.trim()) : 0,
                    hittingPoints: hitElement ? parseFloat(hitElement.textContent.trim().replace(',', '')) : 0,
                    teamPitchingPoints: tpElement ? parseFloat(tpElement.textContent.trim().replace(',', '')) : 0,
                    waiverPosition: wwElement ? parseInt(wwElement.textContent.trim()) : 0,
                    projectedBudgetLeft: pblElement ? parseFloat(pblElement.textContent.trim().replace(',', '')) : 0
                };
            });

            // Extract hitting stats
            const hittingStats = extractTableData('.standings-table-wrapper--pointsbased3, .standings-table-wrapper--statistics-hitting', (row) => {
                // Check if this is a hitting stats table by looking for hitting-specific columns
                const headerRow = row.closest('table')?.querySelector('thead tr');
                if (headerRow && !headerRow.textContent.includes('R') && !headerRow.textContent.includes('HR')) {
                    return null;
                }

                // Check if this row contains a team
                const teamElement = row.querySelector('a[href*="teamId="]');
                if (!teamElement) return null;

                // Extract team ID from href
                const teamIdMatch = teamElement.href.match(/teamId=([^&]+)/);
                if (!teamIdMatch) return null;

                const teamId = teamIdMatch[1];
                const teamName = teamElement.textContent.trim();

                // Find the cells
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length < 10) return null;

                // Extract hitting stats (adjusted for the HTML structure)
                // These indices might need adjustment
                const runsIdx = 2;
                const singlesIdx = 3;
                const doublesIdx = 4;
                const triplesIdx = 5;
                const hrsIdx = 6;
                const rbiIdx = 7;
                const bbIdx = 8;
                const sbIdx = 9;
                const csIdx = 10;

                return {
                    teamId,
                    teamName,
                    runs: parseInt(cells[runsIdx]?.textContent.trim()) || 0,
                    singles: parseInt(cells[singlesIdx]?.textContent.trim()) || 0,
                    doubles: parseInt(cells[doublesIdx]?.textContent.trim()) || 0,
                    triples: parseInt(cells[triplesIdx]?.textContent.trim()) || 0,
                    homeRuns: parseInt(cells[hrsIdx]?.textContent.trim()) || 0,
                    runsBattedIn: parseInt(cells[rbiIdx]?.textContent.trim()) || 0,
                    walks: parseInt(cells[bbIdx]?.textContent.trim()) || 0,
                    stolenBases: parseInt(cells[sbIdx]?.textContent.trim()) || 0,
                    caughtStealing: parseInt(cells[csIdx]?.textContent.trim()) || 0
                };
            }).filter(stats => stats && stats.runs > 0); // Filter to make sure we only get hitting stats

            // Extract pitching stats
            const pitchingStats = extractTableData('.standings-table-wrapper--pointsbased3, .standings-table-wrapper--statistics-team-pitching', (row) => {
                // Check if this is a pitching stats table by looking for pitching-specific columns
                const headerRow = row.closest('table')?.querySelector('thead tr');
                if (headerRow && !headerRow.textContent.includes('IP') && !headerRow.textContent.includes('ER')) {
                    return null;
                }

                // Check if this row contains a team
                const teamElement = row.querySelector('a[href*="teamId="]');
                if (!teamElement) return null;

                // Extract team ID from href
                const teamIdMatch = teamElement.href.match(/teamId=([^&]+)/);
                if (!teamIdMatch) return null;

                const teamId = teamIdMatch[1];
                const teamName = teamElement.textContent.trim();

                // Find the cells
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length < 6) return null;

                // Extract pitching stats (adjusted for the HTML structure)
                // These indices might need adjustment
                const winsIdx = 2;
                const ipIdx = 3;
                const erIdx = 4;
                const hbbIdx = 5;
                const kIdx = 6;

                return {
                    teamId,
                    teamName,
                    wins: parseInt(cells[winsIdx]?.textContent.trim()) || 0,
                    inningsPitched: cells[ipIdx]?.textContent.trim() || '0',
                    earnedRuns: parseInt(cells[erIdx]?.textContent.trim()) || 0,
                    hitsPlusWalks: parseInt(cells[hbbIdx]?.textContent.trim()) || 0,
                    strikeouts: parseInt(cells[kIdx]?.textContent.trim()) || 0
                };
            }).filter(stats => stats && stats.inningsPitched !== '0'); // Filter to make sure we only get pitching stats

            // Return all collected data
            return {
                seasonStats,
                hittingStats,
                pitchingStats
            };
        });

        console.log(`Scraped stats data: ${stats.seasonStats.length} season stats, ${stats.hittingStats.length} hitting stats, ${stats.pitchingStats.length} pitching stats`);
        return stats;
    } catch (error) {
        console.error('Error scraping season stats:', error);
        throw error;
    }
}

module.exports = {
    scrapeSeasonStats
};