import assert from 'node:assert/strict'
import test from 'node:test'
import { initialStoreMap } from '../data/initialStoreMap.js'
import { createLayoutRepository, describeLayoutError, fromLayoutRow } from './layoutRepository.js'

const row = (number = 1) => ({ id: `layout-${number}`, version_number: number, created_at: '2026-10-08T00:00:00Z', layout_snapshot: structuredClone(initialStoreMap), change_note: '変更理由' })
const request = () => ({ id: 'layout-2', baseId: 'layout-1', layoutSnapshot: structuredClone(initialStoreMap), changeNote: '  入口の露出を増やす  ' })

test('履歴を採番順に取得し、DBのデータをコピーする', async () => {
  const rows = [row(3), row(1), row(2)]
  const repository = createLayoutRepository({ rpc: async name => { assert.equal(name, 'get_layout_history'); return { data: rows, error: null } } })
  const history = await repository.getHistory()
  assert.deepEqual(history.map(layout => layout.versionNumber), [1, 2, 3])
  history[0].layoutSnapshot[0].name = '編集'
  assert.equal(rows[1].layout_snapshot[0].name, '試着室')
})

test('初期化と保存を別RPCにし、保存時の採番はDBに任せる', async () => {
  const calls = []
  const repository = createLayoutRepository({ rpc: async (name, args) => { calls.push({ name, args }); return { data: [row(name === 'initialize_layout' ? 1 : 2)], error: null } } })
  assert.equal((await repository.initialize('initial-id', initialStoreMap)).versionNumber, 1)
  const saved = await repository.save(request())
  assert.equal(saved.versionNumber, 2)
  assert.equal(calls[1].args.p_base_id, 'layout-1')
  assert.equal(calls[1].args.p_change_note, '入口の露出を増やす')
  assert.equal(Object.hasOwn(calls[1].args, 'version_number'), false)
})

test('保存の連打を防ぎ、失敗した同じIDを再試行できる', async () => {
  let finish
  const calls = []
  const repository = createLayoutRepository({ rpc: (name, args) => { calls.push(args); return new Promise(resolve => { finish = resolve }) } })
  const record = request()
  const original = structuredClone(record)
  const first = repository.save(record)
  assert.equal(repository.save(record), first)
  finish({ error: { message: 'network' } })
  await assert.rejects(first)
  const retry = repository.save(record)
  assert.deepEqual(calls[1], calls[0])
  finish({ data: [row(2)], error: null })
  await retry
  assert.deepEqual(record, original)
})

test('未設定・読み出し失敗・不正なデータをエラーにし、仮のDB履歴で置き換えない', async () => {
  await assert.rejects(createLayoutRepository(null).getHistory(), { code: 'SUPABASE_NOT_CONFIGURED' })
  for (const response of [{ error: { code: '42501' } }, { data: null }, { data: [row(1), row(1)] }, { data: [{ ...row(), layout_snapshot: [{}] }] }]) {
    await assert.rejects(createLayoutRepository({ rpc: async () => response }).getHistory())
  }
  assert.throws(() => fromLayoutRow({ ...row(), created_at: 'invalid' }))
})

test('入力が不正な場合は保存RPCを送らない', async () => {
  let calls = 0
  const repository = createLayoutRepository({ rpc: () => { calls++; return { data: [row(2)] } } })
  await assert.rejects(repository.save({ ...request(), layoutSnapshot: [{}] }))
  assert.equal(calls, 0)
})

test('競合と未設定のSQLについて、修正に必要な案内を表示する', () => {
  assert.match(describeLayoutError({ code: 'P0001', message: 'LAYOUT_CONFLICT' }), /編集内容は保持/)
  assert.match(describeLayoutError({ code: 'PGRST202' }), /layout-history.sql/)
  assert.match(describeLayoutError(new Error('internal secret')), /再試行/)
})
