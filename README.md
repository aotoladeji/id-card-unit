# ID Card Unit

ID Card Unit is a React + Node.js system for card management, scheduling, reporting, inventory, and printing workflows.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL
- Hosting: Vercel (frontend) + Render (backend and PostgreSQL)

## Local development

### 1) Install dependencies

```bash
# root frontend
npm install

# backend
cd backend
npm install
```

### 2) Configure backend env

Edit `backend/.env` and provide your local database and app values.

### 3) Run both services

```bash
# terminal 1
cd backend
npm run dev

# terminal 2 (project root)
npm run dev
```

Frontend runs on `http://localhost:3001` and proxies `/api` to backend `http://localhost:5000`.

## Production deployment

Use this setup for production:

- Frontend: Vercel (from repo root)
- Backend: Render Web Service (from `backend/`)
- Database: Render PostgreSQL

Key config files:

- `vercel.json`
- `render.yaml`
- `backend/.env.production.example`
- `.env.production.example`

## Existing detailed guide

You can also refer to `DEPLOYMENT-GUIDE.md` for full server setup details.
