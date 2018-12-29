const puppeteer = require('puppeteer');
const fetch = require('node-fetch')
const UserAgent = require('user-agents');
const notifier = require('node-notifier');
const path = require('path');
const GOOGLE_COOKIES = require('./cookies.json');
const logger = require('./logger');
const _ = require('lodash');
var ps = require('ps-list');
const fkill = require('fkill');
const autofill = require("./autofill.json")

let instance;
let config;
let baseUrl;
let browser;
let page;
let headedBrowser = null;
let page2 = null;

//Used to prevent multiple autofills
var lastAutoFill1 = 0;
var lastAutoFill2 = 0;
var delay = 10000;

module.exports = class Bot {

    constructor(i, c) {
        instance = i;
        config = c;
    }

    async start() {

        // Launch the browser in headless mode and set up a page.
        browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                `--window-size=${config.windowWidth},${config.windowHeight}`
            ],
            headless: config.headless,
            ignoreHTTPSErrors: true,
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
        page = (await browser.pages())[0];

        // Max the viewport
        await page.setViewport({
            width: 0,
            height: 0
        });

        //Set timeout
        page.setDefaultNavigationTimeout(60000);

        // Prepare for the tests (not yet implemented).
        await this.preparePage();

        // Set up listeners
        await this.setListeners();

        // Navigate to the page
        while (true) {
            try {
                await page.goto(config.url);
                baseUrl = await page.url();
                break;
            } catch (err) {
                logger.error(instance, err);
            }
        }

    }

    async stop() {
        await browser.close();
        if (headedBrowser != null) await headedBrowser.close();
    }

    // Contains event handlers for various pages and conditions
    async setListeners() {

        // Handlers
        page.on('response', async response => {

            // Catch cart responses
            if (response.url().includes("api/cart_items")) {

            }
            // Catch page reloads 
            else if (response.url() == baseUrl) {

                await page.waitForNavigation()

                const sizeSelector = await page.$x("//*[text() = 'Select size']");
                const cartButton = await page.$x("//*[text() = 'Add To Bag']");

                // If on cart page
                if (sizeSelector.length > 0 || cartButton.length > 0) {

                    logger.success(instance);

                    // Transfer cookies to headed browser
                    if (config.headless) {

                        const sessionCookies = await page.cookies();

                        await this.lauchHeadedBrowser(sessionCookies);

                    }


                    if (config.alertOnCartPage) {

                        notifier.notify({
                            title: 'Adidas Bruteforcer',
                            message: `Cart page on instance ${instance}}!`,
                            sound: 'Hero',
                            timeout: 60000
                        }, async (err, res, data) => {
                            if (res == 'activate') {
                                await page.bringToFront();
                            }
                        });
                    }
                }

            }

            // Cart cart page
            else if (response.url().includes("Cart-Show")) {
            }

            // Catch checkout page 1
            else if (response.url().includes("COShipping-Show")) {
                if (config.autofillCheckout)
                    await this.autofillPage1();
            }
            // Catch checkout page 2
            else if (response.url().includes("COSummary2-Start")) {
                if (config.autofillCheckout)
                    await this.autofillPage2();
            }
        });

    }

    async preparePage() {
        // Pass the User-Agent Test
        let userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36";
        if (config.randomUserAgent)
            userAgent = new UserAgent({ deviceCategory: 'desktop' }).toString();

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

    async lauchHeadedBrowser(cookies) {

        headedBrowser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                `--window-size=${config.windowWidth},${config.windowHeight}`
            ],
            headless: false,
        });

        if (Object.keys(GOOGLE_COOKIES).length != 0) {

            const cookiePage2 = await headedBrowser.newPage();
            cookiePage2.setDefaultNavigationTimeout(60000);

            await cookiePage2.goto('http://www.google.com/404');
            for (let cookie of GOOGLE_COOKIES) {
                await cookiePage2.setCookie({
                    name: cookie.name,
                    value: cookie.value
                });
            }
            await cookiePage2.close();

        }

        page = (await headedBrowser.pages())[0];

        page.setViewport({ width: 0, height: 0 });

        await page.setCookie(...cookies);

        await this.preparePage(page);

        await page.goto(baseUrl);

        await browser.close();
    }

    async autofillPage1() {

        //TODO: Better solution for preventing duplicates

        if (lastAutoFill1 >= (Date.now() - delay))
            return;
        lastAutoFill1 = Date.now();

        let selectors = [
            "#dwfrm_shipping_shiptoaddress_shippingAddress_firstName",
            "#dwfrm_shipping_shiptoaddress_shippingAddress_lastName",
            "#dwfrm_shipping_shiptoaddress_shippingAddress_address1",
            "#dwfrm_shipping_shiptoaddress_shippingAddress_address2",
            "#dwfrm_shipping_shiptoaddress_shippingAddress_city",
            "#dwfrm_shipping_shiptoaddress_shippingAddress_postalCode",
            "#dwfrm_shipping_shiptoaddress_shippingAddress_phone",
            "#dwfrm_shipping_email_emailAddress"
        ]

        let values = [
            autofill.firstName,
            autofill.lastName,
            autofill.address1,
            autofill.address2,
            autofill.city,
            autofill.postalCode,
            autofill.phone,
            autofill.emailAddress
        ]

        await page.waitForNavigation()

        for (let i = 0; i < selectors.length; i++) {
            await page.type(selectors[i], values[i])

            // (await page.$(selectors[i])).click()
            // await page.keyboard.type(values[i]);
        }

        // Click and select state
        const state = await page.$x("//*[text() = 'Select State']");
        await state[0].click();
        const stateName = await page.$$(`[data-value="${autofill.state}"]`);
        stateName[0].click();

    }

    async autofillPage2() {

        //TODO: Better solution for preventing duplicates
        if (lastAutoFill2 >= (Date.now() - delay))
            return;
        lastAutoFill2 = Date.now();

        let selectors = [
            "#dwfrm_payment_creditCard_number",
            "#dwfrm_payment_creditCard_cvn",
        ]

        let values = [
            autofill.cardNumber,
            autofill.CVV
        ]

        await page.waitForNavigation()

        for (let i = 0; i < selectors.length; i++) {
            await page.type(selectors[i], values[i])
        }

        // Click and select month
        const month = await page.$("#dwfrm_payment_creditCard_month_display_field")
        await month.click();
        const monthNumber = await page.$$(`[data-value="${autofill.month}"]`);
        monthNumber[0].click();

        // Click and select year
        const year = await page.$("#dwfrm_payment_creditCard_year_display_field")
        await year.click();
        const yearNumber = await page.$$(`[data-value="${autofill.year}"]`);
        yearNumber[0].click();

    }
}


