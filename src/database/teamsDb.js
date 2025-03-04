const { withTransaction } = require('../utils/database');

/**
 * Functions for managing teams in the database
 */
class TeamsDb {
    /**
     * Initialize with a database connection
     * @param {sqlite.Database} db - SQLite database connection
     */
    constructor(db) {
        this.db = db;
    }

    /**
     * Get all teams for a season
     * @param {number} seasonId - Season ID
     * @returns {Promise<Array>} List of teams for the season
     */
    async getTeamsBySeason(seasonId) {
        return this.db.all('SELECT * FROM teams WHERE season_id = ? ORDER BY name', [seasonId]);
    }

    /**
     * Get a team by its Fantrax ID and season ID
     * @param {string} teamId - Fantrax team ID
     * @param {number} seasonId - Season ID
     * @returns {Promise<Object|null>} Team or null if not found
     */
    async getTeam(teamId, seasonId) {
        return this.db.get(
            'SELECT * FROM teams WHERE team_id = ? AND season_id = ?',
            [teamId, seasonId]
        );
    }

    /**
     * Get a team by database ID
     * @param {number} id - Database ID
     * @returns {Promise<Object|null>} Team or null if not found
     */
    async getTeamById(id) {
        return this.db.get('SELECT * FROM teams WHERE id = ?', [id]);
    }

    /**
     * Add or update a team
     * @param {Object} team - Team data
     * @param {string} team.teamId - Fantrax team ID
     * @param {number} team.seasonId - Season ID
     * @param {string} team.name - Team name
     * @param {string} [team.iconUrl] - Team icon URL
     * @returns {Promise<Object>} The inserted or updated team
     */
    async upsertTeam(team) {
        const { teamId, seasonId, name, iconUrl } = team;

        // Validate required fields
        if (!teamId || !seasonId || !name) {
            throw new Error('Team ID, season ID, and name are required');
        }

        return withTransaction(this.db, async () => {
            // Check if team exists
            const existingTeam = await this.getTeam(teamId, seasonId);

            if (existingTeam) {
                // Update existing team
                await this.db.run(
                    'UPDATE teams SET name = ?, icon_url = ? WHERE team_id = ? AND season_id = ?',
                    [name, iconUrl || existingTeam.icon_url, teamId, seasonId]
                );
                return this.getTeam(teamId, seasonId);
            } else {
                // Insert new team
                await this.db.run(
                    'INSERT INTO teams (team_id, season_id, name, icon_url) VALUES (?, ?, ?, ?)',
                    [teamId, seasonId, name, iconUrl || null]
                );
                return this.getTeam(teamId, seasonId);
            }
        });
    }

    /**
     * Bulk insert or update teams
     * @param {Array<Object>} teams - Array of team objects
     * @returns {Promise<number>} Number of teams processed
     */
    async bulkUpsertTeams(teams) {
        // Don't use withTransaction here, handle transaction manually
        try {
            await this.db.run('BEGIN TRANSACTION');

            let processedCount = 0;
            for (const team of teams) {
                // We don't use this.upsertTeam because it would start its own transaction
                // Instead, do the upsert logic directly
                const { teamId, seasonId, name, iconUrl } = team;

                // Check if team exists
                const existingTeam = await this.db.get(
                    'SELECT * FROM teams WHERE team_id = ? AND season_id = ?',
                    [teamId, seasonId]
                );

                if (existingTeam) {
                    // Update existing team
                    await this.db.run(
                        'UPDATE teams SET name = ?, icon_url = ? WHERE team_id = ? AND season_id = ?',
                        [name, iconUrl || existingTeam.icon_url, teamId, seasonId]
                    );
                } else {
                    // Insert new team
                    await this.db.run(
                        'INSERT INTO teams (team_id, season_id, name, icon_url) VALUES (?, ?, ?, ?)',
                        [teamId, seasonId, name, iconUrl || null]
                    );
                }

                processedCount++;
            }

            await this.db.run('COMMIT');
            return processedCount;
        } catch (error) {
            try {
                await this.db.run('ROLLBACK');
            } catch (rollbackError) {
                console.error('Error during teams rollback:', rollbackError);
            }
            throw error;
        }
    }
}

module.exports = TeamsDb;