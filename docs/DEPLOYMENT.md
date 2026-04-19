# Deploying NEON XO to Railway

This is your step-by-step walkthrough. You don't need any CLI tools — everything is done in the Railway web dashboard.

## Prerequisites

- A GitHub account
- The NEON XO code pushed to a GitHub repository
- A Railway account (sign up free at https://railway.app)

## Step 1 — Push the code to GitHub

From inside your unzipped `neon-xo` folder:

```bash
git init
git add .
git commit -m "Initial NEON XO"
git branch -M main
```

On GitHub, create a new empty repository named `neon-xo`. Then:

```bash
git remote add origin https://github.com/<your-username>/neon-xo.git
git push -u origin main
```

## Step 2 — Create a Railway project

1. Go to **https://railway.app** and click **Login** → sign in with GitHub.
2. Click **New Project**.
3. Select **Deploy from GitHub repo**.
4. If it's your first time, click **Configure GitHub App** and grant Railway access to your `neon-xo` repo.
5. Back on Railway, select the `neon-xo` repo from the list.

Railway will detect the `Dockerfile` and start building. The first build takes 3–5 minutes.

## Step 3 — Add PostgreSQL

1. In your Railway project (you'll see a canvas with one service so far), click the **+ New** button (top-right).
2. Choose **Database** → **Add PostgreSQL**.
3. Wait ~30 seconds. A new Postgres service appears on the canvas.

## Step 4 — Add Redis

1. Click **+ New** again.
2. Choose **Database** → **Add Redis**.
3. Wait ~30 seconds.

You now have three services: your app, Postgres, and Redis.

## Step 5 — Configure environment variables

Click your **app service** (the one built from GitHub). Open the **Variables** tab.

Add each of these by clicking **+ New Variable**:

**Auto-referenced (click "Add Reference" to link):**

| Key | Value |
|---|---|
| `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}` |
| `REDIS_URL` | `${{ Redis.REDIS_URL }}` |

**Plain values (type them in):**

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_EXPIRES_IN` | `30d` |
| `MATCH_INVITE_EXPIRY_MINUTES` | `60` |
| `ABANDONED_MATCH_CLEANUP_DAYS` | `7` |
| `RATE_LIMIT_WINDOW_MS` | `1000` |
| `RATE_LIMIT_MAX` | `10` |

**Generate a strong JWT secret:**

On your local terminal, run:

```bash
openssl rand -hex 32
```

Copy the 64-character hex string. Add:

| Key | Value |
|---|---|
| `JWT_SECRET` | _(paste your 64-char hex string)_ |

## Step 6 — Generate a public domain

1. Still on your app service, go to **Settings** → **Networking**.
2. Click **Generate Domain**.
3. Railway gives you something like `neon-xo-production-abc1.up.railway.app`. Copy it.

## Step 7 — Set the CORS and APP_URL variables

Go back to **Variables** and add:

| Key | Value |
|---|---|
| `CORS_ORIGIN` | `https://<your-domain>.up.railway.app` |
| `APP_URL` | `https://<your-domain>.up.railway.app` |

Paste the exact domain you just generated (no trailing slash).

## Step 8 — Wait for the deploy

Railway should automatically redeploy now that env vars are in place. Watch the **Deployments** tab:

1. **Build** — ~3 minutes. Dockerfile builds the frontend, then backend, then produces the final image.
2. **Deploy** — ~30 seconds. Migrations run (`node backend/dist/db/migrate.js`), then the server starts.
3. **Live** — once `/api/health` returns `ok`, your app is publicly accessible.

## Step 9 — Open your app

Visit your Railway domain: `https://<your-domain>.up.railway.app`

On first visit you'll see the language splash. Pick a language and you're in.

**Test it end-to-end:**
1. Click "Play as Guest", pick a name, click Continue.
2. Click "Play with a Friend", configure the match, create it.
3. Copy the match link and open it in another browser (or incognito tab).
4. Join as another guest — the match begins.

## Step 10 — Set up staging (optional but recommended)

Staging lets you test changes before promoting to production.

1. Create a `staging` branch locally:
   ```bash
   git checkout -b staging
   git push -u origin staging
   ```

2. In Railway, click the **environment** dropdown at the top (default: `production`).
3. Click **New Environment** → name it `staging`.
4. In the new staging environment, click **+ New** → **GitHub Repo** → select `neon-xo` → set **Deploy Branch** to `staging`.
5. Add a separate Postgres and Redis to this environment.
6. Copy over the same env variables (except generate a new `JWT_SECRET`).
7. Generate a new domain.

Now pushes to `main` deploy to production; pushes to `staging` deploy to staging.

## Future changes

Any `git push` to `main` will auto-deploy.

## Troubleshooting

### "Invalid environment configuration" on deploy
One of the required env variables is missing or malformed. Check the **Deployments → Logs** tab — the error names the missing/invalid key.

### "DATABASE_URL is required"
The `${{ Postgres.DATABASE_URL }}` reference didn't resolve. Make sure the Postgres service is in the same environment as the app service, and the variable reference is typed exactly as shown.

### Postgres "SSL required" error
Already handled — the pool enables SSL in production. If you see this anyway, it means `NODE_ENV` isn't set to `production`.

### "Too many requests"
You're hitting the rate limit (10 req/sec per IP). Normal usage won't trigger this. If testing aggressively, temporarily raise `RATE_LIMIT_MAX`.

### Socket keeps disconnecting
Railway's free tier has no sleep behavior for web services, but older Hobby projects might. Upgrade to the Developer plan or ensure your service isn't sleeping.

### Database migrations didn't run
The start command runs `node backend/dist/db/migrate.js` before the server. Check logs — you should see `✅ Migrations applied successfully`. If not, confirm `DATABASE_URL` is correct.

## Cost estimate

Railway's Hobby plan is $5/month (covers small traffic). Estimated consumption for a few hundred concurrent users:

- App service: ~$2–4/month
- Postgres: ~$1–3/month
- Redis: ~$1–2/month

Total: **$5–10/month for hobby scale.**

## Custom domain (optional)

1. Settings → Networking → Custom Domain → enter `play.yourdomain.com`.
2. Railway shows you a CNAME target.
3. Add a CNAME record in your DNS: `play` → `<railway-target>.railway.app`.
4. Railway will provision an SSL cert automatically within a few minutes.

Done. Update `CORS_ORIGIN` and `APP_URL` to point to the custom domain.
