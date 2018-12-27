const puppeteer = require('puppeteer');
const fetch = require('node-fetch')
const UserAgent = require('user-agents');
const config = require("./config.json");

class Bot {
    constructor(pid) {
        this.pid = pid;
    }

    async startBot() {

        // return;

        // Launch the browser in headless mode and set up a page.
        const browser = await puppeteer.launch({
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

        const context = await browser.createIncognitoBrowserContext();

        const page = await context.newPage();

        // Prepare for the tests (not yet implemented).
        await preparePageForTests(page);

        // Navigate to the page that will perform the tests.
        const testUrl = 'https://www.adidas.com/us/pharrell-williams-bbc-hu-v2-shoes/BB9549.html';
        // const testUrl = "https://www.google.com/recaptcha/api2/demo";
        // const testUrl = 'https://www.adidas.com/us/nmd_r1-shoes/B37618.html'; 
        const cartUrl = "https://www.adidas.com/on/demandware.store/Sites-adidas-US-Site/en_US/Cart-Show";

        await page.goto(testUrl, { waitUntil: 'networkidle0' });

        const sizeSelector = await page.$x("//*[text() = 'Select size']");

        // const cartButton  = await page.$x("//*[text() = 'Add To Bag']");
        if (sizeSelector.length > 0) {
            await sizeSelector[0].click();
        } else {
            throw new Error("Link not found");
        }

        // const resp = await page.evaluate(async () => {
        //     var elements = await document.querySelectorAll('[data-auto-id="add-to-bag"');
        //     return elements;
        // });

        // await page.evaluate(() => { document.querySelectorAll('[data-auto-id="logo"]')[0].click(); });
        // await page.evaluate(() => {
        //     document.querySelector('select option:nth-child(2)').selected = true;
        //   })

        // await sendData(page);
        await cartByRequest(page, testUrl);

        // const sessionCookies = await page.cookies();

        // const browser2 = await puppeteer.launch({
        //     args: [
        //         '--no-sandbox',
        //         '--disable-setuid-sandbox',
        //         '--disable-dev-shm-usage',
        //         '--disable-accelerated-2d-canvas',
        //         '--disable-gpu',
        //         '--window-size=1920x1080',
        //     ],
        //     headless: false,
        // });

        // // const context2 = await browser2.createIncognitoBrowserContext();

        // const page2 = await browser2.newPage();

        // await page2.setCookie(...sessionCookies);

        // // await preparePageForTests(page2);

        // await page2.goto(cartUrl);

        // browser.close();
    }

}

const preparePageForTests = async (page) => {
    // Pass the User-Agent Test.
    let userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36";
    if (config.randomUserAgent) {
        userAgent = new UserAgent().toString();
    }
    // const userAgent = 'Mozilla/5.0 (X11; Linux x86_64)' +
    //     'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.39 Safari/537.36';
    await page.setUserAgent(userAgent);

    const blockedResourceTypes = [
        'image',
        'media',
        'font',
        'texttrack',
        'object',
        'beacon',
        'csp_report',
        'imageset',
    ];

    const skippedResources = [
        'quantserve',
        'adzerk',
        'doubleclick',
        'adition',
        'exelator',
        'sharethrough',
        'cdn.api.twitter',
        'google-analytics',
        'googletagmanager',
        'google',
        'fontawesome',
        'facebook',
        'analytics',
        'optimizely',
        'clicktale',
        'mixpanel',
        'zedo',
        'clicksor',
        'tiqcdn',
    ];

    await page.setRequestInterception(true);

    page.on('request', request => {
        const requestUrl = request._url.split('?')[0].split('#')[0];
        if (requestUrl.endsWith("/_bm/_data")) {
            console.log("FOUND /_bm/_data")
            // console.log(request)
            request.continue();
        } else
            if (
                blockedResourceTypes.indexOf(request.resourceType()) !== -1 ||
                skippedResources.some(resource => requestUrl.indexOf(resource) !== -1)
            ) {
                request.abort();
            } else {
                request.continue();
            }
    });

    page.on('response', async response => {
        if (response.url().endsWith("availability?sitePath=us")) {
            // var sizes = await response.json();
            // console.log(sizes);
            // getBestSize(sizes);
        }
    });

    page.on('response', async response => {
        if (response.url().endsWith("api/cart_items?sitePath=us")) {
            console.log("response code: ", response.status());
        }
    });

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

    await page.evaluateOnNewDocument(() => {
        const captchaInterval = setInterval(() => {
            const challengeFrame = document.querySelector('iframe[role="presentation"]');

            if (challengeFrame) {
                const challengeButton = challengeFrame.contentDocument.getElementsByClassName('recaptcha-checkbox-checkmark')[0];

                if (challengeButton) {
                    challengeButton.click();
                }
            }
        }, 500);
    });

}

function getBestSize(sizes) {

    var availible = [];

    sizes.variation_list.forEach(element => {
        if (element.availability_status === 'IN_STOCK')
            availible.push(element.size)
    });

    console.log(availible);

    const minSize = 4;
    const maxSize = 16;

    const minAvailible = availible[0];
    const maxnAvailible = availible[availible.length - 1];

    const minDiff = minSize - minAvailible;
    const maxDiff = maxSize - maxnAvailible;

    if (minDiff < maxDiff) return minAvailible;
    return maxnAvailible;

}

const cartByRequest = async (page) => {

    const resp2 = await page.evaluate(async () => {
        const response2 = fetch("https://www.adidas.com/api/cart_items?sitePath=us", {
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
        // const text2 = await response2.text();
        // console.log(text);
        // return text2;
    });
    console.log(JSON.stringify(resp2, null, 2));

}

const sendData = async (page) => {

    const resp = await page.evaluate(async () => {
        const response = await fetch("https://www.adidas.com/_bm/_data", { 
            "credentials": "include", 
            "headers": { 
                "accept": "*/*", 
                "accept-language": 
                "en-US,en;q=0.9,fr;q=0.8", 
                "content-type": 
                "text/plain;charset=UTF-8", 
                "x-instana-l": "1", 
                "x-instana-s": "82b6fed111d8f49f", 
                "x-instana-t": "82b6fed111d8f49f" 
            }, 
            "referrer": "https://www.adidas.com/us/pharrell-williams-bbc-hu-v2-shoes/BB9549.html", 
            "referrerPolicy": "no-referrer-when-downgrade", 
            "body": "{\"sensor_data\":\"7a74G7m23Vrp0o5c9936381.28-1,2,-94,-100,Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3538.102 Safari/537.36,uaend,12147,20030107,en-US,Gecko,3,0,0,0,379485,4632529,1920,1040,1920,1080,2133,521,1920,,cpen:0,i1:0,dm:0,cwen:1,non:1,opc:0,fc:0,sc:0,wrc:1,isc:0,vib:1,bat:1,x11:0,x12:1,8318,0.868707090434,771162316263.5,loc:-1,2,-94,-101,do_en,dm_en,t_en-1,2,-94,-105,-1,0,0,0,-1,113,0;-1,0,0,0,-1,113,0;0,-1,0,0,-1,520,0;-1,2,-94,-102,-1,0,0,0,-1,113,0;0,-1,0,0,-1,520,0;-1,2,-94,-108,-1,2,-94,-110,0,1,106,156,741;1,1,4069,937,742;2,1,4241,1676,705;3,1,4370,1661,688;4,1,4489,1640,656;5,1,4534,1626,641;6,1,4550,1621,635;7,1,4620,1593,605;8,1,4626,1590,602;9,1,4630,1587,601;10,1,4637,1585,598;11,1,4644,1583,596;12,1,4651,1581,595;13,1,4659,1578,594;14,1,4666,1577,594;15,1,4673,1576,592;16,1,4679,1575,591;17,1,4687,1575,590;18,1,4693,1575,588;19,1,4702,1575,586;20,1,4708,1574,586;21,1,4715,1574,585;22,1,4726,1574,584;23,1,4754,1573,583;24,1,4761,1573,582;109,3,7226,1541,573,-1;-1,2,-94,-117,-1,2,-94,-111,0,253,-1,-1,-1;-1,2,-94,-109,0,175,-1,-1,-1,-1,-1,-1,-1,-1,-1;-1,2,-94,-114,-1,2,-94,-103,2,3708;3,7118;-1,2,-94,-112,https://www.adidas.com/us/pharrell-williams-bbc-hu-v2-shoes/BB9549.html-1,2,-94,-115,0,173562,0,253,175,0,173990,7226,0,1542324632527,17,16499,0,110,2749,1,0,7227,118244,0,BA07A0EF80433BF33D34E0C398AA7C1117CC8F049B7100009701EE5B8C4E2D7B~-1~EjCF6OK4T5UKp8rU25wN8EyWNiKawZ8lBjoSx8eynzA=~-1~-1,8188,903,1726088657,30261693-1,2,-94,-106,1,1-1,2,-94,-119,80,60,40,80,100,100,100,0,0,20,0,340,460,200,-1,2,-94,-122,0,0,0,0,1,0,0-1,2,-94,-70,429593793;dis;,7,8;true;true;true;300;true;24;24;true;false;-1-1,2,-94,-80,4918-1,2,-94,-116,4632535-1,2,-94,-118,89514-1,2,-94,-121,;2;14;0\"}", 
            "method": "POST", 
            "mode": "cors" 
        });
        // const text = await response.text();
        // console.log(text);
        // return text;
    });
    console.log(JSON.stringify(resp, null, 2));

}



module.exports = Bot;