const { takeScreenshot } = require('../utils/browser');
const { FANTRAX_BASE_URL } = require('../auth');
const fs = require('fs-extra');
const path = require('path');

/**
 * Scrape roster data for all teams in a league for specified periods
 * @param {Page} page - Puppeteer page object
 * @param {string} leagueId - Fantrax league ID
 * @param {Array<Object>} teams - Array of team objects from database
 * @param {Object} dbService - Database service instance
 * @param {number} seasonId - Season ID from database
 * @param {number} maxPeriods - Maximum number of periods to scrape (for testing)
 * @returns {Promise<Array>} - Array of roster data for all teams and periods
 */
async function scrapeLeagueRosters(page, leagueId, teams, dbService, seasonId, maxPeriods = 1) {
    console.log(`Scraping rosters for league ${leagueId}, season ID ${seasonId}, max periods: ${maxPeriods}`);
    const allRosterData = [];

    try {
        // Get all schedule entries for this season to determine max period number
        const schedule = await dbService.schedule.getScheduleBySeason(seasonId);

        // Extract unique period numbers from schedule
        const periodNumbers = [...new Set(schedule.map(entry => parseInt(entry.period_number, 10)))];

        // Sort period numbers and filter out any non-numeric periods (like playoff periods)
        const regularPeriods = periodNumbers
            .filter(period => !isNaN(period))
            .sort((a, b) => a - b);

        console.log(`Found ${regularPeriods.length} regular season periods in the schedule data`);

        if (regularPeriods.length === 0) {
            console.warn('No regular season periods found in schedule. Make sure to scrape schedule data first.');
            return allRosterData;
        }

        // Get the maximum period number
        const maxPeriodNumber = regularPeriods[regularPeriods.length - 1];

        // Calculate how many periods to actually scrape
        const periodsToScrape = Math.min(maxPeriodNumber, maxPeriods);
        console.log(`Will scrape ${periodsToScrape} periods for each team (out of ${maxPeriodNumber} total periods)`);

        // Process each team
        for (const team of teams) {
            console.log(`Processing team: ${team.name} (ID: ${team.team_id})`);

            // Scrape each period for this team
            for (let period = 1; period <= periodsToScrape; period++) {
                console.log(`Scraping period ${period} for team ${team.name}`);

                try {
                    const rosterData = await scrapeTeamRoster(page, leagueId, team.team_id, period);

                    // Add team and period information
                    rosterData.teamId = team.id; // Database ID
                    rosterData.fantraxTeamId = team.team_id; // Fantrax ID
                    rosterData.periodNumber = period;
                    rosterData.seasonId = seasonId; // Add the season ID

                    allRosterData.push(rosterData);

                    // Brief pause between requests to avoid rate limiting
                    // Use setTimeout instead of page.waitForTimeout
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (periodError) {
                    console.error(`Error scraping period ${period} for team ${team.name}:`, periodError);
                    // Continue with next period
                }
            }
        }

        console.log(`Successfully scraped ${allRosterData.length} team roster periods`);
        return allRosterData;
    } catch (error) {
        console.error('Error scraping league rosters:', error);
        throw error;
    }
}

/**
 * Scrape roster data for a team in a specific period
 * @param {Page} page - Puppeteer page object
 * @param {string} leagueId - Fantrax league ID
 * @param {string} teamId - Fantrax team ID
 * @param {number} period - Period number
 * @returns {Promise<Array>} - Array of roster data for the team
 */
async function scrapeTeamRoster(page, leagueId, teamId, period) {
    console.log(`Scraping roster for league: ${leagueId}, team: ${teamId}, period: ${period}`);

    try {
        // Navigate to the team roster page for the specified period
        const url = `${FANTRAX_BASE_URL}/fantasy/league/${leagueId}/team/roster;period=${period};teamId=${teamId}`;
        console.log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Wait for content to load properly
        await page.waitForSelector('app-league-team-roster', { timeout: 15000 });

        // Take a screenshot for debugging
        // await takeScreenshot(page, `roster-team-${teamId}-period-${period}`);

        // Save the HTML content for debugging
        // const content = await page.content();
        // const debugDir = path.join(__dirname, '../../data/debug');
        // fs.ensureDirSync(debugDir);
        // await fs.writeFile(path.join(debugDir, `roster-page-${teamId}-period-${period}.html`), content);
        // console.log('Saved HTML content for debugging');

        // Extract roster data using page.evaluate
        const rosterData = await page.evaluate(() => {
            // Function to normalize player names for better matching
            function normalizePlayerName(name) {
                if (!name) return '';

                // Convert to lowercase and normalize Unicode
                let normalized = name.toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, ''); // Remove diacritical marks

                // Remove common suffixes and prefixes
                normalized = normalized
                    .replace(/\s+jr\.?$|\s+sr\.?$|\s+ii$|\s+iii$|\s+iv$/, '') // Remove suffixes like Jr., Sr., III
                    .replace(/^the\s+/, ''); // Remove "The" prefix

                // Remove punctuation and ensure single spaces
                normalized = normalized
                    .replace(/[.,''"\-]/g, '')  // Remove punctuation
                    .replace(/\s+/g, ' ')      // Ensure single spaces
                    .trim();                    // Remove leading/trailing spaces

                return normalized;
            }

            // Function to extract the roster slot index within a position
            function getRosterSlotIndex(posElement) {
                // Try to find all positional elements with the same position code
                const positionCode = posElement.textContent.trim();
                const allSamePosition = Array.from(document.querySelectorAll('button'))
                    .filter(btn => btn.textContent.trim() === positionCode);

                // Find the index of this element within its position group
                return allSamePosition.indexOf(posElement) + 1;
            }

            // Extract team info
            const teamInfo = {
                teamName: document.querySelector('.league-team-select__list h5')?.textContent.trim() || 'Unknown Team',
                record: document.querySelector('.league-team-select__list p b')?.textContent.trim() || '',
                rank: document.querySelector('.league-team-select__list p span b')?.textContent.trim() || '',
                managerName: document.querySelector('.league-team-select__pill')?.textContent.trim() || 'Unknown Manager'
            };

            // Get period info
            const periodText = document.querySelector('mat-select[aria-labelledby="mat-mdc-form-field-label-1"] .mat-mdc-select-value-text')?.textContent.trim() || '';

            // Extract players from the roster table
            const players = [];

            // Process hitting players
            const hittingRows = Array.from(document.querySelectorAll('ultimate-table:nth-of-type(1) aside > td'));

            hittingRows.forEach((row, index) => {
                // Skip empty rows
                if (row.querySelector('mark')) return;

                // Extract position information
                const positionElement = row.querySelector('button');
                if (!positionElement) return;

                const positionCode = positionElement.textContent.trim();
                const rosterSlot = getRosterSlotIndex(positionElement);
                const isActive = !row.classList.contains('row--amber') && !row.classList.contains('row--red');

                // Extract player information
                const playerElement = row.querySelector('.scorer');
                if (!playerElement) return;

                const playerName = playerElement.querySelector('.scorer__info__name a')?.textContent.trim() || '';
                const positionsText = playerElement.querySelector('.scorer__info__positions span')?.textContent.trim() || '';

                // Extract MLB team
                const teamSpan = playerElement.querySelector('.scorer__info__positions span[class*="mat-mdc-tooltip-trigger"]');
                const mlbTeam = teamSpan ? teamSpan.textContent.trim().replace(/^-\s*/, '') : '';

                // Extract player URL to get Fantrax ID
                const playerLink = playerElement.querySelector('.scorer__info__name a');
                let fantraxPlayerId = '';
                if (playerLink) {
                    const onclick = playerLink.getAttribute('onclick') || '';
                    const hrefMatch = playerLink.getAttribute('href')?.match(/player\/([^\/;]+)/) || [];
                    fantraxPlayerId = hrefMatch[1] || '';
                }

                // Extract batting side 
                const batIcon = playerElement.querySelector('.scorer-icon--BAT_LEFT, .scorer-icon--BAT_RIGHT, .scorer-icon--BAT_SWITCH');
                let batSide = '';
                if (batIcon) {
                    if (batIcon.classList.contains('scorer-icon--BAT_LEFT')) batSide = 'L';
                    else if (batIcon.classList.contains('scorer-icon--BAT_RIGHT')) batSide = 'R';
                    else if (batIcon.classList.contains('scorer-icon--BAT_SWITCH')) batSide = 'S';
                }

                // Get stats from the corresponding row in the table
                const statsRow = document.querySelector(`ultimate-table:nth-of-type(1) ._ut__content tr:nth-child(${index + 1})`);

                const stats = {
                    fantasyPoints: parseInt(statsRow?.querySelector('td:nth-child(2) span')?.textContent || '0', 10),
                    fpg: parseFloat(statsRow?.querySelector('td:nth-child(3) span')?.textContent || '0')
                };

                const player = {
                    type: 'hitter',
                    playerName,
                    normalizedName: normalizePlayerName(playerName),
                    positionCode,
                    rosterSlot,
                    isActive,
                    positionsEligible: positionsText,
                    mlbTeam,
                    batSide,
                    fantraxPlayerId,
                    fantasyPoints: stats.fantasyPoints,
                    fpg: stats.fpg
                };

                players.push(player);
            });

            // Process team pitching
            const pitchingRows = Array.from(document.querySelectorAll('ultimate-table:nth-of-type(2) aside > td'));

            pitchingRows.forEach((row, index) => {
                // Skip empty rows
                if (row.querySelector('mark')) return;

                // Extract position information
                const positionElement = row.querySelector('button');
                if (!positionElement) return;

                const positionCode = positionElement.textContent.trim();
                const rosterSlot = getRosterSlotIndex(positionElement);
                const isActive = !row.classList.contains('row--amber') && !row.classList.contains('row--red');

                // Extract team pitching information
                const teamElement = row.querySelector('.scorer');
                if (!teamElement) return;

                const teamName = teamElement.querySelector('.scorer__info__name a')?.textContent.trim() || '';

                // Get stats from the corresponding row in the table
                const statsRow = document.querySelector(`ultimate-table:nth-of-type(2) ._ut__content tr:nth-child(${index + 1})`);

                const stats = {
                    fantasyPoints: parseInt(statsRow?.querySelector('td:nth-child(2) span')?.textContent || '0', 10),
                    fpg: parseFloat(statsRow?.querySelector('td:nth-child(3) span')?.textContent || '0')
                };

                const player = {
                    type: 'teamPitching',
                    playerName: teamName,
                    normalizedName: normalizePlayerName(teamName),
                    positionCode,
                    rosterSlot,
                    isActive,
                    positionsEligible: 'TmP',
                    mlbTeam: teamName.replace('NY ', 'New York '),  // Convert team name to proper form
                    fantasyPoints: stats.fantasyPoints,
                    fpg: stats.fpg
                };

                players.push(player);
            });

            return {
                teamInfo,
                periodText,
                players
            };
        });

        // Process and adjust the scraped data
        if (rosterData && rosterData.players) {
            console.log(`Scraped ${rosterData.players.length} roster entries for ${rosterData.teamInfo.teamName}`);
            return rosterData;
        } else {
            console.log('No roster data found');
            return { players: [] };
        }
    } catch (error) {
        console.error('Error scraping roster:', error);
        throw error;
    }
}

module.exports = {
    scrapeTeamRoster,
    scrapeLeagueRosters
};