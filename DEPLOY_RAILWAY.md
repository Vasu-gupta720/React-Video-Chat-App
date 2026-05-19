Railway deployment steps

Overview
- We'll deploy the `server` and `client` as two separate Railway services/projects.
- The `server` uses Node + Socket.IO and now listens on `process.env.PORT`.
- The `client` builds a static React app; `npm start` will run a small Express server that serves `build/`.

Prerequisites
- A Railway account (https://railway.app) and the Railway CLI installed (`npm i -g railway`)
- Git repo connected to your Railway account (optional but recommended)

Server deployment (recommended)
1. From the `server` folder, ensure dependencies are installed and commit changes:

```bash
cd server
npm install
git add .
git commit -m "Prepare server for Railway: use PORT and node start"
```

2. Create a new Railway project and link your repo (or use `railway init`):

```bash
railway login
railway init  # follow prompts to create a new project
railway up    # deploy current folder as a service
```

Railway will run `npm install` and `npm start` (which runs `node index.js`). After deployment, note the service URL (ex: `https://your-server.up.railway.app`).

Client deployment
1. From the `client` folder, install deps and build:

```bash
cd client
npm install
npm run build
```

2. Commit the new `build/` or push to the repo. Create a Railway project for the client (separate):

```bash
railway init    # in client folder, create new project
railway up      # deploy client; Railway will run `npm install` then `npm start`
```

3. Configure environment variables for the client service (so React knows server URL):
- In the Railway dashboard, add `REACT_APP_SERVER_URL` with the value of your server URL (e.g. `https://your-server.up.railway.app`).

Notes & recommendations
- Socket.IO is supported by Railway; using a single port for HTTP+WebSocket (as implemented) is required.
- For local development run the client with `npm run dev` (keeps `react-scripts start`). On Railway `npm start` serves the production build.
- If you prefer a single repository deployment, consider Dockerizing both services or hosting the client on a CDN/Vercel and the server on Railway.

If you want, I can:
- Add a `railway.json` or Dockerfile for each service.
- Create GitHub workflow to auto-deploy on push.
- Run `npm install` locally and validate builds (I can't run Railway CLI from here without your credentials).
