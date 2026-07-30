# --- STAGE 1: BUILD ---
FROM node:22-alpine AS builder

WORKDIR /app

# Install build tools if native modules need compiling
RUN apk add --no-cache python3 make g++

# Copy dependency files
COPY package*.json ./

# Install dependencies (including devDependencies for compiling)
# Note: repo has no package-lock.json, so use `npm install` (not `npm ci`).
RUN npm install

# Copy the rest of the application files
COPY tsconfig.json vite.config.ts index.html metadata.json ./
COPY public/ ./public/
COPY src/ ./src/
COPY server.ts ./
COPY server/ ./server/

# Build client bundle and compile server script
RUN npm run build

# Remove development dependencies to keep output tiny
RUN npm prune --production

# --- STAGE 2: PRODUCTION ---
FROM node:22-alpine AS runner

WORKDIR /app

# Runtime library required by the native better-sqlite3 addon (compiled with g++).
RUN apk add --no-cache libstdc++

# Create a directory to store persistent data (database + backups)
RUN mkdir -p /app/data && chown -R node:node /app/data

# Version metadata baked at build time (CI passes the git SHA + timestamp).
# Falls back to "dev" for a plain local `docker compose up --build`.
ARG APP_VERSION=dev
ARG GIT_SHA=
ARG BUILD_TIME=
ENV APP_VERSION=$APP_VERSION
ENV GIT_SHA=$GIT_SHA
ENV BUILD_TIME=$BUILD_TIME

# Set environment
ENV NODE_ENV=production
ENV PORT=3002

# Copy necessary production files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Expose port 3002 for container routing.
EXPOSE 3002

# Run container as non-root user for security
USER node

# Start full-stack system
CMD ["npm", "start"]
