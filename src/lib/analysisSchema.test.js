import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test, { before, after } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { initialStoreMap } from '../data/initialStoreMap.js'
import { parseAnalysis } from './analysisRepository.js'
import { layoutMetrics } from './analysis.js'

let db
const readSql = name => readFile(new URL(`../../supabase/${name}`, import.meta.url), 'utf8')
const migration = await readSql('analysis.sql')
const route = (zoneId, ...events) => ({ zoneId, zoneName: '表示名', events })
const bag = 'sample-bags'
const top = 'sample-tops'
const nextMap = initialStoreMap.map(zone => zone.id === bag ? { ...zone, name: '入口バッグ', y: 62 } : zone)
const queryAnalysis = (ids = ['first', 'second']) => db.query('select public.get_layout_analysis($1::text[]) as analysis', [ids]).then(result => result.rows[0].analysis)

async function saveObservation(id, layoutId, routeSteps = [], purchasedZoneIds = [], hadService = false, serviceDetails = {}) {
  const version = layoutId === 'first' ? 'v1' : 'v2'
  const row = { id, observation_number: 1, started_at: '2026-10-01T00:00:00Z', ended_at: '2026-10-01T00:05:00Z', layout_version: version, layout_version_id: layoutId, layout_snapshot: layoutId === 'first' ? initialStoreMap : nextMap, route_steps: routeSteps, customer_service: { hadService, ...serviceDetails }, result: purchasedZoneIds.length ? 'purchase' : 'no-purchase', purchased_items: purchasedZoneIds.map((zoneId, index) => ({ id: `item-${index}`, zoneId, productName: '商品' })), multiple_purchase: purchasedZoneIds.length > 1 }
  await db.query('select public.save_observation($1::jsonb)', [JSON.stringify(row)])
}

before(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated;')
  await db.exec(await readSql('schema.sql'))
  await db.exec(await readSql('layout-history.sql'))
  await db.exec(migration)
  await db.query('select * from public.initialize_layout($1, $2::jsonb)', ['first', JSON.stringify(initialStoreMap)])
  await db.query('select * from public.save_layout_version($1, $2, $3::jsonb, $4)', ['second', 'first', JSON.stringify(nextMap), '入口に移動'])
  await db.query('select * from public.save_layout_version($1, $2, $3::jsonb, $4)', ['empty', 'second', '[]', '空の配置'])
  await saveObservation('a1', 'first', [route(bag, 'stopped', 'touchedProduct'), route(bag, 'checkedPriceTag', 'triedOn'), route(bag, 'stopped')], [bag], true, { startedZone: { zoneId: bag }, sessions: [{ startedZone: { zoneId: bag } }, { startedZone: { zoneId: bag } }] })
  await saveObservation('a2', 'first', [route(bag, 'stopped')], [top], false, { startedZone: { zoneId: bag }, sessions: [{ startedZone: { zoneId: bag } }] })
  await saveObservation('a3', 'first', [route(bag, 'checkedPriceTag'), route('sample-fitting', 'triedOn')])
  await saveObservation('a4', 'first')
  await saveObservation('b1', 'second', [route(bag, 'stopped', 'touchedProduct', 'checkedPriceTag')], [bag, bag])
  await saveObservation('b2', 'second', [route(bag, 'stopped'), route(top)], [], true, { startedZone: { zoneId: top }, sessions: [{ startedZone: { zoneId: top } }, { startedZone: { zoneId: bag } }, { startedZone: { zoneId: bag } }] })
  await saveObservation('b3', 'second', [], [bag, top], true)
  await saveObservation('legacy', null, [route(bag, 'stopped')], [bag], true)
})
after(async () => { if (db) await db.close() })

test('再訪・行動・複数購入を顧客ごとに集計し、履歴IDなしは除外する', async () => {
  const result = parseAnalysis(await queryAnalysis(), ['first', 'second'])
  assert.equal(result.unlinkedCount, 1)
  const first = result.layouts[0]
  assert.equal(first.observedCount, 4)
  assert.equal(first.purchasedCount, 2)
  assert.deepEqual(first.zones.find(zone => zone.zoneId === bag), { zoneId: bag, passedCount: 3, stoppedCount: 2, touchedCount: 1, checkedCount: 2, triedCount: 1, purchasedCount: 1, serviceCount: 1 })
  const second = result.layouts[1]
  assert.equal(second.observedCount, 3)
  assert.deepEqual(second.zones.find(zone => zone.zoneId === bag), { zoneId: bag, passedCount: 2, stoppedCount: 2, touchedCount: 1, checkedCount: 1, triedCount: 0, purchasedCount: 2, serviceCount: 1 })
  assert.equal(second.zones.find(zone => zone.zoneId === top).purchasedCount, 1)
})

test('接客開始ゾーンと各セッションで集計し、再開の重複・接客なし・開始ゾーン不明を割り当てない', async () => {
  const result = parseAnalysis(await queryAnalysis(), ['first', 'second'])
  assert.equal(result.layouts[0].zones.find(zone => zone.zoneId === bag).serviceCount, 1)
  assert.equal(result.layouts[0].zones.find(zone => zone.zoneId === top).serviceCount, 0)
  assert.equal(result.layouts[1].serviceCount, 2)
  assert.equal(result.layouts[1].zones.find(zone => zone.zoneId === bag).serviceCount, 1)
  assert.equal(result.layouts[1].zones.find(zone => zone.zoneId === top).serviceCount, 1)
  assert.equal(layoutMetrics(result.layouts[0], bag).zoneService.rate, 25)
  assert.ok(Math.abs(layoutMetrics(result.layouts[1], top).zoneService.rate - 100 / 3) < 1e-10)
})

test('接客別の購入率は各群が分母、名前変更後も同じIDで集計する', async () => {
  const result = parseAnalysis(await queryAnalysis(), ['first', 'second'])
  const first = layoutMetrics(result.layouts[0], bag)
  const second = layoutMetrics(result.layouts[1], bag)
  assert.equal(first.withServicePurchase.rate, 100)
  assert.ok(Math.abs(first.withoutServicePurchase.rate - 100 / 3) < 1e-10)
  assert.equal(second.withServicePurchase.rate, 50)
  assert.equal(second.withoutServicePurchase.rate, 100)
  assert.equal(first.stopped.rate, 50)
})

test('観察0人・ゾーンなしでも両方の配置を返し、割合は未算出', async () => {
  const result = parseAnalysis(await queryAnalysis(['second', 'empty']), ['second', 'empty'])
  const empty = result.layouts[1]
  assert.equal(empty.observedCount, 0)
  assert.deepEqual(empty.zones, [])
  assert.equal(layoutMetrics(empty, bag).purchase.rate, null)
  const first = result.layouts[0]
  assert.equal(first.zones.find(zone => zone.zoneId === 'sample-entrance').passedCount, 0)
})

test('単一・同じ配置・不明な配置をSQLで拒否する', async () => {
  await assert.rejects(queryAnalysis(['first']), /ANALYSIS_REQUIRES_TWO_LAYOUTS/)
  await assert.rejects(queryAnalysis(['first', 'first']), /ANALYSIS_REQUIRES_TWO_LAYOUTS/)
  await assert.rejects(queryAnalysis(['first', 'missing']), /ANALYSIS_LAYOUT_NOT_FOUND/)
})

test('SQL再実行は既存の観察と配置を変更しない', async () => {
  const before = await queryAnalysis()
  await db.exec(migration)
  assert.deepEqual(await queryAnalysis(), before)
  assert.equal((await db.query('select count(*) as count from public.observations')).rows[0].count, 8)
})

test('公開ロールに集計RPCだけを追加し、観察詳細の権限は増やさない', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    try {
      const data = await queryAnalysis()
      assert.equal(data.layouts.length, 2)
      assert.equal(JSON.stringify(data).includes('route_steps'), false)
      assert.equal(JSON.stringify(data).includes('started_at'), false)
      assert.equal(JSON.stringify(data).includes('productName'), false)
      await assert.rejects(db.query('select * from public.observations'), { code: '42501' })
      await assert.rejects(db.query('delete from public.observations'), { code: '42501' })
    } finally { await db.exec('reset role') }
  }
})
