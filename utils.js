const fetch = require('node-fetch');
const fs = require('node:fs/promises');

const apiUrl = 'https://api.github.com';

const init = async(reader, cb) => {
  const settings = {};
  reader.question('Enter target repo name (where saves will be kept):\n', (repo) => {
    settings.repo = repo;
    reader.question('Enter GitHub username (must be owner of the target repo):\n', (owner) => {
      settings.owner = owner;
      reader.question('Enter repo auth key (private repos):\n', (auth) => {
        settings.auth = auth;
        reader.question('Enter game name:\n', (game) => {
          reader.question('Enter game save folder path:\n', (path) => {
            reader.question('Enter backup directory:\n', (backupPath) => {
            settings.games = {
              [game]: {
                path: '',
                backupPath: ''
              }
            };
            settings.games[game].path = path;
            settings.games[game].backupPath = backupPath;
            const stringSettings = JSON.stringify(settings);
            reader.question(`${stringSettings}: Confirm settings? (Y/N)`, async(conf) => {
              if (conf === 'Y' || conf === 'y') {
                try {
                  await fs.writeFile('settings.json', stringSettings);
                  cb();
                } catch(e) {
                  console.log(`Encountered error ${e} when trying to make the settings file.`);
                  process.exit(1);
                }
              }
            });})
          });
        });
      });
    });
  });
}

const generateStructure = async(settings) => {
  const promises = Object.keys(settings.games).map(g => fetch(`${apiUrl}/repos/${settings.owner}/${settings.repo}/contents/${g}/manifest.json`, {
    headers: {
      'Authorization': `Bearer ${settings.auth}`
    },
    method: 'PUT',
    body: JSON.stringify({
      message: `Creating save storage for game ${g}`,
      committer: {
        name: 'GCSS',
        email: 'undefined'
      },
      content: Buffer.from(JSON.stringify({ lastSaved: '' })).toString('base64')
    })
  }));

  const folderResponse = await Promise.all(promises);

  return folderResponse;
}

const getFileSha = async(fileName, settings, selectedGame) => {
  // When updating files, you first have to get them and use the SHA hash.
  const response = await fetch(`${apiUrl}/repos/${settings.owner}/${settings.repo}/contents/${selectedGame}/${fileName}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${settings.auth}`
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return '';
    };
    console.log('Failed to get existing save file SHA.');
    process.exit(1);
  }

  
  const shaData = await response.json();
  console.log(shaData, response);
  return shaData.sha;
}

const uploadSave = async(settings, selectedGame, file, update) => {
  // first, convert save file contents to a string for transport.
  try {
    console.log(`${settings.games[selectedGame].path}/${file.name}`);
    await fs.access(`${settings.games[selectedGame].path}/${file.name}`);
  } catch(e) {
    console.log('Failed to access save file. Ensure you have entered the correct path.');
    process.exit(1);
  }

  console.log(update);

  const content = await fs.readFile(`${settings.games[selectedGame].path}/${file.name}`);
  const sha = await getFileSha(file.name, settings, selectedGame);
  console.log(sha);

  const response = await fetch(`${apiUrl}/repos/${settings.owner}/${settings.repo}/contents/${selectedGame}/${file.name}`, {
    headers: {
      'Authorization': `Bearer ${settings.auth}`
    },
    method: 'PUT',
    body: JSON.stringify({
      message: `${new Date().toISOString()}: Uploading save file.`,
      committer: {
        name: 'GCSS',
        email: 'undefined'
      },
      content: content.toString('base64'),
      sha
    })
  });

  return response;
}

const updateManifest = async(settings, selectedGame) => {
  const file = {
    name: 'manifest.json',
    content: Buffer.from(JSON.stringify({ lastSaved: new Date().toISOString()}))
  }
  const sha = await getFileSha('manifest.json', settings, selectedGame);
  const response = await fetch(`${apiUrl}/repos/${settings.owner}/${settings.repo}/contents/${selectedGame}/${file.name}`, {
    headers: {
      'Authorization': `Bearer ${settings.auth}`
    },
    method: 'PUT',
    body: JSON.stringify({
      message: `${new Date().toISOString()}: Updating ${selectedGame} manifest.`,
      committer: {
        name: 'GCSS',
        email: 'undefined'
      },
      sha,
      content: file.content.toString('base64')
    })
  });

  return response;
}

const downloadSave = async(settings, selectedGame) => {
  try {
    // Make sure directory is accessible
    await fs.access(`${settings.games[selectedGame].path}`);
  } catch(e) {
    console.log('Failed to access save directory. Ensure you have entered the correct path.');
    console.log(e);
    process.exit(1);
  }

  const response = await fetch(`${apiUrl}/repos/${settings.owner}/${settings.repo}/contents/${selectedGame}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${settings.auth}`
    }
  });

  if (!response.ok) {
    console.log('Failed to retrieve files list.');
    process.exit(1);
  }

  const fileJson = await response.json();

  console.log(fileJson);
  const saveFile = fileJson.filter((f) => f.name !== 'manifest.json')[0];

  console.log(saveFile);

  const fileResponse = await fetch(`${apiUrl}/repos/${settings.owner}/${settings.repo}/contents/${selectedGame}/${saveFile.name}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${settings.auth}`
    }
  });

  if (!fileResponse.ok) {
    console.log('Failed to retrieve file.');
    process.exit(1);
  }

  const contents = await fileResponse.json();

  return contents;
}

const createBackup = async(gamePaths) => {
  console.log('Migrating saves to backup path.');

  const { path, backupPath } = gamePaths;

  console.log(gamePaths, path, backupPath);

  try {
    const saves = await fs.readdir(path);

    console.log(saves);

    if (saves && saves.length) {
      // use milliseconds for backup name as windows wont accept some characters.
      const bfName = new Date().getTime();
      try {
        // create a subfolder to keep the backups in so multiple backups can be made.
        await fs.mkdir(`${backupPath}/${bfName}`);
      } catch(e) {
        console.log('Failed to create subfolder for backup.');
        console.log(e);
        process.exit(1);
      }

      try {
        // copy saves directory contents over to new backup folder
        await fs.cp(path, `${backupPath}/${bfName}`, { recursive: true });
      } catch(e) {
        console.log('Failed to copy save files to backup');
        console.log(e);
        process.exit(1);
      }
    }
  } catch(e) {
    console.log('Error reading saves directory. Backup failed.');
    console.log(e);
    process.exit(1);
  }

  console.log('Files backed up successfully');
}

const addNewGame = async(settings, reader, cb) => {
  const newSettings = {...settings};
  reader.question('Enter game name:\n', async(game) => {
    reader.question('Enter game save folder path:\n', async(path) => {
      reader.question('Enter backup directory:\n', async(backupPath) => {
      newSettings.games = {
        ...newSettings.games,
        [game]: {
          path: '',
          backupPath: ''
        }
      };
      newSettings.games[game].path = path;
      newSettings.games[game].backupPath = backupPath;
      const stringSettings = JSON.stringify(newSettings);
      reader.question(`${stringSettings}: Confirm settings? (Y/N)`, async(conf) => {
        if (conf === 'Y' || conf === 'y') {
          try {
            await fs.writeFile('settings.json', stringSettings);
            await generateStructure({...newSettings, games: { [game]: {
              path,
              backupPath
            }}});
            cb();
          } catch(e) {
            console.log(`Encountered error ${e} when trying to make the settings file.`);
            process.exit(1);
          }
        }
      });
    })});
  });
}

module.exports = {
  apiUrl,
  generateStructure,
  init,
  uploadSave,
  downloadSave,
  createBackup,
  updateManifest,
  addNewGame
}