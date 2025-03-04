/**
 * Scrapes standings data for a specific league
 * @param {Page} page - Puppeteer page object
 * @param {string} leagueId - Fantrax league ID
 * @returns {Promise<Array>} - Array of standings data
 */
async function scrapeStandings(page, leagueId) {
    console.log(`Navigating to standings page for league: ${leagueId}`);

    // Navigate to the standings page
    await page.goto(`${FANTRAX_BASE_URL}/fantasy/league/${leagueId}/standings`,
        { waitUntil: 'networkidle2' });

    // Take a screenshot of the standings page
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'standings-page.png') });

    console.log('Scraping standings data...');

    // Extract the standings data using page.evaluate
    // IMPORTANT: Pass leagueId as a parameter to page.evaluate
    const standingsData = await page.evaluate((leagueId) => {
        // Initialize array to hold data
        const standings = [];

        // First get the league name and season
        const leagueName = document.querySelector('.fx-headline h4 span:last-child')?.textContent || '';
        const season = document.querySelector('.fx-headline h4')?.textContent?.split(leagueName)[0]?.trim() || '';

        // Find the standings table
        const teamElements = Array.from(document.querySelectorAll('aside._ut__aside td'));
        const statElements = Array.from(document.querySelectorAll('div._ut__content table tr'));

        if (teamElements.length > 0 && statElements.length > 0) {
            for (let i = 0; i < teamElements.length; i++) {
                const teamElement = teamElements[i];
                const statElement = statElements[i];

                if (!teamElement || !statElement) continue;

                // Extract team info
                const rank = teamElement.querySelector('b')?.textContent?.trim() || '';
                const teamName = teamElement.querySelector('a')?.textContent?.trim() || '';
                const teamId = teamElement.querySelector('a')?.href?.match(/teamId=([^&]+)/)?.[1] || '';
                const teamIconUrl = teamElement.querySelector('figure')?.style?.backgroundImage?.match(/url\\(\"([^\"]+)\"\\)/)?.[1] || '';

                // Extract stats
                const cells = Array.from(statElement.querySelectorAll('td'));
                const wins = cells[0]?.textContent?.trim() || '';
                const losses = cells[1]?.textContent?.trim() || '';
                const ties = cells[2]?.textContent?.trim() || '';
                const winPercentage = cells[3]?.textContent?.trim() || '';
                const divisionRecord = cells[4]?.textContent?.trim() || '';
                const gamesBack = cells[5]?.textContent?.trim() || '';
                const waiverWireOrder = cells[6]?.textContent?.trim() || '';
                const fantasyPointsFor = cells[7]?.textContent?.trim() || '';
                const fantasyPointsAgainst = cells[8]?.textContent?.trim() || '';
                const streak = cells[9]?.textContent?.trim() || '';

                // Add to standings array
                standings.push({
                    leagueId,
                    season,
                    leagueName,
                    rank,
                    teamName,
                    teamId,
                    teamIconUrl,
                    wins,
                    losses,
                    ties,
                    winPercentage,
                    divisionRecord,
                    gamesBack,
                    waiverWireOrder,
                    fantasyPointsFor,
                    fantasyPointsAgainst,
                    streak
                });
            }
        }

        return standings;
    }, leagueId); // Pass leagueId here

    console.log(`Scraped data for ${standingsData.length} teams`);
    return standingsData;
}