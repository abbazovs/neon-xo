# ---------- Frontend build ----------
FROM node:20-alpine AS frontend-builder
WORKDIR /app

COPY package.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
ENV NPM_CONFIG_IGNORE_SCRIPTS=true
RUN npm install --workspaces --include-workspace-root --no-audit --no-fund

COPY frontend ./frontend
RUN npm --workspace frontend run build

# ---------- Backend build ----------
FROM node:20-alpine AS backend-builder
WORKDIR /app

COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
ENV NPM_CONFIG_IGNORE_SCRIPTS=true
RUN npm install --workspaces --include-workspace-root --no-audit --no-fund

COPY backend ./backend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN npm --workspace backend run build

# ---------- Runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm install --workspace backend --omit=dev --no-audit --no-fund

COPY --from=backend-builder /app/backend/dist ./backend/dist

EXPOSE 3000
CMD ["sh", "-c", "node backend/dist/db/migrate.js && node backend/dist/index.js"]
