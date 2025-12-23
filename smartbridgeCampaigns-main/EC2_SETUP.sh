#!/bin/bash

# 1. Update the system
sudo apt-get update
sudo apt-get upgrade -y

# 2. Install Docker and Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# 3. Install Git (usually installed, but good to ensure)
sudo apt-get install git -y

# 4. Clone your repository (Replace with your actual repo URL)
# git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
# cd smartbridgeCampaigns

# --- OR --- 
# If you uploaded files manually, just cd into the directory
# cd smartbridgeCampaigns-main

# 5. Create/Edit .env file
cp .env.example .env 2>/dev/null || touch .env
# Open editor to add your secrets (AWS keys, etc.)
# nano .env

# 6. Start the application with Docker
# This builds the app and starts App + DB
docker compose up -d --build

# 7. Initialize the Database Schema (Wait a few seconds for DB to start first)
sleep 10
docker compose exec app npm run db:push

# 8. Create the default Admin User
docker compose exec app npm run db:seed

# Optional: View logs
# docker compose logs -f
