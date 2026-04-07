# AWS Deploy Runbook (No Cloudflare/ngrok)

This runbook deploys the app entirely on AWS resources.

If your frontend is hosted on AWS Amplify via GitHub, use deployment/aws/amplify-github-runbook.md for the frontend path and keep this runbook for backend infrastructure.

## Architecture

- Frontend: Nginx on EC2 (serving built Vite files)
- Backend: Node.js/Express on same EC2 via PM2
- Database: PostgreSQL (local or Amazon RDS recommended)
- Capture integration: Separate internal AWS service reachable via private IP/DNS

## 1) Launch and prepare EC2

1. Create Ubuntu 24.04 EC2
2. Security Group inbound:
   - 22 (My IP)
   - 80 (0.0.0.0/0)
   - 443 (0.0.0.0/0, if using TLS)
3. SSH and run:

```bash
bash deployment/aws/ec2-bootstrap.sh
```

## 2) Deploy code

```bash
cd /home/ubuntu
git clone <YOUR_REPOSITORY_URL> id-card-unit
cd id-card-unit
```

## 3) Install dependencies and build

```bash
cd /home/ubuntu/id-card-unit
npm install
npm run build

cd /home/ubuntu/id-card-unit/backend
npm install --production
```

## 4) Configure backend env

```bash
cp /home/ubuntu/id-card-unit/backend/.env.production.example /home/ubuntu/id-card-unit/backend/.env
nano /home/ubuntu/id-card-unit/backend/.env
```

Set these values correctly:

- DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
- JWT_SECRET
- FRONTEND_URL
- CAPTURE_APP_URL (private AWS endpoint, not public tunnel)

## 5) Start backend with PM2

```bash
cd /home/ubuntu/id-card-unit/backend
pm2 start server.js --name id-card-backend
pm2 save
pm2 startup
```

Run the startup command PM2 prints.

## 6) Configure Nginx

```bash
sudo cp /home/ubuntu/id-card-unit/deployment/aws/nginx-id-card.conf /etc/nginx/sites-available/id-card-unit
sudo ln -sf /etc/nginx/sites-available/id-card-unit /etc/nginx/sites-enabled/id-card-unit
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

## 7) Verify

```bash
curl http://127.0.0.1:5000/api/health
curl http://127.0.0.1/api/health
```

Open browser:

- http://<EC2_PUBLIC_IP>
- http://<EC2_PUBLIC_IP>/api/health

## 8) Recommended production hardening

1. Move DB to Amazon RDS PostgreSQL
2. Put EC2 behind ALB and terminate TLS with ACM
3. Restrict backend security group to ALB only
4. Store secrets in AWS Secrets Manager or SSM Parameter Store
5. Add CloudWatch Agent + PM2 logs forwarding
