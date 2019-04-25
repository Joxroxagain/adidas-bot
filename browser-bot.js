const puppeteer = require('puppeteer-extra')
const fetch = require('node-fetch')
const notifier = require('node-notifier');
const path = require('path');
const GOOGLE_COOKIES = require('./cookies.json');
const logger = require('./logger');
const regions = require('./regions')
const $ = require('cheerio');
const querystring = require('querystring');
const prettier = require('prettier');
const atob = require('atob');
const btoa = require('btoa');
const fs = require('fs');
const pluginStealth = require("puppeteer-extra-plugin-stealth");
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha_v2')

puppeteer.use(pluginStealth());

var config;
if (fs.existsSync(".git")) {
    config = require("./dev.config.json");
} else {
    config = require("./config.json");
}

if (config.twocaptcha.enabled)
    puppeteer.use(
        RecaptchaPlugin({
            provider: { id: '2captcha', token: config.twocaptcha.apiKey },
            visualFeedback: true // colorize reCAPTCHAs (violet = detected, green = solved)
        })
    );

/*
* Global Vars
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
// Store region details
const region = regions.getRegion(config.region)


/*
* Urls
* TODO: chamge these to suport other regions
*/
const checkoutUrl = `https://www.adidas.${region.domain}/on/demandware.store/Sites-adidas-${region.code}-Site/${region.language}_${region.code}/COShipping-Show`;
const paymentUrl = `https://www.adidas.${region.domain}/on/demandware.store/Sites-adidas-${region.code}-Site/${region.language}_${region.code}/COSummary2-Start`;
const cartUrl = `https://www.adidas.${region.domain}/api/cart_items?sitePath=${region.code}`;
const shippingSubmitUrl = `https://www.adidas.${region.domain}/on/demandware.store/Sites-adidas-${region.code}-Site/${region.language}_${region.code}/COShipping-Submit`;
const paymentSubmitUrl = `https://www.adidas.${region.domain}/on/demandware.store/Sites-adidas-${region.code}-Site/${region.language}_${region.code}/COPayment-HandlePaymentForm`;


module.exports = class Bot {

    constructor(options) {
        this.browser = null;
        this.page = null;
        this.captcha = false;
        this.captchaSolution = "";
        this.instance = options.instance;
        this.proxy = options.proxy;
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

        //Set timeout
        await this.page.setDefaultNavigationTimeout(0);

        // Allow interception
        await this.page.setRequestInterception(true)

        // Set up listeners
        await this.setListeners();

        // Navigate to the page and solve captcha if needed
        while (!(await this.goTo(config.url, true))) {
            // Wait for the set timeout
            await new Promise(resolve => setTimeout(resolve, config.retryDelay));
        }

        // Splash mode
        if (config.splashMode) {

            // Wait for splash page to be found
            const cookie = await this.waitForATC();

            // Look for captchas
            const cap = await this.findCaptchas();

            // Notify user
            logger.info(this.instance, `Solving captcha...`);
            // Solve captcha and set as solution
            this.captchaSolution =
                await this.solveCaptchas(cap);

            // Log success
            logger.success(this.instance);
            logger.info(this.instance, `HMAC Name = ${cookie[0]}, HMAC Value = ${cookie[1]}`);

            // Notify user
            if (config.alerts) {

                notifier.notify({
                    title: 'Adidas Bruteforcer',
                    message: `Cart page on instance ${this.instance}!`,
                    sound: 'Hero',
                    timeout: 60000
                }, async (err, res) => {
                    if (res == 'activate') {
                        await this.page.bringToFront();
                    }
                });
            }

            // Switch to headed browser if needed
            if (!config.headlessAfterSplash && config.headless)
                await this.lauchHeadedBrowser(await this.page.cookies());

        }

        // Auto cart the shoe
        if (config.autoCart.enabled) {

            if (PID == null && config.autoCart.PID != "") PID = config.autoCart.PID;
            else if (PID == null) {
                logger.info(this.instance, `Waiting for PID to be discovered...`);
                // Wait for productID to be discovered
                await new Promise(async resolve => {
                    var interval = setInterval(function () {
                        if (PID != null) {
                            clearInterval(interval);
                            resolve();
                        }
                    }, config.detectionInterval);
                });
            }

            // Cart the shoe 
            while (!(await this.cartProduct())) {
                await new Promise(resolve => setTimeout(resolve, config.retryDelay));
            }

            logger.info(this.instance, `Carted shoe!`);

            await this.page.goto(checkoutUrl, { waitUntil: 'domcontentloaded' });
        }

        // Submit checkout information
        if (config.autoCheckout.enabled) {

            while (true) {
                if (await this.submitShipping()) break;
                await new Promise(resolve => setTimeout(resolve, config.retryDelay));
            }

            await this.page.goto(paymentUrl, { waitUntil: 'domcontentloaded' });

            await this.submitPayment();

        };

    }

    async stop() {
        await this.browser.close();
    }

    // Navigate to a page with error catches
    // Also solves a captcha is one is found before resolving
    async goTo(url, lookForCaptcha) {
        try {
            await this.page.goto(config.url, { waitUntil: 'domcontentloaded' });
            // Set base url
            if (baseUrl == null) baseUrl = await this.page.url();

            // Click on page, triggers bmak
            try {
                await this.page.click('body')
            } catch (err) {
                logger.error(this.instance, `Error clicking on body tag!`)
            }

            // Send bmak so that we don't get banned on ATC
            const bmak = await this.page.evaluate(() => {
                if (typeof bmak.startTracking != "function") return false;
                bmak.startTracking();
                return true;
            });

            // If calling the bmak function fails, manually trigger the function
            if (!bmak) {
                // Select the size dropdown
                try {
                    await (await this.page.$x("//*[text() = 'Select size']"))[0].click();
                } catch (err) {
                    // Not found
                }
            }

            // If we are looking for captchas
            if (lookForCaptcha) {
                try {
                    // Wait for captcha to load
                    await this.page.waitForFunction(
                        "document.querySelector(`iframe[src^='https://www.google.com/recaptcha/api2/anchor'][name^='a-']`)"
                        + "&& document.querySelector(`iframe[src^='https://www.google.com/recaptcha/api2/anchor'][name^='a-']`).clientHeight != 0",
                        { visible: true, timeout: 5000 });
                    // Solve captchas
                    if (!config.twocaptcha.enabled || config.twocaptcha.apiKey == "") {
                        logger.error(this.instance, `Captcha detected, cannot solve because either 2captcha is not enabled or you did not supply an API key!`);
                    } else {
                        // Find captcha
                        const cap = await this.findCaptchas();
                        // Notify user
                        logger.info(this.instance, `Solving captcha...`);
                        // Solve captcha and set as solution
                        this.captchaSolution =
                            await this.solveCaptchas(cap);
                        return true;
                    }
                } catch (err) {
                    // Captcha not found
                    if (err.name == "TimeoutError")
                        return true;
                    logger.error(this.instance, `Unknown error occured: ${err}`);
                    return false;
                }
            }

            return true;
        } catch (err) {
            logger.error(this.instance, `Error loading page: ${err}`);
            return false;
        }
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
                } catch (err) {
                    logger.error(this.instance, `Error parsing availability JSON: ${err}`);
                }
            }

            // Catch waiting room config response
            if (matchRule(response.url(), '*waitingRoomConfig.json')) {
                try {
                    let json = await response.json();
                } catch (err) {
                    logger.error(this.instance, `Error parsing waiting room config JSON: ${err}`);
                }
            }

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


        // For catching refreshes
        // this.page.on('domcontentloaded', () => {
        //     this.findCaptchas();
        // })

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

    async waitForATC() {
        return new Promise((resolve, reject) => {
            var interval = setInterval(async function (page) {
                let cookies = await page.cookies();
                for (let cookie of cookies) {
                    if (cookie.value.includes(config.splashCookieKeyword)) {
                        clearInterval(interval);
                        resolve([cookie.name, cookie.value]);
                    }
                }
            }, config.detectionInterval, this.page);
        });
    }

    // Finds a captcha on the page and returns the object
    async findCaptchas() {
        return new Promise(async (resolve, reject) => {
            try {
                let { captchas, error } = await this.page.findRecaptchas();
                if (error != null) {
                    logger.error(this.instance, `Error finding captcha: ${error}`)
                } else if (captchas.length != 0) {
                    logger.info(this.instance, `Found captcha!`)
                    resolve(captchas);
                }
            } catch (err) {
                logger.error(this.instance, `Error finding captcha: ${err}`)
                resolve(false);
            }
        })
    }

    // Resolves when the captcha is solved and entered
    async solveCaptchas(captchas) {
        // Return if there was an error
        if (captchas == false) return false;

        try {
            let { solutions, error1 } = await this.page.getRecaptchaSolutions(captchas)
            let { solved, error2 } = await this.page.enterRecaptchaSolutions(solutions)
            if (error1) {
                logger.error(this.instance, `Error solving captcha: ${error1}`);
            } else if (error2) {
                logger.error(this.instance, `Error solving captcha: ${error2}`);
            } else {
                return solutions[0].text;
            }
            return false;

        } catch (err) {
            logger.error(this.instance, `Error solving captcha: ${err}`);
            return false;
        }

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
            } catch (err) {
                logger.error(this.instance, err);
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

        async function cart(sku, size, page, baseUrl, instance, captcha) {

            // Need a delay to prevent bans - driven by event handler in the future?
            // await new Promise(resolve => setTimeout(resolve, 10000));

            let response = await page.evaluate(async (cartUrl, baseUrl, sku, PID, size, captcha) => {
                const res = await fetch(cartUrl, {
                    "credentials": "include",
                    "headers": {
                        "accept": "*/*",
                        "accept-language": "en-US,en;q=0.9,fr;q=0.8",
                        "content-type": "application/json",
                    },
                    "referrer": baseUrl,
                    "referrerPolicy": "no-referrer-when-downgrade",
                    "body": JSON.stringify({
                        captchaResponse: captcha,
                        displaySize: size,
                        productId: sku,
                        product_id: PID,
                        product_variation_sku: sku,
                        quantity: 1,
                        size: size
                    }),
                    "method": "POST",
                    "mode": "cors"
                });

                try {
                    if (res.status == 200) {
                        const json = await res.json();
                        return { success: true, json: json, statusCode: res.status };
                    }
                } catch (err) { }
                return { success: false, json: null, statusCode: res.status };

            }, cartUrl, baseUrl, sku, PID, size, captcha);

            if (response.success && response.json.cart.product_quantity != 0) {
                return true;
            } else if (response.json != null) {
                switch (response.json.message) {
                    case "INVALID-CAPTCHA":
                        logger.info(instance, `Failed to cart shoe: invalid captcha supplied!`);
                        break;
                    default: logger.info(instance, `Failed to cart shoe: an unknown error occured!`);
                }
            } else {
                switch (response.statusCode) {
                    case 403:
                        logger.info(instance, `Failed to cart shoe: temporary ban occured!`);
                        break;
                    default: logger.info(instance, `Failed to cart shoe: an unknown error occured!`);
                }
            }

        }

        // Cart random size
        if (sizesToCart.length == 0) {
            logger.info(this.instance, "Choosing random size...")

            // Filter out OOS sizes
            var newArray = availibility.filter(function (el) {
                return el.availability > 0;
            });

            var varient = newArray[Math.floor(Math.random() * newArray.length)];
            return await cart(varient.sku, varient.size, this.page, cartUrl, this.instance, this.captchaSolution);
        } else {
            for (var size of sizesToCart) {
                for (var varient of availibility) {
                    if (varient.size == size && varient.availability > 0) {
                        return await cart(varient.sku, varient.size, this.page, cartUrl, this.instance, this.captchaSolution);
                    }
                }
            }

            logger.info(this.instance, `Size(s) ${sizesToCart} not availible`)
            return false;
        }

    }

}
