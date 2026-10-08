import { cloneMapElements, ELEMENT_TYPES } from './storeMap.js'

export const layoutLabel = (layout) => layout ? `v${layout.versionNumber}` : '未取得'
export const createLayoutId = () => globalThis.crypto?.randomUUID?.() ?? `layout-${Date.now()}-${Math.random().toString(36).slice(2)}`

export function createLocalLayout(elements) {
  return { id: createLayoutId(), versionNumber: 1, createdAt: new Date().toISOString(), layoutSnapshot: cloneMapElements(elements), changeNote: '初期配置（サンプル）' }
}

export function appendLocalLayout(history, request, createdAt) {
  const existing = history.find((layout) => layout.id === request.id)
  if (existing) return history
  const latest = history.at(-1)
  if (!latest || latest.id !== request.baseId) throw Object.assign(new Error('LAYOUT_CONFLICT'), { code: 'LAYOUT_CONFLICT' })
  return [...history, { id: request.id, versionNumber: latest.versionNumber + 1, createdAt, layoutSnapshot: cloneMapElements(request.layoutSnapshot), changeNote: request.changeNote.trim() }]
}

export function validateLayoutSnapshot(elements) {
  if (!Array.isArray(elements)) return false
  const ids = new Set()
  return elements.every((element) => {
    if (!element || typeof element.id !== 'string' || !element.id || ids.has(element.id)) return false
    ids.add(element.id)
    return Object.hasOwn(ELEMENT_TYPES, element.type) && ['name', 'category', 'product', 'memo'].every((key) => typeof element[key] === 'string') && element.name.trim().length > 0 &&
      ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(element[key])) && element.x >= 0 && element.y >= 0 && element.width > 0 && element.height > 0 && element.x + element.width <= 100.01 && element.y + element.height <= 100.01
  })
}

function positionLabel(element, elements) {
  const horizontal = element.x + element.width / 2
  const vertical = element.y + element.height / 2
  const nearEntrance = element.type !== 'entrance' && elements.some((entry) => entry.type === 'entrance' &&
    Math.max(0, element.x - (entry.x + entry.width), entry.x - (element.x + element.width)) <= 8 &&
    Math.max(0, element.y - (entry.y + entry.height), entry.y - (element.y + element.height)) <= 8)
  if (nearEntrance) return '入口付近'
  const row = vertical < 33.33 ? '上' : vertical > 66.66 ? '下' : '中央'
  const column = horizontal < 33.33 ? '左' : horizontal > 66.66 ? '右' : ''
  return `${row}${column}`
}

export function detectLayoutChanges(before, after) {
  const oldById = new Map(before.map((zone) => [zone.id, zone]))
  const newIds = new Set(after.map((zone) => zone.id))
  const changes = []
  function add(zone, type, label, previous, next) {
    changes.push({ zoneId: zone.id, zoneName: zone.name, type, label, before: previous, after: next })
  }
  for (const zone of before) {
    if (!newIds.has(zone.id)) add(zone, 'removed', '削除', zone.name, null)
  }
  for (const zone of after) {
    const old = oldById.get(zone.id)
    if (!old) { add(zone, 'added', '追加', null, zone.name); continue }
    if (old.x !== zone.x || old.y !== zone.y) add(zone, 'moved', '移動', positionLabel(old, before), positionLabel(zone, after))
    if (old.width !== zone.width || old.height !== zone.height) add(zone, 'resized', 'サイズ', `横幅 ${old.width}%・高さ ${old.height}%`, `横幅 ${zone.width}%・高さ ${zone.height}%`)
    for (const [field, label] of [['name', '名前'], ['product', '商品'], ['category', 'カテゴリー'], ['memo', 'ゾーンメモ']]) {
      if (old[field] !== zone[field]) add(zone, field, label, old[field] || '未設定', zone[field] || '未設定')
    }
    if (old.type !== zone.type) add(zone, 'type', '種類', ELEMENT_TYPES[old.type].label, ELEMENT_TYPES[zone.type].label)
  }
  return changes
}
