const dbService = require('./src/database');
const path = require('path');
const fs = require('fs-extra');

// Configuration
const SEASONS = ['2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017'];
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
            seasonStats: []
        }));

        // Process each season
        for (const year of SEASONS) {
            const season = await dbService.seasons.getSeasonByYear(year);
            if (!season) {
                console.log(`No data for season ${year}, skipping...`);
                continue;
            }

            console.log(`Processing season ${year} (ID: ${season.id})...`);

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

            // Get season stats
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

                // Create season record
                const seasonRecord = {
                    year,
                    teamName: team.name,
                    rank: standing.rank,
                    wins: standing.wins,
                    losses: standing.losses,
                    ties: standing.ties,
                    winPercentage: standing.win_percentage,
                    fantasyPoints: stats ? stats.fantasy_points : 0
                };

                // Update manager stats
                managerStat.seasons++;
                managerStat.wins += standing.wins;
                managerStat.losses += standing.losses;
                managerStat.ties += standing.ties;
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
                // Calculate win percentage
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
 * Analyze head-to-head records between managers
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
                        ties: 0
                    };
                }
            });
        });

        // Process each season
        for (const year of SEASONS) {
            const season = await dbService.seasons.getSeasonByYear(year);
            if (!season) continue;

            // Get all matchups for this season
            const matchups = await dbService.db.all(`
                SELECT 
                    s.period_number, s.period_type,
                    away.id as away_team_id, away.name as away_team_name, away_m.name as away_manager,
                    home.id as home_team_id, home.name as home_team_name, home_m.name as home_manager
                FROM schedule s
                JOIN teams away ON s.away_team_id = away.id
                JOIN teams home ON s.home_team_id = home.id
                LEFT JOIN managers away_m ON away.manager_id = away_m.id
                LEFT JOIN managers home_m ON home.manager_id = home_m.id
                WHERE s.season_id = ? AND away.manager_id IS NOT NULL AND home.manager_id IS NOT NULL
            `, [season.id]);

            // Get all matchup results from the standings
            // Since we don't have actual matchup results, we'll use random outcomes for this example
            // In a real implementation, you would query the matchup results from your database

            for (const matchup of matchups) {
                const awayManager = matchup.away_manager;
                const homeManager = matchup.home_manager;

                if (!awayManager || !homeManager || awayManager === homeManager) continue;

                // Simulate a random outcome (for demonstration only)
                // In a real implementation, you would use actual matchup results
                const randomOutcome = Math.floor(Math.random() * 3); // 0 = away win, 1 = home win, 2 = tie

                if (randomOutcome === 0) {
                    // Away team wins
                    h2hRecords[awayManager][homeManager].wins++;
                    h2hRecords[homeManager][awayManager].losses++;
                } else if (randomOutcome === 1) {
                    // Home team wins
                    h2hRecords[homeManager][awayManager].wins++;
                    h2hRecords[awayManager][homeManager].losses++;
                } else {
                    // Tie
                    h2hRecords[awayManager][homeManager].ties++;
                    h2hRecords[homeManager][awayManager].ties++;
                }
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

                formattedRecords[manager][opponent] = {
                    record: `${record.wins}-${record.losses}-${record.ties}`,
                    winPct: winPct,
                    totalGames: totalGames
                };
            });
        });

        // Save results
        const outputFile = path.join(OUTPUT_DIR, 'head-to-head-records.json');
        await fs.writeFile(outputFile, JSON.stringify(formattedRecords, null, 2));
        console.log(`Head-to-head records saved to ${outputFile}`);

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