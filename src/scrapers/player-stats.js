const { takeScreenshot } = require('../utils/browser');
const { FANTRAX_BASE_URL } = require('../auth');
const fs = require('fs-extra');
const path = require('path');

/**
 * Scrapes player statistics for a team on a specific date
 * @param {Page} page - Puppeteer page object
 * @param {string} leagueId - Fantrax league ID
 * @param {string} teamId - Fantrax team ID 
 * @param {string} date - Date in format YYYY-MM-DD
 * @returns {Promise<Object>} - Object containing hitting and pitching stats
 */
async function scrapePlayerStats(page, leagueId, teamId, date) {
    console.log(`Scraping player stats for team: ${teamId} on date: ${date}`);

    try {
        // Construct the URL with date parameters
        const url = `${FANTRAX_BASE_URL}/fantasy/league/${leagueId}/team/roster;timeframeTypeCode=BY_DATE;startDate=${date};endDate=${date};teamId=${teamId}`;
        console.log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Give Angular time to render fully
        console.log('Waiting for page to fully render...');
        await page.waitForTimeout(5000);

        // Take a screenshot for debugging
        await takeScreenshot(page, `player-stats-${teamId}-${date}`);

        // Save the HTML content for debugging
        const content = await page.content();
        const debugDir = path.join(__dirname, '../../data/debug');
        fs.ensureDirSync(debugDir);
        await fs.writeFile(path.join(debugDir, `player-stats-${teamId}-${date}.html`), content);
        console.log('Saved HTML content for debugging');

        // Extract player stats from the page
        const stats = await page.evaluate(() => {
            // Helper function to safely get text content and parse numbers
            const parseNumeric = (element) => {
                if (!element) return 0;
                const text = element.textContent.trim();
                if (text === '' || text === '-') return 0;
                return parseFloat(text) || 0;
            };

            // Get the team name
            const teamNameElement = document.querySelector('h1 + div span');
            const teamName = teamNameElement ? teamNameElement.textContent.trim() : '';

            // Extract the period number
            let periodNumber = '';
            const periodSelector = document.querySelector('.filter-panel__row .mat-mdc-select-value-text span');
            if (periodSelector) {
                const periodText = periodSelector.textContent.trim();
                const periodMatch = periodText.match(/(\d+)/);
                if (periodMatch) {
                    periodNumber = periodMatch[1];
                }
            }

            // Process hitting players
            const hittingPlayers = [];

            // Find the hitting section
            const hittingRows = document.querySelectorAll('section > aside > td');

            hittingRows.forEach((row, index) => {
                // Skip headers, totals, and empty rows
                if (row.textContent.includes('Hitting') ||
                    row.textContent.includes('Team Pitching') ||
                    row.textContent.includes('Totals') ||
                    row.textContent.includes('Reserve spot(s) available')) {
                    return;
                }

                // Check if this is a player row
                const scorerElement = row.querySelector('.scorer');
                if (!scorerElement) return;

                // Get player name and position
                const nameElement = scorerElement.querySelector('.scorer__info__name a');
                if (!nameElement) return;

                const playerName = nameElement.textContent.trim();

                // Get MLB team and position
                const positionElement = scorerElement.querySelector('.scorer__info__positions');
                let positions = '';
                let mlbTeam = '';

                if (positionElement) {
                    // Get position
                    const posSpan = positionElement.querySelector('span');
                    if (posSpan) {
                        positions = posSpan.textContent.trim();
                    }

                    // Get MLB team
                    const teamSpan = positionElement.querySelector('span[aria-describedby*="cdk-describedby-message"]');
                    if (teamSpan) {
                        const teamText = teamSpan.textContent.trim();
                        // Extract team from format like " - NYY "
                        const teamMatch = teamText.match(/- ([A-Z]{2,4})/);
                        if (teamMatch) {
                            mlbTeam = teamMatch[1];
                        }
                    }
                }

                // Get the player's position in the lineup
                let positionPlayed = '';
                const positionButton = row.querySelector('button');
                if (positionButton) {
                    positionPlayed = positionButton.textContent.trim();
                }

                // Get player ID - Look for it in href
                let playerId = '';
                const playerLink = nameElement.closest('a');
                if (playerLink && playerLink.getAttribute('href')) {
                    const hrefMatch = playerLink.getAttribute('href').match(/playerId=([^&]+)/);
                    if (hrefMatch) {
                        playerId = hrefMatch[1];
                    }
                }

                // Determine if active or on bench (reserves/IR)
                const active = !row.closest('.row--amber') && !row.closest('.row--red') ? 1 : 0;

                // Get the index for data rows
                const dataRowIndex = index;

                // Get stats from the corresponding data row
                const dataRow = document.querySelector(`section > div > table > tr:nth-child(${dataRowIndex + 1})`);

                if (!dataRow) return; // Skip if no data row found

                const cells = dataRow.querySelectorAll('td');

                // Extract stats based on column positions in the table
                // These indexes might need adjustment based on the actual table structure
                const stats = {
                    fantasyPoints: cells.length > 0 ? parseNumeric(cells[0]) : 0,
                    fp_g: cells.length > 1 ? parseNumeric(cells[1]) : 0,
                    ab: cells.length > 2 ? parseNumeric(cells[2]) : 0,
                    h: cells.length > 3 ? parseNumeric(cells[3]) : 0,
                    r: cells.length > 4 ? parseNumeric(cells[4]) : 0,
                    singles: cells.length > 5 ? parseNumeric(cells[5]) : 0,
                    doubles: cells.length > 6 ? parseNumeric(cells[6]) : 0,
                    triples: cells.length > 7 ? parseNumeric(cells[7]) : 0,
                    hr: cells.length > 8 ? parseNumeric(cells[8]) : 0,
                    rbi: cells.length > 9 ? parseNumeric(cells[9]) : 0,
                    bb: cells.length > 10 ? parseNumeric(cells[10]) : 0,
                    sb: cells.length > 11 ? parseNumeric(cells[11]) : 0,
                    cs: cells.length > 12 ? parseNumeric(cells[12]) : 0,
                    gp: cells.length > 13 ? parseNumeric(cells[13]) : 0
                };

                // Create player object
                hittingPlayers.push({
                    playerId,
                    name: playerName,
                    mlbTeam,
                    positions,
                    positionPlayed,
                    active,
                    ...stats
                });
            });

            // Process pitching players
            const pitchingPlayers = [];

            // Find the team pitching row
            const pitchingContainer = Array.from(document.querySelectorAll('section > aside > td')).find(el =>
                el.textContent.includes('TmP')
            );

            if (pitchingContainer) {
                // Get the team name
                const teamElement = pitchingContainer.querySelector('.scorer__info__name a');
                const pitchingTeamName = teamElement ? teamElement.textContent.trim() : '';

                // Get the index for data row
                const pitchingRowIndex = Array.from(document.querySelectorAll('section > aside > td')).indexOf(pitchingContainer);

                // Get stats from the corresponding data row
                const pitchingDataRow = document.querySelector(`table:nth-of-type(2) > tr:nth-child(${pitchingRowIndex + 1})`);

                if (pitchingDataRow) {
                    const cells = pitchingDataRow.querySelectorAll('td');

                    // Extract pitching stats
                    const stats = {
                        fantasyPoints: cells.length > 0 ? parseNumeric(cells[0]) : 0,
                        fp_g: cells.length > 1 ? parseNumeric(cells[1]) : 0,
                        gp: cells.length > 2 ? parseNumeric(cells[2]) : 0,
                        wins: cells.length > 3 ? parseNumeric(cells[3]) : 0,
                        ip: cells.length > 4 ? (cells[4].textContent.trim() || '0') : '0',
                        hits_allowed: cells.length > 5 ? parseNumeric(cells[5]) : 0,
                        earned_runs: cells.length > 6 ? parseNumeric(cells[6]) : 0,
                        bb_allowed: cells.length > 7 ? parseNumeric(cells[7]) : 0,
                        h_plus_bb: cells.length > 8 ? parseNumeric(cells[8]) : 0,
                        strikeouts: cells.length > 9 ? parseNumeric(cells[9]) : 0
                    };

                    // Create pitching object
                    pitchingPlayers.push({
                        teamName: pitchingTeamName,
                        positionPlayed: 'TmP',
                        active: 1,
                        ...stats
                    });
                }
            }

            return {
                teamName,
                periodNumber,
                hittingPlayers,
                pitchingPlayers
            };
        });

        console.log(`Scraped ${stats.hittingPlayers.length} hitting players and ${stats.pitchingPlayers.length} pitching stats for ${stats.teamName}`);

        // Add metadata to the stats object
        stats.date = date;
        stats.teamId = teamId;
        stats.leagueId = leagueId;

        return stats;
    } catch (error) {
        console.error('Error scraping player stats:', error);
        throw error;
    }
}

/**
 * Scrapes daily player statistics for all teams in a league
 * @param {Page} page - Puppeteer page object
 * @param {string} leagueId - Fantrax league ID
 * @param {string} date - Date in format YYYY-MM-DD
 * @param {Array<Object>} teams - Array of team objects with id and name properties
 * @returns {Promise<Array>} - Array of player stats objects
 */
async function scrapeDailyPlayerStats(page, leagueId, date, teams) {
    console.log(`Scraping daily player stats for all teams on ${date}`);

    const allStats = [];

    for (const team of teams) {
        try {
            console.log(`Processing team: ${team.name} (${team.id})`);

            // Add a small delay between requests to avoid rate limiting
            await page.waitForTimeout(2000);

            const teamStats = await scrapePlayerStats(page, leagueId, team.id, date);
            allStats.push(teamStats);

            console.log(`Completed stats for team: ${team.name}`);
        } catch (error) {
            console.error(`Error processing team ${team.name}:`, error);
            // Continue with next team if one fails
        }
    }

    return allStats;
}

module.exports = {
    scrapePlayerStats,
    scrapeDailyPlayerStats
};