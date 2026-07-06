-- Prospect intake runs: every /api/intake result is saved here (latest per
-- domain), so intake work survives the browser tab. Applied 2026-07-06.
create table if not exists public.prospect_intakes (
  id bigint generated always as identity primary key,
  domain text not null unique,
  tier text,
  profile jsonb,
  signals jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.prospect_intakes enable row level security;
-- no public policies: only the service-role key (server-side) touches this table
create index if not exists prospect_intakes_updated_idx on public.prospect_intakes (updated_at desc);
