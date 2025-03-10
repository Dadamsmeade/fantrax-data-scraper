// update-pitching-staff-ids.js
const dbService = require('./src/database');

async function updatePitchingStaffIds() {
    try {
        console.log('Starting database connection...');
        await dbService.initialize();
        console.log('Database connection established');

        // Get all MLB teams
        const mlbTeams = await dbService.db.all('SELECT id, name, short_name FROM mlb_teams');
        console.log(`Found ${mlbTeams.length} MLB teams`);

        if (mlbTeams.length === 0) {
            console.error('No MLB teams found in database. Have you run create-mlb-teams.js?');
            return;
        }

        // Begin transaction
        await dbService.db.run('BEGIN TRANSACTION');

        try {
            // Get all team pitching roster entries
            const teamPitchingEntries = await dbService.db.all(
                "SELECT id, player_name FROM rosters WHERE (position_code = 'TmP' OR position_code = 'Res') AND pitching_staff_id IS NULL"
            );

            console.log(`Found ${teamPitchingEntries.length} unmatched team pitching entries`);

            // Track matches
            let matchedCount = 0;
            let unmatchedCount = 0;
            let unmatchedNames = new Set();

            // Update each team pitching entry
            for (const entry of teamPitchingEntries) {
                // Try to find a matching MLB team
                let matchingTeam = mlbTeams.find(team =>
                    entry.player_name.toLowerCase() === team.short_name.toLowerCase()
                );

                // If no exact match, try partial match
                if (!matchingTeam) {
                    matchingTeam = mlbTeams.find(team =>
                        entry.player_name.toLowerCase().includes(team.short_name.toLowerCase()) ||
                        team.short_name.toLowerCase().includes(entry.player_name.toLowerCase())
                    );
                }

                if (matchingTeam) {
                    // Update the pitching_staff_id
                    await dbService.db.run(
                        'UPDATE rosters SET pitching_staff_id = ? WHERE id = ?',
                        [matchingTeam.id, entry.id]
                    );
                    matchedCount++;

                    // Log what we matched for verification
                    console.log(`Matched "${entry.player_name}" to ${matchingTeam.name} (ID: ${matchingTeam.id})`);
                } else {
                    unmatchedCount++;
                    unmatchedNames.add(entry.player_name);
                }
            }

            // Commit transaction
            await dbService.db.run('COMMIT');

            console.log(`\nSummary: Updated ${matchedCount} team pitching entries with MLB team IDs`);

            if (unmatchedCount > 0) {
                console.log(`Warning: ${unmatchedCount} team pitching entries could not be matched`);
                console.log('Unmatched team names:', Array.from(unmatchedNames));
            }
        } catch (error) {
            await dbService.db.run('ROLLBACK');
            throw error;
        }
    } catch (error) {
        console.error('Error updating pitching staff IDs:', error);
    } finally {
        await dbService.close();
    }
}

// Run the update function
updatePitchingStaffIds().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});