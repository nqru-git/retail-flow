import { detectLayoutChanges, layoutLabel } from './layoutHistory.js'

export const SMALL_SAMPLE_SIZE = 20
export const SERVICE_CHANGE_POINTS = 10

// 選択は配置履歴だけを基準にする。観察件数・比較の向きによる制限は設けない。
export function resolveAnalysisComparison(history, selection = {}) {
  const ordered = [...history].sort((a, b) => a.versionNumber - b.versionNumber)
  const before = ordered.find(layout => layout.id === selection.beforeId) ?? ordered.at(-2) ?? ordered.at(-1)
  const after = ordered.find(layout => layout.id === selection.afterId && layout.id !== before?.id) ?? ordered.findLast(layout => layout.id !== before?.id)
  return { before, after }
}

export function selectAnalysisLayout(history, selection, side, id) {
  const { before, after } = resolveAnalysisComparison(history, selection)
  const current = { beforeId: before?.id ?? '', afterId: after?.id ?? '' }
  if (!['beforeId', 'afterId'].includes(side) || !history.some(layout => layout.id === id) || id === (side === 'beforeId' ? after?.id : before?.id)) return current
  return { ...current, [side]: id }
}

export function comparisonChangeNote(history, before, after) {
  if (!before || !after || before.id === after.id) return ''
  const reversed = before.versionNumber > after.versionNumber
  const earlier = reversed ? after : before
  const later = reversed ? before : after
  const between = history.filter(layout => layout.versionNumber > earlier.versionNumber && layout.versionNumber <= later.versionNumber).sort((a, b) => a.versionNumber - b.versionNumber)
  const notes = between.map(layout => between.length === 1 ? layout.changeNote || '変更理由の記入はありません。' : `${layoutLabel(layout)} への変更理由：\n${layout.changeNote || '記入なし'}`).join('\n\n')
  return reversed ? `保存時の変更理由（${layoutLabel(earlier)} → ${layoutLabel(later)}）：\n${notes}` : notes
}

// 割合は0〜100。分母0・配置に存在しないゾーンは0%ではなく未算出です。
export function metric(count, total) {
  return { count, total, rate: count === null || total === 0 ? null : count / total * 100 }
}

const numberFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 })
export const formatRate = (rate) => rate === null ? '—' : `${numberFormat.format(rate)}%`
export const deltaPoints = (before, after) => before.rate === null || after.rate === null ? null : after.rate - before.rate
export function formatDelta(before, after) {
  const delta = deltaPoints(before, after)
  if (delta === null) return '比較なし'
  const rounded = Math.round(delta * 10) / 10
  return `${rounded > 0 ? '+' : ''}${numberFormat.format(rounded === 0 ? 0 : rounded)}pt`
}

export function comparisonZones(before, after) {
  const zones = new Map()
  for (const zone of [...before.layoutSnapshot, ...after.layoutSnapshot]) {
    if (zone.type === 'sales') zones.set(zone.id, zone)
  }
  return [...zones.values()]
}

export function defaultAnalysisZone(before, after) {
  const zones = comparisonZones(before, after)
  const changed = detectLayoutChanges(before.layoutSnapshot, after.layoutSnapshot)
  const salesChanges = changed.filter(change => zones.some(zone => zone.id === change.zoneId))
  return (salesChanges.find(change => change.type === 'moved') ?? salesChanges[0])?.zoneId ?? zones[0]?.id ?? ''
}

// 配置の組み合わせや再取得が変わっても、候補にあるユーザーの選択を優先します。
export function resolveAnalysisZone(before, after, selectedId = '') {
  if (!before || !after) return ''
  const zones = comparisonZones(before, after)
  return zones.some(zone => zone.id === selectedId) ? selectedId : defaultAnalysisZone(before, after)
}

export function layoutMetrics(aggregate, zoneId) {
  const total = aggregate.observedCount
  const zone = aggregate.zones.find(item => item.zoneId === zoneId)
  const zoneMetric = key => metric(zone?.[key] ?? null, total)
  return {
    observed: metric(total, total),
    passed: zoneMetric('passedCount'), stopped: zoneMetric('stoppedCount'),
    touched: zoneMetric('touchedCount'), checked: zoneMetric('checkedCount'), tried: zoneMetric('triedCount'),
    service: metric(aggregate.serviceCount, total), purchase: metric(aggregate.purchasedCount, total),
    zoneService: zoneMetric('serviceCount'), zonePurchase: zoneMetric('purchasedCount'),
    withServicePurchase: metric(aggregate.servicePurchasedCount, aggregate.serviceCount),
    withoutServicePurchase: metric(aggregate.withoutServicePurchasedCount, aggregate.withoutServiceCount),
  }
}

export function analysisWarnings(before, after) {
  const messages = []
  if (before.observedCount < SMALL_SAMPLE_SIZE || after.observedCount < SMALL_SAMPLE_SIZE) {
    messages.push('観察数が少ないため、参考値として確認してください')
  }
  const first = layoutMetrics(before, '')
  const second = layoutMetrics(after, '')
  const purchaseChange = deltaPoints(first.purchase, second.purchase)
  const serviceChange = deltaPoints(first.service, second.service)
  if (purchaseChange > 0 && serviceChange !== null && Math.abs(serviceChange) >= SERVICE_CHANGE_POINTS) {
    messages.push('接客率の変化も販売結果に影響している可能性があります')
  }
  return messages
}
