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
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# cache-bust: 20260419-v4

COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm install --workspace backend --omit=dev --no-audit --no-fund

COPY --from=backend-builder /app/backend/dist ./backend/dist

EXPOSE 8080
CMD ["node", "-e", "const fs=require('fs'),http=require('http');const p=parseInt(process.env.PORT||'8080');fs.writeSync(1,'[DIAG] port='+p+' starting\\n');http.createServer((q,r)=>{fs.writeSync(1,'[DIAG] req '+q.url+'\\n');r.writeHead(200);r.end('NEON-XO ALIVE port='+p+'\\n')}).listen(p,'0.0.0.0',()=>fs.writeSync(1,'[DIAG] listening on 0.0.0.0:'+p+'\\n'))"]
