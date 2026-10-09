import assert from 'node:assert/strict'
import test from 'node:test'
import { createAnalysisRepository, describeAnalysisError, parseAnalysis } from './analysisRepository.js'

function response() {
  const row = id => ({ layout_version_id: id, observed_count: 3, purchased_count: 2, service_count: 1, service_purchased_count: 1, without_service_count: 2, without_service_purchased_count: 1, zones: [{ zone_id: 'bags', passed_count: 2, stopped_count: 1, touched_count: 1, checked_count: 2, tried_count: 0, purchased_count: 2, service_count: 1 }] })
  return { layouts: [row('first'), row('second')], unlinked_count: 4 }
}

test('2つの履歴IDを1つの読み取りRPCへ送り、集計値だけを変換する', async () => {
  const calls = []
  const repository = createAnalysisRepository({ rpc: (name, args) => { calls.push({ name, args }); return { data: response(), error: null } } })
  const result = await repository.getComparison(['first', 'second'])
  assert.deepEqual(calls, [{ name: 'get_layout_analysis', args: { p_layout_ids: ['first', 'second'] } }])
  assert.equal(result.unlinkedCount, 4)
  assert.deepEqual(result.layouts[0], { layoutId: 'first', observedCount: 3, purchasedCount: 2, serviceCount: 1, servicePurchasedCount: 1, withoutServiceCount: 2, withoutServicePurchasedCount: 1, zones: [{ zoneId: 'bags', passedCount: 2, stoppedCount: 1, touchedCount: 1, checkedCount: 2, triedCount: 0, purchasedCount: 2, serviceCount: 1 }] })
})

test('未設定・同じ配置・不足した選択で通信しない', async () => {
  await assert.rejects(createAnalysisRepository(null).getComparison(['first', 'second']), /SUPABASE_NOT_CONFIGURED/)
  let calls = 0
  const repository = createAnalysisRepository({ rpc: () => { calls++ } })
  for (const ids of [[], ['first'], ['first', 'first'], ['', 'second']]) await assert.rejects(repository.getComparison(ids), /ANALYSIS_REQUIRES_TWO_LAYOUTS/)
  assert.equal(calls, 0)
})

test('取得エラーを0人にせず、再試行時に新しい結果を返す', async () => {
  let failed = true
  const repository = createAnalysisRepository({ rpc: () => failed ? { error: { code: 'PGRST202' } } : { data: response() } })
  await assert.rejects(repository.getComparison(['first', 'second']), { code: 'PGRST202' })
  assert.match(describeAnalysisError({ code: 'PGRST202' }), /supabase\/analysis.sql/)
  assert.match(describeAnalysisError(new Error('network failure')), /再取得/)
  failed = false
  assert.equal((await repository.getComparison(['first', 'second'])).layouts.length, 2)
})

test('欠損・重複・負数・不整合を検出し、不正な割合を表示しない', () => {
  const mutations = [
    data => { data.layouts.pop() },
    data => { data.layouts[1].layout_version_id = 'first' },
    data => { data.layouts[0].observed_count = '3' },
    data => { data.layouts[0].service_count = -1 },
    data => { data.layouts[0].service_purchased_count = 2 },
    data => { data.layouts[0].zones[0].stopped_count = 3 },
    data => { data.layouts[0].zones[0].service_count = 2 },
    data => { data.layouts[0].zones[0].service_count = -1 },
    data => { data.layouts[0].zones[0].service_count = null },
    data => { data.layouts[0].zones.push(data.layouts[0].zones[0]) },
    data => { data.unlinked_count = null },
  ]
  for (const mutate of mutations) { const data = response(); mutate(data); assert.throws(() => parseAnalysis(data, ['first', 'second']), /INVALID_ANALYSIS_DATA/) }
  const data = response()
  // ファネルは独立したイベントの人数。値札確認 > 商品接触も正常です。
  assert.equal(parseAnalysis(data, ['first', 'second']).layouts[0].zones[0].checkedCount, 2)
})

test('旧集計RPCの接客開始人数が未設定でもゾーン選択と他の指標を利用できる', () => {
  const data = response()
  for (const layout of data.layouts) delete layout.zones[0].service_count
  const parsed = parseAnalysis(data, ['first', 'second'])
  assert.equal(parsed.layouts[0].zones[0].serviceCount, null)
  assert.equal(parsed.layouts[0].zones[0].stoppedCount, 1)
  assert.equal(parsed.layouts[0].zones[0].purchasedCount, 2)
})
