import { supabase, supabaseConfigurationError } from './supabase.js'
import { describeSecurityError } from './securityErrors.js'

const countKeys = {
  observedCount: 'observed_count', purchasedCount: 'purchased_count', serviceCount: 'service_count',
  servicePurchasedCount: 'service_purchased_count', withoutServiceCount: 'without_service_count',
  withoutServicePurchasedCount: 'without_service_purchased_count',
}
const zoneKeys = {
  passedCount: 'passed_count', stoppedCount: 'stopped_count', touchedCount: 'touched_count',
  checkedCount: 'checked_count', triedCount: 'tried_count', purchasedCount: 'purchased_count',
}
function counts(row, keys) {
  return Object.fromEntries(Object.entries(keys).map(([name, field]) => {
    const value = row?.[field]
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('INVALID_ANALYSIS_DATA')
    return [name, value]
  }))
}

export function parseAnalysis(data, layoutIds) {
  if (!data || !Array.isArray(data.layouts) || data.layouts.length !== 2 || !Number.isSafeInteger(data.unlinked_count) || data.unlinked_count < 0) throw new Error('INVALID_ANALYSIS_DATA')
  const seen = new Set()
  const layouts = data.layouts.map(row => {
    const id = row.layout_version_id
    if (!layoutIds.includes(id) || seen.has(id) || !Array.isArray(row.zones)) throw new Error('INVALID_ANALYSIS_DATA')
    seen.add(id)
    const totals = counts(row, countKeys)
    if (totals.serviceCount + totals.withoutServiceCount !== totals.observedCount ||
      totals.servicePurchasedCount + totals.withoutServicePurchasedCount !== totals.purchasedCount ||
      totals.servicePurchasedCount > totals.serviceCount || totals.withoutServicePurchasedCount > totals.withoutServiceCount) throw new Error('INVALID_ANALYSIS_DATA')
    const seenZones = new Set()
    const zones = row.zones.map(zone => {
      if (typeof zone.zone_id !== 'string' || !zone.zone_id || seenZones.has(zone.zone_id)) throw new Error('INVALID_ANALYSIS_DATA')
      seenZones.add(zone.zone_id)
      const values = counts(zone, zoneKeys)
      if (Object.values(values).some(value => value > totals.observedCount) ||
        ['stoppedCount', 'touchedCount', 'checkedCount', 'triedCount'].some(key => values[key] > values.passedCount) ||
        values.purchasedCount > totals.purchasedCount) throw new Error('INVALID_ANALYSIS_DATA')
      // 旧RPCでも他の指標とゾーン選択は利用できるようにします。未集計を0にはしません。
      const serviceCount = zone.service_count === undefined ? null : counts(zone, { serviceCount: 'service_count' }).serviceCount
      if (serviceCount !== null && serviceCount > totals.serviceCount) throw new Error('INVALID_ANALYSIS_DATA')
      return { zoneId: zone.zone_id, ...values, serviceCount }
    })
    return { layoutId: id, ...totals, zones }
  })
  return { layouts, unlinkedCount: data.unlinked_count }
}

export function describeAnalysisError(error) {
  if (describeSecurityError(error)) return describeSecurityError(error)
  if (!supabase && error?.message === 'SUPABASE_NOT_CONFIGURED') return supabaseConfigurationError
  if (['PGRST202', '42P01', '42883'].includes(error?.code)) return '分析用SQLが未設定です。SupabaseのSQL Editorで supabase/analysis.sql を実行してください。'
  if (error?.message === 'INVALID_ANALYSIS_DATA') return '分析データの形式を確認できませんでした。SQLを更新して再取得してください。'
  if (error?.message?.includes('ANALYSIS_LAYOUT_NOT_FOUND')) return '選択した配置を取得できませんでした。配置履歴を再取得してください。'
  return '分析データを取得できませんでした。接続を確認して再取得してください。'
}

export function createAnalysisRepository(client) {
  return {
    async getComparison(layoutIds) {
      if (layoutIds.length !== 2 || new Set(layoutIds).size !== 2 || layoutIds.some(id => typeof id !== 'string' || !id)) throw new Error('ANALYSIS_REQUIRES_TWO_LAYOUTS')
      if (!client) throw new Error('SUPABASE_NOT_CONFIGURED')
      const { data, error } = await client.rpc('get_layout_analysis', { p_layout_ids: layoutIds })
      if (error) throw error
      return parseAnalysis(data, layoutIds)
    },
  }
}
export const analysisRepository = createAnalysisRepository(supabase)
