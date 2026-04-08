# Deployment Guide - ID Card Unit (Vercel + Render)

This guide deploys the frontend on Vercel and backend/database on Render.

## Architecture

- Frontend: Vercel (Vite)
- Backend: Render Web Service (Node/Express)
- Database: Render PostgreSQL
- Capture app: stays on your local machine (not deployed)

## 1) Prepare Repository

1. Push your latest code to GitHub.
2. Ensure these files exist and are updated:
   - `.env.production.example`
   - `backend/.env.production.example`
   - `vercel.json`
   - `render.yaml`

## 2) Create Render PostgreSQL

1. In Render Dashboard, create a PostgreSQL service.
2. Save the values Render gives you:
   - `host`
   - `port`
   - `database`
   - `user`
   - `password`

## 3) Create Backend Web Service on Render

1. Create a new Web Service from your GitHub repo.
2. Configure:
   - Root Directory: `backend`
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `node server.js`
3. Add environment variables:
   - `DB_HOST` = Render Postgres host
   - `DB_PORT` = `5432`
   - `DB_USER` = Render Postgres user
   - `DB_PASSWORD` = Render Postgres password
   - `DB_NAME` = Render Postgres database
   - `PORT` = `5000`
   - `NODE_ENV` = `production`
   - `JWT_SECRET` = long random string
   - `MAX_FILE_SIZE` = `5242880`
   - `FRONTEND_URL` = your Vercel frontend URL
   - `CORS_ORIGINS` = your Vercel frontend URL
   - `CORS_ALLOW_VERCEL_PREVIEWS` = `true` (optional, for Vercel preview deployments)
   - `CAPTURE_APP_URL` = your capture app endpoint (if used)
   - `CAPTURE_APP_OUTPUT_DIR` = `/opt/render/project/src/backend/uploads/output`
   - `VERIFY_API_KEY` = your key
   - `SMTP_HOST`, `SMTP_PORT`, `SECURITY`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
4. Deploy the backend service.

## 4) Run Migrations

After backend deploy succeeds, run migrations from Render Shell (or one-off job):

```bash
node run-migration.js
node run-approved-cards-migration.js
node run-query-migration.js
```

## 5) Create Frontend Project on Vercel

1. In Vercel, import the same GitHub repository.
2. Framework preset: Vite.
3. Keep default build settings (build command and output are also defined in `vercel.json`).
4. Add environment variable:
   - `VITE_API_BASE_URL` = `https://<your-backend-service>.onrender.com/api`
5. Deploy the frontend.

## 6) Verify Production

1. Open backend health endpoint:
   - `https://<your-backend-service>.onrender.com/api/health`
2. Open frontend URL and log in.
3. Submit a scheduling request and confirm email link opens:
   - `https://<your-vercel-domain>/schedule/<id>`

## Notes

- If backend sleeps on free tier, first request may be slow.
- Keep `FRONTEND_URL` and `CORS_ORIGINS` aligned with your frontend domain.
- For stricter security, keep `CORS_ALLOW_VERCEL_PREVIEWS=false` and list only trusted origins in `CORS_ORIGINS`.
- Do not commit real `.env` files with secrets.