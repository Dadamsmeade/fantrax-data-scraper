// Manager assignment utility
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const readline = require('readline');

// Database configuration
const DB_PATH = '/workspaces/fantrax-data-scraper/data/db/fantrax.db';

// Create interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function manageManagerAssignments() {
    let db;

    try {
        // Open database
        db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        console.log('Connected to database');

        // Main menu loop
        let running = true;
        while (running) {
            console.log('\n=== MANAGER ASSIGNMENT UTILITY ===');
            console.log('1. List all managers');
            console.log('2. View teams by season');
            console.log('3. Assign manager to team');
            console.log('4. Assign managers in bulk by team name pattern');
            console.log('5. View teams with manager assignments');
            console.log('6. Show historical manager transitions');
            console.log('7. Exit');

            const choice = await askQuestion('Select an option (1-7): ');

            switch (choice) {
                case '1':
                    await listManagers(db);
                    break;
                case '2':
                    await viewTeamsBySeason(db);
                    break;
                case '3':
                    await assignManagerToTeam(db);
                    break;
                case '4':
                    await bulkAssignManagers(db);
                    break;
                case '5':
                    await viewTeamsWithManagers(db);
                    break;
                case '6':
                    await showManagerTransitions(db);
                    break;
                case '7':
                    running = false;
                    break;
                default:
                    console.log('Invalid option, please try again.');
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        if (db) {
            await db.close();
            console.log('Database connection closed');
        }
        rl.close();
    }
}

// Helper function to ask questions
function askQuestion(question) {
    return new Promise(resolve => {
        rl.question(question, answer => {
            resolve(answer);
        });
    });
}

// List all managers
async function listManagers(db) {
    const managers = await db.all(`
    SELECT *, 
           CASE 
             WHEN active_until IS NULL THEN 'Current' 
             ELSE 'Former (' || active_from || '-' || active_until || ')'
           END as status
    FROM managers 
    ORDER BY name
  `);
    console.log('\n=== MANAGERS ===');
    console.table(managers);
}

// View teams by season
async function viewTeamsBySeason(db) {
    // Get seasons
    const seasons = await db.all('SELECT * FROM seasons ORDER BY year DESC');

    if (seasons.length === 0) {
        console.log('No seasons found in the database.');
        return;
    }

    console.log('\n=== AVAILABLE SEASONS ===');
    seasons.forEach((season, index) => {
        console.log(`${index + 1}. ${season.year} - ${season.name || 'Unnamed'}`);
    });

    const seasonIndex = parseInt(await askQuestion('Select a season (number): ')) - 1;

    if (isNaN(seasonIndex) || seasonIndex < 0 || seasonIndex >= seasons.length) {
        console.log('Invalid selection.');
        return;
    }

    const selectedSeason = seasons[seasonIndex];

    // Get managers active in this season
    const activeManagers = await db.all(`
    SELECT * FROM managers 
    WHERE (active_from <= ? AND (active_until IS NULL OR active_until >= ?))
    ORDER BY name
  `, [selectedSeason.year, selectedSeason.year]);

    console.log(`\n=== MANAGERS ACTIVE IN ${selectedSeason.year} SEASON ===`);
    console.table(activeManagers);

    // Get teams for selected season
    const teams = await db.all(`
    SELECT t.*, m.name as manager_name 
    FROM teams t
    LEFT JOIN managers m ON t.manager_id = m.id
    WHERE t.season_id = ?
    ORDER BY t.name
  `, [selectedSeason.id]);

    console.log(`\n=== TEAMS FOR ${selectedSeason.year} SEASON ===`);
    console.table(teams);
}

// Assign manager to team
async function assignManagerToTeam(db) {
    // Get seasons
    const seasons = await db.all('SELECT * FROM seasons ORDER BY year DESC');

    if (seasons.length === 0) {
        console.log('No seasons found in the database.');
        return;
    }

    console.log('\n=== AVAILABLE SEASONS ===');
    seasons.forEach((season, index) => {
        console.log(`${index + 1}. ${season.year} - ${season.name || 'Unnamed'}`);
    });

    const seasonIndex = parseInt(await askQuestion('Select a season (number): ')) - 1;

    if (isNaN(seasonIndex) || seasonIndex < 0 || seasonIndex >= seasons.length) {
        console.log('Invalid selection.');
        return;
    }

    const selectedSeason = seasons[seasonIndex];

    // Get teams for selected season
    const teams = await db.all(`
    SELECT t.*, m.name as manager_name 
    FROM teams t
    LEFT JOIN managers m ON t.manager_id = m.id
    WHERE t.season_id = ?
    ORDER BY t.name
  `, [selectedSeason.id]);

    console.log(`\n=== TEAMS FOR ${selectedSeason.year} SEASON ===`);
    teams.forEach((team, index) => {
        console.log(`${index + 1}. ${team.name} ${team.manager_name ? `(Manager: ${team.manager_name})` : '(No manager assigned)'}`);
    });

    const teamIndex = parseInt(await askQuestion('Select a team (number): ')) - 1;

    if (isNaN(teamIndex) || teamIndex < 0 || teamIndex >= teams.length) {
        console.log('Invalid team selection.');
        return;
    }

    const selectedTeam = teams[teamIndex];

    // Get managers active in this season
    const managers = await db.all(`
    SELECT * FROM managers 
    WHERE (active_from <= ? AND (active_until IS NULL OR active_until >= ?))
    ORDER BY name
  `, [selectedSeason.year, selectedSeason.year]);

    console.log(`\n=== MANAGERS ACTIVE IN ${selectedSeason.year} ===`);
    managers.forEach((manager, index) => {
        console.log(`${index + 1}. ${manager.name}`);
    });

    const managerIndex = parseInt(await askQuestion('Select a manager (number): ')) - 1;

    if (isNaN(managerIndex) || managerIndex < 0 || managerIndex >= managers.length) {
        console.log('Invalid manager selection.');
        return;
    }

    const selectedManager = managers[managerIndex];

    // Update team with manager
    await db.run('UPDATE teams SET manager_id = ? WHERE id = ?', [selectedManager.id, selectedTeam.id]);

    console.log(`Assigned manager ${selectedManager.name} to team ${selectedTeam.name}`);
}

// Bulk assign managers by team name pattern
async function bulkAssignManagers(db) {
    console.log('\n=== BULK MANAGER ASSIGNMENT ===');
    console.log('This will assign managers to teams based on name patterns across all seasons.');
    console.log('For example, if Marcus\'s teams always have "Marcus" in the name.');

    // Get all managers
    const managers = await db.all('SELECT * FROM managers ORDER BY name');

    console.log('\n=== ALL MANAGERS ===');
    managers.forEach((manager, index) => {
        const status = manager.active_until ?
            `(${manager.active_from}-${manager.active_until})` :
            `(${manager.active_from}-Present)`;
        console.log(`${index + 1}. ${manager.name} ${status}`);
    });

    const managerIndex = parseInt(await askQuestion('Select a manager (number): ')) - 1;

    if (isNaN(managerIndex) || managerIndex < 0 || managerIndex >= managers.length) {
        console.log('Invalid manager selection.');
        return;
    }

    const selectedManager = managers[managerIndex];

    const pattern = await askQuestion('Enter team name pattern to match (case insensitive): ');

    if (!pattern) {
        console.log('No pattern provided.');
        return;
    }

    // Get matching teams (only for seasons when the manager was active)
    let query = `
    SELECT t.*, s.year, s.name as season_name 
    FROM teams t 
    JOIN seasons s ON t.season_id = s.id
    WHERE t.name LIKE ? 
  `;

    // Add manager activity filter if they're not active for all years
    if (selectedManager.active_from || selectedManager.active_until) {
        query += ` AND s.year >= ${selectedManager.active_from} `;
        if (selectedManager.active_until) {
            query += ` AND s.year <= ${selectedManager.active_until} `;
        }
    }

    query += ' ORDER BY s.year DESC, t.name';

    const matchingTeams = await db.all(query, [`%${pattern}%`]);

    if (matchingTeams.length === 0) {
        console.log('No matching teams found in the years this manager was active.');
        return;
    }

    console.log(`\n=== TEAMS MATCHING "${pattern}" ===`);
    matchingTeams.forEach((team, index) => {
        console.log(`${index + 1}. [${team.year}] ${team.name}`);
    });

    const confirm = await askQuestion(`Assign ${selectedManager.name} to all ${matchingTeams.length} teams? (y/n): `);

    if (confirm.toLowerCase() !== 'y') {
        console.log('Operation cancelled.');
        return;
    }

    // Update all matching teams
    for (const team of matchingTeams) {
        await db.run('UPDATE teams SET manager_id = ? WHERE id = ?', [selectedManager.id, team.id]);
    }

    console.log(`Assigned ${selectedManager.name} to ${matchingTeams.length} teams`);
}

// View teams with manager assignments
async function viewTeamsWithManagers(db) {
    // Get all teams with manager info
    const teams = await db.all(`
    SELECT t.*, s.year, m.name as manager_name,
           m.active_from, m.active_until
    FROM teams t
    JOIN seasons s ON t.season_id = s.id
    LEFT JOIN managers m ON t.manager_id = m.id
    ORDER BY s.year DESC, m.name, t.name
  `);

    console.log('\n=== TEAMS WITH MANAGER ASSIGNMENTS ===');

    // Group by season
    const seasons = [...new Set(teams.map(team => team.year))];

    for (const year of seasons) {
        console.log(`\n--- ${year} Season ---`);
        const seasonTeams = teams.filter(team => team.year === year);

        // Group by manager
        const managerNames = [...new Set(seasonTeams.map(team => team.manager_name || 'Unassigned'))];

        for (const managerName of managerNames) {
            const managerTeams = seasonTeams.filter(team => (team.manager_name || 'Unassigned') === managerName);

            // Check if this manager should be active in this season
            const manager = managerTeams[0];
            let activeStatus = '';

            if (manager && manager.active_from && (manager.active_from > year || (manager.active_until && manager.active_until < year))) {
                activeStatus = ' (WARNING: Manager not active this season!)';
            }

            console.log(`\n${managerName}${activeStatus}:`);
            managerTeams.forEach(team => {
                console.log(`- ${team.name}`);
            });
        }
    }
}

// Show manager transitions
async function showManagerTransitions(db) {
    console.log('\n=== MANAGER TRANSITIONS ===');

    // Get all managers ordered by entry year
    const managers = await db.all(`
    SELECT *,
           CASE 
             WHEN active_until IS NULL THEN 'Current' 
             ELSE 'Former (' || active_from || '-' || active_until || ')'
           END as status
    FROM managers 
    ORDER BY active_from, name
  `);

    // Show original managers (2017)
    console.log('\nOriginal Managers (2017):');
    const originalManagers = managers.filter(m => m.active_from === 2017);
    originalManagers.forEach(m => {
        console.log(`- ${m.name} ${m.active_until ? `(Until ${m.active_until})` : '(Current)'}`);
    });

    // Show transitions
    console.log('\nManager Transitions:');
    const transitions = await db.all(`
    SELECT m1.name as leaving_manager, 
           m1.active_until as year_left,
           m2.name as joining_manager, 
           m2.active_from as year_joined
    FROM managers m1, managers m2
    WHERE m1.active_until IS NOT NULL
      AND m2.active_from > 2017
      AND m2.active_from = m1.active_until + 1
    ORDER BY m1.active_until
  `);

    if (transitions.length > 0) {
        transitions.forEach(t => {
            console.log(`- ${t.year_left}: ${t.leaving_manager} left, ${t.joining_manager} joined in ${t.year_joined}`);
        });
    } else {
        // Show manual transition for Ben to AJ since we know this one
        console.log(`- 2019: Ben left, AJ joined in 2020`);
    }

    // Count managers by season
    console.log('\nManagers Count by Season:');
    const seasons = await db.all('SELECT year FROM seasons ORDER BY year');

    for (const season of seasons) {
        const year = season.year;
        const count = await db.get(`
      SELECT COUNT(*) as count
      FROM managers 
      WHERE active_from <= ? AND (active_until IS NULL OR active_until >= ?)
    `, [year, year]);

        console.log(`- ${year}: ${count.count} managers`);
    }
}

// Run the manager assignment utility
manageManagerAssignments();