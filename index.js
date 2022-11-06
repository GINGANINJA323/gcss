const { version } = require('./package.json');
const reader = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
const fs = require('node:fs/promises');
const fetch = require('node-fetch');
const { apiUrl, generateStructure, init, uploadSave, createBackup, downloadSave, updateManifest, addNewGame } = require('./utils');

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

      if (![200, 201].includes(folderResponse.status)) {
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

  reader.question('Enter the name of the game you wish to manage, "exit" to leave, "amend" to add a new game to your settings:\n', async(game) => {
    if (game === 'exit') {
      process.exit(0);
    }

    if (game === 'amend') {
      return addNewGame(settings, reader, main);
    }

    if (!games.includes(game)) {
      console.log('Game selected was invalid. Restarting...');
      return main();
    }
    console.log(selectedGame);
    selectedGame = game;

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

    const manifestJson = await manifestResponse.json();
    const manifestData = JSON.parse(Buffer.from(manifestJson.content, 'base64').toString('ascii'));

    console.log('Manifest content: ', manifestData);

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

    console.log(
      newestSave.data.mtime, 
      new Date(manifestData.lastSaved).toISOString(), 
      new Date(newestSave.data.mtime) < new Date(manifestData.lastSaved), 
      new Date(newestSave.data.mtime) > new Date(manifestData.lastSaved)
    );

    reader.question('Before we move any files, would you like to backup your saves? (Y/N)\n', async(bChoice) => {
      if (bChoice === 'Y' || bChoice === 'y') {
        await createBackup(settings.games[game]);
      }

      if (!manifestData.lastSaved || new Date(manifestData.lastSaved) < new Date(newestSave.data.mtime)) {
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
  
      if (new Date(manifestData.lastSaved) > new Date(newestSave.data.mtime)) {
        reader.question('Your local save is older than the one stored in the repo. Would you like to download the latest save? (Y/N)', async(choice) => {
          if (choice === 'Y' || choice === 'y') {
            const response = await downloadSave(settings, selectedGame);

            console.log(response);
            const fileData = Buffer.from(response.content, 'base64');

            console.log(fileData);

            try {
              await fs.writeFile(`${settings.games[selectedGame].path}/${response.name}`, fileData);
            } catch(e) {
              console.log('Failed to write save file.');
              console.log(e);
              process.exit(1);
            }

            console.log('File written successfully!');
            process.exit(0);
          }
        })
      }
    })
  });
}

main();