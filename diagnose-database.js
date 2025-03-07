// simple-diagnostic.js
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data/db/fantrax.db');

async function diagnoseDatabase() {
    try {
        console.log('Opening database connection...');
        const db = await open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });

        console.log('===== DATABASE DIAGNOSTIC REPORT =====');
        
        // Check SQLite version and configuration
        const version = await db.get('SELECT sqlite_version() as version');
        console.log(`SQLite Version: ${version.version}`);
        
        const foreignKeys = await db.get('PRAGMA foreign_keys');
        console.log(`Foreign Keys Enforcement: ${foreignKeys.foreign_keys}`);
        
        // Check database integrity
        console.log('\n--- Database Integrity ---');
        const integrityCheck = await db.get('PRAGMA integrity_check');
        console.log(`Integrity Status: ${integrityCheck['integrity_check']}`);
        
        // List all tables with row counts
        console.log('\n--- Database Tables ---');
        const tables = await db.all(`
            SELECT name 
            FROM sqlite_master 
            WHERE type='table' AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        `);
        
        console.log(`Total Tables: ${tables.length}`);
        for (const table of tables) {
            // Get row count
            const countResult = await db.get(`SELECT COUNT(*) as count FROM ${table.name}`);
            console.log(`\nTable: ${table.name} (${countResult.count} rows)`);
            
            // Get table structure
            const tableInfo = await db.all(`PRAGMA table_info(${table.name})`);
            
            // Check for primary key
            const pkColumns = tableInfo.filter(col => col.pk > 0);
            if (pkColumns.length > 0) {
                console.log(`  Primary Key: ${pkColumns.map(col => col.name).join(', ')}`);
            } else {
                console.log('  No Primary Key defined');
            }
            
            // For the players table, check for duplicates
            if (table.name === 'players') {
                // Enable foreign keys to ensure constraints are enforced
                await db.run('PRAGMA foreign_keys = ON;');
                
                // Get the create table statement
                const createStmt = await db.get(`
                    SELECT sql FROM sqlite_master 
                    WHERE type='table' AND name='players'
                `);
                
                console.log(`\n  Table Definition:\n  ${createStmt.sql}`);
                
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
                    console.log(`\n  ⚠️ Found ${duplicates.length} duplicate player+season combinations (showing top 10):`);
                    for (const dup of duplicates) {
                        console.log(`    Player ID ${dup.id}, Season ${dup.season}: ${dup.count} entries`);
                        
                        // Show example of a duplicate
                        const examples = await db.all(`
                            SELECT rowid, id, full_name, team_name, season 
                            FROM players
                            WHERE id = ? AND season = ?
                            LIMIT 3
                        `, [dup.id, dup.season]);
                        
                        console.log('    Examples:');
                        for (const example of examples) {
                            console.log(`      rowid: ${example.rowid}, Name: ${example.full_name}, Team: ${example.team_name}`);
                        }
                    }
                    
                    // Count total duplicates
                    const dupCount = await db.get(`
                        SELECT SUM(dup_count) - COUNT(*) as total_duplicates
                        FROM (
                            SELECT COUNT(*) as dup_count
                            FROM players
                            GROUP BY id, season
                            HAVING COUNT(*) > 1
                        )
                    `);
                    
                    console.log(`\n  Total duplicate entries: ${dupCount.total_duplicates}`);
                    
                    // Show if PRIMARY KEY constraint exists
                    console.log('\n  Checking why PRIMARY KEY constraint is not working:');
                    
                    // Check if SQLite is enforcing PRIMARY KEY constraints
                    const enforceKeys = await db.get('PRAGMA foreign_keys');
                    console.log(`  - Foreign keys enforcement: ${enforceKeys.foreign_keys === 1 ? 'ON' : 'OFF'}`);
                    
                } else {
                    console.log('\n  ✅ No duplicate player+season combinations found');
                }
                
                // Show season distribution
                const seasonCounts = await db.all(`
                    SELECT season, COUNT(*) as count
                    FROM players
                    GROUP BY season
                    ORDER BY season
                `);
                
                console.log('\n  Players per season:');
                for (const sc of seasonCounts) {
                    console.log(`    ${sc.season}: ${sc.count} players`);
                }
            }
        }
        
        await db.close();
        console.log('\n===== DIAGNOSTIC COMPLETED =====');
    } catch (error) {
        console.error('\nERROR DURING DIAGNOSTIC:', error);
        process.exit(1);
    }
}

// Run the script
diagnoseDatabase().catch(console.error);