const fetch = require('node-fetch');
const fs = require('node:fs/promises');

const apiUrl = 'https://api.github.com';

const init = async(cb) => {
  const settings = {};
  reader.question('Enter target repo name (where saves will be kept):\n', (repo) => {
    settings.repo = repo;
    reader.question('Enter GitHub username (must be owner of the target repo):\n', (owner) => {
      settings.owner = owner;
      reader.question('Enter repo auth key (private repos):\n', (auth) => {
        settings.auth = auth;
        reader.question('Enter game name:\n', (game) => {
          reader.question('Enter game save folder path:\n', (path) => {
            settings.games = {};
            settings.games[game] = path;
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
            });
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

const uploadSave = async(settings, selectedGame, file) => {
  // first, convert save file contents to a string for transport.
  try {
    console.log(`${settings.games[selectedGame]}\\${file.name}`)
    await fs.access(`${settings.games[selectedGame]}\\${file.name}`);
  } catch(e) {
    console.log('Failed to access save file. Ensure you have entered the correct path.');
    process.exit(1);
  }

  const content = await fs.readFile(`${settings.games[selectedGame]}/${file.name}`);

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
      content: content.toString('base64')
    })
  });

  return response;
}

module.exports = {
  apiUrl,
  generateStructure,
  init,
  uploadSave
}