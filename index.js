const config = require("./config.json");
const Bot = require('./browser-bot.js');

var bots = [];

(async () => {

    for (let index = 0; index < config.taskCount; index++) {
        bots.push(new Bot());
        setTimeout(function() {    
            bots[index].start();
        }, config.startUpDelayInterval * index);
    }

    // if (config.autoRefreshAt != "") {
    //     var eta_ms = new Date(2015, 0, 21, 17, 0).getTime() - Date.now();
    //     var timeout = setTimeout(function(){

    //     }, eta_ms);
    // }

})()
