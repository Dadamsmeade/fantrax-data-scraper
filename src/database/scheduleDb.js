const { withTransaction } = require('../utils/database');

/**
 * Functions for managing schedule data in the database
 */
class ScheduleDb {
    /**
     * Initialize with a database connection
     * @param {sqlite.Database} db - SQLite database connection
     */
    constructor(db) {
        this.db = db;
    }

    /**
     * Get all matchups for a season
     * @param {number} seasonId - Season ID
     * @returns {Promise<Array>} List of matchups for the season
     */
    async getScheduleBySeason(seasonId) {
        return this.db.all(`
            SELECT 
                s.id, s.period_number, s.period_type, s.date_range, s.matchup_id,
                away.id as away_team_id, away.name as away_team_name, away.team_id as away_team_fantrax_id,
                home.id as home_team_id, home.name as home_team_name, home.team_id as home_team_fantrax_id
            FROM schedule s
            JOIN teams away ON s.away_team_id = away.id
            JOIN teams home ON s.home_team_id = home.id
            WHERE s.season_id = ?
            ORDER BY 
                CASE 
                    WHEN s.period_type = 'Playoff' THEN 1 
                    ELSE 0 
                END,
                CASE 
                    WHEN SUBSTR(s.period_number, 1, 8) = 'Playoff-' THEN CAST(SUBSTR(s.period_number, 9) AS INTEGER) 
                    ELSE CAST(s.period_number AS INTEGER) 
                END
        `, [seasonId]);
    }

    /**
     * Get matchups for a specific period in a season
     * @param {number} seasonId - Season ID
     * @param {string} periodNumber - Period number
     * @returns {Promise<Array>} List of matchups for the period
     */
    async getMatchupsByPeriod(seasonId, periodNumber) {
        return this.db.all(`
            SELECT 
                s.id, s.period_number, s.period_type, s.date_range, s.matchup_id,
                away.id as away_team_id, away.name as away_team_name, away.team_id as away_team_fantrax_id,
                home.id as home_team_id, home.name as home_team_name, home.team_id as home_team_fantrax_id
            FROM schedule s
            JOIN teams away ON s.away_team_id = away.id
            JOIN teams home ON s.home_team_id = home.id
            WHERE s.season_id = ? AND s.period_number = ?
            ORDER BY s.id
        `, [seasonId, periodNumber]);
    }

    /**
     * Find a specific matchup
     * @param {number} seasonId - Season ID
     * @param {string} periodNumber - Period number
     * @param {number} awayTeamId - Away team ID
     * @param {number} homeTeamId - Home team ID
     * @returns {Promise<Object|null>} Matchup or null if not found
     */
    async findMatchup(seasonId, periodNumber, awayTeamId, homeTeamId) {
        return this.db.get(`
            SELECT * FROM schedule 
            WHERE season_id = ? AND period_number = ? 
            AND away_team_id = ? AND home_team_id = ?
        `, [seasonId, periodNumber, awayTeamId, homeTeamId]);
    }

    /**
     * Add or update a matchup
     * @param {Object} matchup - Matchup data
     * @param {number} matchup.seasonId - Season ID
     * @param {string} matchup.periodNumber - Period number
     * @param {string} matchup.periodType - Period type (Regular Season or Playoff)
     * @param {string} matchup.dateRange - Date range for the period
     * @param {number} matchup.awayTeamId - Away team database ID
     * @param {number} matchup.homeTeamId - Home team database ID
     * @param {string} [matchup.matchupId] - Matchup ID from Fantrax
     * @returns {Promise<Object>} The inserted or updated matchup
     */
    async upsertMatchup(matchup) {
        const { seasonId, periodNumber, periodType, dateRange, awayTeamId, homeTeamId, matchupId } = matchup;

        // Validate required fields
        if (!seasonId || !periodNumber || !periodType || !awayTeamId || !homeTeamId) {
            throw new Error('Missing required fields for matchup');
        }

        return withTransaction(this.db, async () => {
            // Check if matchup exists
            const existingMatchup = await this.findMatchup(
                seasonId, periodNumber, awayTeamId, homeTeamId
            );

            if (existingMatchup) {
                // Update existing matchup
                await this.db.run(`
                    UPDATE schedule 
                    SET period_type = ?, date_range = ?, matchup_id = ?
                    WHERE season_id = ? AND period_number = ? 
                    AND away_team_id = ? AND home_team_id = ?
                `, [
                    periodType,
                    dateRange || existingMatchup.date_range,
                    matchupId || existingMatchup.matchup_id,
                    seasonId, periodNumber, awayTeamId, homeTeamId
                ]);
            } else {
                // Insert new matchup
                await this.db.run(`
                    INSERT INTO schedule 
                    (season_id, period_number, period_type, date_range, 
                     away_team_id, home_team_id, matchup_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    seasonId, periodNumber, periodType, dateRange,
                    awayTeamId, homeTeamId, matchupId
                ]);
            }

            return this.findMatchup(seasonId, periodNumber, awayTeamId, homeTeamId);
        });
    }

    /**
     * Bulk insert or update matchups
     * @param {Array<Object>} matchups - Array of matchup objects
     * @returns {Promise<number>} Number of matchups processed
     */
    async bulkUpsertMatchups(matchups) {
        // Handle transaction manually
        try {
            await this.db.run('BEGIN TRANSACTION');

            let processedCount = 0;
            for (const matchup of matchups) {
                const { seasonId, periodNumber, periodType, dateRange, awayTeamId, homeTeamId, matchupId } = matchup;

                // Check if matchup exists
                const existingMatchup = await this.db.get(`
                    SELECT * FROM schedule 
                    WHERE season_id = ? AND period_number = ? 
                    AND away_team_id = ? AND home_team_id = ?
                `, [seasonId, periodNumber, awayTeamId, homeTeamId]);

                if (existingMatchup) {
                    // Update existing matchup
                    await this.db.run(`
                        UPDATE schedule 
                        SET period_type = ?, date_range = ?, matchup_id = ?
                        WHERE season_id = ? AND period_number = ? 
                        AND away_team_id = ? AND home_team_id = ?
                    `, [
                        periodType,
                        dateRange || existingMatchup.date_range,
                        matchupId || existingMatchup.matchup_id,
                        seasonId, periodNumber, awayTeamId, homeTeamId
                    ]);
                } else {
                    // Insert new matchup
                    await this.db.run(`
                        INSERT INTO schedule 
                        (season_id, period_number, period_type, date_range, 
                         away_team_id, home_team_id, matchup_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `, [
                        seasonId, periodNumber, periodType, dateRange,
                        awayTeamId, homeTeamId, matchupId
                    ]);
                }

                processedCount++;
            }

            await this.db.run('COMMIT');
            return processedCount;
        } catch (error) {
            try {
                await this.db.run('ROLLBACK');
            } catch (rollbackError) {
                console.error('Error during schedule rollback:', rollbackError);
            }
            throw error;
        }
    }

    /**
     * Delete all matchups for a season
     * @param {number} seasonId - Season ID
     * @returns {Promise<number>} Number of deleted matchups
     */
    async deleteSeasonSchedule(seasonId) {
        const result = await this.db.run('DELETE FROM schedule WHERE season_id = ?', [seasonId]);
        return result.changes;
    }
}

module.exports = ScheduleDb;