const fs = require('node:fs/promises');
const fetch = require('node-fetch');

class SaveManager {
    constructor() {
        this.reader = null;
        this.settings = {};
        this.gameSettings = {};
        this.apiUrl = 'https://api.github.com'
    }

    async init(reader) {
        // initialise the class, hand over to generation if needed
        this.reader = reader;

        // first, check if the settings exist
        try {
            console.log('Fetching settings file...');
            await fs.access('./settings.json');
          } catch(e) {
            console.log('No settings detected. Starting first time setup...');
            return this.generateSettings();
          }

          // Load the settings into the class
          const raw = await fs.readFile('./settings.json');
          this.settings = JSON.parse(raw);
        
          console.log(`Attempting to read data from ${this.settings.repo}.`);
        
          const repoResponse = await fetch(`${this.apiUrl}/repos/${this.settings.owner}/${this.settings.repo}/contents`, {
            headers: {
              'Accept': 'application/vnd.github+json',
              'Authorization': `Bearer ${this.settings.auth}`
            },
            method: 'GET'
          });

          if (!repoResponse.ok) {
            // TODO: Make the GCSS hold while the user reads the error (use reader?), and record errors to a log file
            if (repoResponse.status === 401) {
                console.log('GCSS encountered a 401 error. This usually means your PAT or username is incorrect, or is configured wrong. Double check the token and permissions and try again.');
                return exit(1);
            } else {
                console.log('GCSS encountered an error and will quit:', response.status, response.statusText);
                return exit(1);
            }
          }

          const repoData = await repoResponse.json();

          console.log('[DEBUG]: ', repoData, repoData.filter(f => f.name === 'base-manifest.json'));

          if (!repoData.filter(f => f.name === 'base-manifest.json').length) {
            // No base manifest is present. Ask whether the user wants to make one
            await this.reader.question('Repo was reached, but no base manifest was found. Make one? (Y/N)\n', (ans) => {
                if (ans === 'Y' || ans === 'y') {
                    return this.generateBaseManifest();
                } else {
                    console.log('As there isn\'t a base manifest, this program cannot function. It will now exit.');
                    return exit(0);
                }
            })
          }

          const manifestResponse = await fetch(`${this.apiUrl}/repos/${this.settings.owner}/${this.settings.repo}/contents/base-manifest.json`, {
            method: 'GET',
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${this.settings.auth}`
            },
          });

          if (!manifestResponse.ok) {
            console.log('GCSS failed to retrieve base manifest:', manifestResponse.status, manifestResponse.statusText);
            return exit(1);
          }

          console.log('[DEBUG]', manifestResponse);

          // Load the game settings
          this.gameSettings = {}; // TODO: Parse game settings from the base manifest (remote) and continue.
    }

    async generateSettings() {
        // Handle getting the user's details on first time startup - base settings
    }

    async generateBaseManifest() {
        const {
            apiUrl,
            settings: {
                owner,
                repo,
                auth
            }
        } = this;
        const initialGameSettings = {
            games: []
        };

        const file = {
            name: 'base-manifest.json',
            content: Buffer.from(JSON.stringify(initialGameSettings))
          }

        const response = await fetch(`${apiUrl}/repos/${owner}/${repo}/contents/${file.name}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${auth}`
            },
            body: JSON.stringify({
                message: `${new Date().toISOString()}: Creating base manifest`,
                committer: {
                    name: 'GCSS',
                    email: 'undefined'
                },
                content: file.content.toString('base64')
            })
        })

        if (!response.ok) {
            console.log('Failed to create base manifest:', response.status, response.statusText);
            return exit(1);
        }
    }



}

module.exports = SaveManager;