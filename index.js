const { version } = require('./package.json');
const reader = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
const fs = require('node:fs/promises');
const fetch = require('node-fetch');
const { apiUrl, generateStructure, init, uploadSave, createBackup, downloadSave, updateManifest } = require('./utils');

const main = async() => {
  console.log(`Git Cloud Save System version ${version}`);

  let selectedGame;

  try {
    console.log('Fetching settings file...');
    await fs.access('./settings.json');
  } catch(e) {
    console.log('No settings detected. Starting first time setup...');
    return init(reader, main);
  }

  const raw = await fs.readFile('./settings.json');
  const settings = JSON.parse(raw);

  console.log(`Attempting to read data from target repo ${settings.repo}.`);

  const repoResponse = await fetch(`${apiUrl}/repos/${settings.owner}/${settings.repo}/contents`, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${settings.auth}`
    },
    method: 'GET'
  });
  const repoData = await repoResponse.json();

  const games = repoData.map(f => f.name);

  if (!repoResponse.ok || games.length === 0) {
    if (repoData.message === 'This repository is empty.' || games.length === 0) {
      console.log('Empty repo found. Creating structure for games listed in settings.');

      const folderResponse = await generateStructure(settings);

      if (![200, 201].includes(folderResponse.status)) { // TODO: refactor, ok check failed on 201 (folder response is an array)
        console.log('folder response: ', folderResponse);
        console.log('Failed to create folders in repo. Ensure you have correctly configured your auth.');
        process.exit(1);
      }
      return main(); // reinvoke as we need to re-fetch the repo contents
    } else {
      console.log('received: ', repoData);
      console.log('Failed to retrieve repository contents. Ensure the repository exists, and you entered your settings correctly.');
      console.log(`If you need to change your settings, edit "settings.json" at ${__dirname}`);
      process.exit(1);
    }
  }

  console.log('Found: ', repoData.map(f => f.name).join(','));

  reader.question('Enter the name of the game you wish to manage, or type "exit" to leave:\n', async(game) => {
    if (game === 'exit') {
      process.exit(0);
    }

    if (!games.includes(game)) {
      console.log('Game selected was invalid. Restarting...');
      return main();
    }
    selectedGame = game;
    const selectedGameBackup = game.backupPath;

    console.log('Fetching game manifest, please wait...');

    const manifestResponse = await fetch(`${apiUrl}/repos/${settings.owner}/${settings.repo}/contents/${selectedGame}/manifest.json`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${settings.auth}`
      },
    });

    if (!manifestResponse.ok) {
      console.log('Manifest: ', manifestResponse);
      console.log('Failed to get manifest. Please delete your settings and restart this program.');
      process.exit(1);
    }

    const manifestData = await manifestResponse.json();

    console.log('Manifest content: ', JSON.parse(Buffer.from(manifestData.content, 'base64').toString('ascii')));

    try {
      await fs.access(settings.games[selectedGame].path);
    } catch(e) {
      console.log('Could not access game saves directory.');
      process.exit(1);
    }

    const saves = await fs.readdir(settings.games[selectedGame].path);
    const withMetaData = await Promise.all(saves.map(async(s) => ({name: s, data: await fs.stat(`${settings.games[selectedGame].path}/${s}`)})));
    const newestSave = withMetaData.reduce((newest, save) => newest.data.mtime > save.data.mtime ? newest : save);
    console.log('Newest Save: ', newestSave.name);

    reader.question('Before we move any files, would you like to backup your saves? (Y/N)\n', async(bChoice) => {
      if (bChoice === 'Y' || bChoice === 'y') {
        await createBackup(settings, selectedGameBackup);
      }

      if (!manifestData.lastSaved || manifestData.lastSaved < newestSave.data.mtime) {
        reader.question('Your local save is newer than the one stored in the repo. Would you like to upload it? (Y/N)\n', async(choice) => {
          if (choice === 'Y' || choice === 'y') {
            const response = await uploadSave(settings, selectedGame, newestSave, manifestData.lastSaved);
            const otherResponse = await updateManifest(settings, selectedGame);

            console.log(response, otherResponse);
            if (!response.ok || !otherResponse.ok) {
              console.log('Failed to upload successfully.');
              process.exit(1);
            }
  
            console.log('Save uploaded successfully.');
            process.exit(0);
          }
        })
      }
  
      if (manifestData.lastSaved > newestSave.data.mtime) {
        reader.question('Your local save is older than the one stored in the repo. Would you like to download the latest save? (Y/N)', async(choice) => {
          if (choice === 'Y' || choice === 'y') {
            const response = await downloadSave(settings, selectedGame);
  
            console.log(response);
          }
        })
      }
    })
  });
}

main();