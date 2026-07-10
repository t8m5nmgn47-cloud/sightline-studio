-- Sightline Business Intelligence foundation
-- Run in the Sightline Supabase project SQL editor before enabling BI ingestion.
-- The application accesses these tables only from server-side functions using
-- the service-role key; RLS is enabled and no public policies are created.

create extension if not exists pgcrypto;

create table if not exists public.bi_observations (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null,
  entity_name text,
  metric text not null,
  value_numeric double precision,
  value_text text,
  observed_at timestamptz not null default now(),
  source text not null,
  dimensions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bi_observations_entity_metric_time_idx
  on public.bi_observations (entity_key, metric, observed_at desc);
create index if not exists bi_observations_time_idx
  on public.bi_observations (observed_at desc);

create table if not exists public.bi_events (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  channel text,
  campaign_id text,
  offer_id text,
  creative_id text,
  customer_ref text,
  local_weekday text,
  local_hour smallint check (local_hour is null or (local_hour >= 0 and local_hour <= 23)),
  value_numeric double precision,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bi_events_entity_time_idx
  on public.bi_events (entity_key, occurred_at desc);
create index if not exists bi_events_campaign_idx
  on public.bi_events (entity_key, campaign_id)
  where campaign_id is not null;
create index if not exists bi_events_analysis_idx
  on public.bi_events (entity_key, event_type, channel, offer_id, local_weekday);

create table if not exists public.bi_insights (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null,
  insight_type text not null check (insight_type in ('repeat', 'fix', 'test', 'watch')),
  headline text not null,
  body text,
  recommendation text,
  confidence text not null default 'low' check (confidence in ('low', 'medium', 'high')),
  evidence jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  review_after timestamptz,
  status text not null default 'active' check (status in ('active', 'accepted', 'dismissed', 'expired', 'measured')),
  created_at timestamptz not null default now()
);

create index if not exists bi_insights_entity_generated_idx
  on public.bi_insights (entity_key, generated_at desc);
create index if not exists bi_insights_status_idx
  on public.bi_insights (entity_key, status, generated_at desc);

create table if not exists public.bi_recommendation_outcomes (
  id uuid primary key default gen_random_uuid(),
  insight_id uuid not null references public.bi_insights(id) on delete cascade,
  accepted_at timestamptz,
  implemented_at timestamptz,
  measurement_start timestamptz,
  measurement_end timestamptz,
  result text check (result is null or result in ('successful', 'inconclusive', 'unsuccessful', 'reversed')),
  measured_lift double precision,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bi_recommendation_outcomes_insight_idx
  on public.bi_recommendation_outcomes (insight_id);

alter table public.bi_observations enable row level security;
alter table public.bi_events enable row level security;
alter table public.bi_insights enable row level security;
alter table public.bi_recommendation_outcomes enable row level security;

comment on table public.bi_observations is 'Immutable time-series observations used by Sightline Intelligence.';
comment on table public.bi_events is 'Business events for campaign, offer, creative, conversion, and outcome analysis.';
comment on table public.bi_insights is 'Generated Repeat/Fix/Test/Watch intelligence cards and supporting evidence.';
comment on table public.bi_recommendation_outcomes is 'Closed-loop measurement of whether a Sightline recommendation worked.';
