const config = require("./config.json");
const Bot = require('./browser-bot.js');
const logger = require('./logger.js');
const fs = require('fs-extra')
const path = require('path');
const rimraf = require("rimraf");

// Contains running bots
var bots = [];

// Paths
var saveDir = 'saves'
var localWebDataDir = path.join(__dirname, "webdata")
// Generate webdata location
var chromeWebDataDir = process.env.LOCALAPPDATA + "\\Google\\Chrome\\User Data\\Default" ||
    (process.platform == 'darwin' ? process.env.HOME + 'Library/Application Support/Google/Chrome' : '~/.config/google-chrome')

// Moves webdata and deletes old data
async function copyWebData(file, dir2) {
    // Clear previous data dirs
    //TDOD: Configuration option for clearing previous sessions' data
    fs.ensureDir(dir2, err => {
        var f = path.basename(file);
        var source = fs.createReadStream(file);
        var dest = fs.createWriteStream(path.resolve(dir2, f));

        source.pipe(dest);
        source.on('error', function (err) { console.log(err); });
        return true;
    });
};

// Load proxies
var proxies = fs.readFileSync('proxies.txt').toString().split("\n");
if (proxies[0] == '') proxies = [];

// Show intro
logger.intro(config.taskCount, proxies.length);

// Remove saves from the last run
rimraf.sync(saveDir);

// Launch tasks
(async () => {

    for (let index = 0; index < config.taskCount; index++) {
        if (proxies.length != 0) {
            bots.push(new Bot(index, proxies[index % proxies.length]));
        } else {
            bots.push(new Bot(index));
        }

        if (config.webdata.useWebData) {
            if (config.webdata.path != "") {
                await copyWebData(config.webdata.path + '\\Web Data', path.resolve('saves', 'chrome_' + index, "Default"));
            } else {
                await copyWebData(chromeWebDataDir + '\\Web Data', path.resolve('saves', 'chrome_' + index, "Default"));
            }
        }
        
        setTimeout(function(i) {
            bots[i].start();
        }, config.startUpDelayInterval * index, index);

    }

})();
