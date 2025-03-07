const { withTransaction } = require('../utils/database');

/**
 * Functions for managing player daily stats in the database
 */
class PlayerStatsDb {
    /**
     * Initialize with a database connection
     * @param {sqlite.Database} db - SQLite database connection
     */
    constructor(db) {
        this.db = db;
    }

    /**
     * Get player daily stats by date
     * @param {string} date - Date in YYYY-MM-DD format
     * @param {number} seasonId - Season ID
     * @returns {Promise<Array>} List of player stats for the date
     */
    async getStatsByDate(date, seasonId) {
        return this.db.all(`
            SELECT * FROM player_daily_stats
            WHERE date = ? AND season_id = ?
            ORDER BY fantasy_team_id, position_played
        `, [date, seasonId]);
    }

    /**
     * Get player daily stats by player
     * @param {string} playerId - Fantrax player ID
     * @param {number} seasonId - Season ID
     * @returns {Promise<Array>} List of player stats for the player
     */
    async getStatsByPlayer(playerId, seasonId) {
        return this.db.all(`
            SELECT * FROM player_daily_stats
            WHERE player_id = ? AND season_id = ?
            ORDER BY date DESC
        `, [playerId, seasonId]);
    }

    /**
     * Get player daily stats by team
     * @param {number} teamId - Fantasy team ID
     * @param {number} seasonId - Season ID
     * @returns {Promise<Array>} List of player stats for the team
     */
    async getStatsByTeam(teamId, seasonId) {
        return this.db.all(`
            SELECT * FROM player_daily_stats
            WHERE fantasy_team_id = ? AND season_id = ?
            ORDER BY date DESC, position_played
        `, [teamId, seasonId]);
    }

    /**
     * Find a specific player's stats for a date
     * @param {string} date - Date in YYYY-MM-DD format
     * @param {string} playerId - Fantrax player ID
     * @param {number} teamId - Fantasy team ID
     * @returns {Promise<Object|null>} Player stat or null if not found
     */
    async findPlayerStat(date, playerId, teamId) {
        return this.db.get(`
            SELECT * FROM player_daily_stats
            WHERE date = ? AND player_id = ? AND fantasy_team_id = ?
        `, [date, playerId, teamId]);
    }

    /**
     * Add or update a player's daily stats
     * @param {Object} stat - Player stat data
     * @returns {Promise<Object>} The inserted or updated player stat
     */
    async upsertPlayerStat(stat) {
        const {
            date, player_id, mlb_team, fantasy_team_id, season_id, period_number,
            position_played, active, ab, h, r, singles, doubles, triples, hr, rbi,
            bb, sb, cs, fantasy_points, innings_pitched, wins, hits_allowed,
            earned_runs, bb_allowed, h_plus_bb, strikeouts
        } = stat;

        // Validate required fields
        if (!date || !fantasy_team_id || !season_id) {
            throw new Error('Date, fantasy team ID, and season ID are required');
        }

        // Convert innings pitched to outs for easier calculations
        let ip_outs = 0;
        if (innings_pitched) {
            const ipParts = innings_pitched.toString().split('.');
            const fullInnings = parseInt(ipParts[0]) || 0;
            const partialInning = ipParts.length > 1 ? parseInt(ipParts[1]) || 0 : 0;
            ip_outs = (fullInnings * 3) + partialInning;
        }

        return withTransaction(this.db, async () => {
            // Check if the player stat exists
            const existingStat = await this.findPlayerStat(date, player_id, fantasy_team_id);

            if (existingStat) {
                // Update existing stat
                await this.db.run(`
                    UPDATE player_daily_stats
                    SET 
                        mlb_team = ?, season_id = ?, period_number = ?,
                        position_played = ?, active = ?,
                        ab = ?, h = ?, r = ?, singles = ?, doubles = ?,
                        triples = ?, hr = ?, rbi = ?, bb = ?, sb = ?, cs = ?,
                        wins = ?, innings_pitched = ?, ip_outs = ?, earned_runs = ?,
                        hits_allowed = ?, bb_allowed = ?, h_plus_bb = ?, k = ?,
                        fantasy_points = ?
                    WHERE date = ? AND player_id = ? AND fantasy_team_id = ?
                `, [
                    mlb_team, season_id, period_number,
                    position_played, active,
                    ab, h, r, singles, doubles,
                    triples, hr, rbi, bb, sb, cs,
                    wins, innings_pitched, ip_outs, earned_runs,
                    hits_allowed, bb_allowed, h_plus_bb, strikeouts,
                    fantasy_points,
                    date, player_id, fantasy_team_id
                ]);
            } else {
                // Insert new stat
                await this.db.run(`
                    INSERT INTO player_daily_stats (
                        date, player_id, mlb_team, fantasy_team_id, season_id, period_number,
                        position_played, active, ab, h, r, singles, doubles, triples, hr, rbi,
                        bb, sb, cs, wins, innings_pitched, ip_outs, earned_runs, hits_allowed,
                        bb_allowed, h_plus_bb, k, fantasy_points
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    date, player_id, mlb_team, fantasy_team_id, season_id, period_number,
                    position_played, active, ab, h, r, singles, doubles, triples, hr, rbi,
                    bb, sb, cs, wins, innings_pitched, ip_outs, earned_runs, hits_allowed,
                    bb_allowed, h_plus_bb, strikeouts, fantasy_points
                ]);
            }

            return this.findPlayerStat(date, player_id, fantasy_team_id);
        });
    }

    /**
     * Bulk insert or update player stats
     * @param {Array<Object>} statsArray - Array of player stat objects
     * @returns {Promise<number>} Number of stats processed
     */
    async bulkUpsertPlayerStats(statsArray) {
        // Use transaction to make this an atomic operation
        let transactionStarted = false;

        try {
            await this.db.run('BEGIN TRANSACTION');
            transactionStarted = true;

            let processedCount = 0;
            for (const stat of statsArray) {
                try {
                    await this.upsertPlayerStat(stat);
                    processedCount++;
                } catch (error) {
                    console.error(`Error processing player stat: ${error.message}`);
                    // Continue with next stat record if one fails
                }
            }

            await this.db.run('COMMIT');
            transactionStarted = false;

            return processedCount;
        } catch (error) {
            // Only try to rollback if we started the transaction
            if (transactionStarted) {
                try {
                    await this.db.run('ROLLBACK');
                } catch (rollbackError) {
                    console.error('Error during rollback:', rollbackError);
                }
            }
            throw error;
        }
    }

    /**
     * Update or create team daily stat totals
     * @param {string} date - Date in YYYY-MM-DD format
     * @param {number} teamId - Fantasy team ID
     * @param {number} seasonId - Season ID
     * @returns {Promise<Object>} The updated team daily stat
     */
    async updateTeamDailyStats(date, teamId, seasonId) {
        return withTransaction(this.db, async () => {
            // Calculate hitting totals for the team on this date
            const hittingTotals = await this.db.get(`
                SELECT 
                    SUM(ab) as at_bats,
                    SUM(h) as hits,
                    SUM(r) as runs,
                    SUM(singles) as singles,
                    SUM(doubles) as doubles,
                    SUM(triples) as triples,
                    SUM(hr) as home_runs,
                    SUM(rbi) as rbis,
                    SUM(bb) as walks,
                    SUM(sb) as stolen_bases,
                    SUM(cs) as caught_stealing,
                    SUM(CASE WHEN position_played != 'TmP' THEN fantasy_points ELSE 0 END) as hitting_points
                FROM player_daily_stats
                WHERE date = ? AND fantasy_team_id = ? AND active = 1
            `, [date, teamId]);

            // Calculate pitching totals for the team on this date
            const pitchingTotals = await this.db.get(`
                SELECT 
                    SUM(wins) as wins,
                    SUM(ip_outs) as innings_pitched_outs,
                    SUM(earned_runs) as earned_runs,
                    SUM(h_plus_bb) as hits_plus_walks,
                    SUM(k) as strikeouts,
                    SUM(CASE WHEN position_played = 'TmP' THEN fantasy_points ELSE 0 END) as pitching_points
                FROM player_daily_stats
                WHERE date = ? AND fantasy_team_id = ? AND active = 1
            `, [date, teamId]);

            // Get or create team daily stats record
            const existingRecord = await this.db.get(
                'SELECT * FROM fantasy_team_daily_stats WHERE date = ? AND fantasy_team_id = ?',
                [date, teamId]
            );

            // Calculate total points
            const hittingPoints = hittingTotals.hitting_points || 0;
            const pitchingPoints = pitchingTotals.pitching_points || 0;
            const totalPoints = hittingPoints + pitchingPoints;

            // Get period number from player stats
            const periodData = await this.db.get(
                'SELECT period_number FROM player_daily_stats WHERE date = ? AND fantasy_team_id = ? LIMIT 1',
                [date, teamId]
            );
            const periodNumber = periodData ? periodData.period_number : null;

            if (existingRecord) {
                // Update existing record
                await this.db.run(`
                    UPDATE fantasy_team_daily_stats
                    SET 
                        season_id = ?,
                        period_number = ?,
                        at_bats = ?,
                        hits = ?,
                        runs = ?,
                        singles = ?,
                        doubles = ?,
                        triples = ?,
                        home_runs = ?,
                        rbis = ?,
                        walks = ?,
                        stolen_bases = ?,
                        caught_stealing = ?,
                        wins = ?,
                        innings_pitched_outs = ?,
                        earned_runs = ?,
                        hits_plus_walks = ?,
                        strikeouts = ?,
                        hitting_points = ?,
                        pitching_points = ?,
                        total_points = ?
                    WHERE date = ? AND fantasy_team_id = ?
                `, [
                    seasonId,
                    periodNumber,
                    hittingTotals.at_bats || 0,
                    hittingTotals.hits || 0,
                    hittingTotals.runs || 0,
                    hittingTotals.singles || 0,
                    hittingTotals.doubles || 0,
                    hittingTotals.triples || 0,
                    hittingTotals.home_runs || 0,
                    hittingTotals.rbis || 0,
                    hittingTotals.walks || 0,
                    hittingTotals.stolen_bases || 0,
                    hittingTotals.caught_stealing || 0,
                    pitchingTotals.wins || 0,
                    pitchingTotals.innings_pitched_outs || 0,
                    pitchingTotals.earned_runs || 0,
                    pitchingTotals.hits_plus_walks || 0,
                    pitchingTotals.strikeouts || 0,
                    hittingPoints,
                    pitchingPoints,
                    totalPoints,
                    date,
                    teamId
                ]);
            } else {
                // Insert new record
                await this.db.run(`
                    INSERT INTO fantasy_team_daily_stats (
                        date,
                        fantasy_team_id,
                        season_id,
                        period_number,
                        at_bats,
                        hits,
                        runs,
                        singles,
                        doubles,
                        triples,
                        home_runs,
                        rbis,
                        walks,
                        stolen_bases,
                        caught_stealing,
                        wins,
                        innings_pitched_outs,
                        earned_runs,
                        hits_plus_walks,
                        strikeouts,
                        hitting_points,
                        pitching_points,
                        total_points
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    date,
                    teamId,
                    seasonId,
                    periodNumber,
                    hittingTotals.at_bats || 0,
                    hittingTotals.hits || 0,
                    hittingTotals.runs || 0,
                    hittingTotals.singles || 0,
                    hittingTotals.doubles || 0,
                    hittingTotals.triples || 0,
                    hittingTotals.home_runs || 0,
                    hittingTotals.rbis || 0,
                    hittingTotals.walks || 0,
                    hittingTotals.stolen_bases || 0,
                    hittingTotals.caught_stealing || 0,
                    pitchingTotals.wins || 0,
                    pitchingTotals.innings_pitched_outs || 0,
                    pitchingTotals.earned_runs || 0,
                    pitchingTotals.hits_plus_walks || 0,
                    pitchingTotals.strikeouts || 0,
                    hittingPoints,
                    pitchingPoints,
                    totalPoints
                ]);
            }

            return this.db.get(
                'SELECT * FROM fantasy_team_daily_stats WHERE date = ? AND fantasy_team_id = ?',
                [date, teamId]
            );
        });
    }

    /**
     * Update matchup daily results
     * @param {string} date - Date in YYYY-MM-DD format
     * @param {number} seasonId - Season ID
     * @returns {Promise<number>} Number of matchups updated
     */
    async updateMatchupDailyResults(date, seasonId) {
        return withTransaction(this.db, async () => {
            // Get active matchups for this period
            const periodData = await this.db.get(
                'SELECT period_number FROM player_daily_stats WHERE date = ? AND season_id = ? LIMIT 1',
                [date, seasonId]
            );

            if (!periodData || !periodData.period_number) {
                return 0; // No data for this date
            }

            const periodNumber = periodData.period_number;

            // Get matchups for this period
            const matchups = await this.db.all(`
                SELECT 
                    s.id as matchup_id,
                    s.away_team_id,
                    s.home_team_id,
                    s.period_number,
                    s.matchup_id as fantrax_matchup_id
                FROM schedule s
                WHERE s.season_id = ? AND s.period_number = ?
            `, [seasonId, periodNumber]);

            if (matchups.length === 0) {
                return 0; // No matchups found
            }

            // Get team daily stats
            const teamStats = await this.db.all(`
                SELECT 
                    fantasy_team_id,
                    total_points
                FROM fantasy_team_daily_stats
                WHERE date = ? AND season_id = ?
            `, [date, seasonId]);

            // Create a map of team ID to points
            const teamPointsMap = new Map();
            teamStats.forEach(stat => {
                teamPointsMap.set(stat.fantasy_team_id, stat.total_points);
            });

            // Update or insert matchup results
            let updatedCount = 0;
            for (const matchup of matchups) {
                const awayPoints = teamPointsMap.get(matchup.away_team_id) || 0;
                const homePoints = teamPointsMap.get(matchup.home_team_id) || 0;

                // Check if record exists
                const existingRecord = await this.db.get(`
                    SELECT * FROM matchup_daily_results 
                    WHERE date = ? AND away_team_id = ? AND home_team_id = ?
                `, [date, matchup.away_team_id, matchup.home_team_id]);

                if (existingRecord) {
                    // Update existing record
                    await this.db.run(`
                        UPDATE matchup_daily_results
                        SET 
                            season_id = ?,
                            period_number = ?,
                            matchup_id = ?,
                            away_points = ?,
                            home_points = ?
                        WHERE date = ? AND away_team_id = ? AND home_team_id = ?
                    `, [
                        seasonId,
                        periodNumber,
                        matchup.fantrax_matchup_id,
                        awayPoints,
                        homePoints,
                        date,
                        matchup.away_team_id,
                        matchup.home_team_id
                    ]);
                } else {
                    // Insert new record
                    await this.db.run(`
                        INSERT INTO matchup_daily_results (
                            date,
                            season_id,
                            period_number,
                            matchup_id,
                            away_team_id,
                            home_team_id,
                            away_points,
                            home_points
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        date,
                        seasonId,
                        periodNumber,
                        matchup.fantrax_matchup_id,
                        matchup.away_team_id,
                        matchup.home_team_id,
                        awayPoints,
                        homePoints
                    ]);
                }

                updatedCount++;
            }

            return updatedCount;
        });
    }

    /**
     * Delete all player stats for a specific date and season
     * @param {string} date - Date in YYYY-MM-DD format
     * @param {number} seasonId - Season ID
     * @returns {Promise<number>} Number of deleted stats
     */
    async deleteStatsByDate(date, seasonId) {
        return withTransaction(this.db, async () => {
            // Delete player stats
            const playerResult = await this.db.run(
                'DELETE FROM player_daily_stats WHERE date = ? AND season_id = ?',
                [date, seasonId]
            );

            // Delete team stats
            const teamResult = await this.db.run(
                'DELETE FROM fantasy_team_daily_stats WHERE date = ? AND season_id = ?',
                [date, seasonId]
            );

            // Delete matchup results
            const matchupResult = await this.db.run(
                'DELETE FROM matchup_daily_results WHERE date = ? AND season_id = ?',
                [date, seasonId]
            );

            return playerResult.changes + teamResult.changes + matchupResult.changes;
        });
    }
}

module.exports = PlayerStatsDb;