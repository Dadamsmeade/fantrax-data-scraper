// src/database/mlbGamesDb.js
const { withTransaction } = require('../utils/database');

/**
 * Functions for managing MLB games data in the database
 */
class MlbGamesDb {
    /**
     * Initialize with a database connection
     * @param {sqlite.Database} db - SQLite database connection
     */
    constructor(db) {
        this.db = db;
    }

    /**
     * Get all MLB games for a season
     * @param {string} season - Season year (e.g., '2024')
     * @returns {Promise<Array>} List of MLB games for the season
     */
    async getGamesBySeason(season) {
        return this.db.all(`
            SELECT g.*, 
                   home.name as home_team_name, 
                   away.name as away_team_name
            FROM mlb_games g
            LEFT JOIN mlb_teams home ON g.home_team_id = home.id
            LEFT JOIN mlb_teams away ON g.away_team_id = away.id
            WHERE g.season = ?
            ORDER BY g.official_date
        `, [season]);
    }

    /**
     * Get MLB games for a specific date range
     * @param {string} season - Season year
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Array>} List of MLB games for the date range
     */
    async getGamesByDateRange(season, startDate, endDate) {
        return this.db.all(`
            SELECT g.*, 
                   home.name as home_team_name, 
                   away.name as away_team_name
            FROM mlb_games g
            LEFT JOIN mlb_teams home ON g.home_team_id = home.id
            LEFT JOIN mlb_teams away ON g.away_team_id = away.id
            WHERE g.season = ? 
            AND g.official_date >= ? 
            AND g.official_date <= ?
            ORDER BY g.official_date
        `, [season, startDate, endDate]);
    }

    /**
     * Get all games for a specific MLB team in a season
     * @param {string} season - Season year
     * @param {number} teamId - MLB team ID
     * @returns {Promise<Array>} List of MLB games for the team
     */
    async getTeamGames(season, teamId) {
        return this.db.all(`
            SELECT g.*, 
                   home.name as home_team_name, 
                   away.name as away_team_name
            FROM mlb_games g
            LEFT JOIN mlb_teams home ON g.home_team_id = home.id
            LEFT JOIN mlb_teams away ON g.away_team_id = away.id
            WHERE g.season = ? 
            AND (g.home_team_id = ? OR g.away_team_id = ?)
            ORDER BY g.official_date
        `, [season, teamId, teamId]);
    }

    /**
     * Get a specific MLB game by its ID
     * @param {number} gamePk - MLB game ID
     * @returns {Promise<Object|null>} Game or null if not found
     */
    async getGameById(gamePk) {
        return this.db.get(`
            SELECT g.*, 
                   home.name as home_team_name, 
                   away.name as away_team_name
            FROM mlb_games g
            LEFT JOIN mlb_teams home ON g.home_team_id = home.id
            LEFT JOIN mlb_teams away ON g.away_team_id = away.id
            WHERE g.game_pk = ?
        `, [gamePk]);
    }

    /**
     * Add or update an MLB game
     * @param {Object} game - Game data
     * @returns {Promise<Object>} The inserted or updated game
     */
    async upsertGame(game) {
        const {
            gamePk, season, officialDate, gameType,
            abstractGameState, dayNight,
            homeTeamId, awayTeamId,
            homeTeamScore, awayTeamScore,
            venueId, venueName
        } = game;

        // Validate required fields
        if (!gamePk || !season || !officialDate) {
            throw new Error('Game PK, season, and official date are required');
        }

        return withTransaction(this.db, async () => {
            // Check if game exists
            const existingGame = await this.getGameById(gamePk);

            if (existingGame) {
                // Update existing game
                await this.db.run(`
                    UPDATE mlb_games 
                    SET season = ?, official_date = ?, game_type = ?, 
                        abstract_game_state = ?, day_night = ?,
                        home_team_id = ?, away_team_id = ?,
                        home_team_score = ?, away_team_score = ?,
                        venue_id = ?, venue_name = ?
                    WHERE game_pk = ?
                `, [
                    season, officialDate, gameType,
                    abstractGameState, dayNight,
                    homeTeamId, awayTeamId,
                    homeTeamScore, awayTeamScore,
                    venueId, venueName,
                    gamePk
                ]);
            } else {
                // Insert new game
                await this.db.run(`
                    INSERT INTO mlb_games (
                        game_pk, season, official_date, game_type,
                        abstract_game_state, day_night,
                        home_team_id, away_team_id,
                        home_team_score, away_team_score,
                        venue_id, venue_name
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    gamePk, season, officialDate, gameType,
                    abstractGameState, dayNight,
                    homeTeamId, awayTeamId,
                    homeTeamScore, awayTeamScore,
                    venueId, venueName
                ]);
            }

            return this.getGameById(gamePk);
        });
    }

    /**
     * Delete all MLB games for a season
     * @param {string} season - Season year
     * @returns {Promise<number>} Number of deleted games
     */
    async deleteSeasonGames(season) {
        const result = await this.db.run('DELETE FROM mlb_games WHERE season = ?', [season]);
        return result.changes;
    }

    /**
     * Count MLB games by season
     * @returns {Promise<Array>} Array of objects with season and count
     */
    async countGamesBySeason() {
        return this.db.all(`
            SELECT season, COUNT(*) as count
            FROM mlb_games
            GROUP BY season
            ORDER BY season DESC
        `);
    }
}

module.exports = MlbGamesDb;