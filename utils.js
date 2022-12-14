const fetch = require('node-fetch');
const fs = require('node:fs/promises');

const apiUrl = 'https://api.github.com';

const showError = (errors, reader) => {
  let selfReader = reader;
  if (!reader) {
    selfReader = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }
  errors.map((e) => console.log('\x1b[31m%s\x1b[0m', e));
  selfReader.question('Press Ctrl+C to exit.', () => {});
}

const init = async(reader, cb) => {
  const settings = {};
  reader.question('Enter target repo name (where saves will be kept):\n', (repo) => {
    settings.repo = repo;
    reader.question('Enter GitHub username (must be owner of the target repo):\n', (owner) => {
      settings.owner = owner;
      reader.question('Enter GitHub Personal Access Token:\n', (auth) => {
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
                  showError([`Encountered error ${e} when trying to make the settings file.`], reader);
                }
              }
            });})
          });
        });
      });
    });
  });
}

const eMode = async(choice, settings, selectedGame, newestSave, manifestData, cb) => {
  // method to handle edit mode, AKA manual upload or download select for when user wants to better administer cloud save.
  if (choice === 'U' || choice === 'u') {
    console.log('Uploading save and updating manifest...');
    const response = await uploadSave(settings, selectedGame, newestSave, manifestData.lastSaved);
    const manifestResponse = await updateManifest(settings, selectedGame, new Date(newestSave.data.mtime).toISOString());

    if (!response.ok || !manifestResponse.ok) {
      showError(['Failed to upload successfully.']);
    }

    cb(); // go back to main when done...
  } if (choice === 'D' || choice === 'd') {
    console.log('Downloading save...');
    const response = await downloadSave(settings, selectedGame);
    const fileData = Buffer.from(response.content, 'base64');

    try {
      await fs.writeFile(`${settings.games[selectedGame].path}/${response.name}`, fileData);
    } catch(e) {
      showError(['Failed to write save file.', e]);
    }

    console.log('File written successfully!');
    cb();
  } if (choice === 'exit' || choice === 'e' || choice === 'E') {
    process.exit(0);
  } else {
    console.log('Input not recognised, try again.');
    cb();
  }
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
    showError(['Failed to get existing save file SHA.']);
  }

  
  const shaData = await response.json();
  return shaData.sha;
}

const uploadSave = async(settings, selectedGame, file) => {
  // first, convert save file contents to a string for transport.
  try {
    await fs.access(`${settings.games[selectedGame].path}/${file.name}`);
  } catch(e) {
    showError(['Failed to access save file. Ensure you have entered the correct path.'])
  }

  const content = await fs.readFile(`${settings.games[selectedGame].path}/${file.name}`);
  const sha = await getFileSha(file.name, settings, selectedGame);

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

const updateManifest = async(settings, selectedGame, fileSaved) => {
  const file = {
    name: 'manifest.json',
    content: Buffer.from(JSON.stringify({ lastSaved: fileSaved}))
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
    showError(['Failed to access save directory. Ensure you have entered the correct path.', e]);
  }

  const response = await fetch(`${apiUrl}/repos/${settings.owner}/${settings.repo}/contents/${selectedGame}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${settings.auth}`
    }
  });

  if (!response.ok) {
    showError(['Failed to retrieve files list.']);
  }

  const fileJson = await response.json();
  const saveFile = fileJson.filter((f) => f.name !== 'manifest.json')[0];

  const fileResponse = await fetch(`${apiUrl}/repos/${settings.owner}/${settings.repo}/contents/${selectedGame}/${saveFile.name}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${settings.auth}`
    }
  });

  if (!fileResponse.ok) {
    showError(['Failed to retrieve file.'])
  }

  const contents = await fileResponse.json();

  return contents;
}

const createBackup = async(gamePaths) => {
  console.log('Migrating saves to backup path. This might take some time...');

  const { path, backupPath } = gamePaths;

  try {
    const saves = await fs.readdir(path);

    if (saves && saves.length) {
      // use milliseconds for backup name as windows wont accept some characters.
      const bfName = new Date().getTime();
      try {
        // create a subfolder to keep the backups in so multiple backups can be made.
        await fs.mkdir(`${backupPath}/${bfName}`);
      } catch(e) {
        showError(['Failed to create subfolder for backup.', e]);
      }

      try {
        // copy saves directory contents over to new backup folder
        await fs.cp(path, `${backupPath}/${bfName}`, { recursive: true });
      } catch(e) {
        showError(['Failed to copy save files to backup', e]);
      }
    }
  } catch(e) {
    showError(['Error reading saves directory. Backup failed.', e]);
  }

  console.log('Files backed up successfully.');
}

const addNewGame = async(settings, reader, cb, suggestedOptions = {}) => {
  const newSettings = {...settings};
  reader.question(`Enter game name ${suggestedOptions.name ? `(${suggestedOptions.name})` : ''}:\n`, async(game) => {
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
            showError([`Encountered error ${e} when trying to make the settings file.`], reader);
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
  addNewGame,
  eMode,
  showError
}