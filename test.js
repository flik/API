const chalk = require('chalk'),
      fs = require('fs');

console.info('working in ' + __dirname);

try {
    var up = require('./database');
} catch (e) {
    console.error(chalk.red(e));
    fs.writeFile(`./database.json`, JSON.stringify({"1970-01-01": 0}, null, '\t'));
    console.log('you should save the notices now');
} finally { /* this should never run */}

try {
    var up = require('./news');
} catch (e) {
    console.error(chalk.red(e));
    fs.writeFile(`./news.json`, JSON.stringify({file: ""}, null, '\t'));
    console.log('you should save the news now');
} finally { /* this should never run */}