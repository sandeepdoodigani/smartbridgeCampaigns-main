# Deploying to AWS EC2

This guide outlines the steps to deploy the SmartBridge Campaigns application to an AWS EC2 instance.

## Prerequisites

- An AWS Account
- A domain name (optional but recommended for SSL)
- Basic familiarity with SSH and Linux commands

## Step 1: Launch an EC2 Instance

1.  **Login to AWS Console** and navigate to EC2.
2.  **Launch Instance**:
    -   **Name**: SmartBridge-Server
    -   **OS Settings**: Ubuntu Server 22.04 LTS (Recommended)
    -   **Instance Type**: `t3.small` or `t3.medium` (t2.micro might be too small for building/running Node apps effectively).
    -   **Key Pair**: Create one or use an existing one to SSH into the box.
    -   **Network Settings**: Allow SSH (Port 22), HTTP (Port 80), and HTTPS (Port 443) from Anywhere (`0.0.0.0/0`).

## Step 2: Prepare the Server

SSH into your instance:
```bash
ssh -i "your-key.pem" ubuntu@your-ec2-public-ip
```

Run the following commands to update and install dependencies:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (v20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL (Local DB Option)
# Note: For production, AWS RDS is recommended effectively, but running locally is cheaper.
sudo apt install postgresql postgresql-contrib -y

# Start and Enable Postgres
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create Database and User
sudo -u postgres psql
```

Inside the PostgreSQL prompt (`postgres=#`):
```sql
CREATE DATABASE smartbridge;
CREATE USER myuser WITH ENCRYPTED PASSWORD 'mypassword';
GRANT ALL PRIVILEGES ON DATABASE smartbridge TO myuser;
-- For Postgres 15+ you also need to grant schema usage
\c smartbridge
GRANT ALL ON SCHEMA public TO myuser;
\q
```

## Step 3: Deploy Application Code

You can use `git` to clone your repository.

```bash
# Install Git
sudo apt install git -y

# Clone your repository (use your actual Repo URL)
git clone https://github.com/your-username/smartbridgeCampaigns.git
cd smartbridgeCampaigns/smartbridgeCampaigns-main
```

## Step 4: Install Dependencies and Build

```bash
# Install NPM packages
npm ci

# Build the application
npm run build
```

## Step 5: Configure Environment Variables

Create a `.env` file with your production settings.

```bash
nano .env
```

Paste your configuration (update with your actual DB credentials and AWS keys):

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://myuser:mypassword@localhost:5432/smartbridge
SESSION_SECRET=replace-with-a-secure-random-string

# AWS SES Credentials (if not using IAM Roles)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
```

## Step 6: Database Migration

Run the database push command to set up the tables.

```bash
npm run db:push
```

## Step 7: Process Management (PM2)

Use PM2 to keep the app running in the background.

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start the application
pm2 start dist/index.cjs --name "smartbridge-app"

# Save PM2 list so it restarts on reboot
pm2 save
pm2 startup
# (Run the command output by pm2 startup)
```

## Step 8: Configure Nginx (Reverse Proxy)

Nginx will handle incoming web traffic and forward it to your app.

```bash
sudo apt install nginx -y
```

Create a new Nginx config:
```bash
sudo nano /etc/nginx/sites-available/smartbridge
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com; # Or your EC2 Public IP if you don't have a domain

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/smartbridge /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

## Step 9: SSL (HTTPS) - Optional but Recommended

If you have a domain name configured pointing to your EC2 IP:

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

Follow the prompts to enable HTTPS.

## Troubleshooting

-   **Check App Logs**: `pm2 logs smartbridge-app`
-   **Check Nginx Logs**: `sudo tail -f /var/log/nginx/error.log`
-   **Database Access**: Ensure the `DATABASE_URL` matches the user/pass you created.
