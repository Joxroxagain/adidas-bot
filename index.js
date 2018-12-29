const config = require("./config.json");
const Bot = require('./browser-bot.js');
const logger = require('./logger.js');
var fs = require('fs');

// Contains running bots
var bots = [];
// Load proxies
var proxies = fs.readFileSync('proxies.txt').toString().split("\n");
if (proxies[0] == '') proxies = [];

logger.intro(config.taskCount, proxies.length);

(async () => {

    for (let index = 0; index < config.taskCount; index++) {
        if (proxies.length != 0) {
            bots.push(new Bot(index, proxies[index % proxies.length]));
        } else {
            bots.push(new Bot(index));
        }

        setTimeout(function() {    
            bots[index].start();
        }, config.startUpDelayInterval * index);
    }

})();
