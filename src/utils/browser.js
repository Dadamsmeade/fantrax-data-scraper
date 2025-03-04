const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');

// Configuration
const SCREENSHOTS_DIR = path.join(__dirname, '../data/screenshots');

// Ensure screenshots directory exists
fs.ensureDirSync(SCREENSHOTS_DIR);

/**
 * Setup browser for scraping with proper configuration for Codespaces
 * @returns {Promise<Browser>} Puppeteer browser instance
 */
async function setupBrowser() {
    console.log('Launching browser in headless mode...');
    const browser = await puppeteer.launch({
        headless: true, // Must be true in Codespaces
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process'
        ]
    });

    return browser;
}

/**
 * Setup page with common configurations
 * @param {Browser} browser - Puppeteer browser instance
 * @returns {Promise<Page>} Configured Puppeteer page
 */
async function setupPage(browser) {
    const page = await browser.newPage();

    // Set a realistic viewport size
    await page.setViewport({ width: 1280, height: 900 });

    // Add additional settings as needed
    await page.setDefaultNavigationTimeout(60000); // 60 seconds timeout

    return page;
}

/**
 * Take a screenshot and save it to the screenshots directory
 * @param {Page} page - Puppeteer page object
 * @param {string} name - Name for the screenshot file
 */
async function takeScreenshot(page, name) {
    const filename = `${name}.png`;
    const filepath = path.join(SCREENSHOTS_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    console.log(`Screenshot saved: ${filepath}`);
}

module.exports = {
    setupBrowser,
    setupPage,
    takeScreenshot,
    SCREENSHOTS_DIR
};