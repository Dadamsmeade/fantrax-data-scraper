const { initializeDatabase } = require('../utils/database');
const SeasonsDb = require('./seasonsDb');
const TeamsDb = require('./teamsDb');
const ScheduleDb = require('./scheduleDb');

/**
 * Database service that provides access to all database operations
 */
class DatabaseService {
    constructor() {
        this.db = null;
        this.seasons = null;
        this.teams = null;
        this.schedule = null;
        this.initialized = false;
    }

    /**
     * Initialize the database service
     * @returns {Promise<DatabaseService>} This service instance
     */
    async initialize() {
        if (this.initialized) {
            return this;
        }

        try {
            // Initialize database connection
            this.db = await initializeDatabase();

            // Initialize repositories
            this.seasons = new SeasonsDb(this.db);
            this.teams = new TeamsDb(this.db);
            this.schedule = new ScheduleDb(this.db);

            this.initialized = true;
            return this;
        } catch (error) {
            console.error('Failed to initialize database service:', error);
            throw error;
        }
    }

    /**
     * Save a complete season's schedule data to the database
     * @param {Object} data - The schedule data
     * @param {string} year - Season year
     * @param {string} leagueId - Fantrax league ID
     * @returns {Promise<Object>} Summary of saved data
     */
    async saveScheduleData(data, year, leagueId) {
        if (!this.initialized) {
            await this.initialize();
        }

        // Check if data is empty
        if (!data || data.length === 0) {
            console.log(`No schedule data to save for season ${year}`);
            return { teams: 0, matchups: 0 };
        }

        try {
            // Begin a single transaction for all operations
            await this.db.run('BEGIN TRANSACTION');

            // Upsert season
            const season = await this.seasons.upsertSeason({
                year,
                leagueId,
                name: data[0]?.season || `${year} Season`
            });

            console.log(`Season saved: ${season.year} (ID: ${season.id})`);

            // Extract unique teams
            const uniqueTeams = new Map();

            data.forEach(match => {
                // Add away team if not already added
                if (match.awayTeamId && match.awayTeamName) {
                    uniqueTeams.set(match.awayTeamId, {
                        teamId: match.awayTeamId,
                        seasonId: season.id,
                        name: match.awayTeamName
                    });
                }

                // Add home team if not already added
                if (match.homeTeamId && match.homeTeamName) {
                    uniqueTeams.set(match.homeTeamId, {
                        teamId: match.homeTeamId,
                        seasonId: season.id,
                        name: match.homeTeamName
                    });
                }
            });

            // Save teams directly without using bulkUpsertTeams
            const teams = Array.from(uniqueTeams.values());
            for (const team of teams) {
                const { teamId, seasonId, name } = team;
                // Check if team exists
                const existingTeam = await this.db.get(
                    'SELECT * FROM teams WHERE team_id = ? AND season_id = ?',
                    [teamId, seasonId]
                );

                if (existingTeam) {
                    // Update existing team
                    await this.db.run(
                        'UPDATE teams SET name = ? WHERE team_id = ? AND season_id = ?',
                        [name, teamId, seasonId]
                    );
                } else {
                    // Insert new team
                    await this.db.run(
                        'INSERT INTO teams (team_id, season_id, name) VALUES (?, ?, ?)',
                        [teamId, seasonId, name]
                    );
                }
            }

            console.log(`Saved ${teams.length} teams for season ${year}`);

            // Get fresh team data with database IDs
            const savedTeams = await this.teams.getTeamsBySeason(season.id);
            const teamMap = new Map();

            savedTeams.forEach(team => {
                teamMap.set(team.team_id, team);
            });

            // Prepare matchups with database IDs
            let matchupCount = 0;

            for (const match of data) {
                const awayTeam = teamMap.get(match.awayTeamId);
                const homeTeam = teamMap.get(match.homeTeamId);

                if (!awayTeam || !homeTeam) {
                    console.warn(`Skipping matchup with missing team: ${match.awayTeamName} vs ${match.homeTeamName}`);
                    continue;
                }

                // Check if matchup exists
                const existingMatchup = await this.db.get(`
                    SELECT * FROM schedule 
                    WHERE season_id = ? AND period_number = ? 
                    AND away_team_id = ? AND home_team_id = ?
                `, [season.id, match.periodNumber, awayTeam.id, homeTeam.id]);

                if (existingMatchup) {
                    // Update existing matchup
                    await this.db.run(`
                        UPDATE schedule 
                        SET period_type = ?, date_range = ?, matchup_id = ?
                        WHERE season_id = ? AND period_number = ? 
                        AND away_team_id = ? AND home_team_id = ?
                    `, [
                        match.periodType,
                        match.dateRange,
                        match.matchupId,
                        season.id, match.periodNumber, awayTeam.id, homeTeam.id
                    ]);
                } else {
                    // Insert new matchup
                    await this.db.run(`
                        INSERT INTO schedule 
                        (season_id, period_number, period_type, date_range, 
                         away_team_id, home_team_id, matchup_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `, [
                        season.id, match.periodNumber, match.periodType, match.dateRange,
                        awayTeam.id, homeTeam.id, match.matchupId
                    ]);
                }

                matchupCount++;
            }

            // Commit the transaction
            await this.db.run('COMMIT');

            console.log(`Saved ${matchupCount} matchups for season ${year}`);

            return {
                teams: teams.length,
                matchups: matchupCount
            };

        } catch (error) {
            // Rollback the transaction
            try {
                await this.db.run('ROLLBACK');
            } catch (rollbackError) {
                console.error('Error during rollback:', rollbackError);
                // Continue with original error
            }

            console.error(`Error saving schedule data for season ${year}:`, error);
            throw error;
        }
    }

    /**
     * Close the database connection
     * @returns {Promise<void>}
     */
    async close() {
        if (this.db) {
            await this.db.close();
            console.log('Database connection closed');
        }
        this.initialized = false;
    }
}

// Create and export a singleton instance
const dbService = new DatabaseService();

module.exports = dbService;