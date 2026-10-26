# Running and deploying

How to run Consultly on your machine, and how the live site is hosted for free. Stripe stays in **test mode** throughout.

## Run it locally

You need Node 22+, Python with [uv](https://docs.astral.sh/uv/), PostgreSQL, and the [Stripe CLI](https://docs.stripe.com/stripe-cli).

1. **Settings.** Copy each `.env.example` to `api/.env`, `ai/.env` and `web/.env.local` (the name Next.js reads), then fill in:
   - `api/.env`: `DATABASE_URL` and the Stripe test keys.
   - `api/.env` (optional): `RESEND_API_KEY`. Without it, sign-in links are printed in the API's console.
   - `ai/.env` (optional): `ANTHROPIC_API_KEY`. Without it, briefs are stored but not summarised, and Help uses Demo answers.
2. **Database:**
   ```bash
   createdb consultly
   cd api && npm install
   npx prisma migrate deploy  # create the tables
   npx prisma db seed         # sample consultants and availability
   ```
3. **Start the four processes**, each in its own terminal:
   ```bash
   cd api && npm run start:dev                                   # API on :4000
   cd ai  && uv sync && uv run uvicorn ai.main:app --port 8000 --reload   # AI service on :8000
   cd web && npm install && npm run dev                          # website on :3000
   stripe listen --forward-to localhost:4000/stripe/webhook \
     --events checkout.session.completed,checkout.session.expired   # Stripe events to your machine
   ```
   `stripe listen` prints a signing secret (`whsec_…`). Put it in `api/.env` as `STRIPE_WEBHOOK_SECRET` and restart the API. If `stripe listen` isn't running, payments succeed on Stripe's side but bookings stay "held" locally, because the webhook never arrives.
4. **Demo sign-in:** set `DEMO_LOGIN=true` in `api/.env` to show **Explore as a client / consultant**.

## Hosting

| Part | Host | Notes |
|---|---|---|
| Website | Vercel | Root directory `web` |
| API | Render (free web service) | From `render.yaml` |
| AI service | Render (free web service) | From `render.yaml` |
| Database, PDF storage | Supabase (free project) | Postgres plus a private `briefs` bucket |

```
Browser ─▶ https://<site>.vercel.app ─/api/*─▶ https://<api>.onrender.com ─▶ Supabase
                                                   │  service token
                                                   ▼
                                              https://<ai>.onrender.com ─▶ Claude
Stripe ── webhook ──▶ https://<api>.onrender.com/stripe/webhook   (straight to the API)
```

### Before you start

- Push the repo to GitHub; all three hosts deploy from it.
- In the Anthropic Console, set a **monthly spend limit** (Settings → Limits). It is the backstop behind the app's own AI caps.

### 1. Supabase

1. Create a project.
2. **Database address:** Connect → **Session pooler**. It works over IPv4, which Render needs. This is `DATABASE_URL`.
3. **Storage:** create a bucket named `briefs` and keep it **Private**.
4. **Keys:** Project Settings → API keys. Copy the project URL (`SUPABASE_URL`) and a **secret** key (`sb_secret_…`, or the legacy `service_role` key) for `SUPABASE_SERVICE_ROLE_KEY`. It bypasses all access rules, so it goes only into the API's settings on Render: never into the website or the repo.
5. **Create the tables and sample data** once, from your machine:
   ```bash
   cd api
   DATABASE_URL="<session pooler address>" npx prisma migrate deploy
   DATABASE_URL="<session pooler address>" npx prisma db seed
   ```
   After this, Render runs `migrate deploy` on every API deploy.

### 2. Render (API and AI service)

1. New → **Blueprint** → choose the repo. Render reads `render.yaml` and proposes:
   - two free services
   - a shared, generated `AI_SERVICE_TOKEN`
2. Fill in the settings marked `sync: false`:
   - **API:**
     - `DATABASE_URL`
     - `WEB_URL` (the Vercel address, from step 3)
     - `AI_URL` (the AI service's address)
     - `STRIPE_SECRET_KEY` (`sk_test_…`)
     - `STRIPE_WEBHOOK_SECRET` (from step 4)
     - `RESEND_API_KEY`
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY`
   - **AI service:**
     - `ANTHROPIC_API_KEY`
     - `API_URL` (the API's address)
3. Deploy, then check that `/health` on both services answers `{"ok":true…}`. `/health/db` on the API also checks the database.

### 3. Vercel (website)

1. Add New → Project → choose the repo, with **Root Directory** set to `web`.
2. Environment variables:
   - `NEXT_PUBLIC_API_URL=/api`
   - `API_INTERNAL_URL=https://<api>.onrender.com`
3. Deploy. Put the site's address in the API's `WEB_URL` on Render and redeploy the API. Stripe's return pages and the emails use it.

### 4. Stripe webhook (test mode)

Online, Stripe needs a public address to send "payment completed" to:

1. Stripe Dashboard, in test mode → Developers → Webhooks → Add endpoint.
2. URL: `https://<api>.onrender.com/stripe/webhook`. It goes straight to Render, not through Vercel.
3. Events: `checkout.session.completed` and `checkout.session.expired`.
4. Copy the endpoint's signing secret into the API's `STRIPE_WEBHOOK_SECRET` on Render, and redeploy.

### 5. Check it works

- Home, Find a consultant, a consultant profile and the FAQ load.
- In My bookings, choose **Explore as a client**. Your demo consultant, Jason, is in Find a consultant with a "Your demo consultant" tag, and **Book your Demo consultant** in the demo bar opens his profile.
- Book Jason with card `4242 4242 4242 4242`. The booking turns "Paid and booked", which proves the webhook works.
- Cancel it from My bookings; the refund appears in Stripe.
- Add a PDF brief: "Reading your brief…" turns into a prep sheet.
- Help with Live AI answers while signed in. Signed out, it asks you to sign in.
- **Viewing as: Consultant** in the demo bar shows the same booking on Jason's dashboard. **Reset demo** puts the sample sessions back.
- `/consultants/does-not-exist` shows the 404 page.

## Day to day

- **Cold starts:** free Render services sleep after 15 idle minutes and take up to a minute to wake. The website tells visitors so.
- **Demo accounts** clean themselves up. To clear every visitor's demo at once:
  ```bash
  cd api && DATABASE_URL=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run reset:demo
  ```
- **AI spending:** `AI_DAILY_CHAT_LIMIT` (200) and `AI_DAILY_BRIEF_LIMIT` (30) on Render, Live AI for signed-in users only, and the Anthropic monthly limit behind both.
- **Email:** without a verified domain, Resend only delivers to the Resend account owner. Visitors use the demo accounts instead; other sends fail quietly and are logged.
- **Supabase** pauses a free project after a week without database activity. The `Database check` GitHub Action (`.github/workflows/database-check.yml`) calls `/api/health/db` every 3 days, which keeps it active, and a failed run emails the repo owner. It can also be run by hand from the Actions tab.
- **Rotating a secret:** change it in the host's settings and redeploy that service. For the shared `AI_SERVICE_TOKEN`, regenerate it in the Render environment group; both services pick it up on redeploy.

## Settings reference

| Service | Setting | Where it comes from |
|---|---|---|
| API | `DATABASE_URL` | Supabase → Connect → Session pooler |
| API | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API keys |
| API | `SUPABASE_BUCKET` | `briefs` (set by `render.yaml`) |
| API | `STRIPE_SECRET_KEY` | Stripe, test mode → API keys |
| API | `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → your endpoint (locally: `stripe listen`) |
| API | `RESEND_API_KEY`, `EMAIL_FROM` | Resend |
| API | `WEB_URL`, `AI_URL` | Your Vercel and AI service addresses |
| API | `DEMO_LOGIN`, `AI_DAILY_CHAT_LIMIT`, `AI_DAILY_BRIEF_LIMIT`, `NODE_ENV` | Set by `render.yaml` |
| API, AI | `AI_SERVICE_TOKEN` | Generated by Render (shared group) |
| AI | `ANTHROPIC_API_KEY` | Anthropic Console |
| AI | `CLAUDE_MODEL` | `claude-haiku-5-5` (set by `render.yaml`) |
| AI | `API_URL` | Your API's address |
| Website | `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL` | Vercel project settings |
