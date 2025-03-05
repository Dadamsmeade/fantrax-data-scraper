const { withTransaction } = require('../utils/database');

/**
 * Functions for managing standings data in the database
 */
class StandingsDb {
    /**
     * Initialize with a database connection
     * @param {sqlite.Database} db - SQLite database connection
     */
    constructor(db) {
        this.db = db;
    }

    /**
     * Get standings for a season
     * @param {number} seasonId - Season ID
     * @returns {Promise<Array>} List of standings for the season
     */
    async getStandingsBySeason(seasonId) {
        return this.db.all(`
            SELECT s.*, t.name as team_name, t.team_id as fantrax_team_id, 
                   m.name as manager_name, m.active_from, m.active_until
            FROM standings s
            JOIN teams t ON s.team_id = t.id
            LEFT JOIN managers m ON t.manager_id = m.id
            WHERE s.season_id = ?
            ORDER BY s.rank
        `, [seasonId]);
    }

    /**
     * Find a specific team's standings record
     * @param {number} seasonId - Season ID
     * @param {number} teamId - Team ID
     * @returns {Promise<Object|null>} Standing record or null if not found
     */
    async findStanding(seasonId, teamId) {
        return this.db.get(`
            SELECT * FROM standings
            WHERE season_id = ? AND team_id = ?
        `, [seasonId, teamId]);
    }

    /**
     * Add or update a standing record
     * @param {Object} standing - Standing data
     * @param {number} standing.seasonId - Season ID
     * @param {number} standing.teamId - Team database ID
     * @param {number} standing.rank - Team rank
     * @param {number} standing.wins - Wins
     * @param {number} standing.losses - Losses
     * @param {number} standing.ties - Ties
     * @param {number} standing.winPercentage - Win percentage
     * @param {string} standing.divisionRecord - Division record
     * @param {number} standing.gamesBack - Games back
     * @param {number} standing.waiverPosition - Waiver wire position
     * @param {number} standing.fantasyPointsFor - Fantasy points for
     * @param {number} standing.fantasyPointsAgainst - Fantasy points against
     * @param {string} standing.streak - Current streak
     * @returns {Promise<Object>} The inserted or updated standing
     */
    async upsertStanding(standing) {
        const { seasonId, teamId, rank, wins, losses, ties, winPercentage,
            divisionRecord, gamesBack, waiverPosition,
            fantasyPointsFor, fantasyPointsAgainst, streak } = standing;

        // Validate required fields
        if (!seasonId || !teamId) {
            throw new Error('Season ID and team ID are required');
        }

        return withTransaction(this.db, async () => {
            // Check if the standing record exists
            const existingStanding = await this.findStanding(seasonId, teamId);

            if (existingStanding) {
                // Update existing standing
                await this.db.run(`
                    UPDATE standings
                    SET rank = ?, wins = ?, losses = ?, ties = ?, win_percentage = ?,
                        division_record = ?, games_back = ?, waiver_position = ?,
                        fantasy_points_for = ?, fantasy_points_against = ?, streak = ?
                    WHERE season_id = ? AND team_id = ?
                `, [
                    rank, wins, losses, ties, winPercentage,
                    divisionRecord, gamesBack, waiverPosition,
                    fantasyPointsFor, fantasyPointsAgainst, streak,
                    seasonId, teamId
                ]);
            } else {
                // Insert new standing
                await this.db.run(`
                    INSERT INTO standings (
                        season_id, team_id, rank, wins, losses, ties, win_percentage,
                        division_record, games_back, waiver_position, 
                        fantasy_points_for, fantasy_points_against, streak
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    seasonId, teamId, rank, wins, losses, ties, winPercentage,
                    divisionRecord, gamesBack, waiverPosition,
                    fantasyPointsFor, fantasyPointsAgainst, streak
                ]);
            }

            return this.findStanding(seasonId, teamId);
        });
    }

    /**
     * Bulk insert or update standings
     * @param {Array<Object>} standings - Array of standing objects
     * @returns {Promise<number>} Number of standings processed
     */
    async bulkUpsertStandings(standings) {
        return withTransaction(this.db, async () => {
            let processedCount = 0;
            for (const standing of standings) {
                await this.upsertStanding(standing);
                processedCount++;
            }
            return processedCount;
        });
    }

    /**
     * Delete all standings for a season
     * @param {number} seasonId - Season ID
     * @returns {Promise<number>} Number of deleted standings
     */
    async deleteSeasonStandings(seasonId) {
        const result = await this.db.run('DELETE FROM standings WHERE season_id = ?', [seasonId]);
        return result.changes;
    }
}

module.exports = StandingsDb;