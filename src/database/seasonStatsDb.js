const { withTransaction } = require('../utils/database');

/**
 * Functions for managing season stats data in the database
 */
class SeasonStatsDb {
    /**
     * Initialize with a database connection
     * @param {sqlite.Database} db - SQLite database connection
     */
    constructor(db) {
        this.db = db;
    }

    /**
     * Get season stats for a season
     * @param {number} seasonId - Season ID
     * @returns {Promise<Array>} List of season stats for the season
     */
    async getStatsBySeason(seasonId) {
        return this.db.all(`
            SELECT ss.*, t.name as team_name, t.team_id as fantrax_team_id, 
                   m.name as manager_name
            FROM season_stats ss
            JOIN teams t ON ss.team_id = t.id
            LEFT JOIN managers m ON t.manager_id = m.id
            WHERE ss.season_id = ?
            ORDER BY ss.fantasy_points DESC
        `, [seasonId]);
    }

    /**
     * Find season stats for a specific team
     * @param {number} seasonId - Season ID
     * @param {number} teamId - Team ID
     * @returns {Promise<Object|null>} Season stats or null if not found
     */
    async findStats(seasonId, teamId) {
        return this.db.get(`
            SELECT * FROM season_stats
            WHERE season_id = ? AND team_id = ?
        `, [seasonId, teamId]);
    }

    /**
     * Add or update season stats
     * @param {Object} stats - Season stats data
     * @param {number} stats.seasonId - Season ID
     * @param {number} stats.teamId - Team database ID
     * @param {number} stats.fantasyPoints - Fantasy points
     * @param {number} stats.adjustments - Adjustments
     * @param {number} stats.totalPoints - Total points
     * @param {number} stats.fantasyPointsPerGame - Fantasy points per game
     * @param {number} stats.gamesPlayed - Games played
     * @param {number} stats.hittingPoints - Hitting points
     * @param {number} stats.teamPitchingPoints - Team pitching points
     * @param {number} stats.waiverPosition - Waiver wire position
     * @param {number} stats.pointsBehindLeader - Points behind leader
     * @returns {Promise<Object>} The inserted or updated season stats
     */
    async upsertSeasonStats(stats) {
        const {
            seasonId, teamId, fantasyPoints, adjustments, totalPoints,
            fantasyPointsPerGame, gamesPlayed, hittingPoints,
            teamPitchingPoints, waiverPosition, pointsBehindLeader
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
                    UPDATE season_stats
                    SET fantasy_points = ?, adjustments = ?, total_points = ?,
                        fantasy_points_per_game = ?, games_played = ?, hitting_points = ?,
                        team_pitching_points = ?, waiver_position = ?, points_behind_leader = ?
                    WHERE season_id = ? AND team_id = ?
                `, [
                    fantasyPoints, adjustments, totalPoints,
                    fantasyPointsPerGame, gamesPlayed, hittingPoints,
                    teamPitchingPoints, waiverPosition, pointsBehindLeader,
                    seasonId, teamId
                ]);
            } else {
                // Insert new stats
                await this.db.run(`
                    INSERT INTO season_stats (
                        season_id, team_id, fantasy_points, adjustments, total_points,
                        fantasy_points_per_game, games_played, hitting_points,
                        team_pitching_points, waiver_position, points_behind_leader
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    seasonId, teamId, fantasyPoints, adjustments, totalPoints,
                    fantasyPointsPerGame, gamesPlayed, hittingPoints,
                    teamPitchingPoints, waiverPosition, pointsBehindLeader
                ]);
            }

            return this.findStats(seasonId, teamId);
        });
    }

    /**
     * Bulk insert or update season stats - MODIFIED: No transaction inside
     * @param {Array<Object>} statsArray - Array of season stats objects
     * @returns {Promise<number>} Number of stats processed
     */
    async bulkUpsertSeasonStats(statsArray) {
        // Do NOT use withTransaction here since this is called inside a transaction
        let processedCount = 0;
        for (const stats of statsArray) {
            try {
                const {
                    seasonId, teamId, fantasyPoints, adjustments, totalPoints,
                    fantasyPointsPerGame, gamesPlayed, hittingPoints,
                    teamPitchingPoints, waiverPosition, pointsBehindLeader
                } = stats;

                // Check if the stats record exists
                const existingStats = await this.findStats(seasonId, teamId);

                if (existingStats) {
                    // Update existing stats
                    await this.db.run(`
                        UPDATE season_stats
                        SET fantasy_points = ?, adjustments = ?, total_points = ?,
                            fantasy_points_per_game = ?, games_played = ?, hitting_points = ?,
                            team_pitching_points = ?, waiver_position = ?, points_behind_leader = ?
                        WHERE season_id = ? AND team_id = ?
                    `, [
                        fantasyPoints, adjustments, totalPoints,
                        fantasyPointsPerGame, gamesPlayed, hittingPoints,
                        teamPitchingPoints, waiverPosition, pointsBehindLeader,
                        seasonId, teamId
                    ]);
                } else {
                    // Insert new stats
                    await this.db.run(`
                        INSERT INTO season_stats (
                            season_id, team_id, fantasy_points, adjustments, total_points,
                            fantasy_points_per_game, games_played, hitting_points,
                            team_pitching_points, waiver_position, points_behind_leader
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        seasonId, teamId, fantasyPoints, adjustments, totalPoints,
                        fantasyPointsPerGame, gamesPlayed, hittingPoints,
                        teamPitchingPoints, waiverPosition, pointsBehindLeader
                    ]);
                }
                processedCount++;
            } catch (error) {
                console.error(`Error processing season stats: ${error.message}`);
                // Continue with next stats record if one fails
            }
        }
        return processedCount;
    }

    /**
     * Delete all season stats for a season
     * @param {number} seasonId - Season ID
     * @returns {Promise<number>} Number of deleted stats
     */
    async deleteSeasonStats(seasonId) {
        const result = await this.db.run('DELETE FROM season_stats WHERE season_id = ?', [seasonId]);
        return result.changes;
    }
}

module.exports = SeasonStatsDb;