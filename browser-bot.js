const puppeteer = require('puppeteer-extra')
const fetch = require('node-fetch')
const UserAgent = require('user-agents');
const notifier = require('node-notifier');
const path = require('path');
const GOOGLE_COOKIES = require('./cookies.json');
const logger = require('./logger');
const $ = require('cheerio');
const querystring = require('querystring');
const config = require("./config.json");
const prettier = require('prettier');
const atob = require('atob');
const btoa = require('btoa');
const fs = require('fs');

const pluginStealth = require("puppeteer-extra-plugin-stealth");
puppeteer.use(pluginStealth());

const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha')

if (config.twocaptcha.enabled)
    puppeteer.use(
        RecaptchaPlugin({
            provider: { id: '2captcha', token: config.twocaptcha.apiKey },
            visualFeedback: true // colorize reCAPTCHAs (violet = detected, green = solved)
        })
    );

/*
* Urls
* TODO: chamge these to suport other regions
*/
const checkoutUrl = 'https://www.adidas.com/on/demandware.store/Sites-adidas-US-Site/en_US/COShipping-Show';
const paymentUrl = 'https://www.adidas.com/on/demandware.store/Sites-adidas-US-Site/en_US/COSummary2-Start';
const cartUrl = 'https://www.adidas.com/api/cart_items?sitePath=us';
const shippingSubmitUrl = 'https://www.adidas.com/on/demandware.store/Sites-adidas-US-Site/en_US/COShipping-Submit';
const paymentSubmitUrl = 'https://www.adidas.com/on/demandware.store/Sites-adidas-US-Site/en_US/COPayment-HandlePaymentForm';

// For waiting a set number of ms
let wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/*
* Vars
*/
// Holds url that is first navigated to
var baseUrl;
// Holds product ID when it is detected
let PID = null;
// Contains list of all sizes reported by the server
let availibility = [];
// Get sizes to cart
let sizesToCart = [];
if (config.autoCart.sizes != "any" && config.autoCart.sizes != "")
    sizesToCart = config.autoCart.sizes.split(',');

module.exports = class Bot {

    constructor(i, p) {
        this.browser = null;
        this.page = null;
        this.instance = i;
        this.proxy = p;
    }

    async start() {

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
        this.page = await this.browser.newPage();

        // Close first empty page
        (await this.browser.pages())[0].close();

        // Max the viewport
        await this.page.setViewport({
            width: 0,
            height: 0
        });

        // Prepare for the tests (not yet implemented).
        await this.preparePage();

        // Set up listeners
        await this.setListeners();

        // Navigate to the page
        while (true) {
            try {
                await this.page.goto(config.url, { waitUntil: 'load' });
                if (baseUrl == null) baseUrl = await this.page.url();
                break;
            } catch (err) {
                logger.error(this.instance, err);
                await wait(config.retryDelay)
            }
        }

        // Solve captchas
        this.page.solveRecaptchas()

        // Wait for ATC page
        await this.waitForATC(await this.page.cookies());

        // Log success
        logger.success(this.instance);

        // Notify user
        if (config.alertOnCartPage) {

            notifier.notify({
                title: 'Adidas Bruteforcer',
                message: `Cart page on instance ${this.instance}}!`,
                sound: 'Hero',
                timeout: 60000
            }, async (err, res) => {
                if (res == 'activate') {
                    await this.page.bringToFront();
                }
            });
        }

        // Switch to headed browser if needed
        if (!config.headlessAfterSplash && config.headless) {
            await this.lauchHeadedBrowser(await this.page.cookies())
        }

        // Auto cart the shoe
        if (config.autoCart.enabled) {
            while (true) {
                if (await this.cartProduct())
                    break;
                else
                    await wait(config.retryDelay)
            }
            await this.page.goto(checkoutUrl, { waitUntil: 'load' });
        }

        // Submit checkout information
        if (config.autoCheckout.enabled) {

            while (true) {
                if (await this.submitShipping()) break;
                await wait(config.retryDelay);
            }

            await this.page.goto(paymentUrl, { waitUntil: 'domcontentloaded' });

            await this.submitPayment()

        };

    }

    async stop() {
        await this.browser.close();
    }

    // Contains event handlers for various pages and conditions
    async setListeners() {

        var matchRule = (str, rule) => {
            return new RegExp("^" + rule.split("*").join(".*") + "$").test(str);
        }

        // Handlers
        this.page.on('response', async response => {

            // Catch availability response
            if (matchRule(response.url(), '*/api/products/*/availability*')) {
                try {
                    let json = await response.json();
                    PID = json.id;
                    availibility = json.variation_list;
                } catch (ex) {
                    console.log(`Error parsing availability JSON: ${ex}`)
                }
            }

            // Catch captcha requests and change type to 'noclick' (captcha bypass)
            if (matchRule(response.url(), '*google*recaptcha*reload*')) {
                try {
                } catch (ex) {
                    console.log(`${ex}`)
                }
            }

            // Catch waiting room config response
            if (matchRule(response.url(), '*waitingRoomConfig.json')) {
                try {
                    let json = await response.json();
                } catch (ex) {
                    console.log(`Error parsing waiting room config JSON: ${ex}`)
                }
            }


            // if (matchRule(response.url(), '*/demandware.store/*/COShipping-Submit')) {
            //     console.lo
            // }

        });

        // Needed to prevent page from idling
        this.page.on('request', request => {
            // if (matchRule(response.url(), '*google*recaptcha*reload*')) {
            //     request.respond({
            //         status: 200,
            //         contentType: 'application/javascript; charset=utf-8',
            //         body: ''
            //     });
            // } else {
            request.continue();
            // }

        });

    }

    async preparePage() {

        //Set timeout
        await this.page.setDefaultNavigationTimeout(0);
        // Allow interception
        await this.page.setRequestInterception(true)

        // Pass the User-Agent Test
        // let userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36";
        // if (config.randomUserAgent)
        //     userAgent = new UserAgent({ deviceCategory: 'desktop' }).toString();

        // await this.page.setUserAgent(userAgent);

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

        this.page = (await this.browser.pages())[0];

        this.page.setViewport({ width: 0, height: 0 });

        // Set cookies
        await this.page.setCookie(...cookies);

        // Pass detection
        await this.preparePage();

        // Set up listeners
        await this.setListeners();

        await this.page.goto(baseUrl);

    }

    waitForATC(cookies) {
        return new Promise(function (resolve) {
            var interval = setInterval(function (cookies) {
                for (let cookie of cookies) {
                    if (cookie.value.includes(config.splashCookieKeyword)) {
                        clearInterval(interval);
                        resolve();
                    }
                }
            }, config.splashDetectionInterval, cookies);
        });
    }

    async submitShipping() {

        // Serialize the checkout form
        let checkoutForm = await this.page.evaluate(async () => {
            try {
                return await jQuery('#shippingForm').serialize();
            } catch (e) {
                return null;
            }
        });

        // Catch null shippingForm
        if (checkoutForm == null) {
            logger.error(this.instance, "Failed to serialize shippingForm!")
            return false;
        }

        // Convert it to JSON
        var json = querystring.parse(checkoutForm);

        // Grab user data from config file
        var userData = config.autoCheckout.data;

        Object.keys(json).forEach(function (k) {
            for (var name in userData) {
                if (k.includes(name))
                    json[k] = userData[name];
            }
        });

        // Add the last fields that are created by a scrtipt
        json['dwfrm_shipping_updateshippingmethods'] = 'updateshippingmethods';
        json['dwfrm_shipping_submitshiptoaddress'] = 'Review and Pay';

        return await this.page.evaluate(async (body, url) => {
            try {
                await fetch(url, {
                    "credentials": "omit",
                    "headers": {
                        "accept": "application/json, text/plain, */*",
                        "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
                    },
                    "referrer": "https://www.adidas.com/on/demandware.store/Sites-adidas-US-Site/en_US/COShipping-Show",
                    "referrerPolicy": "no-referrer-when-downgrade",
                    "body": body,
                    "method": "POST",
                    "mode": "cors"
                });
                return true;
            } catch (e) {
                console.log(e)
                return false;
            }
        }, querystring.stringify(json), shippingSubmitUrl);
    }

    async submitPayment() {

        // Pulled from adidas.com
        function getCardType(cardNumber, mode) {
            var result = 'other';
            var returnMode = mode || 0; // return mode 0 - as string (default), 1 - as digit

            if (typeof cardNumber == 'undefined' || !cardNumber.length) {
                return result;
            }

            var cardNumber = cardNumber.replace(/[\s-]/g, '');

            // first check for MasterCard (number starts with ranges 51-55 or 2221-2720)
            if (/^(?:5[1-5]|222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)/.test(cardNumber)) {
                result = returnMode ? '002' : 'mc';
            }
            // then check for Visa
            else if (/^4/.test(cardNumber)) {
                result = returnMode ? '001' : 'visa';
            }
            // then check for AmEx
            else if (/^3[47]/.test(cardNumber)) {
                result = returnMode ? '003' : 'amex';
            }
            // then check for Discover
            else if (/^(6011|622(12[6-9]|1[3-9][0-9]|[2-8][0-9]{2}|9[0-1][0-9]|92[0-5]|64[4-9])|65)/.test(cardNumber)) {
                result = returnMode ? '004' : 'discover';
            }
            // then check for Diners Club International
            else if (/^3(?:0|6|8)/.test(cardNumber)) {
                result = returnMode ? '005' : 'diners';
            }
            // then check for ELO
            else if (/^((((636368)|(438935)|(504175)|(451416)|(636297)|(506699))\d{0,10})|((5067)|(4576)|(4011))\d{0,12})$/.test(cardNumber)) {
                result = returnMode ? '006' : 'elo';
            }
            // then check for Hipercard
            else if (/^(606282\d{10}(\d{3})?)|(3841\d{15})$/.test(cardNumber)) {
                result = returnMode ? '007' : 'hipercard';
            }
            // then check for electron
            else if (/^(4026|417500|4405|4508|4844|4913|4917)\d+$/.test(cardNumber)) {
                result = returnMode ? '008' : 'electron';
            }
            // then check for Cabal cards
            else if (/(^604(([23][0-9][0-9])|(400))(\d{10})$)|(^589657(\d{10})$)/.test(cardNumber)) {
                result = returnMode ? '011' : 'CABAL';
            }
            // then check for Naranja cards
            else if (/^589562(\d{10})$/.test(cardNumber)) {
                result = returnMode ? '012' : 'NARANJA';
            }
            // then check for maestro
            else if (/^(?:5[0678]\d\d|6304|6390|67\d\d)\d{8,15}$/.test(cardNumber)) {
                result = returnMode ? '009' : 'maestro';
            }
            // then check for MIR cards ( the number starts in range 2200-2204 )
            else if (/^220[0-4]\d{12}$/.test(cardNumber)) {
                result = returnMode ? '010' : 'MIR';
            }
            //Then check for troy cards (the number starts in range 979200-979289)
            else if ((/^9792[0-8][0-9]\d{10}$/.test(cardNumber))) {
                result = returnMode ? '' : 'troy';
            }
            return result;
        }

        // Grab user data from config file
        var userData = config.autoCheckout.data;

        // Pull the form fields
        let formData = querystring.parse(await this.page.evaluate(async () => {
            return $("#dwfrm_payment").serialize();
        }))

        // Catch error where shipping info was entered incorrectly
        if (formData['dwfrm_payment_creditCard_owner'].includes("null")) {
            logger.error(this.instance, "Invalid shipping info detected! Please continue manually");
            return false;
        }

        // Fill out form data
        Object.keys(formData).forEach(function (k) {
            for (var userEntry in userData)
                if (k.includes(userEntry))
                    formData[k] = userData[userEntry];
        });

        formData["dwfrm_payment_creditCard_type"] = getCardType(userData.creditCard_number, 1)
        formData["format"] = "ajax";

        // Submit payment data to adidas.com
        let respJson = await this.page.evaluate(async (body, url) => {
            try {
                const response = await fetch(url, {
                    "credentials": "include",
                    "headers": {
                        "accept": "application/json, text/javascript, */*; q=0.01",
                        "accept-language": "en-US,en;q=0.9,fr;q=0.8",
                        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "x-requested-with": "XMLHttpRequest"
                    },
                    "referrer": "https://www.adidas.com/on/demandware.store/Sites-adidas-US-Site/en_US/COSummary2-Start",
                    "referrerPolicy": "no-referrer-when-downgrade",
                    "body": body,
                    "method": "POST",
                    "mode": "cors"
                });
                return await response.json();
            } catch (e) {
                console.log(e)
                return null;
            }
        }, querystring.stringify(formData), paymentSubmitUrl);

        if (respJson != null &&
            respJson.hasErrors === false &&
            (typeof (respJson.fieldsToSubmit) == 'object')) {


        } else {
            logger.error(this.instance, "Failed to submit payment information: there was an error with your payment information!")
        }

    }

    async cartProduct() {

        async function cart(sku, size, page) {
            // Select the size dropdown to prevent bans when using auto ATC
            await (await page.$x("//*[text() = 'Select size']"))[0].click();
            // May need a delay - driven by event handler?
            await wait(2000);

            let response = await page.evaluate(async (cartLink, baseUrl, sku, PID, size) => {
                const res = await fetch(cartLink, {
                    "credentials": "include",
                    "headers": {
                        "accept": "*/*",
                        "accept-language": "en-US,en;q=0.9,fr;q=0.8",
                        "content-type": "application/json",
                    },
                    "referrer": baseUrl,
                    "referrerPolicy": "no-referrer-when-downgrade",
                    "body": JSON.stringify({
                        product_id: PID,
                        quantity: 1,
                        product_variation_sku: sku,
                        productId: "sku",
                        size: size,
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
            }, cartUrl, baseUrl, sku, PID, size);

            if (response == null) {
                return false;
            } else {
                return response.cart.product_quantity != 0;
            }

        }

        // Catch error where PID is not found
        if (PID == null) {
            logger.error(this.instance, "Cannot complete auto cart: No product ID found!")
            return;
        }
        // Cart random size
        else if (sizesToCart.length == 0) {
            logger.info(this.instance, "Carting random size")

            var newArray = availibility.filter(function (el) {
                return el.availability > 0;
            });

            var varient = newArray[Math.floor(Math.random() * newArray.length)];
            return await cart(varient.sku, varient.size, this.page, cartUrl);
        } else {
            for (var size of sizesToCart) {
                for (var varient of availibility) {
                    if (varient.size == size && varient.availability > 0) {
                        return await cart(varient.sku, varient.size, this.page, cartUrl);
                    }
                }
            }

            logger.info(this.instance, `Size(s) ${sizesToCart} not availible`)
            return false;
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
            config.autoCheckout.data.creditCard_number,
            config.autoCheckout.data.creditCard_cvn
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
            if (config.autoCheckout.data.creditCard_month == "") return false;
            const month = await this.page.$("#dwfrm_payment_creditCard_month_display_field");
            await month.click();
            const monthNumber = await this.page.$$(`[data-value="${config.autoCheckout.data.creditCard_month}"]`);
            await monthNumber[0].click();
        } catch (e) {
            logger.error(this.instance, `Failed to autofill month field`);
            return false;
        }

        // Click and select year
        try {
            if (config.autoCheckout.data.creditCard_year == "") return false;
            const year = await this.page.$("#dwfrm_payment_creditCard_year_display_field");
            await year.click();
            const yearNumber = await this.page.$$(`[data-value="${config.autoCheckout.data.creditCard_year}"]`);
            await yearNumber[0].click();
        } catch (e) {
            logger.error(this.instance, `Failed to autofill year field`);
            return false;
        }

        return true;
    }

}


