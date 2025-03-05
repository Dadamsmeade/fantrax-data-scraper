const { initializeDatabase } = require('../utils/database');
const SeasonsDb = require('./seasonsDb');
const TeamsDb = require('./teamsDb');
const ScheduleDb = require('./scheduleDb');

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
        this.hittingStats = null;    // New
        this.pitchingStats = null;   // New
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

            this.initialized = true;
            return this;
        } catch (error) {
            console.error('Failed to initialize database service:', error);
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

            try {
                // Get season info
                const season = await this.db.get('SELECT * FROM seasons WHERE id = ?', [seasonId]);
                if (!season) {
                    throw new Error(`Season with ID ${seasonId} not found`);
                }

                // Prepare standings with proper team database IDs
                const processedStandings = [];

                for (const standing of data) {
                    // Find team ID in database
                    const team = await this.db.get(
                        'SELECT * FROM teams WHERE team_id = ? AND season_id = ?',
                        [standing.teamId, seasonId]
                    );

                    if (!team) {
                        console.warn(`Team ${standing.teamName} (ID: ${standing.teamId}) not found for season ${seasonId}`);
                        continue;
                    }

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
                }

                // Save standings
                const result = await this.standings.bulkUpsertStandings(processedStandings);

                // Commit transaction
                await this.db.run('COMMIT');
                transactionStarted = false;

                console.log(`Saved ${result} standings for season ID ${seasonId}`);
                return { saved: result };
            } catch (error) {
                // Only try to rollback if we started the transaction
                if (transactionStarted) {
                    try {
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

                // Process season stats first and build the team mappings
                for (const stat of data.seasonStats) {
                    // Find team ID in database
                    const team = await this.db.get(
                        'SELECT * FROM teams WHERE team_id = ? AND season_id = ?',
                        [stat.teamId, seasonId]
                    );

                    if (!team) {
                        console.warn(`Team ${stat.teamName} (ID: ${stat.teamId}) not found for season ${seasonId}`);
                        continue;
                    }

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
                        projectedBudgetLeft: stat.projectedBudgetLeft || 0
                    });
                }

                // Process hitting stats
                for (const stat of (data.hittingStats || [])) {
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
                }

                // Process pitching stats
                for (const stat of (data.pitchingStats || [])) {
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
                }

                // Save all stats
                const seasonStatsResult = await this.seasonStats.bulkUpsertSeasonStats(processedSeasonStats);
                const hittingStatsResult = await this.hittingStats.bulkUpsertHittingStats(processedHittingStats);
                const pitchingStatsResult = await this.pitchingStats.bulkUpsertPitchingStats(processedPitchingStats);

                // Commit transaction
                await this.db.run('COMMIT');
                transactionStarted = false;

                console.log(`Saved ${seasonStatsResult} season stats, ${hittingStatsResult} hitting stats, and ${pitchingStatsResult} pitching stats for season ID ${seasonId}`);

                return {
                    seasonStats: seasonStatsResult,
                    hittingStats: hittingStatsResult,
                    pitchingStats: pitchingStatsResult
                };
            } catch (error) {
                // Only try to rollback if we started the transaction
                if (transactionStarted) {
                    try {
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
}

// Create and export a singleton instance
const dbService = new DatabaseService();

module.exports = dbService;