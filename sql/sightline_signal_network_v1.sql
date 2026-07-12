-- Sightline Signal Network v1
-- Raw/public evidence layer beneath BI. Run manually in the Sightline Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.signal_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  entity_key text not null,
  entity_name text,
  source_type text not null check (source_type in (
    'website','local_profile','social_profile','review_profile','search_query','news_feed',
    'job_feed','ad_library','business_system'
  )),
  platform text not null default '',
  source_url text not null default '',
  external_id text not null default '',
  handle text,
  relationship text not null default 'owned' check (relationship in ('owned','peer','market')),
  status text not null default 'discovered' check (status in ('discovered','active','blocked','error','retired')),
  match_confidence double precision not null default 1 check (match_confidence >= 0 and match_confidence <= 1),
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CREATE TABLE IF NOT EXISTS does not update an existing inline check constraint.
-- Rebuild the source-type constraint so rerunning this migration upgrades v1
-- databases that were created before local_profile was introduced.
alter table public.signal_sources
  drop constraint if exists signal_sources_source_type_check;

alter table public.signal_sources
  add constraint signal_sources_source_type_check check (source_type in (
    'website','local_profile','social_profile','review_profile','search_query','news_feed',
    'job_feed','ad_library','business_system'
  ));

create index if not exists signal_sources_entity_idx on public.signal_sources(entity_key, relationship, source_type);
create index if not exists signal_sources_platform_idx on public.signal_sources(platform, status);

create table if not exists public.signal_collection_runs (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null,
  anchor_entity_key text not null,
  collector text not null,
  relationship text not null default 'owned' check (relationship in ('owned','peer','market')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running','success','partial','failed','setup_required')),
  sources_seen integer not null default 0,
  snapshots_written integer not null default 0,
  items_written integer not null default 0,
  error_count integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists signal_runs_entity_idx on public.signal_collection_runs(entity_key, started_at desc);
create index if not exists signal_runs_anchor_idx on public.signal_collection_runs(anchor_entity_key, started_at desc);
create index if not exists signal_runs_status_idx on public.signal_collection_runs(status, started_at desc);

create table if not exists public.signal_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_key text not null unique,
  source_id uuid not null references public.signal_sources(id) on delete cascade,
  entity_key text not null,
  signal_key text not null,
  value_numeric double precision,
  value_text text,
  observed_at timestamptz not null,
  collected_at timestamptz not null default now(),
  dimensions jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb
);

create index if not exists signal_snapshots_entity_idx on public.signal_snapshots(entity_key, signal_key, observed_at desc);
create index if not exists signal_snapshots_source_idx on public.signal_snapshots(source_id, observed_at desc);

create table if not exists public.signal_items (
  id uuid primary key default gen_random_uuid(),
  item_key text not null unique,
  source_id uuid not null references public.signal_sources(id) on delete cascade,
  entity_key text not null,
  item_type text not null check (item_type in ('web_page','social_post','video','review','article','ad','job_posting','event')),
  external_id text not null,
  item_url text,
  published_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  title text,
  body_text text,
  media_type text,
  metrics jsonb not null default '{}'::jsonb,
  classifications jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  content_hash text
);

create index if not exists signal_items_entity_idx on public.signal_items(entity_key, item_type, published_at desc nulls last);
create index if not exists signal_items_source_idx on public.signal_items(source_id, last_seen_at desc);
create index if not exists signal_items_hash_idx on public.signal_items(content_hash) where content_hash is not null;

create table if not exists public.signal_entity_links (
  id uuid primary key default gen_random_uuid(),
  entity_key text not null,
  source_id uuid not null references public.signal_sources(id) on delete cascade,
  relationship text not null default 'owned' check (relationship in ('owned','peer','market')),
  match_confidence double precision not null default 1 check (match_confidence >= 0 and match_confidence <= 1),
  match_method text not null default 'website_link',
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(entity_key, source_id)
);

create index if not exists signal_links_entity_idx on public.signal_entity_links(entity_key, relationship, match_confidence desc);

alter table public.signal_sources enable row level security;
alter table public.signal_collection_runs enable row level security;
alter table public.signal_snapshots enable row level security;
alter table public.signal_items enable row level security;
alter table public.signal_entity_links enable row level security;

-- No public policies. Server-side service-role access only.
