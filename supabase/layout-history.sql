-- Phase 5 migration. Run schema.sql first on a new project, then this entire file.
-- Existing observations are preserved; their new layout FK remains NULL.
begin;

-- These historical migrations must never restore anonymous RPC access after Phase 8.
do $$ begin
  if to_regclass('public.store_members') is not null then
    raise exception 'SECURITY_ALREADY_APPLIED: do not rerun legacy SQL; use security.sql';
  end if;
end $$;

create table if not exists public.layout_versions (
  id text primary key check (length(id) between 1 and 200),
  version_number integer not null unique check (version_number > 0),
  created_at timestamptz not null default now(),
  layout_snapshot jsonb not null check (jsonb_typeof(layout_snapshot) = 'array'),
  change_note text not null default '' check (length(change_note) <= 1200)
);
alter table public.layout_versions enable row level security;
revoke all on public.layout_versions from public, anon, authenticated;

alter table public.observations add column if not exists layout_version_id text references public.layout_versions(id);
create index if not exists observations_layout_version_id_idx on public.observations (layout_version_id);

create or replace function public.get_layout_history()
returns setof public.layout_versions
language sql stable security definer set search_path = ''
as $$ select * from public.layout_versions order by version_number; $$;

-- Serialize the initial creation and all subsequent saves with the same transaction lock.
create or replace function public.initialize_layout(p_id text, p_layout_snapshot jsonb)
returns setof public.layout_versions
language plpgsql security definer set search_path = ''
as $$
declare current_layout public.layout_versions;
begin
  perform pg_catalog.pg_advisory_xact_lock(814705);
  select * into current_layout from public.layout_versions order by version_number desc limit 1;
  if not found then
    insert into public.layout_versions(id, version_number, layout_snapshot, change_note)
    values (p_id, 1, p_layout_snapshot, '初期配置（サンプル）') returning * into current_layout;
  end if;
  return next current_layout;
end;
$$;

create or replace function public.save_layout_version(p_id text, p_base_id text, p_layout_snapshot jsonb, p_change_note text)
returns setof public.layout_versions
language plpgsql security definer set search_path = ''
as $$
declare
  current_layout public.layout_versions;
  saved_layout public.layout_versions;
begin
  perform pg_catalog.pg_advisory_xact_lock(814705);
  select * into saved_layout from public.layout_versions where id = p_id;
  if found then
    if saved_layout.layout_snapshot is distinct from p_layout_snapshot
      or saved_layout.change_note is distinct from btrim(coalesce(p_change_note, ''))
      or saved_layout.version_number is distinct from (select version_number + 1 from public.layout_versions where id = p_base_id) then
      raise exception 'LAYOUT_REQUEST_MISMATCH';
    end if;
    return next saved_layout;
    return;
  end if;
  select * into current_layout from public.layout_versions order by version_number desc limit 1;
  if not found or current_layout.id is distinct from p_base_id then
    raise exception 'LAYOUT_CONFLICT';
  end if;
  insert into public.layout_versions(id, version_number, layout_snapshot, change_note)
  values (p_id, current_layout.version_number + 1, p_layout_snapshot, btrim(coalesce(p_change_note, '')))
  returning * into saved_layout;
  return next saved_layout;
end;
$$;

-- Keep the original observation RPC signature. Legacy Phase 4 records still work.
create or replace function public.save_observation(p_observation jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
declare linked_layout public.layout_versions;
begin
  -- Already committed observations can be retried without changing or revalidating them.
  if exists (select 1 from public.observations where id = p_observation->>'id') then return; end if;
  if p_observation->>'layout_version_id' is not null then
    select * into linked_layout from public.layout_versions where id = p_observation->>'layout_version_id';
    if not found or p_observation->>'layout_version' is distinct from ('v' || linked_layout.version_number)
      or p_observation->'layout_snapshot' is distinct from linked_layout.layout_snapshot then
      raise exception 'OBSERVATION_LAYOUT_MISMATCH';
    end if;
  end if;
  insert into public.observations (
    id, observation_number, started_at, ended_at, layout_version, layout_version_id, layout_snapshot,
    route_steps, customer_service, result, purchased_items, multiple_purchase
  ) values (
    p_observation->>'id', (p_observation->>'observation_number')::integer,
    (p_observation->>'started_at')::timestamptz, (p_observation->>'ended_at')::timestamptz,
    p_observation->>'layout_version', p_observation->>'layout_version_id', p_observation->'layout_snapshot',
    p_observation->'route_steps', p_observation->'customer_service',
    p_observation->>'result', p_observation->'purchased_items', (p_observation->>'multiple_purchase')::boolean
  ) on conflict (id) do nothing;
end;
$$;

revoke all on function public.get_layout_history() from public, anon, authenticated;
revoke all on function public.initialize_layout(text, jsonb) from public, anon, authenticated;
revoke all on function public.save_layout_version(text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.save_observation(jsonb) from public, anon, authenticated;
grant execute on function public.get_layout_history() to anon, authenticated;
grant execute on function public.initialize_layout(text, jsonb) to anon, authenticated;
grant execute on function public.save_layout_version(text, text, jsonb, text) to anon, authenticated;
grant execute on function public.save_observation(jsonb) to anon, authenticated;

commit;
