const { withTransaction } = require('../utils/database');

/**
 * Functions for managing seasons in the database
 */
class SeasonsDb {
    /**
     * Initialize with a database connection
     * @param {sqlite.Database} db - SQLite database connection
     */
    constructor(db) {
        this.db = db;
    }

    /**
     * Get all seasons
     * @returns {Promise<Array>} List of all seasons
     */
    async getAllSeasons() {
        return this.db.all('SELECT * FROM seasons ORDER BY year DESC');
    }

    /**
     * Get a season by its league ID
     * @param {string} leagueId - The Fantrax league ID
     * @returns {Promise<Object|null>} Season or null if not found
     */
    async getSeasonByLeagueId(leagueId) {
        return this.db.get('SELECT * FROM seasons WHERE league_id = ?', [leagueId]);
    }

    /**
     * Get a season by year
     * @param {string} year - The season year
     * @returns {Promise<Object|null>} Season or null if not found
     */
    async getSeasonByYear(year) {
        return this.db.get('SELECT * FROM seasons WHERE year = ?', [year]);
    }

    /**
     * Add or update a season
     * @param {Object} season - Season data
     * @param {string} season.year - Season year
     * @param {string} season.leagueId - Fantrax league ID
     * @param {string} [season.name] - League name
     * @returns {Promise<Object>} The inserted or updated season
     */
    async upsertSeason(season) {
        const { year, leagueId, name } = season;

        // Validate required fields
        if (!year || !leagueId) {
            throw new Error('Year and leagueId are required for a season');
        }

        return withTransaction(this.db, async () => {
            // Check if season exists by league ID
            const existingSeason = await this.getSeasonByLeagueId(leagueId);

            if (existingSeason) {
                // Update existing season
                await this.db.run(
                    'UPDATE seasons SET year = ?, name = ? WHERE league_id = ?',
                    [year, name || existingSeason.name, leagueId]
                );
                return this.getSeasonByLeagueId(leagueId);
            } else {
                // Insert new season
                await this.db.run(
                    'INSERT INTO seasons (year, league_id, name) VALUES (?, ?, ?)',
                    [year, leagueId, name || null]
                );
                return this.getSeasonByLeagueId(leagueId);
            }
        });
    }

    /**
     * Delete a season by league ID
     * @param {string} leagueId - Fantrax league ID
     * @returns {Promise<boolean>} True if deleted, false if not found
     */
    async deleteSeason(leagueId) {
        const result = await this.db.run('DELETE FROM seasons WHERE league_id = ?', [leagueId]);
        return result.changes > 0;
    }
}

module.exports = SeasonsDb;