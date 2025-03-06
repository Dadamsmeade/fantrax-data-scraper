const { withTransaction } = require('../utils/database');

/**
 * Functions for managing hitting stats data in the database
 */
class HittingStatsDb {
    /**
     * Initialize with a database connection
     * @param {sqlite.Database} db - SQLite database connection
     */
    constructor(db) {
        this.db = db;
    }

    /**
     * Get hitting stats for a season
     * @param {number} seasonId - Season ID
     * @returns {Promise<Array>} List of hitting stats for the season
     */
    async getStatsBySeason(seasonId) {
        return this.db.all(`
            SELECT hs.*, t.name as team_name, t.team_id as fantrax_team_id, 
                   m.name as manager_name
            FROM hitting_stats hs
            JOIN teams t ON hs.team_id = t.id
            LEFT JOIN managers m ON t.manager_id = m.id
            WHERE hs.season_id = ?
            ORDER BY hs.runs DESC
        `, [seasonId]);
    }

    /**
     * Find hitting stats for a specific team
     * @param {number} seasonId - Season ID
     * @param {number} teamId - Team ID
     * @returns {Promise<Object|null>} Hitting stats or null if not found
     */
    async findStats(seasonId, teamId) {
        return this.db.get(`
            SELECT * FROM hitting_stats
            WHERE season_id = ? AND team_id = ?
        `, [seasonId, teamId]);
    }

    /**
     * Add or update hitting stats
     * @param {Object} stats - Hitting stats data
     * @param {number} stats.seasonId - Season ID
     * @param {number} stats.teamId - Team database ID
     * @param {number} stats.runs - Runs
     * @param {number} stats.singles - Singles
     * @param {number} stats.doubles - Doubles
     * @param {number} stats.triples - Triples
     * @param {number} stats.homeRuns - Home runs
     * @param {number} stats.runsBattedIn - Runs batted in
     * @param {number} stats.walks - Walks
     * @param {number} stats.stolenBases - Stolen bases
     * @param {number} stats.caughtStealing - Caught stealing
     * @returns {Promise<Object>} The inserted or updated hitting stats
     */
    async upsertHittingStats(stats) {
        const {
            seasonId, teamId, runs, singles, doubles, triples, homeRuns,
            runsBattedIn, walks, stolenBases, caughtStealing
        } = stats;

        // Validate required fields
        if (!seasonId || !teamId) {
            throw new Error('Season ID and team ID are required');
        }

        return withTransaction(this.db, async () => {
            // Check if the stats record exists
            const existingStats = await this.findStats(seasonId, teamId);

            if (existingStats) {
                // Update existing stats
                await this.db.run(`
                    UPDATE hitting_stats
                    SET runs = ?, singles = ?, doubles = ?, triples = ?,
                        home_runs = ?, runs_batted_in = ?, walks = ?,
                        stolen_bases = ?, caught_stealing = ?
                    WHERE season_id = ? AND team_id = ?
                `, [
                    runs, singles, doubles, triples, homeRuns,
                    runsBattedIn, walks, stolenBases, caughtStealing,
                    seasonId, teamId
                ]);
            } else {
                // Insert new stats
                await this.db.run(`
                    INSERT INTO hitting_stats (
                        season_id, team_id, runs, singles, doubles, triples, home_runs,
                        runs_batted_in, walks, stolen_bases, caught_stealing
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    seasonId, teamId, runs, singles, doubles, triples, homeRuns,
                    runsBattedIn, walks, stolenBases, caughtStealing
                ]);
            }

            return this.findStats(seasonId, teamId);
        });
    }

    /**
     * Bulk insert or update hitting stats - MODIFIED: No transaction inside
     * @param {Array<Object>} statsArray - Array of hitting stats objects
     * @returns {Promise<number>} Number of stats processed
     */
    async bulkUpsertHittingStats(statsArray) {
        // Do NOT use withTransaction here since this is called inside a transaction
        let processedCount = 0;
        for (const stats of statsArray) {
            try {
                const {
                    seasonId, teamId, runs, singles, doubles, triples, homeRuns,
                    runsBattedIn, walks, stolenBases, caughtStealing
                } = stats;

                // Check if the stats record exists
                const existingStats = await this.findStats(seasonId, teamId);

                if (existingStats) {
                    // Update existing stats
                    await this.db.run(`
                        UPDATE hitting_stats
                        SET runs = ?, singles = ?, doubles = ?, triples = ?,
                            home_runs = ?, runs_batted_in = ?, walks = ?,
                            stolen_bases = ?, caught_stealing = ?
                        WHERE season_id = ? AND team_id = ?
                    `, [
                        runs, singles, doubles, triples, homeRuns,
                        runsBattedIn, walks, stolenBases, caughtStealing,
                        seasonId, teamId
                    ]);
                } else {
                    // Insert new stats
                    await this.db.run(`
                        INSERT INTO hitting_stats (
                            season_id, team_id, runs, singles, doubles, triples, home_runs,
                            runs_batted_in, walks, stolen_bases, caught_stealing
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        seasonId, teamId, runs, singles, doubles, triples, homeRuns,
                        runsBattedIn, walks, stolenBases, caughtStealing
                    ]);
                }
                processedCount++;
            } catch (error) {
                console.error(`Error processing hitting stats: ${error.message}`);
                // Continue with next stats record if one fails
            }
        }
        return processedCount;
    }

    /**
     * Delete all hitting stats for a season
     * @param {number} seasonId - Season ID
     * @returns {Promise<number>} Number of deleted stats
     */
    async deleteSeasonHittingStats(seasonId) {
        const result = await this.db.run('DELETE FROM hitting_stats WHERE season_id = ?', [seasonId]);
        return result.changes;
    }
}

module.exports = HittingStatsDb;