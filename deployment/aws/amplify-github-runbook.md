# Amplify GitHub Deployment Runbook

Use this when frontend is deployed with AWS Amplify from GitHub.

## Target architecture

- Frontend: AWS Amplify Hosting (GitHub-connected)
- Backend API: EC2, ECS, or Elastic Beanstalk (public HTTPS endpoint)
- Database: Amazon RDS PostgreSQL
- Capture integration: Internal AWS endpoint via private network

## 1) Prepare backend first

Deploy backend using one of these:

- EC2 + PM2 + Nginx (see deployment/aws/aws-deploy-runbook.md)
- ECS service behind ALB
- Elastic Beanstalk Node.js environment

Expose backend as HTTPS endpoint, for example:

- `https://api.yourdomain.com/api/health`

## 2) Connect repo to Amplify

1. Open AWS Amplify
2. Create new app, select GitHub repository
3. Choose branch to deploy (main/release)
4. Amplify auto-detects amplify.yml from repo root

## 3) Set Amplify environment variables

In Amplify Console, add:

- `VITE_API_BASE_URL = /api`

Use .env.production.example as reference.

## 4) Configure SPA rewrite rule in Amplify

In Amplify Hosting rewrites and redirects, add these in order:

- Source address: `/api/<*>`
- Target address: `https://api.yourdomain.com/api/<*>`
- Type: `200 (Rewrite)`

- Source address: /<*>
- Target address: /index.html
- Type: 200 (Rewrite)

This ensures React Router routes work after refresh.

## 5) CORS on backend

Allow your Amplify domain in backend CORS settings.

Set backend env values:

- `FRONTEND_URL=https://<your-amplify-domain-or-custom-frontend-domain>`
- `CORS_ORIGINS=https://<your-amplify-domain>,https://<your-custom-frontend-domain>`

Temporary while testing:

- Allow all origins

Production:

- Restrict to your Amplify app domain and custom frontend domain

## 6) Validate deployment

After Amplify build completes:

1. Open frontend URL from Amplify
2. Test login and API calls in browser network tab
3. Confirm health endpoint is reachable at backend domain

## Common issues

1. 404 on page refresh
   - Add SPA rewrite rule in Amplify
2. API calls hitting Amplify domain instead of backend
   - Set VITE_API_BASE_URL correctly in Amplify env vars
3. CORS errors
   - Add Amplify domain to backend allowed origins
