const SaveManager = require('./save-manager');
const reader = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

const main = () => {
    const saveManager = new SaveManager();
    saveManager.init(reader);
}

main();