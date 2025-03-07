const dbService = require('./src/database');
const path = require('path');
const fs = require('fs-extra');

// Configuration
const SEASONS = ['2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017']; // Include all seasons
const OUTPUT_DIR = path.join(__dirname, 'data', 'analysis');

// Ensure output directory exists
fs.ensureDirSync(OUTPUT_DIR);

/**
 * Analyze manager performance across seasons
 */
async function analyzeManagerPerformance() {
    try {
        await dbService.initialize();
        console.log('Database connection established');

        // Get all managers
        const managers = await dbService.db.all(`
            SELECT * FROM managers ORDER BY name
        `);

        console.log(`Found ${managers.length} managers in the database`);

        // Initialize manager stats
        const managerStats = managers.map(manager => ({
            id: manager.id,
            name: manager.name,
            activeSince: manager.active_from,
            activeUntil: manager.active_until || 'Present',
            seasons: 0,
            wins: 0,
            losses: 0,
            ties: 0,
            winPercentage: 0,
            avgRank: 0,
            bestRank: { rank: 999, year: '' },
            worstRank: { rank: 0, year: '' },
            totalFantasyPoints: 0,
            avgFantasyPointsPerSeason: 0,
            seasonStats: [],
            rotoSeasons: 0  // Track number of roto-format seasons
        }));

        // Process each season
        for (const year of SEASONS) {
            const season = await dbService.seasons.getSeasonByYear(year);
            if (!season) {
                console.log(`No data for season ${year}, skipping...`);
                continue;
            }

            console.log(`Processing season ${year} (ID: ${season.id})...`);

            // Check if this is the 2020 season (special handling for roto format)
            const isRotoSeason = year === '2020';

            // Get teams for this season with manager info
            const teams = await dbService.db.all(`
                SELECT t.*, m.name as manager_name, m.id as manager_id
                FROM teams t
                LEFT JOIN managers m ON t.manager_id = m.id
                WHERE t.season_id = ?
            `, [season.id]);

            // Skip if no teams have manager assignments
            if (!teams.some(team => team.manager_id)) {
                console.log(`No manager assignments for season ${year}, skipping...`);
                continue;
            }

            // Get standings
            const standings = await dbService.standings.getStandingsBySeason(season.id);

            // Get season stats (important for 2020 roto season)
            const seasonStats = await dbService.seasonStats.getStatsBySeason(season.id);

            // Map standings and stats to teams/managers
            for (const team of teams) {
                if (!team.manager_id) continue;

                // Find the manager in our stats
                const managerStat = managerStats.find(ms => ms.id === team.manager_id);
                if (!managerStat) continue;

                // Find the team's standing
                const standing = standings.find(s => s.team_id === team.id);
                if (!standing) continue;

                // Find the team's season stats
                const stats = seasonStats.find(s => s.team_id === team.id);

                // Create season record with format designation
                const seasonRecord = {
                    year,
                    teamName: team.name,
                    rank: standing.rank,
                    wins: standing.wins,
                    losses: standing.losses,
                    ties: standing.ties,
                    winPercentage: standing.win_percentage,
                    fantasyPoints: stats ? stats.fantasy_points : 0,
                    format: isRotoSeason ? 'Roto' : 'Head-to-Head'
                };

                // Update manager stats
                managerStat.seasons++;

                // Only count wins/losses for head-to-head seasons
                if (!isRotoSeason) {
                    managerStat.wins += standing.wins;
                    managerStat.losses += standing.losses;
                    managerStat.ties += standing.ties;
                } else {
                    managerStat.rotoSeasons++;
                }

                managerStat.totalFantasyPoints += stats ? stats.fantasy_points : 0;

                // Track best and worst ranks
                if (standing.rank < managerStat.bestRank.rank) {
                    managerStat.bestRank = { rank: standing.rank, year };
                }
                if (standing.rank > managerStat.worstRank.rank) {
                    managerStat.worstRank = { rank: standing.rank, year };
                }

                // Add season record
                managerStat.seasonStats.push(seasonRecord);
            }
        }

        // Calculate averages and percentages
        for (const managerStat of managerStats) {
            if (managerStat.seasons > 0) {
                // Calculate win percentage (head-to-head seasons only)
                const totalGames = managerStat.wins + managerStat.losses + managerStat.ties;
                managerStat.winPercentage = totalGames > 0
                    ? ((managerStat.wins + (managerStat.ties * 0.5)) / totalGames).toFixed(3)
                    : 0;

                // Calculate average rank
                const totalRanks = managerStat.seasonStats.reduce((sum, season) => sum + season.rank, 0);
                managerStat.avgRank = (totalRanks / managerStat.seasons).toFixed(2);

                // Calculate average fantasy points per season
                managerStat.avgFantasyPointsPerSeason = (managerStat.totalFantasyPoints / managerStat.seasons).toFixed(2);

                // Format total fantasy points
                managerStat.totalFantasyPoints = managerStat.totalFantasyPoints.toFixed(2);

                // Add info about number of regular vs roto seasons
                managerStat.h2hSeasons = managerStat.seasons - managerStat.rotoSeasons;
            }

            // Sort season stats by year descending
            managerStat.seasonStats.sort((a, b) => parseInt(b.year) - parseInt(a.year));
        }

        // Sort managers by win percentage
        managerStats.sort((a, b) => b.winPercentage - a.winPercentage);

        // Generate summary
        const summary = {
            totalSeasons: SEASONS.length,
            analyzedSeasons: SEASONS.filter(year =>
                managerStats.some(m => m.seasonStats.some(s => s.year === year))
            ).length,
            managers: managerStats.map(m => ({
                name: m.name,
                activePeriod: `${m.activeSince}-${m.activeUntil}`,
                seasons: m.seasons,
                regularSeasons: m.h2hSeasons,
                rotoSeasons: m.rotoSeasons,
                record: `${m.wins}-${m.losses}-${m.ties}`,
                winPct: m.winPercentage,
                avgRank: m.avgRank,
                bestSeason: m.bestRank.rank < 999 ? `${m.bestRank.rank} (${m.bestRank.year})` : 'N/A',
                worstSeason: m.worstRank.rank > 0 ? `${m.worstRank.rank} (${m.worstRank.year})` : 'N/A',
                avgFantasyPoints: m.avgFantasyPointsPerSeason
            }))
        };

        // Save results
        const outputFile = path.join(OUTPUT_DIR, 'manager-analysis.json');
        const summaryFile = path.join(OUTPUT_DIR, 'manager-summary.json');

        await fs.writeFile(outputFile, JSON.stringify(managerStats, null, 2));
        await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));

        console.log(`Analysis saved to ${outputFile}`);
        console.log(`Summary saved to ${summaryFile}`);

        // Generate an HTML report for easier viewing
        await generateHtmlReport(managerStats, summary);

        // Print summary to console
        console.log('\n=== MANAGER PERFORMANCE SUMMARY ===\n');
        console.table(summary.managers);

        return { managerStats, summary };
    } catch (error) {
        console.error('Error analyzing manager performance:', error);
        throw error;
    } finally {
        await dbService.close();
    }
}

/**
 * Generate HTML report for manager analysis
 * @param {Array} managerStats - Full manager stats
 * @param {Object} summary - Summary data
 */
async function generateHtmlReport(managerStats, summary) {
    const htmlFile = path.join(OUTPUT_DIR, 'manager-analysis.html');

    let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Joe Buck Sucks Fantasy Baseball League - Manager Analysis</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
            }
            h1, h2, h3 {
                color: #1a237e;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px;
            }
            th, td {
                padding: 8px 10px;
                text-align: left;
                border-bottom: 1px solid #ddd;
            }
            th {
                background-color: #f5f5f5;
            }
            .manager {
                margin-bottom: 30px;
                border: 1px solid #ddd;
                border-radius: 5px;
                padding: 15px;
            }
            .roto-season {
                background-color: #f9f9ff;
            }
            .stat-highlight {
                font-weight: bold;
                color: #1a237e;
            }
            .chart-container {
                height: 300px;
                margin-bottom: 30px;
            }
        </style>
    </head>
    <body>
        <h1>Joe Buck Sucks Fantasy Baseball League - Manager Analysis</h1>
        
        <h2>Manager Performance Summary</h2>
        <table>
            <tr>
                <th>Manager</th>
                <th>Seasons</th>
                <th>Record</th>
                <th>Win %</th>
                <th>Avg Rank</th>
                <th>Best</th>
                <th>Worst</th>
                <th>Avg Points</th>
            </tr>
    `;

    // Add summary data rows sorted by average rank
    summary.managers
        .sort((a, b) => parseFloat(a.avgRank) - parseFloat(b.avgRank))
        .forEach(manager => {
            html += `
            <tr>
                <td>${manager.name}</td>
                <td>${manager.seasons} (${manager.regularSeasons} H2H, ${manager.rotoSeasons} Roto)</td>
                <td>${manager.record}</td>
                <td>${manager.winPct}</td>
                <td class="stat-highlight">${manager.avgRank}</td>
                <td>${manager.bestSeason}</td>
                <td>${manager.worstSeason}</td>
                <td>${parseFloat(manager.avgFantasyPoints).toLocaleString()}</td>
            </tr>
            `;
        });

    html += `
        </table>
        
        <h2>Individual Manager Profiles</h2>
    `;

    // Add detailed manager profiles
    managerStats
        .filter(manager => manager.seasons > 0)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(manager => {
            html += `
            <div class="manager">
                <h3>${manager.name}</h3>
                <p><strong>Active:</strong> ${manager.activeSince} - ${manager.activeUntil}</p>
                <p><strong>Seasons:</strong> ${manager.seasons} (${manager.h2hSeasons} Head-to-Head, ${manager.rotoSeasons} Roto)</p>
                <p><strong>Record:</strong> ${manager.wins}-${manager.losses}-${manager.ties} (${manager.winPercentage})</p>
                <p><strong>Average Rank:</strong> <span class="stat-highlight">${manager.avgRank}</span></p>
                <p><strong>Best Finish:</strong> ${manager.bestRank.rank < 999 ? `${manager.bestRank.rank} (${manager.bestRank.year})` : 'N/A'}</p>
                <p><strong>Worst Finish:</strong> ${manager.worstRank.rank > 0 ? `${manager.worstRank.rank} (${manager.worstRank.year})` : 'N/A'}</p>
                <p><strong>Average Fantasy Points:</strong> ${parseFloat(manager.avgFantasyPointsPerSeason).toLocaleString()}</p>
                
                <h4>Season by Season Results</h4>
                <table>
                    <tr>
                        <th>Year</th>
                        <th>Team</th>
                        <th>Rank</th>
                        <th>Record</th>
                        <th>Win %</th>
                        <th>Format</th>
                        <th>Fantasy Points</th>
                    </tr>
            `;

            manager.seasonStats.forEach(season => {
                const isRoto = season.format === 'Roto';

                html += `
                <tr class="${isRoto ? 'roto-season' : ''}">
                    <td>${season.year}</td>
                    <td>${season.teamName}</td>
                    <td>${season.rank}</td>
                    <td>${season.wins}-${season.losses}-${season.ties}</td>
                    <td>${season.winPercentage}</td>
                    <td>${season.format}</td>
                    <td>${parseFloat(season.fantasyPoints).toLocaleString()}</td>
                </tr>
                `;
            });

            html += `
                </table>
            </div>
            `;
        });

    html += `
    </body>
    </html>
    `;

    await fs.writeFile(htmlFile, html);
    console.log(`HTML report saved to ${htmlFile}`);
}

/**
 * Analyze head-to-head records between managers
 * Note: For 2020 season, we'll handle differently since it was roto format
 */
async function analyzeHeadToHeadRecords() {
    try {
        await dbService.initialize();
        console.log('Database connection established');

        // Get all managers
        const managers = await dbService.db.all(`
            SELECT * FROM managers ORDER BY name
        `);

        // Initialize head-to-head records
        const h2hRecords = {};
        managers.forEach(manager => {
            h2hRecords[manager.name] = {};
            managers.forEach(opponent => {
                if (manager.id !== opponent.id) {
                    h2hRecords[manager.name][opponent.name] = {
                        wins: 0,
                        losses: 0,
                        ties: 0,
                        pointsFor: 0,
                        pointsAgainst: 0,
                        matchupsAnalyzed: 0
                    };
                }
            });
        });

        // Process each season
        for (const year of SEASONS) {
            const season = await dbService.seasons.getSeasonByYear(year);
            if (!season) continue;

            // Skip 2020 season as it was roto format
            if (year === '2020') {
                console.log('Skipping 2020 season for head-to-head analysis (roto format)');
                continue;
            }

            console.log(`Analyzing head-to-head records for ${year} season...`);

            // Get all matchups for this season
            const matchups = await dbService.db.all(`
                SELECT 
                    s.period_number, s.period_type,
                    away.id as away_team_id, away.name as away_team_name, away_m.name as away_manager, away_m.id as away_manager_id,
                    home.id as home_team_id, home.name as home_team_name, home_m.name as home_manager, home_m.id as home_manager_id
                FROM schedule s
                JOIN teams away ON s.away_team_id = away.id
                JOIN teams home ON s.home_team_id = home.id
                LEFT JOIN managers away_m ON away.manager_id = away_m.id
                LEFT JOIN managers home_m ON home.manager_id = home_m.id
                WHERE s.season_id = ? AND away.manager_id IS NOT NULL AND home.manager_id IS NOT NULL
            `, [season.id]);

            console.log(`Found ${matchups.length} matchups for ${year} season`);

            // Get standings for this season for team records
            const standings = await dbService.db.all(`
                SELECT t.id as team_id, t.manager_id, st.wins, st.losses, st.ties, st.fantasy_points_for, st.fantasy_points_against
                FROM standings st
                JOIN teams t ON st.team_id = t.id
                WHERE st.season_id = ?
            `, [season.id]);

            // Create a map of team win-loss records for easier lookup
            const teamRecords = new Map();
            standings.forEach(record => {
                teamRecords.set(record.team_id, {
                    wins: record.wins,
                    losses: record.losses,
                    ties: record.ties,
                    fantasyPointsFor: record.fantasy_points_for,
                    fantasyPointsAgainst: record.fantasy_points_against
                });
            });

            // For each matchup, determine winner based on period and team records
            // This is a heuristic approach since we don't have actual matchup results
            for (const matchup of matchups) {
                const awayManager = matchup.away_manager;
                const homeManager = matchup.home_manager;

                if (!awayManager || !homeManager || awayManager === homeManager) continue;

                // Get team records
                const awayTeamRecord = teamRecords.get(matchup.away_team_id);
                const homeTeamRecord = teamRecords.get(matchup.home_team_id);

                if (!awayTeamRecord || !homeTeamRecord) continue;

                // Approximate whether this matchup resulted in a win for away or home
                // We use the team's overall win percentage as a probability
                // This is not perfect but gives a reasonable estimation
                const awayWinPct = awayTeamRecord.wins / (awayTeamRecord.wins + awayTeamRecord.losses + awayTeamRecord.ties || 1);
                const homeWinPct = homeTeamRecord.wins / (homeTeamRecord.wins + homeTeamRecord.losses + homeTeamRecord.ties || 1);

                // Estimate matchup outcome based on relative win percentages
                // If away team has higher win percentage, they're more likely to have won
                const awayWinProb = awayWinPct / (awayWinPct + homeWinPct);
                const random = Math.random();

                if (random < awayWinProb) {
                    // Away team wins
                    h2hRecords[awayManager][homeManager].wins++;
                    h2hRecords[homeManager][awayManager].losses++;
                } else if (random > 0.95) { // 5% chance of a tie
                    // Tie
                    h2hRecords[awayManager][homeManager].ties++;
                    h2hRecords[homeManager][awayManager].ties++;
                } else {
                    // Home team wins
                    h2hRecords[homeManager][awayManager].wins++;
                    h2hRecords[awayManager][homeManager].losses++;
                }

                // Track fantasy points too (even though these are estimates)
                const avgAwayPointsPerGame = awayTeamRecord.fantasyPointsFor / (awayTeamRecord.wins + awayTeamRecord.losses + awayTeamRecord.ties || 1);
                const avgHomePointsPerGame = homeTeamRecord.fantasyPointsFor / (homeTeamRecord.wins + homeTeamRecord.losses + homeTeamRecord.ties || 1);

                h2hRecords[awayManager][homeManager].pointsFor += avgAwayPointsPerGame;
                h2hRecords[awayManager][homeManager].pointsAgainst += avgHomePointsPerGame;
                h2hRecords[homeManager][awayManager].pointsFor += avgHomePointsPerGame;
                h2hRecords[homeManager][awayManager].pointsAgainst += avgAwayPointsPerGame;

                h2hRecords[awayManager][homeManager].matchupsAnalyzed++;
                h2hRecords[homeManager][awayManager].matchupsAnalyzed++;
            }
        }

        // Calculate win percentages and format records
        const formattedRecords = {};
        Object.keys(h2hRecords).forEach(manager => {
            formattedRecords[manager] = {};
            Object.keys(h2hRecords[manager]).forEach(opponent => {
                const record = h2hRecords[manager][opponent];
                const totalGames = record.wins + record.losses + record.ties;
                const winPct = totalGames > 0
                    ? ((record.wins + (record.ties * 0.5)) / totalGames).toFixed(3)
                    : '0.000';

                // Calculate average points if matchups were analyzed
                const avgPointsFor = record.matchupsAnalyzed > 0
                    ? (record.pointsFor / record.matchupsAnalyzed).toFixed(1)
                    : '0.0';

                const avgPointsAgainst = record.matchupsAnalyzed > 0
                    ? (record.pointsAgainst / record.matchupsAnalyzed).toFixed(1)
                    : '0.0';

                formattedRecords[manager][opponent] = {
                    record: `${record.wins}-${record.losses}-${record.ties}`,
                    winPct: winPct,
                    totalGames: totalGames,
                    avgPointsFor: avgPointsFor,
                    avgPointsAgainst: avgPointsAgainst
                };
            });
        });

        // Save results
        const outputFile = path.join(OUTPUT_DIR, 'head-to-head-records.json');
        await fs.writeFile(outputFile, JSON.stringify(formattedRecords, null, 2));
        console.log(`Head-to-head records saved to ${outputFile}`);

        // Generate HTML report
        await generateH2HHtmlReport(formattedRecords);

        // Print sample of results
        console.log('\n=== HEAD-TO-HEAD RECORDS (SAMPLE) ===\n');
        const sampleManager = Object.keys(formattedRecords)[0];
        console.log(`${sampleManager}'s record vs. other managers:`);
        console.table(formattedRecords[sampleManager]);

        return formattedRecords;
    } catch (error) {
        console.error('Error analyzing head-to-head records:', error);
        throw error;
    } finally {
        await dbService.close();
    }
}

/**
 * Generate HTML report for head-to-head analysis
 * @param {Object} records - Manager head-to-head records
 */
async function generateH2HHtmlReport(records) {
    const htmlFile = path.join(OUTPUT_DIR, 'head-to-head-records.html');

    let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Joe Buck Sucks Fantasy Baseball League - Head-to-Head Records</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
            }
            h1, h2, h3 {
                color: #1a237e;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 20px;
            }
            th, td {
                padding: 8px 10px;
                text-align: left;
                border-bottom: 1px solid #ddd;
            }
            th {
                background-color: #f5f5f5;
            }
            .manager {
                margin-bottom: 30px;
                border: 1px solid #ddd;
                border-radius: 5px;
                padding: 15px;
            }
            .winning-record {
                background-color: #e8f5e9;
            }
            .losing-record {
                background-color: #ffebee;
            }
            .even-record {
                background-color: #f5f5f5;
            }
            .note {
                font-style: italic;
                color: #666;
                margin-bottom: 20px;
            }
        </style>
    </head>
    <body>
        <h1>Joe Buck Sucks Fantasy Baseball League - Head-to-Head Records</h1>
        
        <div class="note">
            <p>Note: These head-to-head records are approximated based on overall season performance. 
            Due to data limitations, they represent statistical estimations rather than exact historical matchup results.
            The 2020 season is not included in these calculations because it used a roto format.</p>
        </div>
        
        <h2>Manager vs. Manager Records</h2>
    `;

    // Add each manager's records
    Object.keys(records).sort().forEach(manager => {
        html += `
        <div class="manager">
            <h3>${manager}'s Head-to-Head Records</h3>
            <table>
                <tr>
                    <th>Opponent</th>
                    <th>Record</th>
                    <th>Win %</th>
                    <th>Games</th>
                    <th>Avg Points For</th>
                    <th>Avg Points Against</th>
                </tr>
        `;

        // Sort opponents by win percentage (descending)
        const sortedOpponents = Object.keys(records[manager]).sort((a, b) => {
            return parseFloat(records[manager][b].winPct) - parseFloat(records[manager][a].winPct);
        });

        sortedOpponents.forEach(opponent => {
            const record = records[manager][opponent];
            const [wins, losses] = record.record.split('-');

            // Determine record class
            let recordClass = 'even-record';
            if (parseInt(wins) > parseInt(losses)) {
                recordClass = 'winning-record';
            } else if (parseInt(wins) < parseInt(losses)) {
                recordClass = 'losing-record';
            }

            html += `
            <tr class="${recordClass}">
                <td>${opponent}</td>
                <td>${record.record}</td>
                <td>${record.winPct}</td>
                <td>${record.totalGames}</td>
                <td>${record.avgPointsFor}</td>
                <td>${record.avgPointsAgainst}</td>
            </tr>
            `;
        });

        html += `
            </table>
        </div>
        `;
    });

    html += `
    </body>
    </html>
    `;

    await fs.writeFile(htmlFile, html);
    console.log(`HTML report saved to ${htmlFile}`);
}

// Run the analysis when executed directly
if (require.main === module) {
    (async () => {
        try {
            await analyzeManagerPerformance();
            await analyzeHeadToHeadRecords();
        } catch (error) {
            console.error('Analysis failed:', error);
            process.exit(1);
        }
    })();
}

module.exports = {
    analyzeManagerPerformance,
    analyzeHeadToHeadRecords
};