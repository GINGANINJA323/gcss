const { version } = require('./package.json');
const reader = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});
const fs = require('node:fs/promises');
const fetch = require('node-fetch');
const {
  apiUrl,
  generateStructure,
  init, uploadSave,
  createBackup,
  downloadSave,
  updateManifest,
  addNewGame,
  eMode,
  showError
} = require('./utils');

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

  if (!repoResponse.ok) {
    if (repoData.message === 'This repository is empty.') {
      console.log('Empty repo found. Creating structure for games listed in settings.');

      const folderResponse = await generateStructure(settings);

      if (![200, 201].includes(folderResponse.status)) {
        return showError(['Failed to create folders in repo. Ensure you have correctly configured your auth.'], reader);
      }
    } else {
      return showError(['Failed to retrieve repository contents. Ensure the repository exists, and you entered your settings correctly.'], reader);
    }
  }

  const games = repoData.map(f => f.name);

  console.log('Found:', repoData.map(f => f.name).join(', '));

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
    selectedGame = game;

    console.log('Fetching game manifest, please wait...');

    const manifestResponse = await fetch(`${apiUrl}/repos/${settings.owner}/${settings.repo}/contents/${selectedGame}/manifest.json`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${settings.auth}`
      },
    });

    if (!manifestResponse.ok) {
      showError([`Manifest: ${manifestResponse}`, 'Failed to get manifest. Please delete your settings and restart this program.'], reader)
    }

    const manifestJson = await manifestResponse.json();
    const manifestData = JSON.parse(Buffer.from(manifestJson.content, 'base64').toString('ascii'));

    console.log('Manifest content: ', manifestData);

    if (!settings.games[selectedGame]) {
      // If the game is not in setting but exists in the repo, run amend
      console.log('Game not detected in settings...');
      return addNewGame(settings, reader, main, { name: selectedGame });
    }

    try {
      await fs.access(settings.games[selectedGame].path);
    } catch(e) {
      showError(['Could not access game saves directory.'], reader);
    }

    const saves = await fs.readdir(settings.games[selectedGame].path);
    const withMetaData = await Promise.all(saves.map(async(s) => ({name: s, data: await fs.stat(`${settings.games[selectedGame].path}/${s}`)})));
    const newestSave = withMetaData.reduce((newest, save) => newest.data.mtime > save.data.mtime ? newest : save);
    console.log('Newest Save: ', newestSave.name);

    reader.question('Before we move any files, would you like to backup your saves? (Y/N)\n', async(bChoice) => {
      if (bChoice === 'Y' || bChoice === 'y') {
        await createBackup(settings.games[game]);
      }

      const lastSaved = new Date(newestSave.data.mtime);

      if (!manifestData.lastSaved || new Date(manifestData.lastSaved) < lastSaved) {
        reader.question('Your local save is newer than the one stored in the repo. Would you like to upload it? (Y/N/E)\n', async(choice) => {
          if (choice === 'Y' || choice === 'y') {
            const response = await uploadSave(settings, selectedGame, newestSave, manifestData.lastSaved);
            const manifestResponse = await updateManifest(settings, selectedGame, lastSaved.toISOString());

            if (!response.ok || !manifestResponse.ok) {
              showError(['Failed to upload successfully.'], reader);
            }
  
            console.log('Save uploaded successfully.');
            main();
          } if (choice === 'e' || choice === 'E') {
            // User can manually decide to upload or download...
            reader.question('Upload, download or exit? (U/D/E):\n', (eChoice) => {
              eMode(eChoice, settings, selectedGame, newestSave, manifestData, main);
            });
          } else {
            main();
          }
        })
      } if (new Date(manifestData.lastSaved) > lastSaved) {
        reader.question('Your local save is older than the one stored in the repo. Would you like to download the latest save? (Y/N/E)', async(choice) => {
          if (choice === 'Y' || choice === 'y') {
            const response = await downloadSave(settings, selectedGame);
            const fileData = Buffer.from(response.content, 'base64');

            try {
              await fs.writeFile(`${settings.games[selectedGame].path}/${response.name}`, fileData);
            } catch(e) {
              showError(['Failed to write save file.', e], reader);
            }

            console.log('File written successfully!');
            main();
          } if (choice === 'e' || choice === 'E') {
            // User can manually decide to upload or download...
            reader.question('Upload, download or exit? (U/D/E)\n', (eChoice) => {
              eMode(eChoice, settings, selectedGame, newestSave, manifestData, main);
            });
          } else {
            main();
          }
        })
      } else {
        console.log('It looks like your save is up to date with the one in the cloud.');
        console.log('Cloud date:', new Date(manifestData.lastSaved).toISOString());
        console.log('Local date:', lastSaved);
        reader.question('Upload, download or exit? (U/D/E):\n', (eChoice) => {
          eMode(eChoice, settings, selectedGame, newestSave, manifestData, main);
        });
      }
    })
  });
}

main();