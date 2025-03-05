const { withTransaction } = require('../utils/database');

/**
 * Functions for managing pitching stats data in the database
 */
class PitchingStatsDb {
    /**
     * Initialize with a database connection
     * @param {sqlite.Database} db - SQLite database connection
     */
    constructor(db) {
        this.db = db;
    }

    /**
     * Get pitching stats for a season
     * @param {number} seasonId - Season ID
     * @returns {Promise<Array>} List of pitching stats for the season
     */
    async getStatsBySeason(seasonId) {
        return this.db.all(`
            SELECT ps.*, t.name as team_name, t.team_id as fantrax_team_id, 
                   m.name as manager_name
            FROM pitching_stats ps
            JOIN teams t ON ps.team_id = t.id
            LEFT JOIN managers m ON t.manager_id = m.id
            WHERE ps.season_id = ?
            ORDER BY ps.wins DESC
        `, [seasonId]);
    }

    /**
     * Find pitching stats for a specific team
     * @param {number} seasonId - Season ID
     * @param {number} teamId - Team ID
     * @returns {Promise<Object|null>} Pitching stats or null if not found
     */
    async findStats(seasonId, teamId) {
        return this.db.get(`
            SELECT * FROM pitching_stats
            WHERE season_id = ? AND team_id = ?
        `, [seasonId, teamId]);
    }

    /**
     * Add or update pitching stats
     * @param {Object} stats - Pitching stats data
     * @param {number} stats.seasonId - Season ID
     * @param {number} stats.teamId - Team database ID
     * @param {number} stats.wins - Wins
     * @param {string} stats.inningsPitched - Innings pitched
     * @param {number} stats.earnedRuns - Earned runs
     * @param {number} stats.hitsPlusWalks - Hits plus walks
     * @param {number} stats.strikeouts - Strikeouts
     * @returns {Promise<Object>} The inserted or updated pitching stats
     */
    async upsertPitchingStats(stats) {
        const {
            seasonId, teamId, wins, inningsPitched, earnedRuns,
            hitsPlusWalks, strikeouts
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
                    UPDATE pitching_stats
                    SET wins = ?, innings_pitched = ?, earned_runs = ?,
                        hits_plus_walks = ?, strikeouts = ?
                    WHERE season_id = ? AND team_id = ?
                `, [
                    wins, inningsPitched, earnedRuns,
                    hitsPlusWalks, strikeouts,
                    seasonId, teamId
                ]);
            } else {
                // Insert new stats
                await this.db.run(`
                    INSERT INTO pitching_stats (
                        season_id, team_id, wins, innings_pitched, earned_runs,
                        hits_plus_walks, strikeouts
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    seasonId, teamId, wins, inningsPitched, earnedRuns,
                    hitsPlusWalks, strikeouts
                ]);
            }

            return this.findStats(seasonId, teamId);
        });
    }

    /**
     * Bulk insert or update pitching stats
     * @param {Array<Object>} statsArray - Array of pitching stats objects
     * @returns {Promise<number>} Number of stats processed
     */
    async bulkUpsertPitchingStats(statsArray) {
        return withTransaction(this.db, async () => {
            let processedCount = 0;
            for (const stats of statsArray) {
                await this.upsertPitchingStats(stats);
                processedCount++;
            }
            return processedCount;
        });
    }

    /**
     * Delete all pitching stats for a season
     * @param {number} seasonId - Season ID
     * @returns {Promise<number>} Number of deleted stats
     */
    async deleteSeasonPitchingStats(seasonId) {
        const result = await this.db.run('DELETE FROM pitching_stats WHERE season_id = ?', [seasonId]);
        return result.changes;
    }
}

module.exports = PitchingStatsDb;