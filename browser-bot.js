const puppeteer = require('puppeteer');
const fetch = require('node-fetch')
const UserAgent = require('user-agents');
const config = require("./config.json");
const notifier = require('node-notifier');


class Bot {
    constructor() {
        this.browser = null;
        this.url = '';
        this.isNotified = false;
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
            headless: false,
        });

        const page = (await this.browser.pages())[0];

        // await page.setViewport({ width, height })

        // Prepare for the tests (not yet implemented).
        await preparePageForTests(page);

        // Handlers
        page.on('response', async response => {
            // Catch cart responses
            if (response.url().endsWith("api/cart_items?sitePath=us")) {

            }
            // Catch availibility responses
            else if (response.url().endsWith("availability?sitePath=us")) {
                // var sizes = await response.json();
                // getBestSize(sizes);
            }
            // Catch page reloads 
            else if (response.url() == this.url) {

                if (config.alertOnCartPage) {
                    await page.waitForNavigation()

                    const sizeSelector = await page.$x("//*[text() = 'Select size']");
                    const cartButton = await page.$x("//*[text() = 'Add To Bag']");
    
                    if (sizeSelector.length > 0 || cartButton.length > 0) {
    
                        notifier.notify({
                            'title': 'Past Splash!',
                            'message': 'One or more of the browsers appear to have past the splash page.',
                        });
                    }
                }
                
            }
        });

        // Navigate to the page
        try {
            await page.goto(config.url);
            this.url = await page.url();
        } catch (err) {
            console.log(err)
        }

    }

    async stop() {
        await this.browser.close();
    }
}

const preparePageForTests = async (page) => {
    // Pass the User-Agent Test
    let userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36";
    if (config.randomUserAgent) {
        userAgent = new UserAgent().toString();
    }
    await page.setUserAgent(userAgent);

    // // Block somne stuff to make loading faster
    // const blockedResourceTypes = [
    //     'media',
    //     'font',
    //     'texttrack',
    //     'object',
    //     'beacon',
    //     'csp_report',
    //     'imageset',
    // ];
    // const skippedResources = [
    //     'quantserve',
    //     'adzerk',
    //     'doubleclick',
    //     'adition',
    //     'exelator',
    //     'sharethrough',
    //     'cdn.api.twitter',
    //     'google-analytics',
    //     'googletagmanager',
    //     'fontawesome',
    //     'facebook',
    //     'analytics',
    //     'optimizely',
    //     'clicktale',
    //     'mixpanel',
    //     'zedo',
    //     'clicksor',
    //     'tiqcdn',
    // ];

    //Enable request interception
    // await page.setRequestInterception(true);

    // page.on('request', request => {
    //     const requestUrl = request._url.split('?')[0].split('#')[0];

    //     if (
    //         blockedResourceTypes.indexOf(request.resourceType()) !== -1 ||
    //         skippedResources.some(resource => requestUrl.indexOf(resource) !== -1)
    //     ) {
    //         request.abort();
    //     } else {
    //         request.continue();
    //     }
    // });

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

module.exports = Bot;