const config = require("./config.json");
const Bot = require('./browser-bot.js');
const logger = require('./logger.js');
var fs = require('fs');

// Contains running bots
var bots = [];
// Load proxies
var proxies = fs.readFileSync('proxies.txt').toString().split("\n");

logger.intro(config.taskCount, proxies.length);

(async () => {

    for (let index = 0; index < config.taskCount; index++) {
        bots.push(new Bot(index, proxies[index % proxies.length]));
        setTimeout(function() {    
            bots[index].start();
        }, config.startUpDelayInterval * index);
    }

})();
