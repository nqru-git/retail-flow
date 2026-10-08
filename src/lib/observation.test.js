import assert from 'node:assert/strict'
import test from 'node:test'
import { initialStoreMap } from '../data/initialStoreMap.js'
import { createObservationState, getPurchaseCandidates, observationDate, observationReducer, summarizeObservations } from './observation.js'

const startedAt = '2026-10-08T02:00:00.000Z'
const serviceAt = '2026-10-08T02:01:00.000Z'
const endedAt = '2026-10-08T02:05:00.000Z'
const laterAt = '2026-10-08T02:06:00.000Z'
const start = () => createObservationState({ id: 'observation-19', number: 19, startedAt, elements: initialStoreMap, layoutVersion: 'v2' })
const tap = (state, zoneId) => observationReducer(state, { type: 'add-route', zoneId })
const event = (state, value) => observationReducer(state, { type: 'toggle-event', event: value })
const undo = (state) => observationReducer(state, { type: 'undo' })
const serve = (state, at = serviceAt) => observationReducer(state, { type: 'start-service', at })
const purchase = (state) => observationReducer(state, { type: 'begin-purchase', at: endedAt })

test('開始時に観察番号・時刻・日本時間の日付・配置のコピーを保持する', () => {
  const state = start()
  assert.equal(state.stage, 'observing')
  assert.equal(state.observation.number, 19)
  assert.equal(state.observation.startedAt, startedAt)
  assert.equal(state.observation.date, '2026-10-08')
  assert.equal(state.observation.layoutVersion, 'v2')
  state.mapElements[0].name = 'コピーだけ変更'
  assert.equal(state.observation.layoutSnapshot[0].name, '試着室')
  assert.equal(initialStoreMap[0].name, '試着室')
  assert.equal(observationDate('2026-10-07T15:00:00.000Z'), '2026-10-08')
})

test('入口を含めてタップ順を保持し、再訪を別のステップとして記録する', () => {
  let state = tap(start(), 'sample-entrance')
  state = tap(state, 'sample-bags')
  state = event(state, 'stopped')
  state = tap(state, 'sample-entrance')
  assert.deepEqual(state.observation.routeSteps.map(step => step.zoneName), ['入口', '新作バッグ', '入口'])
  assert.deepEqual(state.observation.routeSteps.map(step => step.events), [[], ['stopped'], []])
})

test('4種類のイベントを現在の訪問にだけON/OFFできる', () => {
  let state = event(tap(start(), 'sample-bags'), 'stopped')
  state = tap(state, 'sample-tops')
  for (const value of ['stopped', 'touchedProduct', 'checkedPriceTag', 'triedOn']) state = event(state, value)
  assert.deepEqual(state.observation.routeSteps[1].events, ['stopped', 'touchedProduct', 'checkedPriceTag', 'triedOn'])
  state = event(state, 'checkedPriceTag')
  assert.deepEqual(state.observation.routeSteps[1].events, ['stopped', 'touchedProduct', 'triedOn'])
  assert.deepEqual(state.observation.routeSteps[0].events, ['stopped'])
})

test('ルート未選択・不正なゾーンやイベントでは記録を追加しない', () => {
  const state = start()
  assert.equal(event(state, 'stopped'), state)
  assert.equal(serve(state), state)
  assert.equal(tap(state, 'missing'), state)
  const selected = tap(state, 'sample-bags')
  assert.equal(event(selected, 'unknown'), selected)
  assert.equal(undo(state), state)
})

test('1つ戻すでOFF操作をONへ戻し、その後イベントとルートを順に取り消す', () => {
  const original = start()
  let state = event(tap(original, 'sample-bags'), 'stopped')
  state = event(state, 'stopped')
  state = undo(state)
  assert.deepEqual(state.observation.routeSteps[0].events, ['stopped'])
  state = undo(state)
  assert.deepEqual(state.observation.routeSteps[0].events, [])
  state = undo(state)
  assert.deepEqual(state.observation.routeSteps, [])
  assert.deepEqual(original.observation.routeSteps, [])
})

test('ルートを戻すと前のゾーンとその行動イベントが復元される', () => {
  let state = event(tap(start(), 'sample-bags'), 'touchedProduct')
  state = undo(tap(state, 'sample-tops'))
  assert.equal(state.observation.routeSteps.at(-1).zoneName, '新作バッグ')
  assert.deepEqual(state.observation.routeSteps.at(-1).events, ['touchedProduct'])
})

test('接客開始時刻・ゾーンを記録し、接客中はルートやイベントを追加しない', () => {
  const state = serve(event(tap(start(), 'sample-bags'), 'stopped'))
  assert.equal(state.stage, 'serving')
  assert.equal(state.observation.customerService.hadService, true)
  assert.equal(state.observation.customerService.startedAt, serviceAt)
  assert.deepEqual(state.observation.customerService.startedZone, { zoneId: 'sample-bags', zoneName: '新作バッグ' })
  assert.equal(tap(state, 'sample-tops'), state)
  assert.equal(event(state, 'triedOn'), state)
  assert.equal(undo(state), state)
})

test('接客終了後に観察を再開でき、取り消しでも接客情報を消さない', () => {
  const serving = serve(event(tap(start(), 'sample-bags'), 'stopped'))
  const resumed = observationReducer(serving, { type: 'resume', at: endedAt })
  assert.equal(resumed.stage, 'observing')
  assert.equal(resumed.observation.customerService.sessions[0].endedAt, endedAt)
  const undone = undo(resumed)
  assert.deepEqual(undone.observation.routeSteps[0].events, [])
  assert.equal(undone.observation.customerService.hadService, true)
  assert.equal(serving.observation.customerService.sessions[0].endedAt, null)
})

test('接客を再開しても最初の接客情報と各回の情報を保持する', () => {
  let state = serve(tap(start(), 'sample-bags'))
  state = observationReducer(state, { type: 'resume', at: endedAt })
  state = serve(tap(state, 'sample-tops'), laterAt)
  assert.equal(state.observation.customerService.startedAt, serviceAt)
  assert.equal(state.observation.customerService.sessions.length, 2)
  assert.equal(state.observation.customerService.sessions[1].startedZone.zoneName, 'トップス')
})

test('購入候補は立ち寄った売場の順を優先し、入口や重複した訪問を候補にしない', () => {
  let state = tap(tap(tap(start(), 'sample-entrance'), 'sample-tops'), 'sample-tops')
  const candidates = getPurchaseCandidates(state.mapElements, state.observation.routeSteps)
  assert.deepEqual(candidates.map(item => item.id), ['zone-sample-tops', 'zone-sample-bags', 'other'])
  assert.equal(candidates[0].visited, true)
  assert.equal(candidates[0].productName, 'ニット・シャツ')
  state = tap(state, 'sample-bags')
  assert.deepEqual(getPurchaseCandidates(state.mapElements, state.observation.routeSteps).map(item => item.visited), [true, true, false])
})

test('商品名が空でもゾーン名を使い、マップが空でもその他の商品を記録できる', () => {
  assert.equal(getPurchaseCandidates([{ ...initialStoreMap[2], product: '' }], [])[0].productName, '新作バッグ')
  const state = purchase(createObservationState({ id: 'empty', number: 20, elements: [], layoutVersion: 'v2', startedAt }))
  const completed = observationReducer(state, { type: 'complete-purchase', itemIds: ['other'] })
  assert.equal(completed.observation.result, 'purchase')
  assert.equal(completed.observation.purchasedItems[0].zoneId, null)
})

test('購入の終了時刻は候補選択を始めた時点で固定し、選択した商品情報を保持する', () => {
  const state = purchase(serve(tap(start(), 'sample-bags')))
  const completed = observationReducer(state, { type: 'complete-purchase', itemIds: ['zone-sample-bags'] })
  assert.equal(completed.stage, 'completed')
  assert.equal(completed.observation.endedAt, endedAt)
  assert.equal(completed.observation.customerService.sessions[0].endedAt, endedAt)
  assert.equal(completed.observation.result, 'purchase')
  assert.equal(completed.observation.purchasedItems[0].productName, 'ボストンバッグ')
  assert.equal(completed.observation.layoutVersion, 'v2')
  assert.equal(tap(completed, 'sample-tops'), completed)
})

test('複数購入は重複しない商品配列を保持し、未選択や不正候補では終了しない', () => {
  const state = purchase(start())
  assert.equal(observationReducer(state, { type: 'complete-purchase', itemIds: [] }), state)
  assert.equal(observationReducer(state, { type: 'complete-purchase', itemIds: ['invalid'] }), state)
  const completed = observationReducer(state, { type: 'complete-purchase', itemIds: ['zone-sample-bags', 'zone-sample-tops', 'zone-sample-bags'], multiple: true })
  assert.equal(completed.observation.purchasedItems.length, 2)
  assert.equal(completed.observation.multiplePurchase, true)
})

test('購入選択から戻ると接客中の状態・時刻・ルートが復元される', () => {
  const serving = serve(event(tap(start(), 'sample-bags'), 'checkedPriceTag'))
  const resumed = observationReducer(purchase(serving), { type: 'cancel-purchase' })
  assert.equal(resumed.stage, 'serving')
  assert.equal(resumed.observation.endedAt, null)
  assert.deepEqual(resumed.observation, serving.observation)
})

test('接客中から非購入で終了でき、購入商品は空で接客の終了時刻を記録する', () => {
  const state = observationReducer(serve(tap(start(), 'sample-tops')), { type: 'complete-no-purchase', at: endedAt })
  assert.equal(state.stage, 'completed')
  assert.equal(state.observation.result, 'no-purchase')
  assert.deepEqual(state.observation.purchasedItems, [])
  assert.equal(state.observation.endedAt, endedAt)
  assert.equal(state.observation.customerService.sessions[0].endedAt, endedAt)
})

test('購入選択中から非購入に修正しても最初の終了時刻を維持する', () => {
  const state = observationReducer(purchase(start()), { type: 'complete-no-purchase', at: laterAt })
  assert.equal(state.observation.result, 'no-purchase')
  assert.equal(state.observation.endedAt, endedAt)
})

test('破棄すると観察データ・ルート・取り消し用データを残さない', () => {
  const state = observationReducer(serve(event(tap(start(), 'sample-bags'), 'stopped')), { type: 'discard' })
  assert.equal(state.stage, 'discarded')
  assert.equal(state.observation, null)
  assert.deepEqual(state.undoStack, [])
  assert.deepEqual(state.mapElements, [])
  assert.equal(observationReducer(state, { type: 'complete-no-purchase', at: endedAt }), state)
})

test('今日の人数には終了した当日の記録だけを数え、購入人数は購入だけを数える', () => {
  const noPurchase = observationReducer(start(), { type: 'complete-no-purchase', at: endedAt }).observation
  const bought = observationReducer(purchase(start()), { type: 'complete-purchase', itemIds: ['other'] }).observation
  const yesterday = { ...bought, date: '2026-10-07' }
  assert.deepEqual(summarizeObservations([noPurchase, bought, yesterday, start().observation], '2026-10-08'), { observedCount: 2, purchasedCount: 1 })
})
