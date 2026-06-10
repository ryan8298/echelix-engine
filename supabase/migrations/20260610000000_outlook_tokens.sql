-- Outlook OAuth tokens, single row per user email.
create table if not exists public.outlook_tokens (
  user_email     text primary key,
  refresh_token  text not null,
  access_token   text,
  expires_at     timestamptz,
  scopes         text,
  connected_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists outlook_tokens_set_updated_at on public.outlook_tokens;
create trigger outlook_tokens_set_updated_at  before update on public.outlook_tokens
  for each row execute function public.tg_set_updated_at();

alter table public.outlook_tokens enable row level security;
-- Service-role only.
