# HustleHub+ as ONE web service (used for Render): the API also serves the built React app.
# The two Dockerfiles in backend/ and frontend/ with docker-compose.yml stay the main local setup.
# Stage 1 builds the React app, stage 2 installs production dependencies only, stage 3 runs the API as the
# unprivileged "node" user and serves the built app from ./public.
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-alpine
ENV NODE_ENV=production \
    USE_HTTPS=false \
    SERVE_FRONTEND=true \
    TRUST_PROXY=1
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY --from=web /web/dist ./public
USER node
# Render sets PORT itself; the API reads it.
EXPOSE 10000
CMD ["node", "src/server.js"]
