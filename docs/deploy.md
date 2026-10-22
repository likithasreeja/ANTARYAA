# Deploy ANTARYA (Vercel + Render + MongoDB Atlas)

ANTARYA is three services. A Vercel-only deploy shows the landing page, but login, customers, and payments need the Render API and MongoDB Atlas.

| Piece | Host | Root folder |
| --- | --- | --- |
| Frontend (React + Vite) | [Vercel](https://vercel.com) | `client` |
| Backend (Express) | [Render](https://render.com) | `server` |
| Database | [MongoDB Atlas](https://cloud.mongodb.com) | n/a |
| Mixpanel (optional) | Mixpanel project token | `VITE_MIXPANEL_TOKEN` on Vercel |

The Python ML service (`ml-service`) is optional. Inventory Planner works only if you also deploy it and set `FASTAPI_URL` on Render.

Do **not** commit `.env` files.

## 1. MongoDB Atlas (required)

If Atlas is on **Connect to Cluster0 → Choose a connection method**:

1. Click **Drivers** (labeled **Drivers and Client Libraries** in some Atlas UIs). Do not choose Compass or Shell for this app.
2. Driver: **Node.js**.
3. Version: **5.5 or later**, or the newest Node.js version Atlas lists (this app uses the MongoDB Node driver 7.x via Mongoose 9).
4. Copy the connection string. It looks like `mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`.
5. Replace `<password>` with the database user's password. URL-encode special characters (`@` → `%40`, `#` → `%23`).
6. Insert the database name before the `?`: `...mongodb.net/antarya?retryWrites=true&w=majority`.
7. Put the URI only in `server/.env` as `MONGODB_URI=...`. Never put it in the Vite frontend or in Git.
8. Atlas → **Network Access**:
   - Local test: **Add Current IP Address**
   - Render: also add `0.0.0.0/0` (Render outbound IPs change). Restrict later if you add a static IP.
9. Atlas → **Database Access**: the user needs `readWrite` on the `antarya` database (or Atlas `readWriteAnyDatabase` on a free cluster).

Do not paste the URI into chat. After it is in `server/.env`, run `npm run test:mongo` from `server/`.

## 2. Render backend

1. Push `antarya1-main` to GitHub (this folder is the app root).
2. Render → **New → Blueprint** and select the repo, or **New → Web Service**.
3. If not using the Blueprint:
   - Root Directory: `server`
   - Runtime: Node
   - Build: `npm install`
   - Start: `npm start`
   - Health check: `/api/health`
4. Environment variables:

```
NODE_ENV=production
MONGODB_URI=<atlas uri from step 1>
JWT_SECRET=<long random string>
FRONTEND_ORIGIN=https://antarya-one.vercel.app
GEMINI_API_KEY=<optional>
```

Copy any Razorpay / UPI / admin keys you already use locally.

5. Deploy, then copy the service URL, for example `https://antarya-api.onrender.com`.
6. Open `https://YOUR-SERVICE.onrender.com/api/health`. It must return `"status":"ok"`.

Render free services sleep after idle. The first request after sleep can take 30–60 seconds.

## 3. Vercel frontend

1. [vercel.com](https://vercel.com) → Add New Project → import the same GitHub repo.
2. Root Directory: `client`.
3. Framework: Vite. Build: `npm run build`. Output: `dist`.
4. Environment variables (Production and Preview):

```
VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com/api
VITE_GA_MEASUREMENT_ID=<optional>
VITE_MIXPANEL_TOKEN=<optional Mixpanel Project Token>
```

5. Deploy. Vite inlines `VITE_*` at **build** time, so changing a variable later requires a **Redeploy**.

Or from this machine, after `npx vercel login`:

```bash
cd client
npx vercel --prod --yes -b VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com/api
```

## 4. Confirm the live app

1. Open the Vercel URL.
2. Register a test shop and log in.
3. Add a customer and open Payments.
4. If login fails, the frontend is live but `VITE_API_URL` is missing or still pointing at `/api` on Vercel.

## Git root warning

This workspace zip has extra wrapper folders. Create the GitHub repo from **`antarya1-main`**, not from `Downloads`. Then Vercel Root Directory is `client` and Render Root Directory is `server`.
