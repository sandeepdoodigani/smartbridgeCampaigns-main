# Deploying with Docker

This guide explains how to deploy the fully Dockerized application. This method is easier to manage as it bundles the application and its environment together.

## Prerequisites

-   Docker and Docker Compose installed on your server (or local machine).
-   Use the provided `docker-compose.yml` and `Dockerfile`.

## Step 1: Prepare Environment

1.  Create or update your `.env` file with production credentials (AWS keys, etc.).
    *   **Note**: You do NOT need to change `DATABASE_URL` for Docker. The `docker-compose.yml` automatically sets it to connect to the internal database container.

## Step 2: Build and Start

Run the following command to build the image and start the containers in the background:

```bash
docker-compose up -d --build
```

This will:
1.  Build the Node.js application image.
2.  Start the Postgres database.
3.  Start the Application connected to the database.

## Step 3: Initialize Database

On the **first run**, you need to push the database schema to the new Postgres container:

```bash
docker-compose exec app npm run db:push
```

## Step 4: Verify

The application should now be running on port 5000.
Visit: `http://localhost:5000` (or your server IP).

## Managing the App

-   **View Logs**: `docker-compose logs -f`
-   **Stop**: `docker-compose down`
-   **Restart**: `docker-compose restart`
-   **Access App Shell**: `docker-compose exec app /bin/sh`

## Production Configuration (Optional)

To serve on Port 80 (standard HTTP) instead of 5000:
1.  Open `docker-compose.yml`.
2.  Change ports under `app`:
    ```yaml
    ports:
      - "80:5000"
    ```
3.  Restart: `docker-compose up -d`
