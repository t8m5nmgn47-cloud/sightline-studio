-- Sightline lead capture. Apply to your Supabase project before enabling the forms.
-- Inserts happen server-side via the service role key (bypasses RLS).

create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  type        text not null check (type in ('scan', 'contact')),
  business    text not null,
  website     text,
  email       text not null,
  message     text,
  source      text,
  user_agent  text
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_type_idx on public.leads (type);

-- Enable RLS with no anon policies: only the service role (server-side) can write/read.
alter table public.leads enable row level security;
