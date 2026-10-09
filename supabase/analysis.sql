-- Phase 6: schema.sql → layout-history.sql の実行後に SQL Editor で実行してください。
-- 観察の詳細は公開せず、選択した2配置の集計値だけを返します。再実行可能です。
begin;

-- These historical migrations must never restore anonymous RPC access after Phase 8.
do $$ begin
  if to_regclass('public.store_members') is not null then
    raise exception 'SECURITY_ALREADY_APPLIED: do not rerun legacy SQL; use security.sql';
  end if;
end $$;

create or replace function public.get_layout_analysis(p_layout_ids text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  analysis jsonb;
begin
  if p_layout_ids is null or cardinality(p_layout_ids) <> 2
    or (select count(distinct id) from unnest(p_layout_ids) as id) <> 2 then
    raise exception 'ANALYSIS_REQUIRES_TWO_LAYOUTS';
  end if;
  if (select count(*) from public.layout_versions where id = any(p_layout_ids)) <> 2 then
    raise exception 'ANALYSIS_LAYOUT_NOT_FOUND';
  end if;

  with selected_layouts as (
    select id, version_number, layout_snapshot
    from public.layout_versions where id = any(p_layout_ids)
  ), observed as materialized (
    select o.id, o.layout_version_id, o.route_steps, o.purchased_items, o.customer_service, o.result,
      coalesce(o.customer_service -> 'hadService' = 'true'::jsonb, false) as had_service
    from public.observations o
    where o.layout_version_id = any(p_layout_ids)
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
    'unlinked_count', (select count(*) from public.observations where layout_version_id is null)
  ) into analysis;
  return analysis;
end;
$$;

revoke all on function public.get_layout_analysis(text[]) from public, anon, authenticated;
grant execute on function public.get_layout_analysis(text[]) to anon, authenticated;

commit;
