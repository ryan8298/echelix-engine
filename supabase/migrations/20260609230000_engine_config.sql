-- Engine configuration — DB-driven so the operator can edit from the web app.
-- One row per config key. Values are JSONB so we can evolve shape per key
-- without further migrations.
create table if not exists public.engine_config (
  key          text primary key,
  value        jsonb not null,
  description  text,
  updated_at   timestamptz not null default now(),
  updated_by   text
);

-- Seed defaults. Re-running this migration is a no-op (do nothing on conflict).
insert into public.engine_config (key, value, description) values
  ('rotation', jsonb_build_object(
    'monday',    'utilities',
    'tuesday',   'oil_and_gas',
    'wednesday', 'distribution_transportation',
    'thursday',  'manufacturing',
    'friday',    'financial_services'
  ), 'Weekday → industry bucket. Loop 2 uses this to pick today''s industry.'),

  ('vertical_map', jsonb_build_object(
    'Power & Utilities',            'utilities',
    'Water & Sewage',               'utilities',
    'Oil & Gas',                    'oil_and_gas',
    'Transport & Travel',           'distribution_transportation',
    'Transport Support Activities', 'distribution_transportation',
    'Discrete Manufacturing',       'manufacturing',
    'Process Manufacturing',        'manufacturing',
    'Industrial Equipment&Machinery','manufacturing',
    'Chemical, Rubber & Plastics',  'manufacturing',
    'Metal',                        'manufacturing',
    'Food & Drink',                 'manufacturing',
    'Banking',                      'financial_services',
    'Commercial Banking',           'financial_services',
    'Credit Unions',                'financial_services',
    'Investment Banking',           'financial_services',
    'Asset Management',             'financial_services',
    'Agents & Brokers',             'financial_services',
    'Insurance',                    'financial_services',
    'Capital Markets',              'financial_services'
  ), 'Source spreadsheet Vertical column → rotation bucket. Verticals not in this map land as ''other'' (status=out_of_rotation, kept for manual selection).'),

  ('revenue_band', jsonb_build_object(
    'lower_usd', 500000000,
    'upper_usd', 5000000000,
    'tiebreaker_pct', 0.1
  ), 'Stage 0 revenue gate band. tiebreaker_pct is the 10% margin around each edge where verdicts route to no_data_review instead of being decided silently.'),

  ('scoring_weights', jsonb_build_object(
    'freshness',   30,
    'relevance',   25,
    'triggers',    20,
    'ms_fit',      15,
    'anti_repeat', 10
  ), 'Loop 2 scoring weights. Must sum to 100.'),

  ('quality_floor', jsonb_build_object(
    'min_freshness', 0.4,
    'min_relevance', 0.3
  ), 'Loop 2 floor: accounts must clear both to be eligible. If fewer than top-N clear, surface fewer (no padding).'),

  ('cooldown_days', to_jsonb(30),
    'Days after last_surfaced_date before an account is eligible again.')
on conflict (key) do nothing;

-- updated_at trigger
drop trigger if exists engine_config_set_updated_at on public.engine_config;
create trigger engine_config_set_updated_at  before update on public.engine_config
  for each row execute function public.tg_set_updated_at();

-- RLS: only service role can read/write for now (service-role bypasses).
alter table public.engine_config enable row level security;
