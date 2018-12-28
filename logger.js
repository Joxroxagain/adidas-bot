const { version } = require('./package.json');

const chalk = require('chalk');
const moment = require('moment');
const cp = require('copy-paste');

const readline = require('readline');
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

let api = {};

api.intro = function(instances) {
	console.log(''); 
	console.log(chalk.bgBlack.white('Adidas Bruteforcer '), chalk.bold(' v' + version));
	console.log(chalk.dim(`Loading ${instances} instances...`));
	console.log('');
};

api.info = function(instance, message) {
	if (this.showLogs) console.log(chalk.bgBlackBright.white(` Instance ${instance}_${tab} `), chalk.dim(message));
};

api.error = function(instance, error) {
	if (this.showLogs) console.log(chalk.bgRed.white(` Instance ${instance}`), error);
};

api.success = function(instance) {
	console.log(chalk.green(`Through Splash on Instance ${instance}!`), chalk.dim('—'), chalk.dim(moment().format('hh:mm:ss')));
	console.log('');
};

module.exports = api;
