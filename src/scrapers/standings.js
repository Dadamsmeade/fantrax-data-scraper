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

    // Add this before your page.evaluate() calls
    page.on('console', msg => {
        console.log(`BROWSER: ${msg.text()}`);
    });

    try {
        // Navigate to the standings page
        const url = `${FANTRAX_BASE_URL}/fantasy/league/${leagueId}/standings`;
        console.log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Add a delay to ensure Angular has time to render components
        console.log('Waiting for page to fully render...');
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 30000)));

        // Take a screenshot
        await takeScreenshot(page, 'standings-page');

        // Save the HTML content for debugging
        const content = await page.content();
        const debugDir = path.join(__dirname, '../../data/debug');
        fs.ensureDirSync(debugDir);
        await fs.writeFile(path.join(debugDir, `standings-page-${leagueId}.html`), content);
        console.log('Saved HTML content for debugging');

        // Log DOM hierarchy to understand the structure
        const domStructure = await page.evaluate(() => {
            // Find the ultimate table
            const table = document.querySelector('.ultimate-table');
            if (!table) return { error: 'No ultimate table found' };

            // Check if we have a section with aside
            const section = table.querySelector('section');
            if (!section) return { error: 'No section found in ultimate table' };

            const aside = section.querySelector('aside');
            if (!aside) return { error: 'No aside found in section' };

            // Log what classes and children the aside has
            return {
                asideChildCount: aside.childElementCount,
                tdCount: aside.querySelectorAll('td').length,
                teamLinkCount: aside.querySelectorAll('a[href*="teamId="]').length,
                rankCount: aside.querySelectorAll('b').length,
                allTeamRows: [...aside.children].map(child => {
                    const teamLink = child.querySelector('a[href*="teamId="]');
                    const rankEl = child.querySelector('b');
                    return {
                        tagName: child.tagName,
                        hasTeamLink: !!teamLink,
                        teamName: teamLink ? teamLink.textContent.trim() : null,
                        hasRank: !!rankEl,
                        rankText: rankEl ? rankEl.textContent.trim() : null
                    };
                })
            };
        });

        console.log('DOM Structure:', JSON.stringify(domStructure, null, 2));

        // Extract standings data using page.evaluate with improved row selection
        const standingsData = await page.evaluate(() => {
            const standings = [];

            // Try to get all team rows using a more inclusive selector
            const container = document.querySelector('.ultimate-table section aside');
            if (!container) {
                console.error('Could not find team container');
                return standings;
            }

            // Get all direct children of the aside element that could be team rows
            const teamRows = Array.from(document.querySelectorAll('.ultimate-table section aside td'));
            console.log(`Found ${teamRows.length} potential team rows`);

            // Process each potential team row
            for (let i = 0; i < teamRows.length; i++) {
                try {
                    const row = teamRows[i];

                    // Skip if this is not a TD element
                    if (row.tagName !== 'TD') {
                        console.log(`Skipping non-TD element at index ${i}`);
                        continue;
                    }

                    // Get team rank from any B element
                    const rankElement = row.querySelector('b');
                    const rank = rankElement ? rankElement.textContent.trim() : '';

                    // Get team name and ID from the link
                    const teamLink = row.querySelector('a[href*="teamId="]');
                    if (!teamLink) {
                        console.warn(`No team link found in row ${i}`);
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

                    console.log(`Processing team: ${teamName} (${teamId}), rank: ${rank}`);

                    // Get the corresponding data row
                    // The dataRowIndex is the actual index of this team row among TD elements
                    const dataRowIndex = Array.from(document.querySelectorAll('.ultimate-table section aside td')).indexOf(row);
                    console.log(`Data row index for ${teamName}: ${dataRowIndex}`);

                    if (dataRowIndex === -1) {
                        console.warn(`Could not determine data row index for team ${teamName}`);
                        continue;
                    }

                    // Get data cells for this team
                    const dataRowCells = Array.from(document.querySelectorAll(`.ultimate-table > section > div > table > tr:nth-child(${dataRowIndex + 2}) > td`));

                    if (dataRowCells.length < 9) {
                        console.warn(`Not enough data cells for team ${teamName}, found ${dataRowCells.length}`);
                        continue;
                    }

                    // Extract data from cells (use try/catch for each to handle potential issues)
                    let wins = 0, losses = 0, ties = 0, winPercentage = 0, divisionRecord = '',
                        gamesBack = 0, waiverPosition = 0, fantasyPointsFor = 0, fantasyPointsAgainst = 0, streak = '';

                    try {
                        wins = parseInt(dataRowCells[0]?.textContent.trim()) || 0;
                        losses = parseInt(dataRowCells[1]?.textContent.trim()) || 0;
                        ties = parseInt(dataRowCells[2]?.textContent.trim()) || 0;

                        const winPctText = dataRowCells[3]?.textContent.trim() || '0';
                        winPercentage = parseFloat(winPctText.replace('.', '0.')) || 0;

                        divisionRecord = dataRowCells[4]?.textContent.trim() || '';
                        gamesBack = parseFloat(dataRowCells[5]?.textContent.trim()) || 0;
                        waiverPosition = parseInt(dataRowCells[6]?.textContent.trim()) || 0;

                        let fptsForText = dataRowCells[7]?.textContent.trim() || '0';
                        let fptsAgainstText = dataRowCells[8]?.textContent.trim() || '0';

                        fptsForText = fptsForText.replace(/,/g, '');
                        fptsAgainstText = fptsAgainstText.replace(/,/g, '');

                        fantasyPointsFor = parseFloat(fptsForText) || 0;
                        fantasyPointsAgainst = parseFloat(fptsAgainstText) || 0;

                        streak = dataRowCells[9]?.textContent.trim() || '';
                    } catch (dataError) {
                        console.error(`Error extracting data for team ${teamName}:`, dataError.message);
                    }

                    console.log(`Stats: ${wins}-${losses}-${ties}, FPts: ${fantasyPointsFor}, FPtsA: ${fantasyPointsAgainst}`);

                    standings.push({
                        teamId,
                        teamName,
                        rank,
                        wins,
                        losses,
                        ties,
                        winPercentage,
                        divisionRecord,
                        gamesBack,
                        waiverPosition,
                        fantasyPointsFor,
                        fantasyPointsAgainst,
                        streak
                    });
                } catch (error) {
                    console.error(`Error processing team row ${i}:`, error.message);
                }
            }

            // Sort by rank to ensure correct order
            return standings.sort((a, b) => {
                // Convert ranks to numbers for sorting
                const rankA = parseInt(a.rank) || 0;
                const rankB = parseInt(b.rank) || 0;
                return rankA - rankB;
            });
        });

        console.log(`Scraped standings data for ${standingsData.length} teams`);

        // Log all team ranks to verify we have all teams
        console.log('All team ranks:', standingsData.map(team => team.rank).join(', '));

        // Log some sample data to verify extraction
        if (standingsData.length > 0) {
            console.log('Sample data from first team:', JSON.stringify(standingsData[0], null, 2));
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