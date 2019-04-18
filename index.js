const Bot = require('./browser-bot.js');
const logger = require('./logger.js');
const fs = require('fs-extra')
const path = require('path');
const rimraf = require("rimraf");
const AutoUpdater = require('auto-updater');
var config;
if (fs.existsSync(".git")) {
    config = require("./dev.config.json");
} else {
    config = require("./config.json");
}

// Contains running bots
var bots = [];

var needsRestart = false;

// Paths
var saveDir = 'saves'
var localWebDataDir = path.join(__dirname, "webdata")
// Generate webdata location
var chromeWebDataDir = process.env.LOCALAPPDATA + "\\Google\\Chrome\\User Data\\Default" ||
    (process.platform == 'darwin' ? process.env.HOME + 'Library/Application Support/Google/Chrome' : '~/.config/google-chrome')

// Load proxies
var proxies = fs.readFileSync('proxies.txt').toString().split("\n");
if (proxies[0] == '' || proxies[0] == '\r') proxies = [];

// Remove saves from the last run
rimraf.sync(saveDir);

var autoupdater = new AutoUpdater({
    pathToJson: '',
    autoupdate: false,
    checkgit: true,
    jsonhost: 'raw.githubusercontent.com',
    contenthost: 'codeload.github.com',
    progressDebounce: 0,
    devmode: true
});

// State the events
autoupdater.on('git-clone', function () {
    launchTasks();
});
autoupdater.on('check.up-to-date', function (v) {
    console.info("You have the latest version: " + v);
    launchTasks();
});
autoupdater.on('check.out-dated', function (v_old, v) {
    console.warn("Your version is outdated. " + v_old + " of " + v);
    needsRestart = true;
    autoupdater.fire('download-update');
});
autoupdater.on('update.downloaded', function () {
    console.log("Update downloaded and ready for install");
    autoupdater.fire('extract');
});
autoupdater.on('update.not-installed', function () {
    console.log("The Update was already in your folder! It's read for install");
    autoupdater.fire('extract');
});
autoupdater.on('update.extracted', function () {
    console.log("Update extracted successfully!");
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
    if (needsRestart) {

        var exec = require('child_process').exec,
            child;

        child = exec('npm i',
            function (error, stdout, stderr) {
                if (error !== null) {
                    console.log('Error: ' + error);
                }
            });

        console.warn("Please restart the application!")

    }
});
autoupdater.on('error', function (name, e) {
    console.error(name, e);
});

autoupdater.fire('check');


// Launch tasks
async function launchTasks() {
    // Show intro
    logger.intro(config.taskCount, proxies.length);

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
}

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