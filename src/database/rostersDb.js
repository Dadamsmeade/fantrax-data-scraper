const { withTransaction } = require('../utils/database');

/**
 * Functions for managing roster data in the database
 */
class RostersDb {
    /**
     * Initialize with a database connection
     * @param {sqlite.Database} db - SQLite database connection
     */
    constructor(db) {
        this.db = db;
    }

    /**
     * Get all rosters for a season
     * @param {number} seasonId - Season ID
     * @returns {Promise<Array>} List of roster entries for the season
     */
    async getRostersBySeason(seasonId) {
        return this.db.all(`
            SELECT r.*, 
                   t.name as team_name, t.team_id as fantrax_team_id,
                   p.full_name as player_full_name, p.first_name as player_first_name, p.last_name as player_last_name
            FROM rosters r
            JOIN teams t ON r.team_id = t.id
            LEFT JOIN players p ON r.player_id = p.id
            WHERE r.season_id = ?
            ORDER BY r.period_number, t.name, r.position_code, r.roster_slot
        `, [seasonId]);
    }

    /**
     * Get roster for a specific team and period
     * @param {number} teamId - Team ID
     * @param {number} periodNumber - Period number
     * @returns {Promise<Array>} List of roster entries
     */
    async getTeamRosterByPeriod(teamId, periodNumber) {
        return this.db.all(`
            SELECT r.*, 
                   t.name as team_name, t.team_id as fantrax_team_id,
                   p.full_name as player_full_name, p.first_name as player_first_name, p.last_name as player_last_name
            FROM rosters r
            JOIN teams t ON r.team_id = t.id
            LEFT JOIN players p ON r.player_id = p.id
            WHERE r.team_id = ? AND r.period_number = ?
            ORDER BY r.is_active DESC, r.position_code, r.roster_slot
        `, [teamId, periodNumber]);
    }

    /**
     * Find a specific roster entry
     * @param {number} seasonId - Season ID
     * @param {number} teamId - Team ID
     * @param {number} periodNumber - Period number
     * @param {string} positionCode - Position code
     * @param {number} rosterSlot - Roster slot number
     * @returns {Promise<Object|null>} Roster entry or null if not found
     */
    async findRosterEntry(seasonId, teamId, periodNumber, positionCode, rosterSlot) {
        return this.db.get(`
            SELECT * FROM rosters 
            WHERE season_id = ? AND team_id = ? AND period_number = ? 
            AND position_code = ? AND roster_slot = ?
        `, [seasonId, teamId, periodNumber, positionCode, rosterSlot]);
    }

    /**
     * Add or update a roster entry
     * @param {Object} entry - Roster entry data
     * @returns {Promise<Object>} The inserted or updated roster entry
     */
    async upsertRosterEntry(entry) {
        const {
            seasonId, teamId, periodNumber, playerId, positionCode,
            rosterSlot, isActive, playerName, playerNameNormalized,
            mlbTeam, batSide, fantraxPlayerId
        } = entry;

        // Validate required fields
        if (!seasonId || !teamId || !periodNumber || !positionCode || rosterSlot === undefined) {
            throw new Error('Missing required fields for roster entry');
        }

        return withTransaction(this.db, async () => {
            // Check if entry exists
            const existingEntry = await this.findRosterEntry(
                seasonId, teamId, periodNumber, positionCode, rosterSlot
            );

            if (existingEntry) {
                // Update existing entry
                await this.db.run(`
                    UPDATE rosters 
                    SET player_id = ?, is_active = ?, player_name = ?, 
                        player_name_normalized = ?, mlb_team = ?, bat_side = ?, 
                        fantrax_player_id = ?
                    WHERE season_id = ? AND team_id = ? AND period_number = ? 
                    AND position_code = ? AND roster_slot = ?
                `, [
                    playerId, isActive ? 1 : 0, playerName,
                    playerNameNormalized, mlbTeam, batSide,
                    fantraxPlayerId,
                    seasonId, teamId, periodNumber, positionCode, rosterSlot
                ]);
            } else {
                // Insert new entry
                await this.db.run(`
                    INSERT INTO rosters (
                        season_id, team_id, period_number, player_id, position_code,
                        roster_slot, is_active, player_name, player_name_normalized,
                        mlb_team, bat_side, fantrax_player_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    seasonId, teamId, periodNumber, playerId, positionCode,
                    rosterSlot, isActive ? 1 : 0, playerName, playerNameNormalized,
                    mlbTeam, batSide, fantraxPlayerId
                ]);
            }

            return this.findRosterEntry(seasonId, teamId, periodNumber, positionCode, rosterSlot);
        });
    }

    /**
     * Bulk insert or update roster entries for a team/period
     * @param {Array<Object>} entries - Array of roster entry objects
     * @returns {Promise<number>} Number of entries processed
     */
    async bulkUpsertRosterEntries(entries) {
        // Handle transaction manually
        try {
            await this.db.run('BEGIN TRANSACTION');

            let processedCount = 0;
            for (const entry of entries) {
                try {
                    const {
                        seasonId, teamId, periodNumber, playerId, positionCode,
                        rosterSlot, isActive, playerName, playerNameNormalized,
                        mlbTeam, batSide, fantraxPlayerId
                    } = entry;

                    // Check if entry exists
                    const existingEntry = await this.db.get(`
                        SELECT * FROM rosters 
                        WHERE season_id = ? AND team_id = ? AND period_number = ? 
                        AND position_code = ? AND roster_slot = ?
                    `, [seasonId, teamId, periodNumber, positionCode, rosterSlot]);

                    if (existingEntry) {
                        // Update existing entry
                        await this.db.run(`
                            UPDATE rosters 
                            SET player_id = ?, is_active = ?, player_name = ?, 
                                player_name_normalized = ?, mlb_team = ?, bat_side = ?, 
                                fantrax_player_id = ?
                            WHERE season_id = ? AND team_id = ? AND period_number = ? 
                            AND position_code = ? AND roster_slot = ?
                        `, [
                            playerId, isActive ? 1 : 0, playerName,
                            playerNameNormalized, mlbTeam, batSide,
                            fantraxPlayerId,
                            seasonId, teamId, periodNumber, positionCode, rosterSlot
                        ]);
                    } else {
                        // Insert new entry
                        await this.db.run(`
                            INSERT INTO rosters (
                                season_id, team_id, period_number, player_id, position_code,
                                roster_slot, is_active, player_name, player_name_normalized,
                                mlb_team, bat_side, fantrax_player_id
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [
                            seasonId, teamId, periodNumber, playerId, positionCode,
                            rosterSlot, isActive ? 1 : 0, playerName, playerNameNormalized,
                            mlbTeam, batSide, fantraxPlayerId
                        ]);
                    }

                    processedCount++;
                } catch (error) {
                    console.error(`Error processing roster entry: ${error.message}`);
                }
            }

            await this.db.run('COMMIT');
            return processedCount;
        } catch (error) {
            try {
                await this.db.run('ROLLBACK');
            } catch (rollbackError) {
                console.error('Error during roster rollback:', rollbackError);
            }
            throw error;
        }
    }

    /**
     * Delete all roster entries for a season
     * @param {number} seasonId - Season ID
     * @returns {Promise<number>} Number of deleted entries
     */
    async deleteSeasonRosters(seasonId) {
        const result = await this.db.run('DELETE FROM rosters WHERE season_id = ?', [seasonId]);
        return result.changes;
    }

    /**
     * Delete all roster entries for a team in a specific period
     * @param {number} teamId - Team ID
     * @param {number} periodNumber - Period number
     * @returns {Promise<number>} Number of deleted entries
     */
    async deleteTeamPeriodRosters(teamId, periodNumber) {
        const result = await this.db.run(
            'DELETE FROM rosters WHERE team_id = ? AND period_number = ?',
            [teamId, periodNumber]
        );
        return result.changes;
    }

    /**
     * Match player names with the players table
     * @param {number} seasonId - Season ID to process
     * @returns {Promise<Object>} Results of the matching process
     */
    async matchPlayerNames(seasonId) {
        // Get all roster entries for the season that have no player_id
        const unmatched = await this.db.all(`
            SELECT * FROM rosters 
            WHERE season_id = ? AND player_id IS NULL
            ORDER BY team_id, period_number
        `, [seasonId]);

        console.log(`Found ${unmatched.length} unmatched roster entries`);

        let matched = 0;
        let stillUnmatched = 0;

        // Process each unmatched entry
        for (const entry of unmatched) {
            // Skip team pitching - these don't match to real players
            if (entry.position_code === 'TmP') {
                continue;
            }

            // Try exact match on normalized name
            const exactMatch = await this.db.get(`
                SELECT id FROM players
                WHERE normalized_full_name = ?
                LIMIT 1
            `, [entry.player_name_normalized]);

            if (exactMatch) {
                // Update the entry with the player_id
                await this.db.run(`
                    UPDATE rosters SET player_id = ? 
                    WHERE id = ?
                `, [exactMatch.id, entry.id]);
                matched++;
                continue;
            }

            // Try fuzzy match (name starts with)
            const fuzzyMatch = await this.db.get(`
                SELECT id FROM players
                WHERE normalized_full_name LIKE ?
                LIMIT 1
            `, [`${entry.player_name_normalized}%`]);

            if (fuzzyMatch) {
                // Update the entry with the player_id
                await this.db.run(`
                    UPDATE rosters SET player_id = ? 
                    WHERE id = ?
                `, [fuzzyMatch.id, entry.id]);
                matched++;
                continue;
            }

            // If we get here, the entry is still unmatched
            stillUnmatched++;
        }

        return {
            processed: unmatched.length,
            matched,
            stillUnmatched
        };
    }
}

module.exports = RostersDb;