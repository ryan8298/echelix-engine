# Echelix Account Engine

Automated daily account research + GTM engine for Echelix's Microsoft co-sell motion. Architecture in `docs/blueprint.md` (TBD — see `Echelix_Account_Engine_Blueprint.md` for now).

## Status

**Step 1 — Account store + Excel loader.** Schema is live; loader normalizes industry from the source Vertical column and reports unmapped rows. Nothing intelligent yet.

## Monorepo

```
apps/
  web/        Next.js — Loop 3 review UI (placeholder)
  workers/    Node CLI — headless loops (Stage 0 gate, Loops 1 & 2), scripts
packages/
  db/         Supabase client + generated types
  core/       Domain logic (scoring, ACR sizing, industry mapping)
  connectors/ FactSet / Apollo / Drive / Gmail / Bright Data adapters
  brief/      Wrapper around the existing brief skill
supabase/
  migrations/ Versioned SQL
scripts/      One-shots (none yet — loader lives in apps/workers)
```

## Local setup

```bash
corepack enable                    # or npm i -g pnpm@9
pnpm install
cp .env.example .env               # then paste keys
pnpm db:push                       # push migrations to linked Supabase project
pnpm load:accounts -- --dry-run    # preview the load
pnpm load:accounts                 # commit rows
```

## Deploy flow ("push to GitHub")

`git push origin main` triggers:
- **Vercel** auto-builds `apps/web` (via Vercel's GitHub integration).
- **GitHub Actions** (`.github/workflows/deploy.yml`) runs typecheck + applies any new Supabase migrations via `supabase db push` using stored secrets.

Secrets configured in the GitHub repo:
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF` (`jghrajxbjktlryossrmk`)
