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
const config = require("./config.json");

var checkoutUrl = 'https://www.adidas.com/on/demandware.store/Sites-adidas-US-Site/en_US/COShipping-Show';
var paymentUrl = 'https://www.adidas.com/on/demandware.store/Sites-adidas-US-Site/en_US/COSummary2-Start';

// For waiting a set number of ms
let wait = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = class Bot {

    constructor(i, p) {
        this.baseUrl = '';
        this.browser = null;
        this.page = null;
        this.instance = i;
        this.proxy = p;
    }

    async start() {

        console.log(`Starting bot instance ${this.instance}`)

        let args;

        if (this.proxy != null) {
            args = [
                '--no-sandbox',
                `--window-size=${config.windowWidth},${config.windowHeight}`,
                `--proxy-server=${this.proxy}`
            ];
        } else {
            args = [
                '--no-sandbox',
                `--window-size=${config.windowWidth},${config.windowHeight}`,
            ];
        }

        // Launch the browser
        this.browser = await puppeteer.launch({
            args,
            headless: config.headless,
            ignoreHTTPSErrors: true,
            userDataDir: path.resolve('saves', 'chrome_' + this.instance)
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
        this.page = (await this.browser.pages())[0];

        // Max the viewport
        await this.page.setViewport({
            width: 0,
            height: 0
        });

        //Set timeout
        this.page.setDefaultNavigationTimeout(60000);

        // Prepare for the tests (not yet implemented).
        await this.preparePage();

        // Set up listeners
        await this.setListeners();

        // Navigate to the page
        while (true) {
            try {
                await this.page.goto(config.url, { waitUntil: 'networkidle0' });
                this.baseUrl = await this.page.url();
                break;
            } catch (err) {
                logger.error(this.instance, err);
                await wait(config.retryDelay)
            }
        }

        // Wait for ATC page
        await Promise.race([
            this.page.waitForXPath("//*[text() = 'Select size']"),
            this.page.waitForXPath("//*[text() = 'Add To Bag']"),
        ]);

        // Log success
        logger.success(this.instance);

        // Notify user
        if (config.alertOnCartPage) {

            notifier.notify({
                title: 'Adidas Bruteforcer',
                message: `Cart page on instance ${this.instance}}!`,
                sound: 'Hero',
                timeout: 60000
            }, async (err, res, data) => {
                if (res == 'activate') {
                    await this.page.bringToFront();
                }
            });
        }

        // if (config.autoATC) {
        //     while (true) {
        //         if (await this.cartByRequest())
        //             break;
        //         else
        //             await wait(config.retryDelay)
        //     }
        //     await this.page.goto(checkoutUrl, { waitUntil: 'domcontentloaded' });
        // }


        // if (config.autofillCheckout) {
        //     await this.fillCheckout1();
        //     await (await this.page.$('[name="dwfrm_shipping_submitshiptoaddress"]')).click();
        //     await this.page.waitForNavigation( { waitUntil: 'domcontentloaded' });
        //     await this.fillCheckout2();
        // }


    }

    async stop() {
        await this.browser.close();
    }

    // Contains event handlers for various pages and conditions
    async setListeners() {

        // Handlers
        await this.page.on('response', async response => {

            // if (response.url().includes("api/cart_items")) {
            //     console.log("caught cart response");

            //     try {
            //         let json = await response.json();
            //         if (json.cart.product_quantity != 0) {
            //             carted = true;
            //             console.log(`Basket count: ${json.cart.product_quantity}`)
            //         }
            //     } catch (ex) {
            //         console.log(`Error parsing JSON: ${ex}`)
            //     }
            // }

            // Catch 
            // else if (response.url() == baseUrl) {

            //     await page.waitForNavigation()

            //     const sizeSelector = await page.$x("//*[text() = 'Select size']");
            //     const cartButton = await page.$x("//*[text() = 'Add To Bag']");

            //     // If on cart page
            //     if (sizeSelector.length > 0 || cartButton.length > 0) {

            //         console.log(`Carted: ${carted}`)
            //         console.log(`Past splash: ${pastSplash}`)

            //         if (!pastSplash)
            //             logger.success(instance);

            //         // Transfer cookies to headed browser
            //         if (config.headless && !pastSplash) {
            //             console.log("transfering cookies")
            //             const sessionCookies = await page.cookies();

            //             await this.lauchHeadedBrowser(sessionCookies);

            //         }


            //         // Notify user
            //         if (config.alertOnCartPage && !pastSplash) {

            //             notifier.notify({
            //                 title: 'Adidas Bruteforcer',
            //                 message: `Cart page on instance ${instance}}!`,
            //                 sound: 'Hero',
            //                 timeout: 60000
            //             }, async (err, res, data) => {
            //                 if (res == 'activate') {
            //                     await page.bringToFront();
            //                 }
            //             });
            //         }

            //         if (config.autoATC && !carted) {
            //             this.cartByRequest();
            //         }

            //         // prevent transfer of cookies again
            //         pastSplash = true;

            //     }



            // }

            // Cart cart page
            // else if (response.url().includes("Cart-Show")) {
            // }

            // // Catch checkout page 1
            // else if (response.url().includes("COShipping-Show")) {
            //     if (config.autofillCheckout)
            //         await this.autofillCheckout1();
            // }
            // // Catch checkout page 2
            // else if (response.url().includes("COSummary2-Start")) {
            //     if (config.autofillCheckout)
            //         await this.autofillCheckout2();
            // }
        });

    }

    async preparePage() {
        // Pass the User-Agent Test
        let userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36";
        if (config.randomUserAgent)
            userAgent = new UserAgent({ deviceCategory: 'desktop' }).toString();

        await this.page.setUserAgent(userAgent);

        // Pass the Webdriver Test.
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
        });

        // Pass the Chrome Test.
        await this.page.evaluateOnNewDocument(() => {
            // We can mock this in as much depth as we need for the test.
            window.navigator.chrome = {
                runtime: {},
                // etc.
            };
        });

        // Pass the Permissions Test.
        await this.page.evaluateOnNewDocument(() => {
            const originalQuery = window.navigator.permissions.query;
            return window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
        });

        // Pass the Plugins Length Test.
        await this.page.evaluateOnNewDocument(() => {
            // Overwrite the `plugins` property to use a custom getter.
            Object.defineProperty(navigator, 'plugins', {
                // This just needs to have `length > 0` for the current test,
                // but we could mock the plugins too if necessary.
                get: () => [1, 2, 3, 4, 5],
            });
        });

        // Pass the Languages Test.
        await this.page.evaluateOnNewDocument(() => {
            // Overwrite the `plugins` property to use a custom getter.
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
        });
    }

    async lauchHeadedBrowser(cookies) {

        console.log("launching headed browser")

        this.browser.close();

        this.browser = await puppeteer.launch({
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

            const cookiePage2 = await browser.newPage();
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

        this.page = (await browser.pages())[0];

        this.page.setViewport({ width: 0, height: 0 });

        // Set cookies
        await this.page.setCookie(...cookies);

        // Pass detection
        await this.preparePage();

        // Set up listeners
        await this.setListeners();

        await this.page.goto(baseUrl);

    }

    async cartByRequest() {

        // Select the size dropdown to prevent bans when using auto ATC
        (await this.page.$x("//*[text() = 'Select size']"))[0].click();
        // May need a delay - drvien by event handler?
        await wait(2000);

        let response = await this.page.evaluate(async () => {
            const res = await fetch("https://www.adidas.com/api/cart_items?sitePath=us", {
                "credentials": "include",
                "headers": {
                    "accept": "*/*",
                    "accept-language": "en-US,en;q=0.9,fr;q=0.8",
                    "content-type": "application/json",
                },
                "referrer": 'https://www.adidas.com/us/pharrell-williams-bbc-hu-v2-shoes/BB9549.html',
                "referrerPolicy": "no-referrer-when-downgrade",
                "body": JSON.stringify({
                    product_id: "BB9549",
                    quantity: 1,
                    product_variation_sku: "BB9549_630",
                    productId: "BB9549_630",
                    size: 9,
                    displaySize: 9,
                    captchaResponse: ""
                }),
                "method": "POST",
                "mode": "cors"
            });

            try {
                const json = await res.json();
                return json;
            } catch (e) {
                return null;
            }
        });

        if (response == null) {
            return false;
        } else {
            return response.cart.product_quantity != 0;
        }

    }

    async fillCheckout1() {

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

        for (let i = 0; i < selectors.length; i++) {
            try {
                await this.page.waitForSelector(selectors[i]);
                await this.page.type(selectors[i], values[i])
            } catch (e) {
                logger.error(this.instance, `Failed to autofill field by selector ${selectors[i]}`)
                return false;
            }
        }

        // Click and select state
        try {
            const state = await this.page.$x("//*[text() = 'Select State']");
            await state[0].click();
            const stateName = await this.page.$$(`[data-value="${autofill.state}"]`);
            stateName[0].click();
        } catch (e) {
            logger.error(this.instance, `Failed to autofill state field`)
            return false;
        }

        return true;

    }

    async fillCheckout2() {

        let selectors = [
            "#dwfrm_payment_creditCard_number",
            "#dwfrm_payment_creditCard_cvn",
        ]

        let values = [
            autofill.cardNumber,
            autofill.CVV
        ]

        for (let i = 0; i < selectors.length; i++) {
            try {
                await this.page.waitForSelector(selectors[i]);
                await this.page.type(selectors[i], values[i]);
            } catch (e) {
                logger.error(this.instance, `Failed to autofill field by selector ${selectors[i]}`);
                return false;
            }
        }

        // Click and select month
        try {
            const month = await this.page.$("#dwfrm_payment_creditCard_month_display_field");
            await month.click();
            const monthNumber = await this.page.$$(`[data-value="${autofill.month}"]`);
            monthNumber[0].click();
        } catch (e) {
            logger.error(this.instance, `Failed to autofill month field`);
            return false;
        }

        // Click and select year
        try {
            const year = await this.page.$("#dwfrm_payment_creditCard_year_display_field");
            await year.click();
            const yearNumber = await this.page.$$(`[data-value="${autofill.year}"]`);
            yearNumber[0].click();
        } catch (e) {
            logger.error(this.instance, `Failed to autofill year field`);
            return false;
        }

        return true;
    }

}


