// src/database/batterGameStatsDb.js
const { withTransaction } = require('../utils/database');

/**
 * Functions for managing MLB batter game stats in the database
 */
class BatterGameStatsDb {
    /**
     * Initialize with a database connection
     * @param {sqlite.Database} db - SQLite database connection
     */
    constructor(db) {
        this.db = db;
    }

    /**
     * Get all batter game stats for a specific game
     * @param {number} gamePk - MLB game ID
     * @returns {Promise<Array>} List of batter game stats for the game
     */
    async getStatsByGame(gamePk) {
        return this.db.all(`
            SELECT * FROM batter_game_stats
            WHERE game_pk = ?
            ORDER BY team_id, player_name
        `, [gamePk]);
    }

    /**
     * Get all batter game stats for a specific player
     * @param {number} playerId - MLB player ID
     * @returns {Promise<Array>} List of batter game stats for the player
     */
    async getStatsByPlayer(playerId) {
        return this.db.all(`
            SELECT * FROM batter_game_stats
            WHERE player_id = ?
            ORDER BY game_date DESC
        `, [playerId]);
    }

    /**
     * Get all batter game stats for a specific team in a date range
     * @param {number} teamId - MLB team ID
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Array>} List of batter game stats for the team
     */
    async getStatsByTeamAndDateRange(teamId, startDate, endDate) {
        return this.db.all(`
            SELECT * FROM batter_game_stats
            WHERE team_id = ? 
            AND game_date >= ? 
            AND game_date <= ?
            ORDER BY game_date, player_name
        `, [teamId, startDate, endDate]);
    }

    /**
     * Check if batter game stats exist for a specific game
     * @param {number} gamePk - MLB game ID
     * @returns {Promise<boolean>} True if stats exist for the game
     */
    async hasStatsForGame(gamePk) {
        const result = await this.db.get(`
            SELECT COUNT(*) as count FROM batter_game_stats
            WHERE game_pk = ?
        `, [gamePk]);

        return result.count > 0;
    }

    /**
     * Add or update batter game stats
     * @param {Object} stats - Batter game stats data
     * @returns {Promise<Object>} The inserted or updated stats
     */
    async upsertBatterGameStats(stats) {
        const {
            gamePk, playerId, playerName, teamId, teamName, gameDate,
            gamesPlayed, plateAppearances, atBats, runs, hits, doubles,
            triples, homeRuns, rbi, stolenBases, caughtStealing,
            baseOnBalls, intentionalWalks, strikeouts, hitByPitch,
            sacFlies, sacBunts, groundIntoDoublePlay, groundIntoTriplePlay,
            flyOuts, groundOuts, popOuts, lineOuts, airOuts,
            battingSummary, avg, obp, slg, ops, totalBases,
            leftOnBase, atBatsPerHomeRun, stolenBasePercentage
        } = stats;

        // Validate required fields
        if (!gamePk || !playerId || !playerName || !teamId) {
            throw new Error('Game PK, player ID, player name, and team ID are required');
        }

        return withTransaction(this.db, async () => {
            // Check if stats already exist
            const existingStats = await this.db.get(`
                SELECT * FROM batter_game_stats
                WHERE game_pk = ? AND player_id = ? AND team_id = ?
            `, [gamePk, playerId, teamId]);

            if (existingStats) {
                // Update existing stats
                await this.db.run(`
                    UPDATE batter_game_stats SET
                        player_name = ?, team_name = ?, game_date = ?,
                        games_played = ?, plate_appearances = ?, at_bats = ?,
                        runs = ?, hits = ?, doubles = ?, triples = ?,
                        home_runs = ?, rbi = ?, stolen_bases = ?, caught_stealing = ?,
                        base_on_balls = ?, intentional_walks = ?, strikeouts = ?,
                        hit_by_pitch = ?, sac_flies = ?, sac_bunts = ?,
                        ground_into_double_play = ?, ground_into_triple_play = ?,
                        fly_outs = ?, ground_outs = ?, pop_outs = ?, line_outs = ?, air_outs = ?,
                        batting_summary = ?, avg = ?, obp = ?, slg = ?, ops = ?,
                        total_bases = ?, left_on_base = ?,
                        at_bats_per_home_run = ?, stolen_base_percentage = ?
                    WHERE game_pk = ? AND player_id = ? AND team_id = ?
                `, [
                    playerName, teamName, gameDate,
                    gamesPlayed, plateAppearances, atBats,
                    runs, hits, doubles, triples,
                    homeRuns, rbi, stolenBases, caughtStealing,
                    baseOnBalls, intentionalWalks, strikeouts,
                    hitByPitch, sacFlies, sacBunts,
                    groundIntoDoublePlay, groundIntoTriplePlay,
                    flyOuts, groundOuts, popOuts, lineOuts, airOuts,
                    battingSummary, avg, obp, slg, ops,
                    totalBases, leftOnBase,
                    atBatsPerHomeRun, stolenBasePercentage,
                    gamePk, playerId, teamId
                ]);
            } else {
                // Insert new stats
                await this.db.run(`
                    INSERT INTO batter_game_stats (
                        game_pk, player_id, player_name, team_id, team_name, game_date,
                        games_played, plate_appearances, at_bats, runs, hits, doubles,
                        triples, home_runs, rbi, stolen_bases, caught_stealing,
                        base_on_balls, intentional_walks, strikeouts, hit_by_pitch,
                        sac_flies, sac_bunts, ground_into_double_play, ground_into_triple_play,
                        fly_outs, ground_outs, pop_outs, line_outs, air_outs,
                        batting_summary, avg, obp, slg, ops, total_bases,
                        left_on_base, at_bats_per_home_run, stolen_base_percentage
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    gamePk, playerId, playerName, teamId, teamName, gameDate,
                    gamesPlayed, plateAppearances, atBats, runs, hits, doubles,
                    triples, homeRuns, rbi, stolenBases, caughtStealing,
                    baseOnBalls, intentionalWalks, strikeouts, hitByPitch,
                    sacFlies, sacBunts, groundIntoDoublePlay, groundIntoTriplePlay,
                    flyOuts, groundOuts, popOuts, lineOuts, airOuts,
                    battingSummary, avg, obp, slg, ops, totalBases,
                    leftOnBase, atBatsPerHomeRun, stolenBasePercentage
                ]);
            }

            return this.db.get(`
                SELECT * FROM batter_game_stats
                WHERE game_pk = ? AND player_id = ? AND team_id = ?
            `, [gamePk, playerId, teamId]);
        });
    }

    /**
     * Bulk insert or update batter game stats
     * @param {Array<Object>} statsArray - Array of batter game stats objects
     * @returns {Promise<number>} Number of stats processed
     */
    async bulkUpsertBatterGameStats(statsArray) {
        // Handle transaction manually
        try {
            await this.db.run('BEGIN TRANSACTION');

            let processedCount = 0;
            for (const stats of statsArray) {
                try {
                    const {
                        gamePk, playerId, playerName, teamId, teamName, gameDate,
                        gamesPlayed, plateAppearances, atBats, runs, hits, doubles,
                        triples, homeRuns, rbi, stolenBases, caughtStealing,
                        baseOnBalls, intentionalWalks, strikeouts, hitByPitch,
                        sacFlies, sacBunts, groundIntoDoublePlay, groundIntoTriplePlay,
                        flyOuts, groundOuts, popOuts, lineOuts, airOuts,
                        battingSummary, avg, obp, slg, ops, totalBases,
                        leftOnBase, atBatsPerHomeRun, stolenBasePercentage
                    } = stats;

                    // Check if stats already exist
                    const existingStats = await this.db.get(`
                        SELECT * FROM batter_game_stats
                        WHERE game_pk = ? AND player_id = ? AND team_id = ?
                    `, [gamePk, playerId, teamId]);

                    if (existingStats) {
                        // Update existing stats
                        await this.db.run(`
                            UPDATE batter_game_stats SET
                                player_name = ?, team_name = ?, game_date = ?,
                                games_played = ?, plate_appearances = ?, at_bats = ?,
                                runs = ?, hits = ?, doubles = ?, triples = ?,
                                home_runs = ?, rbi = ?, stolen_bases = ?, caught_stealing = ?,
                                base_on_balls = ?, intentional_walks = ?, strikeouts = ?,
                                hit_by_pitch = ?, sac_flies = ?, sac_bunts = ?,
                                ground_into_double_play = ?, ground_into_triple_play = ?,
                                fly_outs = ?, ground_outs = ?, pop_outs = ?, line_outs = ?, air_outs = ?,
                                batting_summary = ?, avg = ?, obp = ?, slg = ?, ops = ?,
                                total_bases = ?, left_on_base = ?,
                                at_bats_per_home_run = ?, stolen_base_percentage = ?
                            WHERE game_pk = ? AND player_id = ? AND team_id = ?
                        `, [
                            playerName, teamName, gameDate,
                            gamesPlayed, plateAppearances, atBats,
                            runs, hits, doubles, triples,
                            homeRuns, rbi, stolenBases, caughtStealing,
                            baseOnBalls, intentionalWalks, strikeouts,
                            hitByPitch, sacFlies, sacBunts,
                            groundIntoDoublePlay, groundIntoTriplePlay,
                            flyOuts, groundOuts, popOuts, lineOuts, airOuts,
                            battingSummary, avg, obp, slg, ops,
                            totalBases, leftOnBase,
                            atBatsPerHomeRun, stolenBasePercentage,
                            gamePk, playerId, teamId
                        ]);
                    } else {
                        // Insert new stats
                        await this.db.run(`
                            INSERT INTO batter_game_stats (
                                game_pk, player_id, player_name, team_id, team_name, game_date,
                                games_played, plate_appearances, at_bats, runs, hits, doubles,
                                triples, home_runs, rbi, stolen_bases, caught_stealing,
                                base_on_balls, intentional_walks, strikeouts, hit_by_pitch,
                                sac_flies, sac_bunts, ground_into_double_play, ground_into_triple_play,
                                fly_outs, ground_outs, pop_outs, line_outs, air_outs,
                                batting_summary, avg, obp, slg, ops, total_bases,
                                left_on_base, at_bats_per_home_run, stolen_base_percentage
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [
                            gamePk, playerId, playerName, teamId, teamName, gameDate,
                            gamesPlayed, plateAppearances, atBats, runs, hits, doubles,
                            triples, homeRuns, rbi, stolenBases, caughtStealing,
                            baseOnBalls, intentionalWalks, strikeouts, hitByPitch,
                            sacFlies, sacBunts, groundIntoDoublePlay, groundIntoTriplePlay,
                            flyOuts, groundOuts, popOuts, lineOuts, airOuts,
                            battingSummary, avg, obp, slg, ops, totalBases,
                            leftOnBase, atBatsPerHomeRun, stolenBasePercentage
                        ]);
                    }

                    processedCount++;
                } catch (error) {
                    console.error(`Error processing batter game stats: ${error.message}`);
                }
            }

            await this.db.run('COMMIT');
            return processedCount;
        } catch (error) {
            try {
                await this.db.run('ROLLBACK');
            } catch (rollbackError) {
                console.error('Error during rollback:', rollbackError);
            }
            throw error;
        }
    }

    /**
     * Delete batter game stats for a specific game
     * @param {number} gamePk - MLB game ID
     * @returns {Promise<number>} Number of deleted stats
     */
    async deleteStatsByGame(gamePk) {
        const result = await this.db.run('DELETE FROM batter_game_stats WHERE game_pk = ?', [gamePk]);
        return result.changes;
    }

    /**
     * Get stats for top performers over a date range
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @param {string} category - Stat category to sort by (e.g., 'home_runs', 'hits', 'rbi')
     * @param {number} limit - Maximum number of players to return
     * @returns {Promise<Array>} List of top performers
     */
    async getTopPerformers(startDate, endDate, category = 'home_runs', limit = 10) {
        return this.db.all(`
            SELECT 
                player_id, player_name, team_id, team_name,
                SUM(${category}) as total,
                COUNT(*) as games,
                AVG(${category}) as average
            FROM batter_game_stats
            WHERE game_date >= ? AND game_date <= ?
            GROUP BY player_id
            ORDER BY total DESC
            LIMIT ?
        `, [startDate, endDate, limit]);
    }
}

module.exports = BatterGameStatsDb;