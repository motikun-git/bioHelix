# BioHelix portal: one container that runs the API and serves the React app.
# Works on Northflank, Render, Railway, a VPS: anything that runs Docker.

# ---------- 1. Build ----------
FROM node:22-alpine AS build
WORKDIR /app

# Install packages first so Docker can reuse this layer when only code changes
COPY server/package.json server/package-lock.json server/
COPY client/package.json client/package-lock.json client/
RUN npm ci --prefix server --omit=dev && npm ci --prefix client

COPY server server
COPY client client
RUN npm run build --prefix client

# ---------- 2. Run ----------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=5000
WORKDIR /app

COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/client/dist ./client/dist

# Don't run as root inside the container
USER node
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

CMD ["node", "server/src/index.js"]
