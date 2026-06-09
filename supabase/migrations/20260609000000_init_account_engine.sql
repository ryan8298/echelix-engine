-- Echelix Account Engine — initial schema (Step 1)
-- Tables: accounts, signals, briefs, outreach, run_log
-- Storage bucket: briefs

-- Extensions
create extension if not exists "pgcrypto";

-- ---------- accounts ----------
create table if not exists public.accounts (
  id                   uuid primary key default gen_random_uuid(),
  tpid                 bigint unique,                 -- Microsoft TPID (source of truth from Excel)
  company_name         text not null,
  ticker               text,
  domain               text,
  industry             text,                          -- normalized rotation bucket OR 'other'
  source_industry      text,                          -- raw Industry value from source
  source_vertical      text,                          -- raw Vertical value from source (drives normalization)
  assigned_weekday     text generated always as (
    case industry
      when 'utilities'                    then 'monday'
      when 'oil_and_gas'                  then 'tuesday'
      when 'distribution_transportation'  then 'wednesday'
      when 'manufacturing'                then 'thursday'
      when 'financial_services'           then 'friday'
      else null
    end
  ) stored,
  tier                 text not null default 'cold' check (tier in ('hot','warm','cold')),
  hq_location          text,
  hq_address           text,
  hq_city              text,
  hq_state             text,
  hq_zip               text,
  microsoft_team       jsonb,                         -- preserved MS account team contacts
  last_researched      timestamptz,
  score                numeric,
  last_surfaced_date   date,
  surface_count        int not null default 0,
  status               text not null default 'pending'
    check (status in ('active','paused','closed','do_not_contact','out_of_range','out_of_rotation','pending')),
  annual_revenue_usd   numeric,
  revenue_metric       text check (revenue_metric in ('10k_annual','ttm','estimate')),
  revenue_confidence   text check (revenue_confidence in ('audited','estimated','unverified')),
  revenue_as_of        date,
  revenue_verdict      text check (revenue_verdict in ('in_range','out_of_range','no_data_review')),
  revenue_source_url   text,
  is_subsidiary        boolean default false,
  parent_company       text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists accounts_industry_status_idx on public.accounts (industry, status);
create index if not exists accounts_weekday_status_idx  on public.accounts (assigned_weekday, status);
create index if not exists accounts_score_idx           on public.accounts (score desc nulls last);
create index if not exists accounts_last_surfaced_idx   on public.accounts (last_surfaced_date);
create index if not exists accounts_tier_idx            on public.accounts (tier);

-- ---------- signals ----------
create table if not exists public.signals (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.accounts(id) on delete cascade,
  signal_type     text not null check (signal_type in
    ('news','10k','10q','job_posting','tech_stack','leadership','earnings','other')),
  signal_date     date,                               -- when the event happened (drives freshness)
  headline        text,
  detail          text,
  source_url      text,
  relevance_tags  text[] default '{}',
  captured_at     timestamptz not null default now() -- when Loop 1 wrote it
);

create index if not exists signals_account_idx       on public.signals (account_id);
create index if not exists signals_account_date_idx  on public.signals (account_id, signal_date desc);
create index if not exists signals_tags_idx          on public.signals using gin (relevance_tags);

-- ---------- briefs ----------
create table if not exists public.briefs (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts(id) on delete cascade,
  brief_date    date not null,
  status        text not null default 'draft' check (status in ('draft','reviewed','sent')),
  markdown_path text,                                 -- supabase storage path
  pdf_path      text,                                 -- supabase storage path
  score_at_pick numeric,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (account_id, brief_date)
);

create index if not exists briefs_date_status_idx on public.briefs (brief_date, status);

-- ---------- outreach ----------
create table if not exists public.outreach (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  brief_id     uuid references public.briefs(id) on delete set null,
  channel      text not null check (channel in ('microsoft','prospect')),
  recipient    text,
  subject      text,
  body         text,
  status       text not null default 'draft' check (status in ('draft','approved','sent','failed')),
  sent_at      timestamptz,
  external_id  text,                                  -- gmail message id, etc.
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists outreach_account_idx on public.outreach (account_id);
create index if not exists outreach_status_idx  on public.outreach (status);

-- ---------- run_log ----------
create table if not exists public.run_log (
  id              uuid primary key default gen_random_uuid(),
  loop_name       text not null,                     -- 'stage0_gate','loop1_enrich','loop2_select','loader', etc.
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running' check (status in ('running','ok','error','partial')),
  accounts_touched int,
  details         jsonb,                             -- counts, errors, shortfall flags, etc.
  error_message   text
);

create index if not exists run_log_loop_started_idx on public.run_log (loop_name, started_at desc);

-- ---------- updated_at triggers ----------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at  before update on public.accounts  for each row execute function public.tg_set_updated_at();
drop trigger if exists briefs_set_updated_at on public.briefs;
create trigger briefs_set_updated_at    before update on public.briefs    for each row execute function public.tg_set_updated_at();
drop trigger if exists outreach_set_updated_at on public.outreach;
create trigger outreach_set_updated_at  before update on public.outreach  for each row execute function public.tg_set_updated_at();

-- ---------- storage bucket for briefs ----------
insert into storage.buckets (id, name, public)
values ('briefs', 'briefs', false)
on conflict (id) do nothing;

-- ---------- RLS ----------
-- Single-operator engine; service role bypasses RLS, anon has no access.
alter table public.accounts enable row level security;
alter table public.signals  enable row level security;
alter table public.briefs   enable row level security;
alter table public.outreach enable row level security;
alter table public.run_log  enable row level security;
-- (No policies yet → only service role can read/write. UI auth added in step 6.)
