import { supabase, supabaseConfigurationError } from './supabase.js'

export function toObservationRow(record) {
  if (!record?.id || !record.startedAt || !record.endedAt || !['purchase', 'no-purchase'].includes(record.result)) {
    throw new Error('終了した観察データがありません。')
  }
  return {
    id: record.id,
    observation_number: record.number,
    started_at: record.startedAt,
    ended_at: record.endedAt,
    layout_version: record.layoutVersion,
    layout_version_id: record.layoutVersionId ?? null,
    layout_snapshot: record.layoutSnapshot,
    route_steps: record.routeSteps,
    customer_service: record.customerService,
    result: record.result,
    purchased_items: record.purchasedItems,
    multiple_purchase: record.multiplePurchase,
  }
}

export function describeSupabaseError(error) {
  if (error?.code === 'SUPABASE_NOT_CONFIGURED') return error.message
  if (['PGRST202', '42P01', '42883'].includes(error?.code)) return '保存先の準備が完了していません。Supabaseで supabase/schema.sql と supabase/layout-history.sql を実行してください。'
  if (error?.message === 'OBSERVATION_LAYOUT_MISMATCH') return '観察開始時の配置情報と保存先が一致しません。観察データは保持されています。配置履歴の設定を確認してください。'
  if (['42501', 'PGRST301'].includes(error?.code) || error?.status === 401 || error?.status === 403) return 'Supabaseの公開キーとアクセス権限を確認してください。'
  return 'Supabaseとの通信に失敗しました。接続や設定を確認して、もう一度お試しください。'
}

export function createObservationRepository(client, configurationError = supabaseConfigurationError) {
  const pending = new Map()
  function requireClient() {
    if (!client) throw Object.assign(new Error(configurationError || 'Supabaseが設定されていません。'), { code: 'SUPABASE_NOT_CONFIGURED' })
  }
  function save(record) {
    // A stable ID also makes retries safe if the DB committed but the response was lost.
    if (pending.has(record?.id)) return pending.get(record.id)
    const task = (async () => {
      const row = toObservationRow(record)
      requireClient()
      const { error } = await client.rpc('save_observation', { p_observation: row })
      if (error) throw error
    })()
    pending.set(record?.id, task)
    void task.then(() => pending.delete(record?.id), () => pending.delete(record?.id))
    return task
  }
  async function getTodaySummary(date) {
    requireClient()
    const { data, error } = await client.rpc('get_observation_summary', { p_date: date })
    if (error) throw error
    const summary = data?.[0]
    const observedCount = Number(summary?.observed_count)
    const purchasedCount = Number(summary?.purchased_count)
    if (summary?.observed_count == null || summary?.purchased_count == null || !Number.isSafeInteger(observedCount) || !Number.isSafeInteger(purchasedCount) || purchasedCount < 0 || observedCount < purchasedCount) {
      throw new Error('集計結果が不正です。')
    }
    return { observedCount, purchasedCount }
  }
  return { save, getTodaySummary }
}

export const observationRepository = createObservationRepository(supabase)
