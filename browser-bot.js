const puppeteer = require('puppeteer');
const fetch = require('node-fetch')
const UserAgent = require('user-agents');
const notifier = require('node-notifier');
const path = require('path');
const GOOGLE_COOKIES = require('./cookies.json');
const logger = require('./logger');
const _ = require('lodash');


let instance;
let config;
let url;


module.exports = class Bot {

    constructor(i, c) {
        instance = i;
        config = c;
    }

    async start() {
        const width = config.windowWidth;
        const height = config.windowHeight;

        // Launch the browser in headless mode and set up a page.
        this.browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                `--window-size=${width},${height}`
            ],
            headless: config.headless,
            ignoreHTTPSErrors: true,
            // userDataDir: path.resolve('tmp', 'chrome_' + this.instance),
        });


        // Add google cookies to browser if provided
        if (Object.keys(GOOGLE_COOKIES).length != 0) {

            const cookiePage = await this.browser.newPage();
            cookiePage.setDefaultNavigationTimeout(60000);

            await cookiePage.goto('http://www.google.com/404');
            for (let cookie of GOOGLE_COOKIES) {
                await cookiePage.setCookie({
                    name: cookie.name,
                    value: cookie.value
                });
            }
            await cookiePage.close();

        }

        // Create main page
        const page = (await this.browser.pages())[0];

        // Enable interception

        // await page.setViewport({
        //     width: _.random(800, 1000),
        //     height: _.random(600, 800)
        // });

        page.setDefaultNavigationTimeout(60000);

        // Prepare for the tests (not yet implemented).
        await this.preparePageForTests(page, config);

        // Set up listeners
        await this.setListeners(page);

        // Navigate to the page
        while (true) {
            try {
                await page.goto(config.url);
                url = await page.url();
                break;
            } catch (err) {
                logger.error(instance, err);
            }
        }

    }

    async stop() {
        await this.browser.close();
    }

    // Contains event handlers which do the work
    async setListeners(page) {

        // Handlers
        page.on('response', async response => {


            // Catch cart responses
            if (response.url().includes("api/cart_items")) {

            }
            // Catch availibility responses
            else if (response.url().includes("availability")) {
                // var sizes = await response.json();
                // getBestSize(sizes);
            }
            // Catch page reloads 
            else if (response.url() == url) {

                await page.waitForNavigation()

                const sizeSelector = await page.$x("//*[text() = 'Select size']");
                const cartButton = await page.$x("//*[text() = 'Add To Bag']");

                // Transfer cookies to headed browser
                let browser2 = null;
                let page2 = null;
                
                if (config.headless) {
                    const sessionCookies = await page.cookies()

                    browser2 = await puppeteer.launch({
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-accelerated-2d-canvas',
                            '--disable-gpu',
                            '--window-size=1920x1080',
                        ],
                        headless: false,
                    });

                    page2 = (await browser2.pages())[0];

                    page2.setViewport({ width: 0, height: 0 });

                    await page2.setCookie(...sessionCookies);

                    await this.preparePageForTests(page2);

                    await page2.goto(url);

                    this.browser.close();

                }

                // If on cart page
                // if (sizeSelector.length > 0 || cartButton.length > 0) {
                if (true) {
                    logger.success(instance);

                    if (config.alertOnCartPage) {

                        notifier.notify({
                            title: 'Adidas Bruteforcer',
                            message: `Cart page on instance ${instance}}!`,
                            sound: 'Hero',
                            timeout: 60000
                        }, async (err, res, data) => {
                            if (res == 'activate') {
                                if (!config.headless) {
                                    await page.bringToFront();
                                } else {
                                    await page2.bringToFront();
                                }
                            }
                        });
                    }
                }

            }
        });

    }

    async preparePageForTests(page) {
        // Pass the User-Agent Test
        let userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36";
        if (config.randomUserAgent) {
            userAgent = new UserAgent().toString();
        }
        await page.setUserAgent(userAgent);

        // Pass the Webdriver Test.
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
        });

        // Pass the Chrome Test.
        await page.evaluateOnNewDocument(() => {
            // We can mock this in as much depth as we need for the test.
            window.navigator.chrome = {
                runtime: {},
                // etc.
            };
        });

        // Pass the Permissions Test.
        await page.evaluateOnNewDocument(() => {
            const originalQuery = window.navigator.permissions.query;
            return window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
        });

        // Pass the Plugins Length Test.
        await page.evaluateOnNewDocument(() => {
            // Overwrite the `plugins` property to use a custom getter.
            Object.defineProperty(navigator, 'plugins', {
                // This just needs to have `length > 0` for the current test,
                // but we could mock the plugins too if necessary.
                get: () => [1, 2, 3, 4, 5],
            });
        });

        // Pass the Languages Test.
        await page.evaluateOnNewDocument(() => {
            // Overwrite the `plugins` property to use a custom getter.
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
        });
    }

}


