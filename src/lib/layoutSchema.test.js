import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test, { before, after } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { initialStoreMap } from '../data/initialStoreMap.js'
import { createObservationState, observationReducer } from './observation.js'
import { toObservationRow } from './observationRepository.js'

let db
const baseSchema = await readFile(new URL('../../supabase/schema.sql', import.meta.url), 'utf8')
const migration = await readFile(new URL('../../supabase/layout-history.sql', import.meta.url), 'utf8')
const initialize = (id) => db.query('select * from public.initialize_layout($1, $2::jsonb)', [id, JSON.stringify(initialStoreMap)])
const save = (id, baseId, snapshot = initialStoreMap, note = '') => db.query('select * from public.save_layout_version($1, $2, $3::jsonb, $4)', [id, baseId, JSON.stringify(snapshot), note])
function observation(id, layoutVersionId, layoutVersion, elements = initialStoreMap) {
  const state = createObservationState({ id, number: 25, startedAt: '2026-10-08T00:00:00Z', elements, layoutVersion, layoutVersionId })
  return toObservationRow(observationReducer(state, { type: 'complete-no-purchase', at: '2026-10-08T00:05:00Z' }).observation)
}
const saveObservation = (row) => db.query('select public.save_observation($1::jsonb)', [JSON.stringify(row)])

before(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated;')
  await db.exec(baseSchema)
  await saveObservation(observation('legacy', null, 'v2'))
  await db.exec(migration)
})
after(async () => { if (db) await db.close() })

test('Phase 4からの移行とSQL再実行で既存の観察を残す', async () => {
  await db.exec(migration)
  const { rows } = await db.query("select layout_version, layout_version_id from public.observations where id = 'legacy'")
  assert.deepEqual(rows, [{ layout_version: 'v2', layout_version_id: null }])
})

test('初期化の再試行・別ブラウザの初期化でもv1は1件だけ作る', async () => {
  const first = await initialize('first-layout')
  const second = await initialize('other-initialization')
  assert.equal(first.rows[0].version_number, 1)
  assert.deepEqual(second.rows, first.rows)
  assert.equal((await db.query('select count(*) as count from public.layout_versions')).rows[0].count, 1)
})

test('v1→v2→v3をDBで採番し、過去のスナップショットと理由を変更しない', async () => {
  const next = initialStoreMap.map(zone => ({ ...zone, memo: 'v2のメモ' }))
  const second = await save('second-layout', 'first-layout', next, '  新商品の露出を増やす  ')
  assert.equal(second.rows[0].version_number, 2)
  assert.equal(second.rows[0].change_note, '新商品の露出を増やす')
  const third = await save('third-layout', 'second-layout', [], '空の配置')
  assert.equal(third.rows[0].version_number, 3)
  const { rows } = await db.query('select * from public.get_layout_history()')
  assert.deepEqual(rows.map(layout => layout.version_number), [1, 2, 3])
  assert.deepEqual(rows[0].layout_snapshot, initialStoreMap)
  assert.deepEqual(rows[1].layout_snapshot, next)
})

test('保存応答を失った後の再試行でも同じバージョンを返し、最新の採番を増やさない', async () => {
  const retry = await save('third-layout', 'second-layout', [], '空の配置')
  assert.equal(retry.rows[0].version_number, 3)
  await assert.rejects(save('third-layout', 'second-layout', [], '違うメモ'), /LAYOUT_REQUEST_MISMATCH/)
  assert.equal((await db.query('select count(*) as count from public.layout_versions')).rows[0].count, 3)
})

test('別の保存後に古いコピーを保存しようとすると競合として拒否する', async () => {
  await assert.rejects(save('conflicting', 'first-layout'), /LAYOUT_CONFLICT/)
  assert.equal((await db.query('select count(*) as count from public.layout_versions')).rows[0].count, 3)
})

test('観察開始後に配置が更新されても、開始した配置に紐づけて保存する', async () => {
  const record = observation('linked-observation', 'first-layout', 'v1')
  await saveObservation(record)
  const { rows } = await db.query("select layout_version, layout_version_id, layout_snapshot from public.observations where id = 'linked-observation'")
  assert.equal(rows[0].layout_version, 'v1')
  assert.equal(rows[0].layout_version_id, 'first-layout')
  assert.deepEqual(rows[0].layout_snapshot, initialStoreMap)
  await saveObservation(record)
  assert.equal((await db.query("select count(*) as count from public.observations where id = 'linked-observation'")).rows[0].count, 1)
  await assert.rejects(saveObservation({ ...record, id: 'wrong-version', layout_version: 'v3' }), /OBSERVATION_LAYOUT_MISMATCH/)
  await assert.rejects(saveObservation({ ...record, id: 'wrong-snapshot', layout_snapshot: [] }), /OBSERVATION_LAYOUT_MISMATCH/)
  await assert.rejects(saveObservation({ ...record, id: 'missing-layout', layout_version_id: 'missing' }), /OBSERVATION_LAYOUT_MISMATCH/)
})

test('公開ロールは履歴取得・追加RPCだけを利用でき、直接上書き・削除できない', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    try {
      await assert.rejects(db.query('select * from public.layout_versions'), { code: '42501' })
      await assert.rejects(db.query("update public.layout_versions set change_note = '上書き'"), { code: '42501' })
      await assert.rejects(db.query('delete from public.layout_versions'), { code: '42501' })
      const history = await db.query('select * from public.get_layout_history()')
      const last = history.rows.at(-1)
      const saved = await save(`public-${role}`, last.id)
      assert.equal(saved.rows[0].version_number, last.version_number + 1)
      await saveObservation(observation(`observation-${role}`, saved.rows[0].id, `v${saved.rows[0].version_number}`))
    } finally { await db.exec('reset role') }
  }
})

test('DBで配列以外のスナップショット・長すぎる変更理由を拒否する', async () => {
  const { rows } = await db.query('select * from public.get_layout_history()')
  await assert.rejects(save('invalid-map', rows.at(-1).id, {}), { code: '23514' })
  await assert.rejects(save('invalid-note', rows.at(-1).id, [], 'a'.repeat(1201)), { code: '23514' })
})
