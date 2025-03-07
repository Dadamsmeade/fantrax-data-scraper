// force-fix-player-duplicates.js
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs-extra');

const DB_PATH = path.join(__dirname, 'data/db/fantrax.db');
const BACKUP_PATH = path.join(__dirname, 'data/db/players_backup.json');

async function forceFixPlayerDuplicates() {
    try {
        console.log('Opening database connection...');
        const db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        console.log('===== STARTING PLAYER TABLE DIAGNOSTIC =====');

        // Enable foreign keys to ensure constraints are enforced
        await db.run('PRAGMA foreign_keys = ON;');

        // Check SQLite version and settings
        const version = await db.get('SELECT sqlite_version() as version');
        console.log(`SQLite Version: ${version.version}`);

        const foreignKeys = await db.get('PRAGMA foreign_keys');
        console.log(`Foreign Keys Enforcement: ${foreignKeys.foreign_keys}`);

        const integrityCheck = await db.get('PRAGMA integrity_check');
        console.log(`Database Integrity: ${integrityCheck['integrity_check']}`);

        // Get current table info
        const tableInfo = await db.all('PRAGMA table_info(players)');
        console.log('\nTable Structure:');
        console.log(tableInfo);

        // Check for primary key
        const pkColumns = tableInfo.filter(col => col.pk > 0);
        console.log(`\nPrimary Key Columns: ${pkColumns.map(col => col.name).join(', ') || 'None'}`);

        // Get total count and check for duplicates
        const countResult = await db.get('SELECT COUNT(*) as count FROM players');
        console.log(`\nTotal player records: ${countResult.count}`);

        // Find duplicate player+season combinations
        const duplicates = await db.all(`
            SELECT id, season, COUNT(*) as count
            FROM players
            GROUP BY id, season
            HAVING COUNT(*) > 1
            ORDER BY count DESC
            LIMIT 10
        `);

        if (duplicates.length > 0) {
            console.log(`Found ${duplicates.length} duplicate player+season combinations (showing top 10):`);
            for (const dup of duplicates) {
                console.log(`  Player ID ${dup.id}, Season ${dup.season}: ${dup.count} entries`);
            }
        } else {
            console.log('No duplicate player+season combinations found in current table.');
        }

        // Create a backup of the data
        console.log('\n===== BACKING UP PLAYER DATA =====');
        const allPlayers = await db.all(`
            SELECT DISTINCT * FROM players
            GROUP BY id, season
        `);
        console.log(`Found ${allPlayers.length} unique player records to back up`);
        fs.writeJsonSync(BACKUP_PATH, allPlayers, { spaces: 2 });
        console.log(`Backup saved to ${BACKUP_PATH}`);

        console.log('\n===== PERFORMING TABLE RECREATION =====');
        await db.run('BEGIN EXCLUSIVE TRANSACTION');

        try {
            // Drop existing table
            console.log('Dropping existing players table...');
            await db.run('DROP TABLE IF EXISTS players');

            // Create new table with enforced PRIMARY KEY
            console.log('Creating new players table with strict PRIMARY KEY constraint...');
            await db.run(`
                CREATE TABLE players (
                    id INTEGER NOT NULL,
                    full_name TEXT NOT NULL,
                    first_name TEXT,
                    last_name TEXT,
                    birth_date DATE,
                    birth_city TEXT, 
                    birth_country TEXT,
                    birth_state_province TEXT,
                    height TEXT,
                    weight INTEGER,
                    active BOOLEAN,
                    team_id INTEGER,
                    team_name TEXT,
                    position_code TEXT,
                    position_name TEXT,
                    position_type TEXT,
                    mlb_debut_date DATE,
                    bat_side TEXT,
                    pitch_hand TEXT,
                    season INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id, season) ON CONFLICT REPLACE
                )
            `);

            // Create indexes 
            console.log('Creating indexes...');
            await db.run('CREATE INDEX idx_players_season ON players(season)');
            await db.run('CREATE INDEX idx_players_team ON players(team_id, season)');
            await db.run('CREATE INDEX idx_players_name ON players(full_name, season)');
            await db.run('CREATE INDEX idx_players_active ON players(active, season)');

            // Recreate trigger
            console.log('Creating update trigger...');
            await db.run(`
                CREATE TRIGGER update_players_timestamp
                AFTER UPDATE ON players
                BEGIN
                    UPDATE players SET updated_at = CURRENT_TIMESTAMP 
                    WHERE id = NEW.id AND season = NEW.season;
                END
            `);

            // Reinsert data from backup
            console.log('Reinserting player data from backup...');
            let insertCount = 0;
            let errorCount = 0;

            // Insert in batches for better performance
            const BATCH_SIZE = 100;
            for (let i = 0; i < allPlayers.length; i += BATCH_SIZE) {
                const batch = allPlayers.slice(i, i + BATCH_SIZE);
                const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');

                const values = [];
                batch.forEach(player => {
                    values.push(
                        player.id,
                        player.full_name,
                        player.first_name,
                        player.last_name,
                        player.birth_date,
                        player.birth_city,
                        player.birth_state_province,
                        player.birth_country,
                        player.height,
                        player.weight,
                        player.active,
                        player.team_id,
                        player.team_name,
                        player.position_code,
                        player.position_name,
                        player.position_type,
                        player.mlb_debut_date,
                        player.bat_side,
                        player.pitch_hand,
                        player.season,
                        player.created_at || null,
                        player.updated_at || null
                    );
                });

                try {
                    await db.run(`
                        INSERT OR REPLACE INTO players (
                            id, full_name, first_name, last_name, birth_date,
                            birth_city, birth_state_province, birth_country, height, weight, active,
                            team_id, team_name, position_code, position_name, position_type,
                            mlb_debut_date, bat_side, pitch_hand, season, created_at, updated_at
                        ) VALUES ${placeholders}
                    `, values);

                    insertCount += batch.length;

                    // Show progress
                    if (insertCount % 1000 === 0 || insertCount === allPlayers.length) {
                        console.log(`Inserted ${insertCount}/${allPlayers.length} players`);
                    }
                } catch (err) {
                    console.error(`Error inserting batch starting at index ${i}:`, err.message);
                    errorCount++;
                }
            }

            console.log(`Completed reinsertion: ${insertCount} players inserted, ${errorCount} batch errors`);

            // Verify that duplicates are gone
            const verifyDuplicates = await db.all(`
                SELECT id, season, COUNT(*) as count
                FROM players
                GROUP BY id, season
                HAVING COUNT(*) > 1
                LIMIT 5
            `);

            if (verifyDuplicates.length > 0) {
                console.log('\n⚠️ WARNING: Still found duplicate records after rebuild:');
                for (const dup of verifyDuplicates) {
                    console.log(`  Player ID ${dup.id}, Season ${dup.season}: ${dup.count} entries`);
                }
            } else {
                console.log('\n✅ SUCCESS: No duplicate records found after rebuild');
            }

            // Check final count
            const finalCount = await db.get('SELECT COUNT(*) as count FROM players');
            console.log(`Final player count: ${finalCount.count}`);

            await db.run('COMMIT');
            console.log('\n===== RECREATION COMPLETED SUCCESSFULLY =====');

        } catch (error) {
            await db.run('ROLLBACK');
            console.error('\n❌ ERROR DURING TABLE RECREATION:', error);
            throw error;
        }

        await db.close();
        console.log('Database connection closed');
    } catch (error) {
        console.error('\nFATAL ERROR:', error);
        process.exit(1);
    }
}

// Run the script
forceFixPlayerDuplicates().catch(console.error);