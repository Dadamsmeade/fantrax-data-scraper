// A simple database viewer
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

// Database configuration - using the exact path that worked in the command line
const DB_PATH = '/workspaces/fantrax-data-scraper/data/db/fantrax.db';

async function viewDatabase() {
    try {
        console.log(`Opening database at ${DB_PATH}`);

        // Open the database
        const db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        console.log('Database connection established\n');

        // View seasons
        const seasons = await db.all('SELECT * FROM seasons ORDER BY year DESC');
        console.log('=== SEASONS ===');
        console.table(seasons);

        // Count tables
        const counts = await db.get(`
      SELECT 
        (SELECT COUNT(*) FROM seasons) as seasons_count,
        (SELECT COUNT(*) FROM teams) as teams_count,
        (SELECT COUNT(*) FROM schedule) as matchups_count
    `);

        console.log('\n=== DATABASE SUMMARY ===');
        console.table(counts);

        // For each season, view teams and schedule
        for (const season of seasons) {
            console.log(`\n=== TEAMS FOR ${season.year} SEASON (${season.name || 'Unnamed'}) ===`);

            const teams = await db.all('SELECT * FROM teams WHERE season_id = ? ORDER BY name', [season.id]);
            console.table(teams);

            // View sample of schedule for this season (first 10 matchups)
            console.log(`\n=== SCHEDULE SAMPLE FOR ${season.year} SEASON (first 10 matchups) ===`);

            const schedule = await db.all(`
        SELECT 
          s.id, s.period_number, s.period_type, s.date_range,
          away.name as away_team, 
          home.name as home_team
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
        LIMIT 10
      `, [season.id]);

            console.table(schedule);
        }

        // Close the database connection
        await db.close();
        console.log('\nDatabase connection closed');

    } catch (error) {
        console.error('Error viewing database:', error);
    }
}

// Run the function
viewDatabase().catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
});