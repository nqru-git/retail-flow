-- Phase 8. Run schema.sql -> layout-history.sql -> analysis.sql -> this file.
-- Run as the SQL Editor administrator. This migration is transactional and repeatable.
-- Existing records are retained in an unassigned legacy store, never claimed by signup.
begin;

revoke create on schema public from public, anon, authenticated;

create schema if not exists retail_private;
revoke all on schema retail_private from public, anon, authenticated;
grant usage on schema retail_private to authenticated;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);
create table if not exists public.store_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  store_id uuid not null references public.stores(id),
  role text not null default 'staff' check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now()
);
create index if not exists store_members_store_id_idx on public.store_members(store_id);

insert into public.stores(id, name)
values ('00000000-0000-4000-8000-000000000001', '移行した店舗') on conflict (id) do nothing;
alter table public.observations add column if not exists store_id uuid references public.stores(id);
alter table public.layout_versions add column if not exists store_id uuid references public.stores(id);
update public.layout_versions set store_id = '00000000-0000-4000-8000-000000000001' where store_id is null;
update public.observations set store_id = '00000000-0000-4000-8000-000000000001' where store_id is null;
alter table public.observations alter column store_id set not null;
alter table public.layout_versions alter column store_id set not null;
alter table public.layout_versions drop constraint if exists layout_versions_version_number_key;
create unique index if not exists layout_versions_store_number_key on public.layout_versions(store_id, version_number);
create unique index if not exists layout_versions_store_id_key on public.layout_versions(store_id, id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'observations_store_layout_fkey' and conrelid = 'public.observations'::regclass) then
    alter table public.observations add constraint observations_store_layout_fkey
      foreign key (store_id, layout_version_id) references public.layout_versions(store_id, id);
  end if;
end $$;
create index if not exists observations_store_started_idx on public.observations(store_id, started_at);
create index if not exists observations_store_layout_idx on public.observations(store_id, layout_version_id);

alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.observations enable row level security;
alter table public.layout_versions enable row level security;
revoke all on public.stores, public.store_members, public.observations, public.layout_versions from public, anon, authenticated;
-- Clear column grants too; REVOKE on a whole table alone does not clear those.
do $$
declare target text; columns text;
begin
  foreach target in array array['stores', 'store_members', 'observations', 'layout_versions'] loop
    select string_agg(quote_ident(attname), ', ') into columns from pg_attribute
      where attrelid = format('public.%I', target)::regclass and attnum > 0 and not attisdropped;
    execute format('revoke all (%s) on public.%I from public, anon, authenticated', columns, target);
  end loop;
end $$;
grant select on public.stores, public.store_members to authenticated;
grant select, insert, update on public.observations to authenticated;
grant select, insert on public.layout_versions to authenticated;
-- Historical maps and version numbers remain immutable. Only a note may be corrected.
grant update (change_note) on public.layout_versions to authenticated;

drop policy if exists member_read_self on public.store_members;
create policy member_read_self on public.store_members for select to authenticated
  using (user_id = (select auth.uid()));

-- SECURITY INVOKER throughout: membership itself is filtered by RLS.
create or replace function retail_private.current_store_id()
returns uuid language sql stable security invoker set search_path = ''
as $$ select store_id from public.store_members where user_id = auth.uid(); $$;
create or replace function retail_private.require_store_id()
returns uuid language plpgsql stable security invoker set search_path = ''
as $$
declare own_store uuid;
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED' using errcode = '28000'; end if;
  own_store := retail_private.current_store_id();
  if own_store is null then raise exception 'STORE_MEMBERSHIP_REQUIRED' using errcode = '42501'; end if;
  return own_store;
end;
$$;
revoke all on function retail_private.current_store_id(), retail_private.require_store_id() from public, anon, authenticated;
grant execute on function retail_private.current_store_id(), retail_private.require_store_id() to authenticated;

drop policy if exists store_read_own on public.stores;
create policy store_read_own on public.stores for select to authenticated
  using (id = (select retail_private.current_store_id()));
-- A restrictive boundary also protects against accidentally retained permissive policies.
drop policy if exists member_boundary on public.store_members;
create policy member_boundary on public.store_members as restrictive for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists store_boundary on public.stores;
create policy store_boundary on public.stores as restrictive for all to authenticated
  using (id = (select retail_private.current_store_id())) with check (id = (select retail_private.current_store_id()));
do $$
declare table_name text;
begin
  foreach table_name in array array['observations', 'layout_versions'] loop
    execute format('drop policy if exists store_boundary on public.%I', table_name);
    execute format('create policy store_boundary on public.%I as restrictive for all to authenticated using (store_id = (select retail_private.current_store_id())) with check (store_id = (select retail_private.current_store_id()))', table_name);
    execute format('drop policy if exists store_select on public.%I', table_name);
    execute format('create policy store_select on public.%I for select to authenticated using (store_id = (select retail_private.current_store_id()))', table_name);
    execute format('drop policy if exists store_insert on public.%I', table_name);
    execute format('create policy store_insert on public.%I for insert to authenticated with check (store_id = (select retail_private.current_store_id()))', table_name);
    execute format('drop policy if exists store_update on public.%I', table_name);
    execute format('create policy store_update on public.%I for update to authenticated using (store_id = (select retail_private.current_store_id())) with check (store_id = (select retail_private.current_store_id()))', table_name);
  end loop;
end $$;

create or replace function public.get_current_store()
returns table(store_id uuid, store_name text, member_role text)
language plpgsql stable security invoker set search_path = ''
as $$
declare own_store uuid := retail_private.require_store_id();
begin
  return query select s.id, s.name, m.role from public.stores s join public.store_members m on m.store_id = s.id
    where s.id = own_store and m.user_id = auth.uid();
end;
$$;
create or replace function public.get_layout_history()
returns setof public.layout_versions language plpgsql stable security invoker set search_path = ''
as $$
declare own_store uuid := retail_private.require_store_id();
begin
  return query select * from public.layout_versions where store_id = own_store order by version_number;
end;
$$;
create or replace function public.initialize_layout(p_id text, p_layout_snapshot jsonb)
returns setof public.layout_versions language plpgsql security invoker set search_path = ''
as $$
declare own_store uuid := retail_private.require_store_id(); current_layout public.layout_versions;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(own_store::text, 814705));
  select * into current_layout from public.layout_versions where store_id = own_store order by version_number desc limit 1;
  if not found then
    insert into public.layout_versions(id, store_id, version_number, layout_snapshot, change_note)
    values (p_id, own_store, 1, p_layout_snapshot, '初期配置（サンプル）') returning * into current_layout;
  end if;
  return next current_layout;
end;
$$;
create or replace function public.save_layout_version(p_id text, p_base_id text, p_layout_snapshot jsonb, p_change_note text)
returns setof public.layout_versions language plpgsql security invoker set search_path = ''
as $$
declare own_store uuid := retail_private.require_store_id(); current_layout public.layout_versions; saved_layout public.layout_versions;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(own_store::text, 814705));
  select * into saved_layout from public.layout_versions where id = p_id and store_id = own_store;
  if found then
    if saved_layout.layout_snapshot is distinct from p_layout_snapshot
      or saved_layout.change_note is distinct from btrim(coalesce(p_change_note, ''))
      or saved_layout.version_number is distinct from (select version_number + 1 from public.layout_versions where id = p_base_id and store_id = own_store) then
      raise exception 'LAYOUT_REQUEST_MISMATCH';
    end if;
    return next saved_layout;
    return;
  end if;
  select * into current_layout from public.layout_versions where store_id = own_store order by version_number desc limit 1;
  if not found or current_layout.id is distinct from p_base_id then raise exception 'LAYOUT_CONFLICT'; end if;
  insert into public.layout_versions(id, store_id, version_number, layout_snapshot, change_note)
  values (p_id, own_store, current_layout.version_number + 1, p_layout_snapshot, btrim(coalesce(p_change_note, '')))
  returning * into saved_layout;
  return next saved_layout;
end;
$$;
create or replace function public.save_observation(p_observation jsonb)
returns void language plpgsql security invoker set search_path = ''
as $$
declare own_store uuid := retail_private.require_store_id(); linked_layout public.layout_versions;
begin
  -- Never trust a store_id supplied by the browser, including an old draft after account switching.
  if p_observation->>'store_id' is not null and p_observation->>'store_id' is distinct from own_store::text then
    raise exception 'STORE_ACCESS_DENIED' using errcode = '42501';
  end if;
  if exists (select 1 from public.observations where id = p_observation->>'id' and store_id = own_store) then return; end if;
  if p_observation->>'layout_version_id' is not null then
    select * into linked_layout from public.layout_versions where id = p_observation->>'layout_version_id' and store_id = own_store;
    if not found then raise exception 'STORE_ACCESS_DENIED' using errcode = '42501'; end if;
    if p_observation->>'layout_version' is distinct from ('v' || linked_layout.version_number)
      or p_observation->'layout_snapshot' is distinct from linked_layout.layout_snapshot then
      raise exception 'OBSERVATION_LAYOUT_MISMATCH';
    end if;
  end if;
  insert into public.observations (
    id, store_id, observation_number, started_at, ended_at, layout_version, layout_version_id, layout_snapshot,
    route_steps, customer_service, result, purchased_items, multiple_purchase
  ) values (
    p_observation->>'id', own_store, (p_observation->>'observation_number')::integer,
    (p_observation->>'started_at')::timestamptz, (p_observation->>'ended_at')::timestamptz,
    p_observation->>'layout_version', p_observation->>'layout_version_id', p_observation->'layout_snapshot',
    p_observation->'route_steps', p_observation->'customer_service', p_observation->>'result',
    p_observation->'purchased_items', (p_observation->>'multiple_purchase')::boolean
  ) on conflict (id) do nothing;
  if not exists (select 1 from public.observations where id = p_observation->>'id' and store_id = own_store) then
    raise exception 'STORE_ACCESS_DENIED' using errcode = '42501';
  end if;
end;
$$;
create or replace function public.get_observation_summary(p_date date)
returns table(observed_count bigint, purchased_count bigint)
language plpgsql stable security invoker set search_path = ''
as $$
declare own_store uuid := retail_private.require_store_id();
begin
  return query select count(*), count(*) filter (where result = 'purchase') from public.observations
    where store_id = own_store and started_at >= (p_date::timestamp at time zone 'Asia/Tokyo')
      and started_at < ((p_date + 1)::timestamp at time zone 'Asia/Tokyo');
end;
$$;

-- The analysis function below applies the same boundary to layouts, all observations,
-- and unlinked legacy totals. No RPC accepts a client-selected store_id.

create or replace function public.get_layout_analysis(p_layout_ids text[])
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  analysis jsonb;
  own_store uuid := retail_private.require_store_id();
begin
  if p_layout_ids is null or cardinality(p_layout_ids) <> 2
    or (select count(distinct id) from unnest(p_layout_ids) as id) <> 2 then
    raise exception 'ANALYSIS_REQUIRES_TWO_LAYOUTS';
  end if;
  if (select count(*) from public.layout_versions where store_id = own_store and id = any(p_layout_ids)) <> 2 then
    raise exception 'STORE_ACCESS_DENIED' using errcode = '42501';
  end if;

  with selected_layouts as (
    select id, version_number, layout_snapshot
    from public.layout_versions where store_id = own_store and id = any(p_layout_ids)
  ), observed as materialized (
    select o.id, o.layout_version_id, o.route_steps, o.purchased_items, o.customer_service, o.result,
      coalesce(o.customer_service -> 'hadService' = 'true'::jsonb, false) as had_service
    from public.observations o
    where o.store_id = own_store and o.layout_version_id = any(p_layout_ids)
  ), visits as (
    -- 同じ顧客が再訪しても、各ゾーン・各行動につき1人として数えます。
    select o.id, step ->> 'zoneId' as zone_id,
      bool_or(coalesce(step -> 'events' @> '["stopped"]'::jsonb, false)) as stopped,
      bool_or(coalesce(step -> 'events' @> '["touchedProduct"]'::jsonb, false)) as touched,
      bool_or(coalesce(step -> 'events' @> '["checkedPriceTag"]'::jsonb, false)) as checked,
      bool_or(coalesce(step -> 'events' @> '["triedOn"]'::jsonb, false)) as tried
    from observed o cross join lateral jsonb_array_elements(o.route_steps) as step
    group by o.id, step ->> 'zoneId'
  ), purchases as (
    -- 複数商品の購入でも、同じゾーンの商品購入は1人です。不明商品は紐づけません。
    select distinct o.id, item ->> 'zoneId' as zone_id
    from observed o cross join lateral jsonb_array_elements(o.purchased_items) as item
    where o.result = 'purchase' and item ->> 'zoneId' is not null
  ), services as (
    -- 初回の接客と再開後の各セッションを、顧客・接客開始ゾーンごとに1人にまとめます。
    -- 接客開始ゾーンが不明な旧データは、任意の売場に割り当てません。
    select o.id, o.customer_service -> 'startedZone' ->> 'zoneId' as zone_id
    from observed o where o.had_service
      and o.customer_service -> 'startedZone' ->> 'zoneId' is not null
    union
    select o.id, session -> 'startedZone' ->> 'zoneId' as zone_id
    from observed o cross join lateral jsonb_array_elements(
      case when jsonb_typeof(o.customer_service -> 'sessions') = 'array'
        then o.customer_service -> 'sessions' else '[]'::jsonb end
    ) as session
    where o.had_service and session -> 'startedZone' ->> 'zoneId' is not null
  ), totals as (
    select l.id, l.version_number,
      count(o.id) as observed_count,
      count(o.id) filter (where o.result = 'purchase') as purchased_count,
      count(o.id) filter (where o.had_service) as service_count,
      count(o.id) filter (where o.had_service and o.result = 'purchase') as service_purchased_count,
      count(o.id) filter (where not o.had_service) as without_service_count,
      count(o.id) filter (where not o.had_service and o.result = 'purchase') as without_service_purchased_count
    from selected_layouts l left join observed o on o.layout_version_id = l.id
    group by l.id, l.version_number
  ), zone_counts as (
    select l.id as layout_id, zone ->> 'id' as zone_id,
      count(o.id) filter (where v.id is not null) as passed_count,
      count(o.id) filter (where v.stopped) as stopped_count,
      count(o.id) filter (where v.touched) as touched_count,
      count(o.id) filter (where v.checked) as checked_count,
      count(o.id) filter (where v.tried) as tried_count,
      count(o.id) filter (where p.id is not null) as purchased_count,
      count(o.id) filter (where s.id is not null) as service_count
    from selected_layouts l cross join lateral jsonb_array_elements(l.layout_snapshot) as zone
    left join observed o on o.layout_version_id = l.id
    left join visits v on v.id = o.id and v.zone_id = zone ->> 'id'
    left join purchases p on p.id = o.id and p.zone_id = zone ->> 'id'
    left join services s on s.id = o.id and s.zone_id = zone ->> 'id'
    group by l.id, zone ->> 'id'
  )
  select jsonb_build_object(
    'layouts', (select jsonb_agg(jsonb_build_object(
      'layout_version_id', t.id,
      'observed_count', t.observed_count,
      'purchased_count', t.purchased_count,
      'service_count', t.service_count,
      'service_purchased_count', t.service_purchased_count,
      'without_service_count', t.without_service_count,
      'without_service_purchased_count', t.without_service_purchased_count,
      'zones', coalesce((select jsonb_agg(to_jsonb(z) - 'layout_id' order by z.zone_id)
        from zone_counts z where z.layout_id = t.id), '[]'::jsonb)
    ) order by t.version_number) from totals t),
    -- Phase 4以前の履歴IDなしの観察を、文字列だけで新しい配置へ割り当てません。
    'unlinked_count', (select count(*) from public.observations where store_id = own_store and layout_version_id is null)
  ) into analysis;
  return analysis;
end;
$$;


revoke all on function public.get_current_store() from public, anon, authenticated;
grant execute on function public.get_current_store() to authenticated;
revoke all on function public.get_layout_history() from public, anon, authenticated;
grant execute on function public.get_layout_history() to authenticated;
revoke all on function public.initialize_layout(text, jsonb) from public, anon, authenticated;
grant execute on function public.initialize_layout(text, jsonb) to authenticated;
revoke all on function public.save_layout_version(text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.save_layout_version(text, text, jsonb, text) to authenticated;
revoke all on function public.save_observation(jsonb) from public, anon, authenticated;
grant execute on function public.save_observation(jsonb) to authenticated;
revoke all on function public.get_observation_summary(date) from public, anon, authenticated;
grant execute on function public.get_observation_summary(date) to authenticated;
revoke all on function public.get_layout_analysis(text[]) from public, anon, authenticated;
grant execute on function public.get_layout_analysis(text[]) to authenticated;

-- New functions must opt into API access explicitly. Applies to this SQL creator role.
alter default privileges in schema public revoke execute on functions from public, anon;
notify pgrst, 'reload schema';
commit;
