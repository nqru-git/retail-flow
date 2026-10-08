import assert from 'node:assert/strict'
import test from 'node:test'
import { initialStoreMap } from '../data/initialStoreMap.js'
import { appendLocalLayout, createLocalLayout, detectLayoutChanges, layoutLabel, validateLayoutSnapshot } from './layoutHistory.js'
import { createObservationState } from './observation.js'

test('ローカルでもv1→v2→v3を追加し、過去の配置を変更しない', () => {
  const first = createLocalLayout(initialStoreMap)
  const original = structuredClone(first)
  const edited = first.layoutSnapshot.map((zone) => ({ ...zone, x: 0 }))
  const request = { id: 'v2', baseId: first.id, layoutSnapshot: edited, changeNote: '  露出を増やす  ' }
  const history = appendLocalLayout([first], request, '2026-10-08T00:00:00Z')
  edited[0].name = '保存後の編集'
  assert.deepEqual(history[0], original)
  assert.equal(history[1].layoutSnapshot[0].name, '試着室')
  assert.equal(history[1].changeNote, '露出を増やす')
  assert.equal(appendLocalLayout(history, request, 'later'), history)
  const third = appendLocalLayout(history, { ...request, id: 'v3', baseId: 'v2' }, '2026-10-08T01:00:00Z')
  assert.deepEqual(third.map(layoutLabel), ['v1', 'v2', 'v3'])
  assert.equal(history.length, 2)
  assert.throws(() => appendLocalLayout(third, { ...request, id: 'stale' }, 'later'), { code: 'LAYOUT_CONFLICT' })
})

test('初期配置と観察は、それぞれコピーして配置IDとバージョンを固定する', () => {
  const layout = createLocalLayout(initialStoreMap)
  const state = createObservationState({ number: 25, startedAt: '2026-10-08T00:00:00Z', layoutVersion: 'v3', layoutVersionId: layout.id, elements: layout.layoutSnapshot })
  layout.layoutSnapshot[0].name = '別の配置へ編集'
  assert.equal(initialStoreMap[0].name, '試着室')
  assert.equal(state.observation.layoutSnapshot[0].name, '試着室')
  assert.equal(state.observation.layoutVersionId, layout.id)
  assert.equal(state.observation.layoutVersion, 'v3')
})

test('追加・削除・移動・サイズ・名前・商品・カテゴリーをIDで自動比較する', () => {
  const old = structuredClone(initialStoreMap)
  const next = old.filter(zone => zone.id !== 'sample-checkout').map(zone => zone.id === 'sample-bags' ? { ...zone, x: 34, y: 68, width: 30, height: 20, name: 'バッグ', product: '新商品', category: '新作' } : { ...zone })
  next.push({ ...old[2], id: 'new-zone', name: 'デニム' })
  const changes = detectLayoutChanges(old, next)
  assert.deepEqual(changes.filter(change => change.zoneId === 'sample-bags').map(change => change.type), ['moved', 'resized', 'name', 'product', 'category'])
  assert.equal(changes.find(change => change.type === 'removed').zoneName, 'レジ')
  assert.equal(changes.find(change => change.type === 'added').zoneName, 'デニム')
  assert.equal(changes.find(change => change.type === 'moved').after, '入口付近')
  assert.equal(changes.find(change => change.type === 'name').before, '新作バッグ')
  assert.equal(old[2].name, '新作バッグ')
})

test('同じエリアの小さな移動を検出し、配列順だけでは変更にしない', () => {
  assert.deepEqual(detectLayoutChanges(initialStoreMap, [...initialStoreMap].reverse()), [])
  const next = initialStoreMap.map(zone => zone.id === 'sample-bags' ? { ...zone, x: zone.x + 1 } : zone)
  const [change] = detectLayoutChanges(initialStoreMap, next)
  assert.equal(change.type, 'moved')
  assert.equal(change.before, change.after)
  assert.deepEqual(detectLayoutChanges([], []), [])
})

test('ゾーンメモと種類の変更も拾い、空の商品は未設定と表示する', () => {
  const next = [{ ...initialStoreMap[2], memo: '', product: '', type: 'checkout' }]
  const changes = detectLayoutChanges([initialStoreMap[2]], next)
  assert.equal(changes.find(change => change.type === 'product').after, '未設定')
  assert.ok(changes.some(change => change.type === 'memo'))
  assert.ok(changes.some(change => change.type === 'type'))
})

test('空マップを許可し、重複ID・不正な座標・不正なメタデータを拒否する', () => {
  assert.equal(validateLayoutSnapshot(initialStoreMap), true)
  assert.equal(validateLayoutSnapshot([]), true)
  for (const snapshot of [null, [initialStoreMap[0], initialStoreMap[0]], [{ ...initialStoreMap[0], x: -1 }], [{ ...initialStoreMap[0], width: 200 }], [{ ...initialStoreMap[0], name: '' }], [{ ...initialStoreMap[0], type: 'aisle' }]]) assert.equal(validateLayoutSnapshot(snapshot), false)
})
