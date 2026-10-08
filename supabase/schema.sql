-- Phase 4: one-store, no-login MVP. Run the entire file in Supabase SQL Editor.
-- For Phase 5, run layout-history.sql AFTER this file (including on re-runs).
-- Public clients can append completed observations and read aggregate counts only.
-- Observation details, updates and deletes are not exposed to public clients.
begin;

create table if not exists public.observations (
  id text primary key check (length(id) between 1 and 200),
  observation_number integer not null check (observation_number > 0),
  started_at timestamptz not null,
  ended_at timestamptz not null check (ended_at >= started_at),
  layout_version text not null check (length(layout_version) > 0),
  layout_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(layout_snapshot) = 'array'),
  route_steps jsonb not null default '[]'::jsonb check (jsonb_typeof(route_steps) = 'array'),
  customer_service jsonb not null check (jsonb_typeof(customer_service) = 'object'),
  result text not null check (result in ('purchase', 'no-purchase')),
  purchased_items jsonb not null default '[]'::jsonb check (jsonb_typeof(purchased_items) = 'array'),
  multiple_purchase boolean not null default false,
  created_at timestamptz not null default now(),
  constraint observations_purchase_result check (
    (result = 'purchase' and jsonb_array_length(purchased_items) > 0) or
    (result = 'no-purchase' and purchased_items = '[]'::jsonb and not multiple_purchase)
  )
);

create index if not exists observations_started_at_idx on public.observations (started_at);
alter table public.observations enable row level security;
revoke all on public.observations from public, anon, authenticated;

-- Restricted RPC: insert only. Retrying an existing ID never overwrites the record.
create or replace function public.save_observation(p_observation jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.observations (
    id, observation_number, started_at, ended_at, layout_version, layout_snapshot,
    route_steps, customer_service, result, purchased_items, multiple_purchase
  ) values (
    p_observation->>'id', (p_observation->>'observation_number')::integer,
    (p_observation->>'started_at')::timestamptz, (p_observation->>'ended_at')::timestamptz,
    p_observation->>'layout_version', p_observation->'layout_snapshot',
    p_observation->'route_steps', p_observation->'customer_service',
    p_observation->>'result', p_observation->'purchased_items',
    (p_observation->>'multiple_purchase')::boolean
  ) on conflict (id) do nothing;
$$;

-- "Today" follows the observation's start date in Japan, not the DB server timezone.
create or replace function public.get_observation_summary(p_date date)
returns table (observed_count bigint, purchased_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*), count(*) filter (where result = 'purchase')
  from public.observations
  where started_at >= (p_date::timestamp at time zone 'Asia/Tokyo')
    and started_at < ((p_date + 1)::timestamp at time zone 'Asia/Tokyo');
$$;

revoke all on function public.save_observation(jsonb) from public, anon, authenticated;
revoke all on function public.get_observation_summary(date) from public, anon, authenticated;
grant execute on function public.save_observation(jsonb) to anon, authenticated;
grant execute on function public.get_observation_summary(date) to anon, authenticated;

commit;
