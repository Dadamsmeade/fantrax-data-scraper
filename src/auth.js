const { takeScreenshot } = require('./utils/browser');

// Fantrax base URL
const FANTRAX_BASE_URL = 'https://www.fantrax.com';

/**
 * Authenticates with Fantrax and returns page object
 * @param {Page} page - Puppeteer page object
 * @param {string} username - Fantrax username
 * @param {string} password - Fantrax password
 * @returns {Promise<boolean>} - Whether authentication was successful
 */
async function authenticateFantrax(page, username, password) {
    console.log('Starting Fantrax authentication...');

    try {
        // Navigate to Fantrax login page
        console.log('Navigating to Fantrax login page...');
        await page.goto(`${FANTRAX_BASE_URL}/login`, { waitUntil: 'networkidle2' });

        // Take a screenshot of the login page
        await takeScreenshot(page, 'login-page');

        // Login flow
        console.log('Starting login process...');

        try {
            // Wait for form fields to be available
            await page.waitForSelector('input[formcontrolname="email"]');
            console.log('Found email input field');

            // Fill in login credentials
            await page.type('input[formcontrolname="email"]', username);
            await page.type('input[formcontrolname="password"]', password);

            // Take a screenshot of the filled form
            await takeScreenshot(page, 'form-filled');

            // Try using page.evaluate to find and click the login button
            console.log('Attempting to click login button...');
            const buttonClicked = await page.evaluate(() => {
                // Find all buttons on the page
                const buttons = Array.from(document.querySelectorAll('button'));

                // Look for a button with login text or login icon
                for (const button of buttons) {
                    if (button.textContent.toLowerCase().includes('login') ||
                        button.innerHTML.toLowerCase().includes('login')) {
                        console.log('Found login button by text content');
                        button.click();
                        return true;
                    }
                }

                // Try to find button with type="submit"
                const submitButton = document.querySelector('button[type="submit"]');
                if (submitButton) {
                    console.log('Found submit button');
                    submitButton.click();
                    return true;
                }

                return false;
            });

            if (buttonClicked) {
                console.log('Login button clicked');
            } else {
                console.log('Could not find login button via page.evaluate()');

                // Try form submission if button click failed
                console.log('Attempting direct form submission...');
                await page.evaluate(() => {
                    const form = document.querySelector('form');
                    if (form) {
                        form.submit();
                    }
                });
            }

            // Wait for navigation to complete after login attempt
            console.log('Waiting for navigation after login attempt...');
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });

        } catch (error) {
            console.error('Error during login process:', error);
            await takeScreenshot(page, 'login-error');

            // Try Enter key as a last resort
            console.log('Trying final approach: pressing Enter in password field...');
            try {
                await page.focus('input[formcontrolname="password"]');
                await page.keyboard.press('Enter');
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
            } catch (enterError) {
                console.error('Error during Enter key submission:', enterError);
                throw error;
            }
        }

        // Take a screenshot after login attempt
        await takeScreenshot(page, 'after-login');

        // Check if login was successful
        const url = page.url();
        console.log(`Current URL after login attempt: ${url}`);

        if (url.includes('login')) {
            console.error('Login failed. Still on the login page.');
            return false;
        }

        console.log('Login successful!');
        return true;
    } catch (error) {
        console.error('Authentication error:', error);
        return false;
    }
}

module.exports = {
    authenticateFantrax,
    FANTRAX_BASE_URL
};