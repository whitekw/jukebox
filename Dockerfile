FROM node:24-bookworm-slim AS build-base

ARG NPM_VERSION=11.6.2
RUN npm install --global npm@${NPM_VERSION}

FROM build-base AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM build-base AS backend-dependencies

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3001 \
    DATABASE_PATH=/app/data/jukebox.sqlite

WORKDIR /app/backend

COPY --from=backend-dependencies --chown=node:node /app/backend/node_modules ./node_modules
COPY --chown=node:node backend/package.json ./package.json
COPY --chown=node:node backend/src ./src
COPY --from=frontend-build --chown=node:node /app/frontend/dist /app/frontend/dist

RUN mkdir -p /app/data && chown node:node /app/data

USER node
EXPOSE 3001
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
