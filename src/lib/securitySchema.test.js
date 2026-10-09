import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test, { before, after } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { initialStoreMap } from '../data/initialStoreMap.js'
import { createObservationState, observationReducer } from './observation.js'
import { toObservationRow } from './observationRepository.js'

const sql = await Promise.all(['schema.sql', 'layout-history.sql', 'analysis.sql', 'security.sql'].map(name => readFile(new URL(`../../supabase/${name}`, import.meta.url), 'utf8')))
const storeA = '00000000-0000-4000-8000-000000000001'
const storeB = '00000000-0000-4000-8000-000000000002'
const userA = '10000000-0000-4000-8000-000000000001'
const userB = '10000000-0000-4000-8000-000000000002'
const unassigned = '10000000-0000-4000-8000-000000000003'
let db
function record(id, layoutId = 'a-v1', version = 'v1') {
  const state = createObservationState({ id, number: 1, startedAt: '2026-10-09T01:00:00Z', elements: initialStoreMap, layoutVersion: version, layoutVersionId: layoutId })
  return toObservationRow(observationReducer(state, { type: 'complete-no-purchase', at: '2026-10-09T01:01:00Z' }).observation)
}
async function asUser(user, callback, role = 'authenticated') {
  return db.transaction(async tx => {
    await tx.exec(`set local role ${role}`)
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user ?? ''])
    return callback(tx)
  })
}
const saveObservation = (tx, row) => tx.query('select public.save_observation($1::jsonb)', [JSON.stringify(row)])

before(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
    grant usage on schema auth to anon, authenticated;
    insert into auth.users values ('${userA}'), ('${userB}'), ('${unassigned}');`)
  for (const migration of sql.slice(0, 3)) await db.exec(migration)
  await db.query('select * from public.initialize_layout($1, $2::jsonb)', ['a-v1', JSON.stringify(initialStoreMap)])
  await db.query('select * from public.save_layout_version($1, $2, $3::jsonb, $4)', ['a-v2', 'a-v1', JSON.stringify(initialStoreMap), '移行前の変更理由'])
  await saveObservation(db, record('legacy-linked'))
  await saveObservation(db, record('legacy-unlinked', null))
  await db.exec(sql[3])
  // No implicit assignment: existing data remains inaccessible until administrator enrollment.
  await assert.rejects(asUser(userA, tx => tx.query('select * from public.get_layout_history()')), /STORE_MEMBERSHIP_REQUIRED/)
  await db.query('insert into public.stores(id, name) values ($1, $2)', [storeB, '店舗B'])
  await db.query('insert into public.store_members(user_id, store_id, role) values ($1, $2, $3), ($4, $5, $6)', [userA, storeA, 'owner', userB, storeB, 'staff'])
  await asUser(userB, async tx => {
    await tx.query('select * from public.initialize_layout($1, $2::jsonb)', ['b-v1', JSON.stringify(initialStoreMap)])
    await tx.query('select * from public.save_layout_version($1, $2, $3::jsonb, $4)', ['b-v2', 'b-v1', JSON.stringify(initialStoreMap), 'Bだけの変更理由'])
    await saveObservation(tx, record('b-observation', 'b-v1'))
    await saveObservation(tx, record('b-unlinked', null))
  })
})
after(async () => { if (db) await db.close() })

test('移行・再実行で既存データと関連・変更理由を保持し、店舗単位でv1を持てる', async () => {
  await db.exec(sql[3])
  const rows = (await db.query('select id, store_id, layout_version_id from public.observations order by id')).rows
  assert.deepEqual(rows.find(row => row.id === 'legacy-linked'), { id: 'legacy-linked', store_id: storeA, layout_version_id: 'a-v1' })
  assert.equal(rows.find(row => row.id === 'legacy-unlinked').layout_version_id, null)
  const layouts = (await db.query('select store_id, version_number, change_note from public.layout_versions order by store_id, version_number')).rows
  assert.deepEqual(layouts.map(row => row.version_number), [1, 2, 1, 2])
  assert.equal(layouts[1].change_note, '移行前の変更理由')
})

test('未ログインは全店舗テーブルと全RPCの読み書きが拒否される', async () => {
  for (const table of ['observations', 'layout_versions', 'stores', 'store_members']) {
    for (const query of [`select * from public.${table}`, `delete from public.${table}`]) {
      await assert.rejects(asUser(null, tx => tx.query(query), 'anon'), { code: '42501' })
    }
  }
  for (const query of [
    'select * from public.get_layout_history()', 'select * from public.get_current_store()',
    "select * from public.get_observation_summary('2026-10-09'::date)",
    "select public.get_layout_analysis(array['a-v1','a-v2'])",
    "select * from public.initialize_layout('anonymous', '[]'::jsonb)",
    "select * from public.save_layout_version('anonymous', 'a-v2', '[]'::jsonb, '')",
  ]) await assert.rejects(asUser(null, tx => tx.query(query), 'anon'), { code: '42501' })
  await assert.rejects(asUser(null, tx => saveObservation(tx, record('anon-write')), 'anon'), { code: '42501' })
  await assert.rejects(asUser(null, tx => tx.query('select * from public.get_layout_history()')), /LOGIN_REQUIRED/)
  await assert.rejects(asUser(null, tx => saveObservation(tx, record('missing-uid'))), /LOGIN_REQUIRED/)
})

test('店舗Aは店舗Bの観察・履歴・所属・店舗名を読めない', async () => {
  await asUser(userA, async tx => {
    assert.ok((await tx.query('select * from public.observations')).rows.every(row => row.store_id === storeA))
    assert.deepEqual((await tx.query("select * from public.observations where id = 'b-observation'")).rows, [])
    assert.deepEqual((await tx.query('select * from public.layout_versions where store_id = $1', [storeB])).rows, [])
    assert.deepEqual((await tx.query('select * from public.get_layout_history()')).rows.map(row => row.id), ['a-v1', 'a-v2'])
    assert.deepEqual((await tx.query('select * from public.store_members')).rows.map(row => row.user_id), [userA])
    assert.deepEqual((await tx.query('select * from public.stores')).rows.map(row => row.id), [storeA])
  })
})

test('店舗Aは他店舗への直接INSERT・RPC保存・store_id移動を行えない', async () => {
  await assert.rejects(asUser(userA, tx => tx.query('insert into public.layout_versions(id, store_id, version_number, layout_snapshot) values ($1, $2, 3, $3::jsonb)', ['cross-layout', storeB, JSON.stringify(initialStoreMap)])), { code: '42501' })
  await assert.rejects(asUser(userA, tx => saveObservation(tx, { ...record('cross-observation'), store_id: storeB })), { code: '42501' })
  await assert.rejects(asUser(userA, tx => saveObservation(tx, record('cross-link', 'b-v1'))), { code: '42501' })
  await assert.rejects(asUser(userA, tx => tx.query('update public.observations set store_id = $1 where id = $2', [storeB, 'legacy-unlinked'])), { code: '42501' })
  const query = "insert into public.observations(id, store_id, observation_number, started_at, ended_at, layout_version, result) values ('direct-cross', $1, 1, now(), now(), 'v1', 'no-purchase')"
  await assert.rejects(asUser(userA, tx => tx.query(query, [storeB])), { code: '42501' })
  await assert.rejects(asUser(userA, tx => saveObservation(tx, record('b-observation', null))), { code: '42501' })
})

test('他店舗データのUPDATEは0件になり、所属・roleの自己変更は拒否される', async () => {
  await asUser(userA, async tx => {
    const rows = await tx.query("update public.observations set layout_version = 'v999' where id = 'b-observation' returning id")
    assert.deepEqual(rows.rows, [])
    assert.deepEqual((await tx.query("update public.layout_versions set change_note = '改ざん' where id = 'b-v2' returning id")).rows, [])
  })
  await assert.rejects(asUser(userA, tx => tx.query("update public.store_members set store_id = $1, role = 'owner'", [storeB])), { code: '42501' })
  await assert.rejects(asUser(userA, tx => tx.query('insert into public.store_members(user_id, store_id) values ($1,$2)', [unassigned, storeA])), { code: '42501' })
})

test('自店舗の保存・取得・再試行・UPDATE・今日の集計は動作する', async () => {
  await asUser(userA, async tx => {
    const row = { ...record('own-saved'), store_id: storeA }
    await saveObservation(tx, row)
    await saveObservation(tx, row)
    assert.equal((await tx.query("select count(*) as count from public.observations where id = 'own-saved'")).rows[0].count, 1)
    assert.equal((await tx.query("update public.observations set observation_number = 2 where id = 'own-saved' returning observation_number")).rows[0].observation_number, 2)
    const counts = (await tx.query("select * from public.get_observation_summary('2026-10-09')")).rows[0]
    assert.deepEqual(counts, { observed_count: 3, purchased_count: 0 })
  })
})

test('配置の店舗間参照は複合FKでも拒否し、過去マップとDELETEは許可しない', async () => {
  const query = "insert into public.observations(id, store_id, layout_version_id, observation_number, started_at, ended_at, layout_version, customer_service, result) values ('cross-fk', $1, 'b-v1', 1, now(), now(), 'v1', '{}', 'no-purchase')"
  await assert.rejects(asUser(userA, tx => tx.query(query, [storeA])), { code: '23503' })
  await assert.rejects(asUser(userA, tx => tx.query("update public.layout_versions set layout_snapshot = '[]'::jsonb where id = 'a-v1'")), { code: '42501' })
  for (const table of ['observations', 'layout_versions', 'stores', 'store_members']) await assert.rejects(asUser(userA, tx => tx.query(`delete from public.${table}`)), { code: '42501' })
})

test('分析RPCは自店舗のみ集計し、他店舗ID・混在ID・任意store_idを受け付けない', async () => {
  await asUser(userA, async tx => {
    const data = (await tx.query("select public.get_layout_analysis(array['a-v1','a-v2']) as data")).rows[0].data
    assert.equal(data.unlinked_count, 1)
    assert.equal(data.layouts.find(row => row.layout_version_id === 'a-v1').observed_count, 2)
    assert.ok(data.layouts.every(row => row.layout_version_id.startsWith('a-')))
  })
  for (const ids of [['b-v1', 'b-v2'], ['a-v1', 'b-v2']]) await assert.rejects(asUser(userA, tx => tx.query('select public.get_layout_analysis($1::text[])', [ids])), { code: '42501' })
  await assert.rejects(asUser(userA, tx => tx.query('select public.get_layout_analysis($1::text[], $2::uuid)', [['a-v1', 'a-v2'], storeB])), { code: '42883' })
  const b = await asUser(userB, tx => tx.query("select public.get_layout_analysis(array['b-v1','b-v2']) as data"))
  assert.equal(b.rows[0].data.layouts[0].observed_count, 1)
  assert.equal(b.rows[0].data.unlinked_count, 1)
})

test('所属未登録・ログアウト後はデータを取得・保存できない', async () => {
  await assert.rejects(asUser(unassigned, tx => saveObservation(tx, record('unassigned'))), /STORE_MEMBERSHIP_REQUIRED/)
  assert.deepEqual((await asUser(unassigned, tx => tx.query('select * from public.observations'))).rows, [])
  await asUser(userA, tx => tx.query('select * from public.get_layout_history()'))
  await assert.rejects(asUser(null, tx => tx.query('select * from public.get_layout_history()'), 'anon'), { code: '42501' })
  await assert.rejects(asUser(null, tx => saveObservation(tx, record('after-logout')), 'anon'), { code: '42501' })
})

test('全対象テーブルのRLS・関数invoker・固定search_path・匿名EXECUTE禁止を確認する', async () => {
  const tables = (await db.query("select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname in ('stores','store_members','observations','layout_versions')")).rows
  assert.equal(tables.length, 4)
  assert.ok(tables.every(row => row.relrowsecurity))
  const functions = (await db.query("select proname, prosecdef, proconfig, has_function_privilege('anon', oid, 'EXECUTE') as anon_exec from pg_proc where pronamespace = 'public'::regnamespace and proname in ('get_current_store','get_layout_history','save_layout_version','initialize_layout','save_observation','get_observation_summary','get_layout_analysis')")).rows
  assert.equal(functions.length, 7)
  assert.ok(functions.every(row => !row.prosecdef && !row.anon_exec && row.proconfig.includes('search_path=""')))
})

test('旧SQLを再実行して匿名権限が復活することを防ぐ', async () => {
  for (const legacy of sql.slice(0, 3)) {
    await assert.rejects(db.exec(legacy), /SECURITY_ALREADY_APPLIED/)
    await db.exec('rollback')
  }
  await assert.rejects(asUser(null, tx => saveObservation(tx, record('legacy-bypass')), 'anon'), { code: '42501' })
})
