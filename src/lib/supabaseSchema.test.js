import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test, { after, before } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { createObservationState, observationReducer } from './observation.js'
import { toObservationRow } from './observationRepository.js'

let db
const schema = await readFile(new URL('../../supabase/schema.sql', import.meta.url), 'utf8')
function row(id, startedAt = '2026-10-08T02:00:00Z', purchase = false) {
  let state = createObservationState({ id, number: 19, elements: [], layoutVersion: 'v2', startedAt })
  const at = new Date(Date.parse(startedAt) + 300_000).toISOString()
  if (purchase) {
    state = observationReducer(state, { type: 'begin-purchase', at })
    state = observationReducer(state, { type: 'complete-purchase', itemIds: ['other'] })
  } else state = observationReducer(state, { type: 'complete-no-purchase', at })
  return toObservationRow(state.observation)
}
const save = (record) => db.query('select public.save_observation($1::jsonb)', [JSON.stringify(record)])

before(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated;')
  await db.exec(schema)
})
after(async () => { if (db) await db.close() })

test('SQLを再実行でき、記録・JSONB・DB側の作成時刻を保存する', async () => {
  await db.exec(schema)
  const record = row('schema-record')
  await save(record)
  const { rows } = await db.query('select * from public.observations where id = $1', [record.id])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].result, 'no-purchase')
  assert.deepEqual(rows[0].route_steps, [])
  assert.deepEqual(rows[0].customer_service, record.customer_service)
  assert.ok(rows[0].created_at instanceof Date)
})

test('同じIDの再試行は重複せず、元の終了時刻・結果を上書きしない', async () => {
  const record = row('retry-record')
  await save(record)
  await save({ ...record, result: 'purchase', purchased_items: [{ id: 'other' }] })
  const { rows } = await db.query('select result, ended_at from public.observations where id = $1', [record.id])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].result, 'no-purchase')
  assert.equal(rows[0].ended_at.toISOString(), record.ended_at)
})

test('日本時間の0時境界と開始日で集計し、前日・翌日を含めない', async () => {
  await save(row('before-jst', '2026-10-09T14:59:59Z', true))
  await save(row('start-jst', '2026-10-09T15:00:00Z', true))
  await save(row('end-jst', '2026-10-10T14:59:59Z'))
  await save(row('after-jst', '2026-10-10T15:00:00Z', true))
  const { rows } = await db.query("select * from public.get_observation_summary('2026-10-10')")
  assert.deepEqual(rows, [{ observed_count: 2, purchased_count: 1 }])
  const empty = await db.query("select * from public.get_observation_summary('2026-11-01')")
  assert.deepEqual(empty.rows, [{ observed_count: 0, purchased_count: 0 }])
})

test('不正な終了結果・時刻・JSON型・購入結果をDB制約で拒否する', async () => {
  for (const changes of [
    { result: 'discarded' },
    { ended_at: '2026-10-08T01:59:00Z' },
    { route_steps: {} },
    { customer_service: [] },
    { result: 'purchase', purchased_items: [] },
    { purchased_items: [{ id: 'other' }] },
  ]) await assert.rejects(save({ ...row('invalid-record'), ...changes }), { code: '23514' })
})

test('RLS有効・公開ロールは記録詳細の読み出しや直接変更ができない', async () => {
  const rls = await db.query("select relrowsecurity from pg_class where oid = 'public.observations'::regclass")
  assert.equal(rls.rows[0].relrowsecurity, true)
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    try {
      await assert.rejects(db.query('select * from public.observations'), { code: '42501' })
      await assert.rejects(db.query('delete from public.observations'), { code: '42501' })
      await assert.rejects(db.query("update public.observations set result = 'no-purchase'"), { code: '42501' })
      await save(row(`public-${role}`))
      const { rows } = await db.query("select * from public.get_observation_summary('2026-10-08')")
      assert.ok(rows[0].observed_count > 0)
    } finally { await db.exec('reset role') }
  }
})
