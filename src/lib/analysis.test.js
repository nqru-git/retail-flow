import assert from 'node:assert/strict'
import test from 'node:test'
import { analysisWarnings, comparisonChangeNote, comparisonZones, defaultAnalysisZone, deltaPoints, formatDelta, formatRate, layoutMetrics, metric, resolveAnalysisComparison, resolveAnalysisZone, selectAnalysisLayout } from './analysis.js'
import { initialStoreMap } from '../data/initialStoreMap.js'

const aggregate = overrides => ({ observedCount: 50, purchasedCount: 2, serviceCount: 10, servicePurchasedCount: 1, withoutServiceCount: 40, withoutServicePurchasedCount: 1, zones: [{ zoneId: 'bags', passedCount: 30, stoppedCount: 9, touchedCount: 7, checkedCount: 5, triedCount: 2, purchasedCount: 1 }], ...overrides })
const history = [1, 2, 3].map(number => ({ id: `layout-${number}`, versionNumber: number, changeNote: `v${number}の理由` }))

test('配置履歴だけから直近2配置を初期選択し、履歴の取得順に依存しない', () => {
  assert.deepEqual(resolveAnalysisComparison(history), { before: history[1], after: history[2] })
  assert.deepEqual(resolveAnalysisComparison([...history].reverse()), { before: history[1], after: history[2] })
  assert.deepEqual(resolveAnalysisComparison([]), { before: undefined, after: undefined })
  assert.deepEqual(resolveAnalysisComparison([history[0]]), { before: history[0], after: undefined })
})

test('最新を比較元・古い配置を比較先にも選択でき、再取得で選択を維持する', () => {
  let selection = selectAnalysisLayout(history, {}, 'afterId', 'layout-1')
  selection = selectAnalysisLayout(history, selection, 'beforeId', 'layout-3')
  assert.deepEqual(selection, { beforeId: 'layout-3', afterId: 'layout-1' })
  assert.deepEqual(resolveAnalysisComparison(history, selection), { before: history[2], after: history[0] })
  assert.deepEqual(resolveAnalysisComparison([...history, { id: 'layout-4', versionNumber: 4 }], selection), { before: history[2], after: history[0] })
})

test('同じ配置同士・履歴にないIDへの切り替えは拒否する', () => {
  const selection = { beforeId: 'layout-2', afterId: 'layout-3' }
  assert.deepEqual(selectAnalysisLayout(history, selection, 'beforeId', 'layout-3'), selection)
  assert.deepEqual(selectAnalysisLayout(history, selection, 'afterId', 'layout-2'), selection)
  assert.deepEqual(selectAnalysisLayout(history, selection, 'afterId', 'missing'), selection)
  assert.notEqual(resolveAnalysisComparison(history, { beforeId: 'layout-3', afterId: 'layout-3' }).after.id, 'layout-3')
})

test('観察0件でも選択を維持し、割合は未算出にする', () => {
  const selection = { beforeId: 'layout-1', afterId: 'layout-3' }
  const withCounts = history.map(layout => ({ ...layout, observedCount: 0 }))
  const comparison = resolveAnalysisComparison(withCounts, selection)
  assert.equal(comparison.before.id, 'layout-1')
  assert.equal(comparison.after.id, 'layout-3')
  assert.equal(metric(0, comparison.before.observedCount).rate, null)
})

test('順方向・逆方向どちらも保存時の変更理由を失わずに表示する', () => {
  assert.equal(comparisonChangeNote(history, history[0], history[1]), 'v2の理由')
  assert.equal(comparisonChangeNote(history, history[1], history[0]), '保存時の変更理由（v1 → v2）：\nv2の理由')
  assert.match(comparisonChangeNote(history, history[0], history[2]), /v2 への変更理由：[\s\S]*v3 への変更理由：/)
  assert.match(comparisonChangeNote(history, history[2], history[0]), /保存時の変更理由（v1 → v3）：[\s\S]*v2の理由[\s\S]*v3の理由/)
  assert.equal(comparisonChangeNote(history, history[0], history[0]), '')
})

test('人数・分母・割合を保持し、0人の割合は未算出にする', () => {
  assert.deepEqual(metric(9, 50), { count: 9, total: 50, rate: 18 })
  assert.equal(formatRate(metric(0, 0).rate), '—')
  assert.equal(formatRate(metric(null, 50).rate), '—')
  assert.equal(formatRate(metric(0, 50).rate), '0%')
  assert.equal(formatRate(metric(1, 3).rate), '33.3%')
})

test('変化量は相対増加率ではなく、丸める前の割合のポイント差', () => {
  assert.equal(formatDelta(metric(9, 50), metric(18, 50)), '+18pt')
  assert.equal(formatDelta(metric(18, 50), metric(9, 50)), '-18pt')
  assert.equal(formatDelta(metric(1, 3), metric(2, 3)), '+33.3pt')
  assert.equal(deltaPoints(metric(1, 4), metric(2, 4)), 25)
  assert.equal(formatDelta(metric(0, 0), metric(1, 50)), '比較なし')
  assert.equal(formatDelta(metric(1, 10000), metric(0, 10000)), '0pt')
})

test('ゾーン行動・商品購入は全観察が分母、接客別は各接客群が分母', () => {
  const metrics = layoutMetrics(aggregate(), 'bags')
  assert.deepEqual(metrics.stopped, metric(9, 50))
  assert.deepEqual(metrics.purchase, metric(2, 50))
  assert.deepEqual(metrics.zonePurchase, metric(1, 50))
  assert.deepEqual(metrics.withServicePurchase, metric(1, 10))
  assert.deepEqual(metrics.withoutServicePurchase, metric(1, 40))
  assert.equal(layoutMetrics(aggregate(), 'removed').passed.count, null)
  assert.equal(layoutMetrics(aggregate({ serviceCount: 0, servicePurchasedCount: 0 }), 'bags').withServicePurchase.rate, null)
})

test('20人未満・購入率上昇かつ接客率10pt以上の変化で注意を表示', () => {
  assert.deepEqual(analysisWarnings(aggregate(), aggregate()), [])
  assert.match(analysisWarnings(aggregate({ observedCount: 19 }), aggregate())[0], /参考値/)
  assert.equal(analysisWarnings(aggregate({ observedCount: 20 }), aggregate()).length, 0)
  assert.match(analysisWarnings(aggregate(), aggregate({ purchasedCount: 5, serviceCount: 15 }))[0], /接客率の変化/)
  assert.match(analysisWarnings(aggregate(), aggregate({ purchasedCount: 5, serviceCount: 0 }))[0], /接客率の変化/)
  assert.equal(analysisWarnings(aggregate(), aggregate({ purchasedCount: 5, serviceCount: 14 })).length, 0)
  assert.equal(analysisWarnings(aggregate(), aggregate({ purchasedCount: 1, serviceCount: 25 })).length, 0)
  assert.equal(analysisWarnings(aggregate({ observedCount: 0 }), aggregate()).length, 1)
})

test('ゾーンIDで追加・削除・名前変更を比較し、変更した売場を初期選択', () => {
  const before = { layoutSnapshot: initialStoreMap }
  const after = { layoutSnapshot: initialStoreMap.filter(zone => zone.id !== 'sample-tops').map(zone => zone.id === 'sample-bags' ? { ...zone, name: 'バッグ', x: 30 } : zone) }
  const zones = comparisonZones(before, after)
  assert.deepEqual(zones.map(zone => zone.id), ['sample-bags', 'sample-tops'])
  assert.equal(zones[0].name, 'バッグ')
  assert.equal(defaultAnalysisZone(before, after), 'sample-bags')
  assert.equal(defaultAnalysisZone(before, before), 'sample-bags')
  assert.equal(defaultAnalysisZone({ layoutSnapshot: [] }, { layoutSnapshot: [] }), '')
})

test('選択した売場を優先し、配置切り替え・再取得・0件の配置でも固定値に戻さない', () => {
  const before = { layoutSnapshot: initialStoreMap, observedCount: 0 }
  const after = { layoutSnapshot: initialStoreMap.map(zone => zone.id === 'sample-bags' ? { ...zone, x: 30 } : zone) }
  assert.equal(resolveAnalysisZone(before, after), 'sample-bags')
  assert.equal(resolveAnalysisZone(before, after, 'sample-tops'), 'sample-tops')
  assert.equal(resolveAnalysisZone(after, before, 'sample-tops'), 'sample-tops')
  assert.equal(resolveAnalysisZone(structuredClone(before), structuredClone(after), 'sample-tops'), 'sample-tops')
  assert.equal(resolveAnalysisZone(before, after, 'sample-entrance'), 'sample-bags')
  assert.equal(resolveAnalysisZone({ layoutSnapshot: [] }, { layoutSnapshot: [] }, 'sample-tops'), '')
})

test('両配置の売場だけを候補にし、追加・削除の売場も選択できる', () => {
  const before = { layoutSnapshot: initialStoreMap }
  const after = { layoutSnapshot: [{ ...initialStoreMap.find(zone => zone.type === 'sales'), id: 'denim', name: 'デニム' }] }
  assert.deepEqual(comparisonZones(before, after).map(zone => zone.id), ['sample-bags', 'sample-tops', 'denim'])
  assert.equal(resolveAnalysisZone(before, after, 'denim'), 'denim')
  assert.equal(resolveAnalysisZone(before, after, 'sample-tops'), 'sample-tops')
})

test('売場を切り替えると行動・接客開始・商品購入の指標がまとめて切り替わる', () => {
  const data = aggregate({ zones: [
    { zoneId: 'bags', passedCount: 30, stoppedCount: 9, touchedCount: 7, checkedCount: 5, triedCount: 2, serviceCount: 8, purchasedCount: 2 },
    { zoneId: 'tops', passedCount: 20, stoppedCount: 6, touchedCount: 4, checkedCount: 3, triedCount: 1, serviceCount: 2, purchasedCount: 1 },
  ] })
  const bags = layoutMetrics(data, 'bags')
  const tops = layoutMetrics(data, 'tops')
  for (const [key, first, second] of [['passed', 30, 20], ['stopped', 9, 6], ['touched', 7, 4], ['checked', 5, 3], ['tried', 2, 1], ['zoneService', 8, 2], ['zonePurchase', 2, 1]]) {
    assert.deepEqual(bags[key], metric(first, 50))
    assert.deepEqual(tops[key], metric(second, 50))
    assert.equal(layoutMetrics(data, 'absent')[key].rate, null)
  }
  assert.equal(bags.purchase.rate, tops.purchase.rate)
  assert.equal(layoutMetrics(aggregate(), 'bags').zoneService.rate, null)
})
