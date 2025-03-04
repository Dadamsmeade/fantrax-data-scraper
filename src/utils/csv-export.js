const fs = require('fs-extra');
const path = require('path');
const Papa = require('papaparse');

// Configuration
const DATA_DIR = path.join(__dirname, '../data');

// Ensure data directory exists
fs.ensureDirSync(DATA_DIR);

/**
 * Save data to a CSV file
 * @param {Array} data - Array of objects to save
 * @param {string} filename - Filename to save as
 * @param {string} subdirectory - Optional subdirectory within data directory
 * @returns {Promise<string>} - Path to the saved file
 */
async function saveToCSV(data, filename, subdirectory = '') {
    if (!data || data.length === 0) {
        console.log(`No data to save for ${filename}`);
        return null;
    }

    try {
        // Create subdirectory if provided
        const dirPath = subdirectory
            ? path.join(DATA_DIR, subdirectory)
            : DATA_DIR;

        fs.ensureDirSync(dirPath);

        // Add .csv extension if not already present
        if (!filename.endsWith('.csv')) {
            filename = `${filename}.csv`;
        }

        const filePath = path.join(dirPath, filename);

        const csvString = Papa.unparse(data, {
            header: true,
            newline: '\n'
        });

        await fs.writeFile(filePath, csvString, 'utf8');
        console.log(`Data saved to ${filePath}`);

        return filePath;
    } catch (error) {
        console.error(`Error saving CSV file ${filename}:`, error);
        throw error;
    }
}

/**
 * Read data from a CSV file
 * @param {string} filePath - Path to the CSV file
 * @returns {Promise<Array>} - Array of objects from the CSV
 */
async function readFromCSV(filePath) {
    try {
        const csvString = await fs.readFile(filePath, 'utf8');

        return new Promise((resolve, reject) => {
            Papa.parse(csvString, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: (results) => {
                    resolve(results.data);
                },
                error: (error) => {
                    reject(error);
                }
            });
        });
    } catch (error) {
        console.error(`Error reading CSV file ${filePath}:`, error);
        throw error;
    }
}

module.exports = {
    saveToCSV,
    readFromCSV,
    DATA_DIR
};