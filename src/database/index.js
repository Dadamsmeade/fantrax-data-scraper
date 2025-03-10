const { initializeDatabase } = require('../utils/database');
const SeasonsDb = require('./seasonsDb');
const TeamsDb = require('./teamsDb');
const ScheduleDb = require('./scheduleDb');
const StandingsDb = require('./standingsDb');       // Add this import
const SeasonStatsDb = require('./seasonStatsDb');   // Add this import
const HittingStatsDb = require('./hittingStatsDb'); // Add this import
const PitchingStatsDb = require('./pitchingStatsDb'); // Add this import
const RostersDb = require('./rostersDb'); // Add this import
const MlbTeamsDb = require('./mlbTeamsDb'); // Add this import

/**
 * Database service that provides access to all database operations
 */
class DatabaseService {
    constructor() {
        this.db = null;
        this.seasons = null;
        this.teams = null;
        this.schedule = null;
        this.standings = null;       // New
        this.seasonStats = null;     // New
        this.rosters = null;     // New
        this.mlbTeams = null; // Add this new property
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) {
            return this;
        }

        try {
            // Initialize database connection
            this.db = await initializeDatabase();

            // Initialize repositories
            this.seasons = new SeasonsDb(this.db);
            this.teams = new TeamsDb(this.db);
            this.schedule = new ScheduleDb(this.db);
            this.standings = new StandingsDb(this.db);         // New
            this.seasonStats = new SeasonStatsDb(this.db);     // New
            this.hittingStats = new HittingStatsDb(this.db);   // New
            this.pitchingStats = new PitchingStatsDb(this.db); // New
            this.rosters = new RostersDb(this.db);
            this.mlbTeams = new MlbTeamsDb(this.db);

            this.initialized = true;
            return this;
        } catch (error) {
            console.error('Failed to initialize database service:', error);
            throw error;
        }
    }

    // Add a close method to properly shut down the database connection
    async close() {
        if (this.db) {
            await this.db.close();
            this.initialized = false;
            console.log('Database connection closed');
        }
    }

    // Add a method to save schedule data
    async saveScheduleData(scheduleData, year, leagueId) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            // Get or create season
            const season = await this.seasons.getSeasonByLeagueId(leagueId);
            if (!season) {
                throw new Error(`Season with league ID ${leagueId} not found`);
            }

            // Extract unique teams from schedule data
            const uniqueTeams = new Map();
            for (const matchup of scheduleData) {
                if (matchup.awayTeamId && matchup.awayTeamName) {
                    uniqueTeams.set(matchup.awayTeamId, matchup.awayTeamName);
                }
                if (matchup.homeTeamId && matchup.homeTeamName) {
                    uniqueTeams.set(matchup.homeTeamId, matchup.homeTeamName);
                }
            }

            // Create team objects
            const teamsToSave = Array.from(uniqueTeams.entries()).map(([teamId, name]) => ({
                teamId,
                seasonId: season.id,
                name
            }));

            // Save teams
            let savedTeamsCount = 0;
            if (teamsToSave.length > 0) {
                savedTeamsCount = await this.teams.bulkUpsertTeams(teamsToSave);
            }

            // Get all teams for this season to map IDs
            const allTeams = await this.teams.getTeamsBySeason(season.id);
            const teamIdMap = new Map();
            allTeams.forEach(team => {
                teamIdMap.set(team.team_id, team.id);
            });

            // Create matchup objects
            const matchupsToSave = [];
            for (const matchup of scheduleData) {
                const awayTeamId = teamIdMap.get(matchup.awayTeamId);
                const homeTeamId = teamIdMap.get(matchup.homeTeamId);

                if (!awayTeamId || !homeTeamId) {
                    console.warn(`Skipping matchup due to missing team ID: ${matchup.awayTeamName} vs ${matchup.homeTeamName}`);
                    continue;
                }

                matchupsToSave.push({
                    seasonId: season.id,
                    periodNumber: matchup.periodNumber,
                    periodType: matchup.periodType,
                    dateRange: matchup.dateRange,
                    awayTeamId,
                    homeTeamId,
                    matchupId: matchup.matchupId
                });
            }

            // Save matchups
            let savedMatchupsCount = 0;
            if (matchupsToSave.length > 0) {
                savedMatchupsCount = await this.schedule.bulkUpsertMatchups(matchupsToSave);
            }

            return {
                teams: savedTeamsCount,
                matchups: savedMatchupsCount
            };
        } catch (error) {
            console.error(`Error saving schedule data for ${year}:`, error);
            throw error;
        }
    }

    // Add a method to save standings data
    async saveStandingsData(data, seasonId) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!data || data.length === 0) {
            console.log(`No standings data to save for season ID ${seasonId}`);
            return { saved: 0 };
        }

        try {
            // Begin transaction
            await this.db.run('BEGIN TRANSACTION');
            let transactionStarted = true;
            console.log(`Starting transaction for saving ${data.length} standings records`);

            try {
                // Get season info
                const season = await this.db.get('SELECT * FROM seasons WHERE id = ?', [seasonId]);
                if (!season) {
                    throw new Error(`Season with ID ${seasonId} not found`);
                }

                // Prepare standings with proper team database IDs
                const processedStandings = [];
                console.log(`Processing standings data for season ${season.year}`);

                for (const standing of data) {
                    // Log the team info we're processing
                    console.log(`Processing team: ${standing.teamName} (${standing.teamId})`);

                    try {
                        // Find team ID in database
                        const team = await this.db.get(
                            'SELECT * FROM teams WHERE team_id = ? AND season_id = ?',
                            [standing.teamId, seasonId]
                        );

                        if (!team) {
                            console.warn(`Team ${standing.teamName} (ID: ${standing.teamId}) not found for season ${seasonId}`);
                            continue;
                        }

                        console.log(`Found team in database: ${team.name} (ID: ${team.id})`);

                        processedStandings.push({
                            seasonId,
                            teamId: team.id,
                            rank: parseInt(standing.rank) || 0,
                            wins: standing.wins,
                            losses: standing.losses,
                            ties: standing.ties,
                            winPercentage: standing.winPercentage,
                            divisionRecord: standing.divisionRecord,
                            gamesBack: standing.gamesBack,
                            waiverPosition: standing.waiverPosition,
                            fantasyPointsFor: standing.fantasyPointsFor,
                            fantasyPointsAgainst: standing.fantasyPointsAgainst,
                            streak: standing.streak
                        });
                    } catch (err) {
                        console.error(`Error processing team ${standing.teamName}:`, err.message);
                        // Continue with next standing
                    }
                }

                console.log(`Saving ${processedStandings.length} standings records to database`);

                // Save standings
                const result = await this.standings.bulkUpsertStandings(processedStandings);

                // Commit transaction
                await this.db.run('COMMIT');
                transactionStarted = false;

                console.log(`Successfully saved ${result} standings for season ID ${seasonId}`);
                return { saved: result };
            } catch (error) {
                // Only try to rollback if we started the transaction
                if (transactionStarted) {
                    try {
                        console.log('Rolling back transaction due to error');
                        await this.db.run('ROLLBACK');
                    } catch (rollbackError) {
                        console.error('Error during rollback:', rollbackError);
                    }
                }
                throw error;
            }
        } catch (error) {
            console.error(`Error saving standings data for season ID ${seasonId}:`, error);
            throw error;
        }
    }

    // Add a method to save season stats data
    async saveSeasonStatsData(data, seasonId) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (!data || !data.seasonStats || data.seasonStats.length === 0) {
            console.log(`No season stats data to save for season ID ${seasonId}`);
            return { seasonStats: 0, hittingStats: 0, pitchingStats: 0 };
        }

        try {
            // Begin transaction
            await this.db.run('BEGIN TRANSACTION');
            let transactionStarted = true;
            console.log(`Starting transaction for saving ${data.seasonStats.length} season stats records`);

            try {
                // Get season info
                const season = await this.db.get('SELECT * FROM seasons WHERE id = ?', [seasonId]);
                if (!season) {
                    throw new Error(`Season with ID ${seasonId} not found`);
                }

                // Process season stats
                const processedSeasonStats = [];
                const processedHittingStats = [];
                const processedPitchingStats = [];

                // Create mappings for later reference
                const teamMappings = new Map(); // Map Fantrax team IDs to database IDs
                console.log(`Processing season stats data for season ${season.year}`);

                // Process season stats first and build the team mappings
                for (const stat of data.seasonStats) {
                    // Log the team info we're processing
                    console.log(`Processing team stats: ${stat.teamName} (${stat.teamId})`);

                    try {
                        // Find team ID in database
                        const team = await this.db.get(
                            'SELECT * FROM teams WHERE team_id = ? AND season_id = ?',
                            [stat.teamId, seasonId]
                        );

                        if (!team) {
                            console.warn(`Team ${stat.teamName} (ID: ${stat.teamId}) not found for season ${seasonId}`);
                            continue;
                        }

                        console.log(`Found team in database: ${team.name} (ID: ${team.id})`);

                        // Store the mapping for later
                        teamMappings.set(stat.teamId, team.id);

                        processedSeasonStats.push({
                            seasonId,
                            teamId: team.id,
                            fantasyPoints: stat.fantasyPoints,
                            adjustments: stat.adjustments,
                            totalPoints: stat.totalPoints,
                            fantasyPointsPerGame: stat.fantasyPointsPerGame,
                            gamesPlayed: stat.gamesPlayed,
                            hittingPoints: stat.hittingPoints,
                            teamPitchingPoints: stat.teamPitchingPoints,
                            waiverPosition: stat.waiverPosition,
                            pointsBehindLeader: stat.pointsBehindLeader || 0
                        });
                    } catch (err) {
                        console.error(`Error processing team stats for ${stat.teamName}:`, err.message);
                        // Continue with next stat
                    }
                }

                // Process hitting stats
                if (data.hittingStats && data.hittingStats.length > 0) {
                    console.log(`Processing ${data.hittingStats.length} hitting stats records`);

                    for (const stat of data.hittingStats) {
                        try {
                            // Use the team mapping we created
                            const teamId = teamMappings.get(stat.teamId);
                            if (!teamId) {
                                console.warn(`Team ${stat.teamName} (ID: ${stat.teamId}) mapping not found for hitting stats`);
                                continue;
                            }

                            processedHittingStats.push({
                                seasonId,
                                teamId,
                                runs: stat.runs,
                                singles: stat.singles,
                                doubles: stat.doubles,
                                triples: stat.triples,
                                homeRuns: stat.homeRuns,
                                runsBattedIn: stat.runsBattedIn,
                                walks: stat.walks,
                                stolenBases: stat.stolenBases,
                                caughtStealing: stat.caughtStealing
                            });
                        } catch (err) {
                            console.error(`Error processing hitting stats for team ${stat.teamName}:`, err.message);
                            // Continue with next stat
                        }
                    }
                }

                // Process pitching stats
                if (data.pitchingStats && data.pitchingStats.length > 0) {
                    console.log(`Processing ${data.pitchingStats.length} pitching stats records`);

                    for (const stat of data.pitchingStats) {
                        try {
                            // Use the team mapping we created
                            const teamId = teamMappings.get(stat.teamId);
                            if (!teamId) {
                                console.warn(`Team ${stat.teamName} (ID: ${stat.teamId}) mapping not found for pitching stats`);
                                continue;
                            }

                            processedPitchingStats.push({
                                seasonId,
                                teamId,
                                wins: stat.wins,
                                inningsPitched: stat.inningsPitched,
                                earnedRuns: stat.earnedRuns,
                                hitsPlusWalks: stat.hitsPlusWalks,
                                strikeouts: stat.strikeouts
                            });
                        } catch (err) {
                            console.error(`Error processing pitching stats for team ${stat.teamName}:`, err.message);
                            // Continue with next stat
                        }
                    }
                }

                console.log(`Saving to database: ${processedSeasonStats.length} season stats, ${processedHittingStats.length} hitting stats, ${processedPitchingStats.length} pitching stats`);

                // Save all stats
                const seasonStatsResult = await this.seasonStats.bulkUpsertSeasonStats(processedSeasonStats);
                const hittingStatsResult = await this.hittingStats.bulkUpsertHittingStats(processedHittingStats);
                const pitchingStatsResult = await this.pitchingStats.bulkUpsertPitchingStats(processedPitchingStats);

                // Commit transaction
                await this.db.run('COMMIT');
                transactionStarted = false;

                console.log(`Successfully saved ${seasonStatsResult} season stats, ${hittingStatsResult} hitting stats, and ${pitchingStatsResult} pitching stats for season ID ${seasonId}`);

                return {
                    seasonStats: seasonStatsResult,
                    hittingStats: hittingStatsResult,
                    pitchingStats: pitchingStatsResult
                };
            } catch (error) {
                // Only try to rollback if we started the transaction
                if (transactionStarted) {
                    try {
                        console.log('Rolling back transaction due to error');
                        await this.db.run('ROLLBACK');
                    } catch (rollbackError) {
                        console.error('Error during rollback:', rollbackError);
                    }
                }
                throw error;
            }
        } catch (error) {
            console.error(`Error saving season stats data for season ID ${seasonId}:`, error);
            throw error;
        }
    }

    // Add this new method to your DatabaseService class
    /**
     * Save roster data
     * @param {Array} rosterData - Array of roster data objects from scraper
     * @param {string} season - Season year
     * @param {string} leagueId - Fantrax league ID
     * @returns {Promise<Object>} Results of the save operation
     */
    async saveRosterData(rosterData, season, leagueId) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            // Get or create season
            const dbSeason = await this.seasons.getSeasonByLeagueId(leagueId);
            if (!dbSeason) {
                throw new Error(`Season with league ID ${leagueId} not found`);
            }

            let processedEntries = 0;
            let matchedPlayers = 0;

            // Process each roster data object (each represents a team for a period)
            for (const teamRoster of rosterData) {
                const { periodNumber, teamId, players } = teamRoster;

                // Convert player data to roster entries
                const rosterEntries = [];

                for (const player of players) {
                    // Skip entries with missing essential data
                    if (!player.playerName || !player.positionCode) continue;

                    // Try to match player with MLB database
                    let playerId = null;
                    let pitchingStaffId = null;

                    // Handle team pitching entries
                    if (player.positionCode === 'TmP' || player.positionCode === 'Res') {
                        // Try to match with MLB team
                        const mlbTeam = await this.db.get(`
          SELECT id FROM mlb_teams
          WHERE short_name = ? OR name LIKE ?
        `, [player.playerName, `%${player.playerName}%`]);

                        if (mlbTeam) {
                            pitchingStaffId = mlbTeam.id;
                            console.log(`Matched team pitching "${player.playerName}" to MLB team ID: ${pitchingStaffId}`);
                        }
                    } else {
                        // Try to find player by normalized name (for regular players)
                        const normalizedName = player.normalizedName;

                        // First try exact match on normalized name
                        const playerMatch = await this.db.get(`
          SELECT id FROM players 
          WHERE normalized_full_name = ?
          LIMIT 1
        `, [normalizedName]);

                        if (playerMatch) {
                            playerId = playerMatch.id;
                            matchedPlayers++;
                        }
                    }

                    // Create roster entry
                    rosterEntries.push({
                        seasonId: dbSeason.id,
                        teamId,
                        periodNumber,
                        playerId,
                        pitchingStaffId,  // Add the new field
                        positionCode: player.positionCode,
                        rosterSlot: player.rosterSlot,
                        isActive: player.isActive,
                        playerName: player.playerName,
                        playerNameNormalized: player.normalizedName,
                        mlbTeam: player.mlbTeam,
                        batSide: player.batSide,
                        fantraxPlayerId: player.fantraxPlayerId
                    });
                }

                // First clear any existing entries for this team/period
                await this.rosters.deleteTeamPeriodRosters(teamId, periodNumber);

                // Save all roster entries for this team/period
                if (rosterEntries.length > 0) {
                    const savedCount = await this.rosters.bulkUpsertRosterEntries(rosterEntries);
                    processedEntries += savedCount;
                }
            }

            // Try to match any remaining unmatched players
            const matchingResults = await this.rosters.matchPlayerNames(dbSeason.id);

            return {
                processedRosters: rosterData.length,
                processedEntries,
                initialMatches: matchedPlayers,
                additionalMatches: matchingResults.matched,
                unmatchedEntries: matchingResults.stillUnmatched
            };
        } catch (error) {
            console.error(`Error saving roster data for ${season}:`, error);
            throw error;
        }
    }
}

// Create and export a singleton instance
const dbService = new DatabaseService();

module.exports = dbService;