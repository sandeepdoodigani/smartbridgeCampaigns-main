FROM node:20-slim AS builder

WORKDIR /app

# Install standard dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build the application
RUN npm run build

# Production image
FROM node:20-slim

WORKDIR /app

# Install production dependencies
COPY package*.json ./
# We install all dependencies (including dev) to allow running 'npm run db:push' for convenience
# In a strict production environment, you might separate this.
RUN npm ci

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/db ./db
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/tsconfig.json ./

# Expose port
EXPOSE 5000
# Create admin user and start
CMD ["sh", "-c", "npm run db:push && npm run create-admin && npm run start"]
