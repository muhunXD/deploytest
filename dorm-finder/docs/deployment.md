# Deployment Guide

This project ships as a React front end (`client/`) and an Express/MongoDB API (`server/`). The sections below cover the configuration you need before deploying and outline deployment options for Azure.

## 1. Configure Environment Variables

Copy the sample env files and customise them for the target environment:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Populate the following keys:

| Location      | Key               | Description                                                                      |
| ------------- | ----------------- | -------------------------------------------------------------------------------- |
| `server/.env` | `MONGODB_URI`     | MongoDB / Cosmos DB connection string. Required in production.                  |
|               | `PORT`            | HTTP port for the API. Defaults to `4000`.                                       |
|               | `NODE_ENV`        | Use `production` when deploying. Affects logging and Mongo index builds.         |
|               | `ALLOWED_ORIGINS` | Comma separated list of browser origins that may call the API. `*` allows all.  |
| `client/.env` | `VITE_API_URL`    | Base URL for the deployed API (e.g. `https://dormfinder-api.azurewebsites.net`). |

Never commit your populated `.env` files. They are ignored by `.gitignore`.

## 2. Verify Locally

```bash
# Install deps
(cd server && npm ci)
(cd client && npm ci)

# Run API
(cd server && npm run dev)

# Build and preview the client
(cd client && npm run build && npm run preview)
```

Visit `http://localhost:4000/api/health` for a health check and run a quick smoke test in the browser.

### Docker Compose (optional)

You can spin up the stack locally with Docker:

```bash
docker compose up --build
```

The updated compose file uses the bundled Mongo container (`mongodb://mongo:27017/dorm-finder`) and exposes the client on `http://localhost:5173`.

## 3. Azure App Service (API)

1. Create a **Resource Group** and **App Service Plan** (Linux, Node 20 LTS).
2. Provision an **App Service** for the API. During or after creation:
   - Go to **Configuration -> Application settings** and add `MONGODB_URI`, `ALLOWED_ORIGINS`, `NODE_ENV=production`, and (optionally) `PORT`.
   - If you use Azure Cosmos DB, copy the primary connection string into `MONGODB_URI`.
3. Deploy the code:
   - Zip the `server/` folder (excluding `node_modules`) and upload via **Deployment Center -> Zip Deploy**, *or*
   - Connect Deployment Center to GitHub and point it at the `server` subfolder. App Service uses Oryx to run `npm install --production` and `npm start`.
4. Confirm `https://<appname>.azurewebsites.net/api/health` returns `{"ok":true,...}`.

> Azure automatically injects `PORT` and `WEBSITE_HOSTNAME`. The server now honours those values and trusts the front-end origin list from `ALLOWED_ORIGINS`.

## 4. Azure Static Web Apps (Client)

1. Create a **Static Web App**.
2. When configuring the build, set:
   - `app_location`: `client`
   - `output_location`: `dist`
3. Add a secret or workflow variable for `VITE_API_URL` that points to the App Service URL.
4. Once the GitHub Action finishes, browse to the Static Web App URL and verify requests hit the API.

### Alternative: Azure Storage + CDN

1. Create a Storage Account and enable **Static website**.
2. Build locally with `npm run build` and upload the contents of `client/dist` to the `$web` container (`az storage blob upload-batch` or Storage Explorer).
3. Set `VITE_API_URL` before building to ensure the client calls the hosted API.
4. Optionally front the storage endpoint with Azure CDN or a custom domain.

## 5. Operational Notes

- The API now logs blocked CORS origins and shuts down gracefully on `SIGINT`/`SIGTERM`, which keeps App Service happy during restarts.
- `ALLOWED_ORIGINS=*` is accepted but logs a warning; define explicit origins in production wherever possible.
- MongoDB indexes are auto-managed in development. In production they only build when necessary (`autoIndex` is disabled).
- Monitor App Service with **Log Stream** and add Azure Monitor alerts (HTTP 5xx, CPU, memory).
- Consider adding GitHub Actions workflows for the server and client to automate deployments end-to-end.

With these steps completed, the project is ready for a production deployment on Azure.
