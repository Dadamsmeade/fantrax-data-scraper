// test-puppeteer-simple.js
const puppeteer = require('puppeteer');

async function test() {
    console.log('Puppeteer type:', typeof puppeteer);
    console.log('Puppeteer methods:', Object.keys(puppeteer));

    try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();

        // Check page methods
        console.log('Page methods sample:',
            Object.getOwnPropertyNames(Object.getPrototypeOf(page)).slice(0, 10));

        // Test if page.waitForTimeout is available
        if (typeof page.waitForTimeout === 'function') {
            console.log('waitForTimeout is available');
        } else {
            console.log('waitForTimeout is NOT available');
            // List methods that might be used for waiting
            const waitMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(page))
                .filter(m => m.toLowerCase().includes('wait'));
            console.log('Available wait methods:', waitMethods);
        }

        await browser.close();
    } catch (err) {
        console.error('Error launching browser:', err);
    }
}

test().catch(console.error);