# Fieldbook

Internal tool for managing teleoperation data-collection tasks: venues, scenes (with photos), tasks and their versions, props and rigs.

**How it fits with the operator tool:** you create a task here and mark it **Ready** (or switch on "Ready for operators" when you create it). Your existing operator tool fetches Ready tasks from `GET /api/v1/tasks` using a rig API key, and can report sessions and episodes back so progress shows up here. See [docs/API.md](docs/API.md).

- **Stack:** Next.js 15 (App Router, TypeScript strict), Tailwind CSS + shadcn/ui, Supabase (Postgres, Auth, Storage, Realtime), Zod, sharp, Recharts.
- **Security model:** email + password sign-in with open sign-up (new accounts are view-only), Row-Level Security on every table, private photo bucket with 5-minute signed URLs, EXIF/GPS stripped on upload, hashed and revocable rig API keys. See [Security](#security).
- **Docs:** [Episode API](docs/API.md) · [Python client](clients/python/README.md) · [5-minute demo script](docs/DEMO_SCRIPT.md)

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20.9+ (tested on 24) | |
| pnpm | 12 (via `corepack enable`) | `packageManager` is pinned in `package.json` |
| Docker Desktop | running | Needed by the local Supabase stack |
| Python | 3.8+ | Only for the Python client |

The Supabase CLI is a dev dependency, so run it as `pnpm supabase …`; no global install is needed.

## Local setup

```bash
pnpm install
pnpm exec playwright install chromium          # only for e2e tests

pnpm db:start                                  # local Supabase in Docker; applies supabase/migrations
pnpm supabase status -o env                    # prints the local URL and keys
cp .env.example .env.local                     # then fill in the three Supabase values from the line above
```

`.env.local` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the `ANON_KEY` value) and `SUPABASE_SERVICE_ROLE_KEY` (the `SERVICE_ROLE_KEY` value). Keep `DEMO_ANONYMIZE=true` if the screen may be shared.

### Seed and import

Put the spreadsheet at `data/tasks.xlsx` (`data/` is gitignored), then:

```bash
pnpm demo:setup
```

This runs three idempotent steps, which you can also run one at a time:

| Command | What it does |
|---|---|
| `pnpm seed` | Demo users (one per role), 3 rigs, and an API key for the simulator, written to `.env.local` as `FIELDBOOK_API_KEY` |
| `pnpm import:xlsx` | Imports a **curated demo subset** (~40 tasks, 9 scenes). Add `--all` to import every row and `--no-photos` to skip images. Prints a summary report |
| `pnpm seed:episodes` | Venue assignments plus 14 days of synthetic episode history for the charts. `--reset` regenerates it |

Start the app:

```bash
pnpm dev                                       # http://localhost:3000
```

**Signing in locally:** use any demo account below with the password **`Fieldbook2026`** (local demo data only). Or click **Create account** and sign up with your own email; new accounts are viewers. To make your own account an admin:

```bash
pnpm make-admin you@gmail.com
```

| Email | Role | Sees |
|---|---|---|
| `admin@example.com` | admin | everything, including users, rigs and API keys |
| `designer@example.com` | designer | all venues; creates and edits tasks, scenes and props |
| `operator@example.com`, `jordan@example.com` | operator | assigned venues; uploads photos and records feasibility results |
| `contractor@example.com` | operator (contractor) | Office Site A only |
| `viewer@example.com` | viewer | Showroom B only, read-only |

### Spreadsheet import rules

- **Tasks** and **Ready to Go** are merged and deduped by normalized instruction. Rows found in Ready to Go are imported as `ready`; rows with Done = 1 become `done` (with a synthetic target).
- A non-empty "Scene description" starts a new scene. The rows below it belong to that scene until the next description. Rows before any description go to a scene called "General". Descriptions that read like comments ("lid needs to be light…") are kept as feasibility notes instead.
- Feasibility comments containing "impossible"/"infeasible" give `infeasible`; "concern"/"needs testing" give `feasibility_test`. The raw text goes into `feasibility_notes`.
- A note like "NEW ITERATION: \<new instruction\>" creates version 2 of the task, with the note as the change reason. Ambiguous notes stay as notes.
- Props: segments are split on `|`; a `Scene:` prefix means at the scene, `Buy:` means to buy. Items are split on commas, and a leading number is the quantity.
- Embedded images are mapped to their anchor row's scene through `xl/drawings` and processed by the same sharp pipeline as uploads. Unmapped images go to an "Unsorted" scene, where a designer can move them. In-cell images (`xl/richData`) are detected and reported.

## Scripts

| Command | |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | App |
| `pnpm typecheck` · `pnpm lint` · `pnpm test` | TypeScript, ESLint, Vitest unit tests |
| `pnpm test:rls` | pgTAP tests for RLS policies (`supabase/tests`) |
| `pnpm test:e2e` | Playwright: sign-up and sign-in, role safety, admin flows, upload with EXIF check, versioning, Ready → API feed, live dashboard |
| `pnpm make-admin <email>` | Promotes an existing account to admin |
| `pnpm check:bundle` | After `pnpm build`: fails if any server secret appears in `.next/static` |
| `pnpm simulate` | Simulated rig posting episodes through the real API (see the demo script) |
| `pnpm db:reset` | Wipes the local DB and re-applies migrations (run `pnpm demo:setup` again afterwards) |
| `pnpm db:types` | Regenerates `src/lib/database.types.ts` from the schema |

Python client tests: `cd clients/python && python -m unittest test_fieldbook_client`.

## Project layout

```
src/app/(auth)/            sign in / create account (email + password)
src/app/(app)/             signed-in app: dashboard, tasks, venues, shopping, admin
src/app/api/v1/            Episode API (rig Bearer keys)
src/app/api/upload/        photo upload (sharp re-encode, EXIF strip, thumbnails)
src/lib/                   auth, Supabase clients, validation (Zod), status workflow, photos, import rules
src/middleware.ts          session on every route, inactive users signed out, per-request CSP nonce
supabase/migrations/       schema, triggers, RLS policies, RPCs
supabase/tests/            RLS tests
scripts/                   seed, import, synthetic history, simulator, bundle check
clients/python/            requests-only client with an offline queue
```

---

## Security

| Control | Where |
|---|---|
| Email + password sign-in; open sign-up; passwords need 8+ characters with letters and digits. Sign-in errors don't reveal whether an account exists | `supabase/config.toml`, `src/app/(auth)/login` |
| Roles come only from server-set `app_metadata`, never from user-supplied sign-up data, so every self-signup is a viewer with no venues (it sees nothing until an admin grants access). Covered by RLS and e2e tests | `private.handle_new_user()`, `private.handle_user_app_metadata()` |
| RLS on every table, deny by default, covered by 37 pgTAP tests (cross-venue reads, viewer writes, self-assigned roles, forged versions, anon access, deactivated users) | `supabase/migrations/*_rls_policies.sql`, `supabase/tests/database/rls.test.sql` |
| Service-role key only in server code (`server-only` guard), verified by `pnpm check:bundle` | `src/lib/supabase/admin.ts` |
| Private `scene-photos` bucket with no client policies; 5-minute signed URLs issued after an RLS-checked query | `src/lib/signed-urls.ts` |
| Uploads: origin check, type and size validation, re-encoding with sharp (drops EXIF/GPS), 400px thumbnail | `src/app/api/upload/route.ts`, `src/lib/photos.ts` |
| Headers: per-request nonce CSP, HSTS, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, nosniff; `robots.txt` disallows all; no third-party analytics or font CDNs (fonts are bundled) | `next.config.ts`, `src/lib/csp.ts` |
| Rig keys: `rig_<prefix>_<secret>`, stored as SHA-256, shown once, constant-time comparison, revocable, `last_used_at` tracked, 60 requests/min per key (Postgres) | `src/lib/api-keys.ts`, `src/lib/api/rig-auth.ts` |
| Deactivation is immediate: profile set inactive (RLS and middleware), auth ban, all sessions and refresh tokens revoked | `src/app/(app)/admin/actions.ts`, `admin_revoke_sessions()` |
| Audit log on every write to business tables (admin read-only) | `private.audit_row()` |
| 12-hour inactivity session timeout | `supabase/config.toml` (`[auth.sessions]`) |

---

## Deploy runbook (Supabase Cloud + Vercel)

> These steps create cloud resources and send real email. Do them yourself, or confirm before an agent does them.

### 1. Supabase project

1. Create an organization (Pro plan, needed for daily backups and session controls) and a project in a **US region**. Save the database password in a password manager.
2. Link the repo and push migrations:
   ```bash
   pnpm supabase login
   pnpm supabase link --project-ref <project-ref>
   pnpm supabase db push
   ```
3. **Authentication → Sign In / Providers → Email:** enabled, and **"Allow new users to sign up" on**. Set the minimum password length to 8 and require letters and digits. Turn on **leaked password protection** (Pro).
   - **"Confirm email":** if it's on, new users must click a link before signing in, which needs working email (step 7). If it's off, sign-up works immediately; new accounts are still view-only.
4. **Authentication → Sessions** (Pro): set the inactivity timeout to **12 hours**.
5. **Authentication → URL Configuration:** set Site URL to `https://<your-domain>` and add `https://<your-domain>/**` to Redirect URLs. Confirmation links come back to `/auth/confirm`.
6. **Authentication → Rate Limits:** keep the sign-up and sign-in limits low (bots will find an open sign-up page).
7. **Custom SMTP** (needed only if "Confirm email" is on): set up Resend or Postmark, verify your domain (SPF/DKIM), and enter the SMTP settings under **Authentication → Emails → SMTP Settings**.
9. **Storage:** the `scene-photos` bucket is created by migration as **private**. Confirm it isn't public.
10. **Database → Backups:** confirm daily backups are on. Optionally add Point-in-Time Recovery. Test a restore once.

### 2. Vercel (CLI, no GitHub integration needed)

```bash
pnpm dlx vercel@latest login
pnpm dlx vercel@latest link                      # create a project under your team
```

Add these environment variables (Production and Preview). Paste values directly into Vercel, never into chat or code:

| Variable | Value | Exposed to browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | yes (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the project's anon / publishable key | yes (public; RLS protects data) |
| `NEXT_PUBLIC_APP_NAME` | `Fieldbook` (or another neutral name) | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | the service-role / secret key | **no**, server only |
| `SITE_URL` | `https://<your-domain>` | no |
| `APP_TIMEZONE` | e.g. `America/Los_Angeles` | no |
| `API_RATE_LIMIT_PER_MINUTE` | `60` | no |

```bash
pnpm dlx vercel@latest env add SUPABASE_SERVICE_ROLE_KEY production   # repeat for each variable
pnpm dlx vercel@latest deploy --prod
```

Then in the Vercel dashboard:

1. **Domains:** attach a neutral domain (with 2FA on the registrar account).
2. **Settings → Deployment Protection:** enable Vercel Authentication for **Preview** deployments.
3. **Firewall → Rules:** add a rate-limit rule for `/api/v1/*` (e.g. 120 requests/minute per IP). This is in addition to the per-key limit in the app.
4. **Analytics / Speed Insights:** leave **off** (no third-party analytics).

Verify the deploy:

```bash
curl -sI https://<your-domain>/login | grep -iE "content-security|x-robots|strict-transport"
curl -s https://<your-domain>/robots.txt
```

### 3. First admin and go-live

1. Open the app, click **Create account**, and sign up with your own email.
2. Make yourself admin: in Supabase **Table Editor → profiles**, set your `role` to `admin`. Or run `pnpm make-admin you@gmail.com` with the production env values.
3. **Admin → Users:** promote teammates who signed up, or **Add user** with a starting password. Assign venues to operators and viewers.
4. **Admin → Rigs & API keys:** create one rig per recording station and one key per PC. Copy each key once into that PC's `FIELDBOOK_API_KEY`.
5. Import data against production only deliberately: put the production values in a separate env file and run `pnpm import:xlsx --all`.

### 4. Accounts checklist

- [ ] 2FA on GitHub, Vercel and Supabase accounts (the app itself uses passwords only)
- [ ] DPAs accepted with Vercel and Supabase
- [ ] Private GitHub repo with branch protection, secret scanning and Dependabot
- [ ] One database restore tested
