const { version } = require('./package.json');

const chalk = require('chalk');
const moment = require('moment');

const readline = require('readline');
readline.emitKeypressEvents(process.stdin);

let api = {};

process.stdin.on('keypress', (char, key)  => {
	if (key && key.ctrl && key.name == 'c') {
		api.info(chalk.red('Exiting program...'));
		process.exit()
	}
});

api.intro = function(instances, proxies) {
	console.log(''); 
	console.log(chalk.bgBlack.white('Adidas Bruteforcer '), chalk.bold(' v' + version));
	console.log(chalk.dim(`Loading ${instances} instances with ${proxies} proxies...`));
	console.log('');
};

api.info = function(instance, message) {
	console.log(chalk.bgBlackBright.white(`Instance ${instance} `), chalk.dim(message));
};

api.error = function(instance, error) {
	console.log(chalk.bgRed.white(`Instance ${instance}`), error);
};

api.success = function(instance) {
	console.log(chalk.green(`Cart page on ${instance}!`), chalk.dim('—'), chalk.dim(moment().format('hh:mm:ss')));
	console.log('');
};

module.exports = api;
