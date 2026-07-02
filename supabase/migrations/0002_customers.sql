-- Sightline "Customer Database (CRM)" add-on.
-- A private contacts/leads/clients store for a client's website.
-- Writes happen server-side via the service role key (bypasses RLS) — see api/customer.js.

create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  name        text not null,
  email       text,
  phone       text,
  company     text,
  status      text not null default 'lead' check (status in ('lead', 'prospect', 'customer', 'archived')),
  tags        text[],
  notes       text,
  source      text
);

create index if not exists customers_created_at_idx on public.customers (created_at desc);
create index if not exists customers_email_idx      on public.customers (email);
create index if not exists customers_status_idx     on public.customers (status);

-- Keep updated_at current on edits.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

-- RLS: the public (anon) role gets nothing. The service role (api/customer.js)
-- bypasses RLS for public intake. Signed-in accounts (magic-link) manage the CRM
-- from /crm — same model as leads/subscribers.
alter table public.customers enable row level security;

create policy "authenticated read customers"   on public.customers for select to authenticated using (true);
create policy "authenticated insert customers" on public.customers for insert to authenticated with check (true);
create policy "authenticated update customers" on public.customers for update to authenticated using (true) with check (true);
create policy "authenticated delete customers" on public.customers for delete to authenticated using (true);
