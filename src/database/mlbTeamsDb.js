// src/database/mlbTeamsDb.js
const { withTransaction } = require('../utils/database');

/**
 * Functions for managing MLB teams data in the database
 */
class MlbTeamsDb {
    /**
     * Initialize with a database connection
     * @param {sqlite.Database} db - SQLite database connection
     */
    constructor(db) {
        this.db = db;
    }

    /**
     * Get all MLB teams
     * @returns {Promise<Array>} List of all MLB teams
     */
    async getAllTeams() {
        return this.db.all('SELECT * FROM mlb_teams ORDER BY name');
    }

    /**
     * Get an MLB team by its ID
     * @param {number} id - MLB team ID
     * @returns {Promise<Object|null>} Team or null if not found
     */
    async getTeamById(id) {
        return this.db.get('SELECT * FROM mlb_teams WHERE id = ?', [id]);
    }

    /**
     * Get an MLB team by abbreviation
     * @param {string} abbreviation - Team abbreviation
     * @returns {Promise<Object|null>} Team or null if not found
     */
    async getTeamByAbbreviation(abbreviation) {
        return this.db.get('SELECT * FROM mlb_teams WHERE abbreviation = ?', [abbreviation]);
    }

    /**
     * Find MLB teams by name (fuzzy match)
     * @param {string} name - Name to search for
     * @returns {Promise<Array>} List of matching teams
     */
    async findTeamsByName(name) {
        return this.db.all(
            'SELECT * FROM mlb_teams WHERE name LIKE ? OR short_name LIKE ?',
            [`%${name}%`, `%${name}%`]
        );
    }

    /**
     * Add or update an MLB team
     * @param {Object} team - Team data
     * @param {number} team.id - MLB team ID
     * @param {string} team.name - Full team name
     * @param {string} team.abbreviation - Team abbreviation
     * @param {string} team.shortName - Short team name
     * @returns {Promise<Object>} The inserted or updated team
     */
    async upsertTeam(team) {
        const { id, name, abbreviation, shortName } = team;

        // Validate required fields
        if (!id || !name) {
            throw new Error('ID and name are required for an MLB team');
        }

        return withTransaction(this.db, async () => {
            // Check if team exists
            const existingTeam = await this.getTeamById(id);

            if (existingTeam) {
                // Update existing team
                await this.db.run(
                    'UPDATE mlb_teams SET name = ?, abbreviation = ?, short_name = ? WHERE id = ?',
                    [name, abbreviation, shortName, id]
                );
            } else {
                // Insert new team
                await this.db.run(
                    'INSERT INTO mlb_teams (id, name, abbreviation, short_name) VALUES (?, ?, ?, ?)',
                    [id, name, abbreviation, shortName]
                );
            }

            return this.getTeamById(id);
        });
    }

    /**
     * Delete an MLB team by ID
     * @param {number} id - MLB team ID
     * @returns {Promise<boolean>} True if deleted, false if not found
     */
    async deleteTeam(id) {
        const result = await this.db.run('DELETE FROM mlb_teams WHERE id = ?', [id]);
        return result.changes > 0;
    }
}

module.exports = MlbTeamsDb;