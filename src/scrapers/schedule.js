// Modified scrapeSchedule function with updated playoff handling
const { takeScreenshot } = require('../utils/browser');
const { FANTRAX_BASE_URL } = require('../auth');
const fs = require('fs-extra');
const path = require('path');

/**
 * Scrapes the full season schedule for a league
 * @param {Page} page - Puppeteer page object
 * @param {string} leagueId - Fantrax league ID 
 * @returns {Promise<Array>} - Array of schedule data
 */
async function scrapeSchedule(page, leagueId) {
    console.log(`Scraping schedule for league: ${leagueId}`);

    try {
        // Navigate to the fantasy matchups page
        const url = `${FANTRAX_BASE_URL}/newui/fantasy/fantasyMatchups.go?leagueId=${leagueId}`;
        console.log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Take a screenshot
        await takeScreenshot(page, 'schedule-page');

        // Save the HTML content for debugging
        const content = await page.content();
        const debugDir = path.join(__dirname, '../data/debug');
        fs.ensureDirSync(debugDir);
        await fs.writeFile(path.join(debugDir, `schedule-page-${leagueId}.html`), content);
        console.log('Saved HTML content for debugging');

        console.log('Extracting schedule data...');

        // First check if we're on the correct page
        const pageTitle = await page.title();
        console.log(`Page title: ${pageTitle}`);

        // Check if main container exists
        const containerExists = await page.evaluate(() => {
            const container = document.querySelector('#container, .fantasyMainContainer, .main');
            return !!container;
        });

        if (!containerExists) {
            console.error('Cannot find main container on the page. Page might not have loaded correctly.');
            return [];
        }

        // Check if we need to change the URL format for older seasons
        const isOldLayout = await page.evaluate(() => {
            return !!document.querySelector('.fantasyMainContainer');
        });

        console.log(`Page layout: ${isOldLayout ? 'Old' : 'New'}`);

        // First try to get any scoring period containers
        const hasScoringPeriods = await page.evaluate(() => {
            const scoringPeriods = document.querySelectorAll('.statsContainer2');
            return scoringPeriods.length > 0;
        });

        console.log(`Found scoring periods: ${hasScoringPeriods}`);

        // Extract schedule data using page.evaluate
        const scheduleData = await page.evaluate((leagueId) => {
            // Initialize array to hold all matchups
            const allMatchups = [];

            // Try multiple selectors for season information
            let seasonText = '';
            const seasonSelectors = [
                '.contentMainTabsContainer h3',
                '.fx-headline h4',
                '.titleBarContainer h3',
                '.content__headline + h3'
            ];

            for (const selector of seasonSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    seasonText = element.textContent.trim();
                    break;
                }
            }

            // Try multiple selectors for scoring period containers
            const scoringPeriodSelectors = [
                '.statsContainer2',
                '.rosterArea2',
                '.fantasyMatchups'
            ];

            let scoringPeriods = [];

            for (const selector of scoringPeriodSelectors) {
                const elements = document.querySelectorAll(selector);
                if (elements && elements.length > 0) {
                    scoringPeriods = Array.from(elements);
                    break;
                }
            }

            if (scoringPeriods.length === 0) {
                // Try to find any tables
                const tables = document.querySelectorAll('table');
                if (tables.length > 0) {
                    // Create synthetic containers for each table
                    const tablesArray = Array.from(tables);
                    scoringPeriods = tablesArray.map(table => {
                        // Find closest header or create temporary container
                        const header = table.closest('div').querySelector('h4, h3, h2, .title') || { textContent: 'Unknown Period' };
                        const container = document.createElement('div');
                        container.appendChild(header.cloneNode(true));
                        container.appendChild(table.cloneNode(true));
                        return container;
                    });
                }
            }

            // If we still have no scoring periods, return empty array
            if (scoringPeriods.length === 0) {
                return {
                    matchups: allMatchups,
                    debug: {
                        hasScoringPeriods: false,
                        seasonText,
                        containerCount: document.querySelectorAll('.statsContainer2').length,
                        tableCount: document.querySelectorAll('table').length
                    }
                };
            }

            // Track the last period number for reference
            let lastRegularPeriodNumber = 0;

            // Track playoff rounds for determining Championship vs Playoff
            let playoffRound = 0;

            // Process each scoring period
            scoringPeriods.forEach((periodContainer, index) => {
                try {
                    // Try multiple selectors for period title
                    let periodHeader = '';
                    let periodDates = '';

                    const titleSelectors = [
                        '.fantasyHeaderItem p.title',
                        '.fantasyHeaderBlock2 .title',
                        'h4.title',
                        '.title'
                    ];

                    for (const selector of titleSelectors) {
                        const element = periodContainer.querySelector(selector);
                        if (element) {
                            periodHeader = element.textContent.trim();
                            // Try to find the date span
                            const dateSpan = element.querySelector('span');
                            if (dateSpan) {
                                periodDates = dateSpan.textContent.trim();
                            }
                            break;
                        }
                    }

                    // If we couldn't find a title, use the container index
                    if (!periodHeader) {
                        periodHeader = `Period ${index + 1}`;
                    }

                    // Check if this is a playoff period
                    const isPlayoff = periodHeader.toLowerCase().includes('playoff');

                    // Extract period number
                    let periodNumber = '';
                    let periodType = isPlayoff ? 'Playoff' : 'Regular Season';

                    if (periodHeader.includes('Scoring Period')) {
                        // Regular season period
                        periodNumber = periodHeader.match(/Scoring Period (\d+)/)?.[1] || '';
                        lastRegularPeriodNumber = parseInt(periodNumber, 10);
                    } else if (periodHeader.includes('Round')) {
                        // Playoff round - using just the number as requested
                        // Extract the round number
                        const playoffRoundMatch = periodHeader.match(/Round (\d+)/);
                        if (playoffRoundMatch) {
                            playoffRound = parseInt(playoffRoundMatch[1], 10);

                            // Set the period number to continue from regular season
                            // For example, if last regular period was 25, first playoff would be 26
                            periodNumber = (lastRegularPeriodNumber + playoffRound).toString();

                            // Set period type based on round as requested
                            if (playoffRound === 1) {
                                periodType = 'Playoff';
                            } else if (playoffRound === 2) {
                                periodType = 'Championship';
                            } else {
                                // Handle additional rounds if they exist
                                periodType = 'Playoff';
                            }
                        } else {
                            // Fallback if we can't parse the round number
                            periodNumber = `${lastRegularPeriodNumber + index + 1}`;
                            periodType = 'Playoff';
                        }
                    } else if (/Period \d+/.test(periodHeader)) {
                        periodNumber = periodHeader.match(/Period (\d+)/)[1];
                    } else {
                        periodNumber = `${index + 1}`;
                    }

                    // Clean up dates
                    const dateRange = periodDates.replace(/\(|\)/g, '').trim();

                    // Try multiple selectors for matchup rows
                    const matchupRowSelectors = [
                        'tr.matchupRow',
                        'tr:not(:first-child)',
                        '.fantasyMatchups tr:not(:first-child)'
                    ];

                    let matchupRows = [];

                    for (const selector of matchupRowSelectors) {
                        const elements = periodContainer.querySelectorAll(selector);
                        if (elements && elements.length > 0) {
                            matchupRows = Array.from(elements);
                            break;
                        }
                    }

                    // If we found a table but no rows, try to get rows directly
                    if (matchupRows.length === 0 && periodContainer.tagName === 'TABLE') {
                        matchupRows = Array.from(periodContainer.querySelectorAll('tr')).slice(1); // Skip header row
                    }

                    // Process each matchup
                    matchupRows.forEach((row) => {
                        try {
                            // Skip "To be Determined" matchups and header rows
                            if (row.textContent.includes('To be Determined') ||
                                row.textContent.includes('Away') ||
                                row.textContent.includes('Home') ||
                                row.cells.length < 2) {
                                return;
                            }

                            // Try multiple selectors for team cells
                            let awayCell, homeCell;

                            if (row.classList.contains('matchupRow')) {
                                // Standard format
                                awayCell = row.querySelector('td.tm1');
                                homeCell = row.querySelector('td.tm2');
                            } else if (row.cells.length >= 3) {
                                // Alternative format with 3+ cells
                                awayCell = row.cells[0];
                                homeCell = row.cells[2];
                            } else if (row.cells.length === 2) {
                                // Simple two-column format
                                awayCell = row.cells[0];
                                homeCell = row.cells[1];
                            }

                            if (!awayCell || !homeCell) {
                                return; // Skip if we can't find team cells
                            }

                            // Get team information
                            const awayTeamName = awayCell.querySelector('a')?.textContent?.trim() || awayCell.textContent.trim();
                            const awayTeamId = awayCell.querySelector('a')?.href?.match(/teamId=([^&]+)/)?.[1] || '';

                            const homeTeamName = homeCell.querySelector('a')?.textContent?.trim() || homeCell.textContent.trim();
                            const homeTeamId = homeCell.querySelector('a')?.href?.match(/teamId=([^&]+)/)?.[1] || '';

                            // Create matchup object
                            const matchup = {
                                leagueId,
                                season: seasonText.trim() || 'Unknown',
                                periodNumber,
                                periodType,
                                dateRange: dateRange || 'Unknown',
                                awayTeamName,
                                awayTeamId,
                                homeTeamName,
                                homeTeamId,
                                matchupId: `${awayTeamId}_${homeTeamId}`
                            };

                            allMatchups.push(matchup);
                        } catch (rowError) {
                            // Skip problematic rows but continue processing
                            console.error('Error processing matchup row:', rowError);
                        }
                    });
                } catch (periodError) {
                    // Skip problematic periods but continue processing
                    console.error('Error processing scoring period:', periodError);
                }
            });

            return {
                matchups: allMatchups,
                debug: {
                    hasScoringPeriods: true,
                    periodCount: scoringPeriods.length,
                    seasonText
                }
            };
        }, leagueId);

        // Log debug information
        console.log('Debug info:', scheduleData.debug);

        // Return just the matchups array
        const matchups = scheduleData.matchups || [];
        console.log(`Scraped ${matchups.length} matchups from schedule`);
        return matchups;
    } catch (error) {
        console.error('Error scraping schedule:', error);
        throw error;
    }
}

module.exports = {
    scrapeSchedule
};