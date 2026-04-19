# NEON XO

> Neon-cyberpunk multiplayer tic-tac-toe. Play with friends online across any device.

![NEON XO](./frontend/public/favicon.svg)

## What's inside

A full real-time multiplayer game platform:

- **Backend**: Node.js 20 + Express + Socket.IO + PostgreSQL + Redis, written in TypeScript
- **Frontend**: React 18 + Vite + Tailwind + Framer Motion, written in TypeScript
- **Auth**: JWT + bcrypt + Redis-backed session registry (single-tab enforcement)
- **Real-time**: Socket.IO with Redis adapter for horizontal scaling
- **i18n**: UZ / RU / EN trilingual UI
- **Sound**: Web Audio synthesized SFX (no audio files shipped)
- **Deploy target**: Railway (single service + Postgres + Redis plugins)

## Feature highlights

- Shareable match link + friend-invite link + username search + in-app invites
- Guest play (link + display name) with no account required
- Registered accounts with stats, match history, global + friends leaderboards
- Board sizes 3×3 / 4×4 / 5×5 with classic N-in-a-row rules
- Single / Best-of-3 / Best-of-5 match formats
- Per-move timer (none / 10s / 30s) that resets each turn
- Coin flip to decide first move, with 3D animation
- Emoji reactions (🔥😂😭👏) during matches
- Neon cyan = P1 (×), magenta = P2 (○)
- Confetti win, dimmed loss, clashing-symbols draw
- Surrender button, rematch flow, disconnect auto-win
- Quick Match (random pairing) for logged-in users
- Full a11y (ARIA, keyboard, screen reader, high-contrast toggle)
- Haptic feedback on mobile + desktop
- Rate limiting (10 req/sec per user), helmet, CORS whitelist, SQL injection prevention
- Nightly cleanup of abandoned matches
- OpenGraph share previews

## Project layout

```
neon-xo/
├── backend/           # Node.js + Express + Socket.IO server
│   ├── src/
│   │   ├── config/    # Env validation
│   │   ├── db/        # Postgres schema, pool, Redis, users/friends/matches
│   │   ├── auth/      # bcrypt, JWT, sessions
│   │   ├── game/      # Pure game engine, match state
│   │   ├── sockets/   # Socket.IO event handlers
│   │   ├── routes/    # HTTP API routes
│   │   ├── middleware/# auth + rate limiting
│   │   └── utils/     # cron jobs
│   └── scripts/       # Build helpers
├── frontend/          # React + Vite SPA
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── store/     # Zustand stores
│   │   ├── lib/       # API client, socket client, sound
│   │   ├── i18n/      # UZ/RU/EN translations
│   │   └── styles/
│   └── public/
├── .github/workflows/ # CI
├── Dockerfile         # Multi-stage production build
├── railway.json       # Railway deployment config
└── .env.example       # All env vars documented
```

## Local development

### Prerequisites

- Node.js 20+
- Postgres 15+ (local or Docker)
- Redis 7+ (local or Docker)

### Setup

```bash
# 1. Clone and install
git clone <your-repo> neon-xo
cd neon-xo
npm install

# 2. Spin up Postgres + Redis (Docker example)
docker run -d --name neonxo-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine
docker run -d --name neonxo-redis -p 6379:6379 redis:7-alpine

# 3. Create the database
docker exec -it neonxo-pg psql -U postgres -c "CREATE DATABASE neonxo;"

# 4. Configure env
cp .env.example .env
# Edit .env — at minimum generate a JWT_SECRET:
#   openssl rand -hex 32

# 5. Run migrations
npm --workspace backend run migrate

# 6. Start dev servers (backend on :3000, frontend on :5173)
npm run dev
```

Open http://localhost:5173

### Running tests

```bash
npm --workspace backend run test        # game engine + match sim
npm --workspace frontend run typecheck  # frontend types
npm run lint                            # all workspaces
```

## Deploy to Railway — step-by-step

This is the walkthrough for a first-time Railway user. No CLI required.

### 1. Push this code to GitHub

```bash
git init
git add .
git commit -m "Initial NEON XO"
git branch -M main
git remote add origin https://github.com/<you>/neon-xo.git
git push -u origin main
```

### 2. Create a Railway project

1. Go to **https://railway.app** and sign in with GitHub.
2. Click **New Project** → **Deploy from GitHub repo**.
3. Authorize Railway to access your GitHub, then select `neon-xo`.
4. Railway will detect the `Dockerfile` and start building. This first build may take 3–5 minutes.

### 3. Add Postgres

1. In your Railway project, click **+ New** → **Database** → **Add PostgreSQL**.
2. Wait for it to provision (about 30 seconds).

### 4. Add Redis

1. Click **+ New** → **Database** → **Add Redis**.
2. Wait for it to provision.

### 5. Connect services via variables

Open your **app service** (the one built from GitHub, not Postgres/Redis), go to the **Variables** tab, and add:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | _generate with `openssl rand -hex 32`_ |
| `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` |
| `REDIS_URL` | `${{ Redis.REDIS_URL }}` |
| `CORS_ORIGIN` | `${{ RAILWAY_PUBLIC_DOMAIN }}` |
| `APP_URL` | `https://${{ RAILWAY_PUBLIC_DOMAIN }}` |
| `JWT_EXPIRES_IN` | `30d` |
| `MATCH_INVITE_EXPIRY_MINUTES` | `60` |
| `ABANDONED_MATCH_CLEANUP_DAYS` | `7` |
| `RATE_LIMIT_WINDOW_MS` | `1000` |
| `RATE_LIMIT_MAX` | `10` |

> Railway's `${{ ... }}` syntax references variables from other services in the same project. When you click a variable's **+ Add Reference** button, you can pick them from a list.

### 6. Generate a public domain

1. In your app service, go to **Settings** → **Networking** → **Generate Domain**.
2. Railway gives you something like `neon-xo-production.up.railway.app`.
3. Copy the domain and paste it back into `CORS_ORIGIN` and `APP_URL` (replacing `${{ RAILWAY_PUBLIC_DOMAIN }}` if you prefer an explicit value).

### 7. Trigger the deploy

Any push to `main` will auto-deploy. The first deploy will:

1. Build the Docker image
2. Run `npm --workspace backend run migrate` on start (creates tables)
3. Start the server
4. Pass the `/api/health` check
5. Go live

### 8. Open your app

Visit `https://<your-domain>.up.railway.app`. First visit shows the language splash.

### 9. Set up a staging environment (optional)

1. Create a `staging` branch: `git checkout -b staging && git push -u origin staging`
2. In Railway, click **Environments** (top of project) → **New Environment** → name it `staging`.
3. In the staging environment, duplicate the app service and change its **Source** branch to `staging`.
4. Also add staging Postgres + Redis plugins in that environment.

Now pushes to `staging` deploy to staging, pushes to `main` deploy to production.

## How the real-time game works

1. **Create match** (HTTP): client calls socket `match:create`; server stores state in Redis + a waiting row in Postgres; responds with a short shareable code.
2. **Share link**: `https://yourapp/match/{code}`.
3. **Join**: second player opens the link. Client emits `match:join`.
4. **Coin flip**: on both players present, status moves to `coin_flip`. P1 triggers `match:coinFlip`, server randomizes, emits result.
5. **Play**: clients emit `match:move` with the cell index. Server validates via the pure game engine, advances state, broadcasts `match:moveMade`.
6. **Round end**: server detects win/draw, emits `match:roundEnd` with the winning line. For BO3/BO5, another round auto-starts after 3s.
7. **Match end**: series winner is determined, `match:finished` emitted, stats updated in Postgres (only when both players are registered).
8. **Disconnect**: opponent auto-wins immediately. Both disconnect = draw.
9. **Rematch**: both players click rematch → board resets, scores zeroed, new coin flip.

## Security posture

- JWT tokens, 30-day expiry, stored in `localStorage`
- bcrypt password hashing (12 rounds)
- Redis session registry — login invalidates any prior session (single-tab/device)
- Parameterized SQL everywhere (no string concat)
- Helmet security headers
- CORS whitelist (configurable)
- Rate limit (10 req/sec per IP, 5 auth attempts/min)
- Zod schema validation on every HTTP body
- Socket auth middleware re-validates session on each connection

## What's not in v1 (by design)

- AI opponent / solo mode
- Spectator mode
- Admin panel (use DB directly)
- Analytics / telemetry
- Push notifications
- Public profile pages
- Block-a-user feature
- Tutorial / onboarding flow
- Email — usernames only
- PWA install (infrastructure is ready, not enabled)

Add them as v2 features with confidence — the architecture supports all of them.

## License

All rights reserved — your project.
