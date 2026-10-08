import assert from 'node:assert/strict'
import test from 'node:test'
import { initialStoreMap } from '../data/initialStoreMap.js'
import { createObservationState, observationReducer } from './observation.js'
import { createObservationRepository, describeSupabaseError, toObservationRow } from './observationRepository.js'

const create = () => createObservationState({ id: 'observation-test', number: 19, layoutVersion: 'v2', elements: initialStoreMap, startedAt: '2026-10-08T02:00:00Z' })
const completed = () => observationReducer(create(), { type: 'complete-no-purchase', at: '2026-10-08T02:05:00Z' }).observation

test('終了済みの観察をDB用に変換し、配置・ルート・接客・購入データを保持する', () => {
  let state = observationReducer(create(), { type: 'add-route', zoneId: 'sample-bags' })
  state = observationReducer(state, { type: 'toggle-event', event: 'stopped' })
  state = observationReducer(state, { type: 'start-service', at: '2026-10-08T02:01:00Z' })
  state = observationReducer(state, { type: 'begin-purchase', at: '2026-10-08T02:05:00Z' })
  const record = observationReducer(state, { type: 'complete-purchase', itemIds: ['zone-sample-bags', 'zone-sample-tops'], multiple: true }).observation
  const original = structuredClone(record)
  const row = toObservationRow(record)
  assert.equal(row.id, record.id)
  assert.equal(row.started_at, record.startedAt)
  assert.equal(row.ended_at, record.endedAt)
  assert.equal(row.layout_version, 'v2')
  assert.deepEqual(row.layout_snapshot, record.layoutSnapshot)
  assert.deepEqual(row.route_steps[0].events, ['stopped'])
  assert.equal(row.customer_service.hadService, true)
  assert.equal(row.customer_service.sessions[0].endedAt, record.endedAt)
  assert.equal(row.purchased_items.length, 2)
  assert.equal(row.multiple_purchase, true)
  assert.equal(row.result, 'purchase')
  assert.equal(Object.hasOwn(row, 'created_at'), false)
  assert.deepEqual(record, original)
})

test('破棄・未終了の観察はSupabaseへ送らない', async () => {
  let calls = 0
  const repository = createObservationRepository({ rpc: () => { calls++; return { error: null } } })
  const discarded = observationReducer(create(), { type: 'discard' })
  await assert.rejects(repository.save(discarded.observation), /終了した観察/)
  await assert.rejects(repository.save(create().observation), /終了した観察/)
  assert.equal(calls, 0)
})

test('非購入は空の商品配列を保存用RPCへ渡す', async () => {
  const requests = []
  const repository = createObservationRepository({ rpc: async (name, args) => { requests.push({ name, args }); return { error: null } } })
  await repository.save(completed())
  assert.equal(requests[0].name, 'save_observation')
  assert.equal(requests[0].args.p_observation.result, 'no-purchase')
  assert.deepEqual(requests[0].args.p_observation.purchased_items, [])
})

test('保存中に同じ観察を再送せず、同じPromiseを返す', async () => {
  let resolveRequest
  let calls = 0
  const repository = createObservationRepository({ rpc: () => { calls++; return new Promise((resolve) => { resolveRequest = resolve }) } })
  const first = repository.save(completed())
  const second = repository.save(completed())
  assert.equal(first, second)
  assert.equal(calls, 1)
  resolveRequest({ error: null })
  await first
})

test('失敗しても観察を変更せず、同じID・終了時刻で再試行できる', async () => {
  const requests = []
  const record = completed()
  const original = structuredClone(record)
  const repository = createObservationRepository({ rpc: async (name, args) => {
    requests.push(args.p_observation)
    return requests.length === 1 ? { error: { message: 'network error' } } : { error: null }
  } })
  await assert.rejects(repository.save(record))
  assert.deepEqual(record, original)
  await repository.save(record)
  assert.deepEqual(requests[1], requests[0])
})

test('未設定時は保存と人数取得を明示的なエラーにする', async () => {
  const repository = createObservationRepository(null, 'Supabaseが設定されていません。')
  await assert.rejects(repository.save(completed()), { code: 'SUPABASE_NOT_CONFIGURED' })
  await assert.rejects(repository.getTodaySummary('2026-10-08'), { code: 'SUPABASE_NOT_CONFIGURED' })
})

test('人数をDBから取得し、0人も扱い、日本時間の日付をRPCへ渡す', async () => {
  const requests = []
  const repository = createObservationRepository({ rpc: async (name, args) => {
    requests.push({ name, args })
    return { data: [{ observed_count: '0', purchased_count: '0' }], error: null }
  } })
  assert.deepEqual(await repository.getTodaySummary('2026-10-08'), { observedCount: 0, purchasedCount: 0 })
  assert.deepEqual(requests, [{ name: 'get_observation_summary', args: { p_date: '2026-10-08' } }])
})

test('人数取得の失敗や不正な応答を0人として扱わない', async () => {
  for (const response of [{ error: { code: '42501' } }, { data: [], error: null }, { data: [{ observed_count: null, purchased_count: null }], error: null }, { data: [{ observed_count: 1, purchased_count: 2 }], error: null }]) {
    const repository = createObservationRepository({ rpc: async () => response })
    await assert.rejects(repository.getTodaySummary('2026-10-08'))
  }
})

test('保存エラーの表示に内部エラーや資格情報をそのまま出さない', () => {
  assert.match(describeSupabaseError({ code: 'PGRST202' }), /schema.sql/)
  assert.match(describeSupabaseError({ code: '42501' }), /アクセス権限/)
  assert.match(describeSupabaseError(new Error('sensitive internal details')), /通信に失敗/)
  assert.equal(describeSupabaseError({ code: 'SUPABASE_NOT_CONFIGURED', message: 'Supabaseが設定されていません。' }), 'Supabaseが設定されていません。')
})
