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
    console.log(`${settings.games[selectedGame].path}\\${file.name}`)
    await fs.access(`${settings.games[selectedGame].path}\\${file.name}`);
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
    method: 'POST',
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
    await fs.access(`${settings.games[selectedGame]}`);
  } catch(e) {
    console.log('Failed to access save directory. Ensure you have entered the correct path.');
    process.exit(1);
  }

  const response = await fetch(`${apiUrl}/repos/${settings.owner}/${settings.repo}/contents/${selectedGame}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${settings.auth}`
    }
  });

  return response;
}

const createBackup = async(settings, selectedGame) => {
  
}

module.exports = {
  apiUrl,
  generateStructure,
  init,
  uploadSave,
  downloadSave,
  createBackup,
  updateManifest
}