const config = require("./config.json");
const Bot = require('./browser-bot.js');
const logger = require('./logger.js');
const fs = require('fs-extra')
const path = require('path');
const rimraf = require("rimraf");
var AutoUpdater = require('auto-updater');

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
if (proxies[0] == '' || proxies[0] == '\r') proxies = [];

// Show intro
logger.intro(config.taskCount, proxies.length);

// Remove saves from the last run
rimraf.sync(saveDir);

var autoupdater = new AutoUpdater({
    pathToJson: '',
    autoupdate: true,
    checkgit: true,
    jsonhost: '',
    contenthost: '',
    progressDebounce: 0,
    devmode: true
});

// State the events
autoupdater.on('git-clone', function () {
    console.log("You have a clone of the repository. Use 'git pull' to be up-to-date");
});
autoupdater.on('check.up-to-date', function (v) {
    console.info("You have the latest version: " + v);
});
autoupdater.on('check.out-dated', function (v_old, v) {
    console.warn("Your version is outdated. " + v_old + " of " + v);
    autoupdater.fire('download-update'); // If autoupdate: false, you'll have to do this manually.
    // Maybe ask if the'd like to download the update.
});
autoupdater.on('update.downloaded', function () {
    console.log("Update downloaded and ready for install");
    autoupdater.fire('extract'); // If autoupdate: false, you'll have to do this manually.
});
autoupdater.on('update.not-installed', function () {
    console.log("The Update was already in your folder! It's read for install");
    autoupdater.fire('extract'); // If autoupdate: false, you'll have to do this manually.
});
autoupdater.on('update.extracted', function () {
    console.log("Update extracted successfully!");
    console.warn("RESTART THE APP!");
});
autoupdater.on('download.start', function (name) {
    console.log("Starting downloading: " + name);
});
autoupdater.on('download.progress', function (name, perc) {
    process.stdout.write("Downloading " + perc + "% \033[0G");
});
autoupdater.on('download.end', function (name) {
    console.log("Downloaded " + name);
});
autoupdater.on('download.error', function (err) {
    console.error("Error when downloading: " + err);
});
autoupdater.on('end', function () {
    console.log("The app is ready to function");
});
autoupdater.on('error', function (name, e) {
    console.error(name, e);
});

autoupdater.fire('check');


// Launch tasks
(async () => {

    for (let index = 0; index < config.taskCount; index++) {
        if (proxies.length != 0) {
            bots.push(new Bot(index, proxies[index % proxies.length]));
        } else {
            bots.push(new Bot(index));
        }

        if (config.webdata.enabled) {
            if (config.webdata.path != "") {
                await copyWebData(config.webdata.path + '\\Web Data', path.resolve('saves', 'chrome_' + index, "Default"));
            } else {
                await copyWebData(chromeWebDataDir + '\\Web Data', path.resolve('saves', 'chrome_' + index, "Default"));
            }
        }

        setTimeout(function (i) {
            bots[i].start();
        }, config.startUpDelayInterval * index, index);

    }

})();
