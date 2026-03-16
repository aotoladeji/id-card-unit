# Deployment Guide — ID Card Unit System
### For Hosting on a Live Server (AWS, DigitalOcean, VPS, etc.)

---

## Overview of What This System Has

Before we start, here is what you are deploying:

| Part | What It Is | Runs On |
|------|-----------|---------|
| **Frontend** | The React web app (what users see in the browser) | Built into static files, served by Nginx |
| **Backend** | The Node/Express API server | Port 5000 |
| **Database** | PostgreSQL | Port 5432 |
| **Capture App** | Separate fingerprint/photo app (stays on your LOCAL machine) | Port 5001 (local only) |

The **Capture App stays on your local machine** — it connects to the live server remotely. It is NOT deployed to AWS.

---

## PART 1 — Set Up Your Server on AWS

### Step 1: Create an EC2 Instance

1. Go to [https://aws.amazon.com](https://aws.amazon.com) and sign in
2. Go to **EC2 > Instances > Launch Instance**
3. Choose:
   - **Name:** `id-card-unit`
   - **OS:** Ubuntu Server 24.04 LTS (Free tier eligible)
   - **Instance type:** `t3.small` (recommended) or `t2.micro` (free tier, may be slow)
   - **Key pair:** Create a new one, name it `id-card-key`, download the `.pem` file — **keep this safe, you cannot re-download it**
4. Under **Network settings**, click **Edit** and add these inbound rules:
   - SSH — Port 22 — Source: My IP (for your secure access)
   - HTTP — Port 80 — Source: 0.0.0.0/0
   - HTTPS — Port 443 — Source: 0.0.0.0/0
   - Custom TCP — Port 5000 — Source: 0.0.0.0/0 (backend API, can be removed later once Nginx is configured)
5. Storage: 20 GB is fine
6. Click **Launch Instance**

### Step 2: Note Your Server's IP Address

After launching, go to your instance list and copy the **Public IPv4 address** — it will look like `54.123.45.67`. You will use this everywhere below.

---

## PART 2 — Connect to Your Server

### On Windows (using PowerShell or Terminal):

```powershell
# Navigate to where you saved the .pem file, e.g.:
cd C:\Users\TbagTayo\Downloads

# Fix permissions on the key file (required):
icacls id-card-key.pem /inheritance:r /grant:r "$($env:USERNAME):R"

# Connect:
ssh -i id-card-key.pem ubuntu@YOUR_SERVER_IP
```

Replace `YOUR_SERVER_IP` with your actual EC2 IP address (e.g. `54.123.45.67`).

You are now inside your server. Every command from here runs on the server unless stated otherwise.

---

## PART 3 — Install Required Software on the Server

Run these commands one by one after connecting via SSH:

### Step 3: Update the server

```bash
sudo apt update && sudo apt upgrade -y
```

### Step 4: Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # should print v20.x.x
```

### Step 5: Install PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

### Step 6: Install Nginx (web server)

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Step 7: Install PM2 (keeps your Node server running 24/7)

```bash
sudo npm install -g pm2
```

### Step 8: Install Git

```bash
sudo apt install -y git
```

---

## PART 4 — Set Up the PostgreSQL Database

### Step 9: Create a database user and database

```bash
sudo -u postgres psql
```

You are now inside the PostgreSQL console. Run:

```sql
CREATE USER id_card_user WITH PASSWORD 'choose-a-strong-password-here';
CREATE DATABASE id_card_system OWNER id_card_user;
GRANT ALL PRIVILEGES ON DATABASE id_card_system TO id_card_user;
\q
```

> Write down the password you chose — you will need it in the `.env` file.

### Step 10: Run your database schema

Temporarily, copy your schema file to the server. From your **local machine** run (in a new terminal window, NOT in SSH):

```powershell
scp -i C:\Users\TbagTayo\Downloads\id-card-key.pem "C:\Users\TbagTayo\Desktop\id-card-unit\database-schema.sql" ubuntu@YOUR_SERVER_IP:/home/ubuntu/
```

Then back in your SSH session, run the schema:

```bash
sudo -u postgres psql -d id_card_system -f /home/ubuntu/database-schema.sql
```

If there are migration files to run as well, repeat for each migration SQL file:

```bash
sudo -u postgres psql -d id_card_system -f /home/ubuntu/database-migration-approved-cards.sql
sudo -u postgres psql -d id_card_system -f /home/ubuntu/database-migration-inventory-used.sql
sudo -u postgres psql -d id_card_system -f /home/ubuntu/database-migration-print-collections.sql
```

---

## PART 5 — Upload and Configure the Application

### Step 11: Upload your project to the server

From your **local machine** (not SSH), zip and upload the project:

```powershell
# Option A: Use SCP to copy the whole project folder
scp -i C:\Users\TbagTayo\Downloads\id-card-key.pem -r "C:\Users\TbagTayo\Desktop\id-card-unit" ubuntu@YOUR_SERVER_IP:/home/ubuntu/id-card-unit
```

> **Note:** This will also upload `node_modules` which is large. A better option is to use Git. If your project is on GitHub, instead run on the server: `git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git /home/ubuntu/id-card-unit`

### Step 12: Install backend dependencies

In your SSH session:

```bash
cd /home/ubuntu/id-card-unit/backend
npm install --production
```

### Step 13: Create the production `.env` file for the backend

```bash
nano /home/ubuntu/id-card-unit/backend/.env
```

Paste the following — fill in YOUR values:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=id_card_user
DB_PASSWORD=the-password-you-chose-in-step-9
DB_NAME=id_card_system

# Server Configuration
PORT=5000
NODE_ENV=production

# JWT Secret — change this to any long random string
JWT_SECRET=replace-this-with-a-very-long-random-string-at-least-32-chars

# File Upload
MAX_FILE_SIZE=5242880

# Frontend URL (your server's IP or domain)
FRONTEND_URL=http://YOUR_SERVER_IP

# Integration with Capture App
# This is your LOCAL machine's public IP (not the server IP)
# The capture app runs on your local computer
CAPTURE_APP_URL=http://YOUR_LOCAL_MACHINE_PUBLIC_IP:5001
CAPTURE_APP_OUTPUT_DIR=/home/ubuntu/id-card-unit/backend/uploads/output
VERIFY_API_KEY=2f411ce1c1dafdcf36079620dc3f00b97ec2ca24a7ce87c35b503fe09866c069

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SECURITY=TLS
SMTP_USER=aot.oladeji@gmail.com
SMTP_PASS=viemhpruaqyrctaq
SMTP_FROM="ID Card Unit" <noreply@ui.edu.ng>
```

Save and exit: press `Ctrl+X`, then `Y`, then `Enter`.

> **Important notes on the .env above:**
> - `DB_USER` and `DB_PASSWORD` must match what you set in Step 9
> - `JWT_SECRET` must be a long random string — go to https://www.uuidgenerator.net/ and use 2-3 UUIDs joined together
> - `CAPTURE_APP_URL` points to your **local machine** (where the capture app runs), not to the server
> - `FRONTEND_URL` is the server's IP or domain name

### Step 14: Build the React frontend

Still in the SSH terminal, go to the project root and build:

```bash
cd /home/ubuntu/id-card-unit
npm install
npm run build
```

This creates a `dist/` folder containing the compiled frontend files.

---

## PART 6 — Start the Backend Server

### Step 15: Start the backend with PM2

```bash
cd /home/ubuntu/id-card-unit/backend
pm2 start server.js --name "id-card-backend"
pm2 save
pm2 startup
```

The last command will print another command for you to copy and run (it looks like `sudo env PATH=...`). Copy and run that command — it makes the backend auto-start if the server ever reboots.

Check that it started correctly:

```bash
pm2 logs id-card-backend --lines 50
```

You should see: `🚀 Server is running on port 5000`

---

## PART 7 — Configure Nginx

Nginx acts as the "front door" of your server. It serves the React frontend and forwards `/api` requests to the backend.

### Step 16: Create an Nginx config file

```bash
sudo nano /etc/nginx/sites-available/id-card-unit
```

Paste this configuration — replace `YOUR_SERVER_IP` with your actual IP:

```nginx
server {
    listen 80;
    server_name YOUR_SERVER_IP;

    # Serve the React frontend (built files)
    root /home/ubuntu/id-card-unit/dist;
    index index.html;

    # All frontend routes fall back to index.html (for React Router)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Forward all /api requests to the Node.js backend
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }

    # Serve uploaded files
    location /uploads {
        alias /home/ubuntu/id-card-unit/backend/uploads;
    }
}
```

Save and exit: `Ctrl+X`, then `Y`, then `Enter`.

### Step 17: Enable the config and restart Nginx

```bash
sudo ln -s /etc/nginx/sites-available/id-card-unit /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

`nginx -t` checks for any errors. If it says `syntax is ok` and `test is successful`, you are good.

---

## PART 8 — Update Your Local (Vite) Config for Production

The `vite.config.js` proxy setting (pointing to `localhost:5000`) is only used during development on your local machine. In production, Nginx handles routing, so **no changes to vite.config.js are needed for the live server**.

However, you must update the `src/services/api.js` file if it hardcodes `localhost`. Let's check:

```bash
grep -n "localhost" /home/ubuntu/id-card-unit/src/services/api.js
```

If it shows any `localhost` references, you need to make those use relative URLs (e.g., `/api/...` instead of `http://localhost:5000/api/...`). Relative URLs automatically work on any host.

---

## PART 9 — Test Your Deployment

### Step 18: Open your browser

Go to: `http://YOUR_SERVER_IP`

You should see the login page.

### Step 19: Test the health check

Go to: `http://YOUR_SERVER_IP/api/health`

You should see: `{"status":"OK","message":"Server is running",...}`

### If something is broken, check logs:

```bash
# Backend logs
pm2 logs id-card-backend

# Nginx error logs
sudo tail -50 /var/log/nginx/error.log

# Nginx access logs
sudo tail -50 /var/log/nginx/access.log
```

---

## PART 10 — Connecting the Capture App (Local Machine) to Live Server

The capture app runs on your local computer and needs to communicate with the live server. Here is how:

### Step 20: Allow the capture app to reach the live server

The capture app needs to POST to `http://YOUR_SERVER_IP/api/...`. No special configuration needed on the server — the backend is already public.

### Step 21: Make the live server reach the capture app

This is the tricky part. The capture app (port 5001) runs on your local machine, and the live server needs to call it. Your local machine is behind a router/ISP — the server cannot reach it directly unless you:

**Option A — Use ngrok on the capture app machine (easiest):**

1. Install ngrok on your local machine (already installed based on your project)
2. Run: `ngrok http 5001`
3. Copy the https URL it gives you (e.g. `https://abc123.ngrok-free.app`)
4. SSH into your server and update the env:
   ```bash
   nano /home/ubuntu/id-card-unit/backend/.env
   # Change CAPTURE_APP_URL to the ngrok URL
   CAPTURE_APP_URL=https://abc123.ngrok-free.app
   ```
5. Restart the backend: `pm2 restart id-card-backend`

> **Downside:** The ngrok URL changes every time you restart ngrok (unless you pay for a fixed URL).

**Option B — Static IP + Port forwarding (permanent solution):**

1. Ask your ISP for a **static IP address** for your local network
2. Log into your router and set up **port forwarding**: forward external port 5001 → your local machine's IP:5001
3. Set `CAPTURE_APP_URL=http://YOUR_STATIC_IP:5001` in the server's `.env`

---

## PART 11 — Optional but Recommended

### Get a Domain Name

Instead of using an IP like `54.123.45.67`, you can buy a domain (e.g. `idcardunit.ui.edu.ng`) and point it to your server IP. Then update `server_name` in the Nginx config and `FRONTEND_URL` in `.env`.

### Enable HTTPS (SSL certificate — free)

Once you have a domain name:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
sudo systemctl reload nginx
```

This gives you a free SSL certificate (https://) that auto-renews.

### Secure your database — do not expose port 5432 publicly

In your AWS Security Group, make sure port 5432 is **NOT** open to `0.0.0.0/0`. The database only needs to be reachable from `localhost` (the server itself).

---

## Quick Reference — Files Changed for Production

| File | What to Change |
|------|---------------|
| `backend/.env` | DB credentials, FRONTEND_URL, CAPTURE_APP_URL, JWT_SECRET |
| `vite.config.js` | No changes needed for production |
| Nginx config | `server_name` = your IP or domain |

---

## Quick Reference — Useful Commands on the Server

```bash
# Check backend status
pm2 status

# Restart backend
pm2 restart id-card-backend

# View live backend logs
pm2 logs id-card-backend

# Restart Nginx
sudo systemctl restart nginx

# Check Nginx status
sudo systemctl status nginx

# After updating code, rebuild frontend
cd /home/ubuntu/id-card-unit && npm run build

# After updating backend code, restart
pm2 restart id-card-backend
```

---

## Summary Checklist

- [ ] EC2 instance created (Ubuntu, ports 80/443/22 open)
- [ ] Node.js 20, PostgreSQL, Nginx, PM2 installed
- [ ] Database and user created in PostgreSQL
- [ ] Schema and migration SQL files run
- [ ] Project uploaded to server
- [ ] backend `.env` updated with production values
- [ ] Frontend built with `npm run build`
- [ ] Backend started with PM2
- [ ] Nginx configured and restarted
- [ ] Site accessible at `http://YOUR_SERVER_IP`
- [ ] Capture app reachable via ngrok or static IP
