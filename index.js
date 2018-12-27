const config = require("./config.json");
const Bot = require('./browser-bot.js');

(async () => {

    for (let index = 0; index < config.taskCount; index++) {
        setTimeout(function() {    
            new Bot().start();
        }, config.startUpDelayInterval * index);
    }

})()
