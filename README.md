# ID Card Unit

ID Card Unit is a React + Node.js system for card management, scheduling, reporting, inventory, and printing workflows.

## Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL
- Process manager: PM2
- Reverse proxy/static serving: Nginx

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

## AWS deployment (no Cloudflare/ngrok)

Use the AWS-native deployment path in these files:

- `deployment/aws/aws-deploy-runbook.md`
- `deployment/aws/amplify-github-runbook.md`
- `deployment/aws/ec2-bootstrap.sh`
- `deployment/aws/nginx-id-card.conf`
- `backend/.env.production.example`
- `.env.production.example`

If you are deploying frontend with Amplify GitHub integration, start with `deployment/aws/amplify-github-runbook.md`.

The runbook is designed to use AWS resources directly (EC2/RDS/ALB/private VPC connectivity) and does not require tunnel-based services.

## Existing detailed guide

You can also refer to `DEPLOYMENT-GUIDE.md` for full server setup details.
