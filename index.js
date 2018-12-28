const config = require("./config.json");
const Bot = require('./browser-bot.js');
const logger = require('./logger.js');

var bots = [];

logger.intro(config.taskCount);

(async () => {

    for (let index = 0; index < config.taskCount; index++) {
        bots.push(new Bot(index, config));
        setTimeout(function() {    
            bots[index].start();
        }, config.startUpDelayInterval * index);
    }

})()
