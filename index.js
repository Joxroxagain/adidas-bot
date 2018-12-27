const config = require("./config.json");
const Bot = require('./browser-bot.js');

(async () => {
    new Bot().start();
})()
