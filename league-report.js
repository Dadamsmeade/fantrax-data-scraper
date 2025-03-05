const dbService = require('./src/database');
const fs = require('fs-extra');
const path = require('path');

// Configuration
const OUTPUT_DIR = path.join(__dirname, 'data', 'reports');

// Ensure output directory exists
fs.ensureDirSync(OUTPUT_DIR);

/**
 * Generate a comprehensive league history report
 */
async function generateLeagueReport() {
    try {
        await dbService.initialize();
        console.log('Database connection established');

        // Get all seasons
        const seasons = await dbService.seasons.getAllSeasons();
        console.log(`Found ${seasons.length} seasons in the database`);

        // Get all managers
        const managers = await dbService.db.all(`
            SELECT * FROM managers ORDER BY name
        `);
        console.log(`Found ${managers.length} managers in the database`);

        // Prepare report data
        const report = {
            leagueName: 'Joe Buck Sucks Fantasy Baseball League',
            description: 'Historical data for the Joe Buck Sucks fantasy baseball league',
            seasons: [],
            managers: [],
            summary: {
                totalSeasons: seasons.length,
                totalManagers: managers.length,
                championsByManager: {},
                topThreeFinishesByManager: {}
            }
        };

        // Initialize manager summaries
        managers.forEach(manager => {
            report.summary.championsByManager[manager.name] = 0;
            report.summary.topThreeFinishesByManager[manager.name] = 0;
        });

        // Process each season
        for (const season of seasons) {
            console.log(`Processing season ${season.year}...`);

            // Get teams for this season
            const teams = await dbService.db.all(`
                SELECT t.*, m.name as manager_name, m.id as manager_id
                FROM teams t
                LEFT JOIN managers m ON t.manager_id = m.id
                WHERE t.season_id = ?
            `, [season.id]);

            // Get standings
            const standings = await dbService.standings.getStandingsBySeason(season.id);

            // Get season stats
            const seasonStats = await dbService.seasonStats.getStatsBySeason(season.id);

            // Process and combine data
            const seasonTeams = [];

            for (const team of teams) {
                const standing = standings.find(s => s.team_id === team.id);
                const stats = seasonStats.find(s => s.team_id === team.id);

                if (!standing) continue;

                const teamData = {
                    name: team.name,
                    manager: team.manager_name || 'Unknown',
                    rank: standing.rank,
                    record: `${standing.wins}-${standing.losses}-${standing.ties}`,
                    winPercentage: standing.win_percentage,
                    fantasyPoints: stats ? stats.fantasy_points : 0,
                    gamesBack: standing.games_back
                };

                seasonTeams.push(teamData);

                // Update championship and top-three counts
                if (team.manager_name) {
                    if (standing.rank === 1) {
                        report.summary.championsByManager[team.manager_name] =
                            (report.summary.championsByManager[team.manager_name] || 0) + 1;
                    }

                    if (standing.rank <= 3) {
                        report.summary.topThreeFinishesByManager[team.manager_name] =
                            (report.summary.topThreeFinishesByManager[team.manager_name] || 0) + 1;
                    }
                }
            }

            // Sort teams by rank
            seasonTeams.sort((a, b) => a.rank - b.rank);

            // Build season data
            const seasonData = {
                year: season.year,
                name: season.name,
                leagueId: season.league_id,
                teams: seasonTeams,
                champion: seasonTeams.length > 0 ? seasonTeams[0] : null,
                runnerUp: seasonTeams.length > 1 ? seasonTeams[1] : null,
                thirdPlace: seasonTeams.length > 2 ? seasonTeams[2] : null
            };

            report.seasons.push(seasonData);
        }

        // Sort seasons by year descending
        report.seasons.sort((a, b) => parseInt(b.year) - parseInt(a.year));

        // Process manager data
        for (const manager of managers) {
            // Get all teams managed by this person
            const managerTeams = await dbService.db.all(`
                SELECT t.*, s.year, st.rank, st.wins, st.losses, st.ties, st.win_percentage
                FROM teams t
                JOIN seasons s ON t.season_id = s.id
                LEFT JOIN standings st ON t.id = st.team_id AND t.season_id = st.season_id
                WHERE t.manager_id = ?
                ORDER BY s.year DESC
            `, [manager.id]);

            // Calculate career stats
            let totalWins = 0;
            let totalLosses = 0;
            let totalTies = 0;
            let totalSeasons = 0;
            let bestRank = { rank: 999, year: '' };
            let worstRank = { rank: 0, year: '' };

            managerTeams.forEach(team => {
                if (team.rank) {
                    totalSeasons++;
                    totalWins += team.wins || 0;
                    totalLosses += team.losses || 0;
                    totalTies += team.ties || 0;

                    if (team.rank < bestRank.rank) {
                        bestRank = { rank: team.rank, year: team.year };
                    }

                    if (team.rank > worstRank.rank) {
                        worstRank = { rank: team.rank, year: team.year };
                    }
                }
            });

            const totalGames = totalWins + totalLosses + totalTies;
            const winPercentage = totalGames > 0
                ? ((totalWins + (totalTies * 0.5)) / totalGames).toFixed(3)
                : '0.000';

            // Build manager data
            const managerData = {
                name: manager.name,
                active: `${manager.active_from}${manager.active_until ? ' - ' + manager.active_until : ' - Present'}`,
                seasons: totalSeasons,
                careerRecord: `${totalWins}-${totalLosses}-${totalTies}`,
                winPercentage: winPercentage,
                championships: report.summary.championsByManager[manager.name] || 0,
                topThreeFinishes: report.summary.topThreeFinishesByManager[manager.name] || 0,
                bestFinish: bestRank.rank < 999 ? `${bestRank.rank} (${bestRank.year})` : 'N/A',
                worstFinish: worstRank.rank > 0 ? `${worstRank.rank} (${worstRank.year})` : 'N/A',
                teams: managerTeams.map(team => ({
                    year: team.year,
                    name: team.name,
                    rank: team.rank || 'Unknown',
                    record: team.wins ? `${team.wins}-${team.losses}-${team.ties}` : 'Unknown'
                }))
            };

            report.managers.push(managerData);
        }

        // Sort managers by championships, then win percentage
        report.managers.sort((a, b) => {
            if (b.championships !== a.championships) {
                return b.championships - a.championships;
            }
            return parseFloat(b.winPercentage) - parseFloat(a.winPercentage);
        });

        // Save the report
        const reportFile = path.join(OUTPUT_DIR, 'league-history.json');
        await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
        console.log(`League history report saved to ${reportFile}`);

        // Generate a simplified HTML report for easy viewing
        await generateHtmlReport(report);

        return report;
    } catch (error) {
        console.error('Error generating league report:', error);
        throw error;
    } finally {
        await dbService.close();
    }
}

/**
 * Generate an HTML report from the JSON data
 * @param {Object} report - The report data
 */
async function generateHtmlReport(report) {
    const htmlFile = path.join(OUTPUT_DIR, 'league-history.html');

    let html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${report.leagueName} - League History</title>
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
            .season {
                margin-bottom: 30px;
                border: 1px solid #ddd;
                border-radius: 5px;
                padding: 15px;
            }
            .manager {
                margin-bottom: 30px;
                border: 1px solid #ddd;
                border-radius: 5px;
                padding: 15px;
            }
            .champion {
                font-weight: bold;
                color: gold;
            }
            .runner-up {
                color: silver;
            }
            .third-place {
                color: #cd7f32; /* bronze */
            }
        </style>
    </head>
    <body>
        <h1>${report.leagueName}</h1>
        <p>${report.description}</p>
        
        <h2>League Summary</h2>
        <p>Total Seasons: ${report.summary.totalSeasons}</p>
        <p>Total Managers: ${report.summary.totalManagers}</p>
        
        <h3>Championships by Manager</h3>
        <table>
            <tr>
                <th>Manager</th>
                <th>Championships</th>
                <th>Top 3 Finishes</th>
            </tr>
    `;

    // Add championship data
    Object.keys(report.summary.championsByManager)
        .filter(manager => report.summary.championsByManager[manager] > 0)
        .sort((a, b) => report.summary.championsByManager[b] - report.summary.championsByManager[a])
        .forEach(manager => {
            html += `
            <tr>
                <td>${manager}</td>
                <td>${report.summary.championsByManager[manager]}</td>
                <td>${report.summary.topThreeFinishesByManager[manager]}</td>
            </tr>
            `;
        });

    html += `
        </table>
        
        <h2>Seasons</h2>
    `;

    // Add season data
    report.seasons.forEach(season => {
        html += `
        <div class="season">
            <h3>${season.year} Season</h3>
            <table>
                <tr>
                    <th>Rank</th>
                    <th>Team</th>
                    <th>Manager</th>
                    <th>Record</th>
                    <th>Win %</th>
                    <th>GB</th>
                </tr>
        `;

        season.teams.forEach(team => {
            let rowClass = '';
            if (team.rank === 1) rowClass = 'champion';
            else if (team.rank === 2) rowClass = 'runner-up';
            else if (team.rank === 3) rowClass = 'third-place';

            html += `
            <tr class="${rowClass}">
                <td>${team.rank}</td>
                <td>${team.name}</td>
                <td>${team.manager}</td>
                <td>${team.record}</td>
                <td>${team.winPercentage}</td>
                <td>${team.gamesBack}</td>
            </tr>
            `;
        });

        html += `
            </table>
        </div>
        `;
    });

    html += `
        <h2>Manager Profiles</h2>
    `;

    // Add manager data
    report.managers.forEach(manager => {
        html += `
        <div class="manager">
            <h3>${manager.name}</h3>
            <p><strong>Active:</strong> ${manager.active}</p>
            <p><strong>Career Record:</strong> ${manager.careerRecord} (${manager.winPercentage})</p>
            <p><strong>Championships:</strong> ${manager.championships}</p>
            <p><strong>Top 3 Finishes:</strong> ${manager.topThreeFinishes}</p>
            <p><strong>Best Finish:</strong> ${manager.bestFinish}</p>
            <p><strong>Worst Finish:</strong> ${manager.worstFinish}</p>
            
            <h4>Teams by Season</h4>
            <table>
                <tr>
                    <th>Year</th>
                    <th>Team Name</th>
                    <th>Finish</th>
                    <th>Record</th>
                </tr>
        `;

        manager.teams.forEach(team => {
            const isChampion = team.rank === 1;
            html += `
            <tr>
                <td>${team.year}</td>
                <td>${team.name}</td>
                <td>${isChampion ? '🏆 ' : ''}${team.rank}</td>
                <td>${team.record}</td>
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

// Run the report generation when executed directly
if (require.main === module) {
    generateLeagueReport().catch(error => {
        console.error('Report generation failed:', error);
        process.exit(1);
    });
}

module.exports = {
    generateLeagueReport
};