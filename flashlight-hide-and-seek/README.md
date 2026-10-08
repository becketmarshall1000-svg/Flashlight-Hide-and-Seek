# Flashlight Hide and Seek (online)

A dark room, one flashlight, and everyone else hiding. Play alone against bots, or online with friends using a game code.

## What's in here

| File | What it does |
|---|---|
| `server.js` | The game server. Sends the game page to players and passes live game messages between everyone in a room. Uses only Node's built-in tools, so there is nothing to install. |
| `public/index.html` | The whole game (graphics, sound, bots, lobby). |
| `package.json` | Tells Render how to start the server (`npm start`). |
| `render.yaml` | Optional: lets Render set everything up automatically. |

## Try it on your own computer (optional)

1. Install Node.js (version 18 or newer) from https://nodejs.org
2. Open a terminal in this folder and run: `node server.js`
3. Open http://localhost:3000 in two browser windows and click **Play online with friends**.

## Put it online with Render (free)

### 1. Put the code on GitHub
1. Make a free account at https://github.com
2. Click **+** (top right) → **New repository**. Name it `flashlight-hide-and-seek`, choose **Public**, click **Create repository**.
3. On the new repository page, click **uploading an existing file**.
4. Unzip this project, then drag **everything inside the folder** (`server.js`, `package.json`, `render.yaml`, `README.md`, `.gitignore`, and the `public` folder) into the browser window.
5. Click **Commit changes**.

### 2. Create the web service on Render
1. Go to https://render.com and sign up **with your GitHub account**.
2. Click **New +** → **Web Service** → pick your `flashlight-hide-and-seek` repository (click **Configure account** if it isn't listed, and give Render access to it).
3. Use these settings:
   - **Runtime / Language:** Node
   - **Build Command:** `echo "Nothing to build"`
   - **Start Command:** `node server.js`
   - **Instance type:** Free
4. Click **Create Web Service**. After a minute or two it says **Live**, and your game is at an address like `https://flashlight-hide-and-seek.onrender.com`.

### 3. Play
Open your address, click **Play online with friends**, type a name, and click **Create a game**. Send the 4-letter code to your friends; they open the same address, type a name and the code, and click **Join**. The host picks the seeker and the settings, then clicks **Start game**.

## Good to know
- **Free plan sleep:** after about 15 minutes with nobody playing, Render puts the free server to sleep. The next visit takes about 50 seconds to load. Open the site a minute before you need it (or use Render's $7/month plan to keep it awake).
- **Updating the game:** change a file on GitHub (edit, or upload a new version) and Render redeploys automatically.
- **Players per game:** up to 8 people. Bots fill any extra hider spots.
- **Who runs what:** each player's browser controls their own movement and flashlight. The host's browser runs the bots, the timer, time rings, catches and tags, and tells everyone else. If the host leaves, everyone goes back to the lobby and someone else becomes host.
