#!/usr/bin/env bash
set -euo pipefail

# Bootstraps Ubuntu EC2 for ID Card Unit backend/frontend hosting.
# Run as: bash deployment/aws/ec2-bootstrap.sh

echo "[1/8] Updating apt packages"
sudo apt update
sudo apt upgrade -y

echo "[2/8] Installing base packages"
sudo apt install -y curl git nginx postgresql postgresql-contrib

echo "[3/8] Installing Node.js 20"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

echo "[4/8] Installing PM2"
sudo npm install -g pm2

echo "[5/8] Enabling services"
sudo systemctl enable postgresql
sudo systemctl start postgresql
sudo systemctl enable nginx
sudo systemctl start nginx

echo "[6/8] Preparing app directory"
sudo mkdir -p /home/ubuntu/id-card-unit
sudo chown -R ubuntu:ubuntu /home/ubuntu/id-card-unit

echo "[7/8] Versions"
node -v
npm -v
psql --version
nginx -v
pm2 -v

echo "[8/8] Done"
echo "Next: deploy code to /home/ubuntu/id-card-unit, then follow deployment/aws/aws-deploy-runbook.md"
