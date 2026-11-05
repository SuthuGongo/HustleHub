# HustleHub+ API image.
# Two stages: the first installs production dependencies only (no test or lint tools, and no install
# scripts, so no package can run code while the image is built); the second copies just what the API needs
# and runs it as the unprivileged "node" user.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-alpine
ENV NODE_ENV=production \
    USE_HTTPS=false \
    PORT=5000
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY scripts ./scripts
USER node
EXPOSE 5000
# Marks the container unhealthy (and holds back the web container) until the API answers.
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD wget -qO- http://127.0.0.1:5000/api/health || exit 1
CMD ["node", "src/server.js"]
