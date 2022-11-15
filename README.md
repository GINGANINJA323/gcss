# Git Cloud Save System (GCSS)

This is a Node program which allows for basic management of game save files using a Git Repo as cloud storage.

It allows you to move saves to and from a git repository, or [back them up](#backups) to avoid potential save loss.

## Disclaimer

I am not responsible for damaging or losing save files or other data within your git repo/repos.

## Dependancies

1. [NodeJS](https://nodejs.org/en/) v16 or higher
2. A [Github](https://github.com/) account 
3. A Personal Access Token (see [Github Setup](#github-setup))
4. (Optional) [Git](https://git-scm.com/download)

## Installation

### Normal Installation

1. Download the code using the 'Download as ZIP' button under 'Clone'.
2. Ensure you have the dependencies installed and working.
3. Navigate to the location where you cloned the project.
4. Run `npm install` to gather the required Node packages.

### Developer Installation

Same as normal, but run `git clone https://github.com/GINGANINJA323/gcss.git` instead of downloading the code through Github.

## Usage

Run `npm start` or `node index.js` to start the program. From there, you will be given instructions on the command prompt.

### Initial Setup

On first launch, the program will run you through setup, to learn some settings (i.e. Github account and token, target repository etc). It will also let you
add your first game to the settings.

From there, it will format your git repo by creating a folder with the game name containing a manifest JSON file. This simply logs the last time a file was uploaded.

Once that's all done, you'll be free to use the program. You'll be given three main options

* Enter a game name - the program will scan the repo to find out when a save for that game was last uploaded, then compare to your newest local save. If the local is newer, it'll prompt
to upload, if not, it will prompt to download. It will also give you the option to back all of your saves up locally, before uploading or downloading.

* `amend` - Allows you to add another game to your settings. It'll guide you through questions similar to the initial setup.

* `exit` - quits the program.

### Settings

When run for the first time, GCSS will run you through a quick setup to establish the repo, user account and token. These are stored in `settings.json`, in the root of
the project. This can be edited at anytime to make quick changes. To add games, you can also use `amend` when running GCSS to register a new game similar to setup.

### Backups

This program moves save files, which people value. Therefore, before performing an upload or download, you are given the option
to backup your files. This will copy the entire saves directory specified in your settings to the backup path also specified in your settings.
Inside the backup path, a new folder will be created, and the save files will be stored there. The folder name uses the current UNIX time as it's name,
so the higher the number, the newer the backup. This way you have multiple backups easily.

## Github Setup

In order to use this program, you need a Github account with two key things:

1. A repository to store your saves in. It can be public or private.
2. A personal access token. This can be setup under Settings -> Developer Settings -> Personal Access Tokens -> Fine-grained Tokens

The personal access token will need some permissions, i'd recommend giving it only access to the saves repo, and then the following specific permissions:

* No Account permissions

* Repository permissions
  * Contents - Read and Write
  * Actions - Read and Write
  * Workflows - Read and Write

Permissions for the token can be edited anytime, so this can be done after GCSS setup if needed (though GCSS will not work until the token has permission).

## Development

This program is written in NodeJS, and uses [Node-Fetch](https://github.com/node-fetch/node-fetch) for HTTPS requests. It uses the Github APIs for interacting
with repositories.
