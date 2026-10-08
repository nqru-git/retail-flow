import assert from 'node:assert/strict'
import test from 'node:test'
import { initialStoreMap } from '../data/initialStoreMap.js'
import { cloneMapElements, createMapElement, ELEMENT_TYPES, MIN_ELEMENT_HEIGHT, MIN_ELEMENT_WIDTH, moveMapElement, resizeMapElement } from './storeMap.js'

const element = { id: 'test', type: 'sales', name: 'バッグ', category: 'バッグ', product: '新作バッグ', memo: 'メモ', x: 30, y: 40, width: 28, height: 22 }

test('編集用のコピーを変えても保存済みのマップは変わらない', () => {
  const saved = cloneMapElements(initialStoreMap)
  const draft = cloneMapElements(saved)
  draft[0].name = '変更した名前'
  draft[0].x = 50
  draft.push({ ...element })
  assert.deepEqual(saved, initialStoreMap)
  assert.notEqual(draft[0], saved[0])
})

test('マップの外にドラッグしても四辺の内側に収まる', () => {
  const topLeft = moveMapElement(element, -1000, -1000)
  const bottomRight = moveMapElement(element, 1000, 1000)
  assert.deepEqual([topLeft.x, topLeft.y], [0, 0])
  assert.deepEqual([bottomRight.x + bottomRight.width, bottomRight.y + bottomRight.height], [100, 100])
  assert.equal(bottomRight.product, element.product)
  assert.deepEqual(element, { ...element, x: 30, y: 40 })
})

test('小さい指の移動を割合で反映し、元の要素を変更しない', () => {
  const moved = moveMapElement(element, 2.56, -1.27)
  assert.deepEqual([moved.x, moved.y], [32.6, 38.7])
  assert.deepEqual([element.x, element.y], [30, 40])
})

test('縮小しすぎても操作できる最小サイズを保つ', () => {
  const resized = resizeMapElement(element, -1000, -1000)
  assert.deepEqual([resized.width, resized.height], [MIN_ELEMENT_WIDTH, MIN_ELEMENT_HEIGHT])
  assert.deepEqual([resized.x, resized.y], [element.x, element.y])
})

test('拡大は右端・下端で止まり、位置と商品情報を維持する', () => {
  const resized = resizeMapElement(element, 1000, 1000)
  assert.deepEqual([resized.width, resized.height], [70, 60])
  assert.deepEqual([resized.x, resized.y, resized.name, resized.product, resized.memo], [30, 40, 'バッグ', '新作バッグ', 'メモ'])
})

test('売場・入口・レジ・試着室を、異なる ID で空き場所に追加できる', () => {
  const elements = cloneMapElements(initialStoreMap)
  for (const type of Object.keys(ELEMENT_TYPES)) {
    const added = createMapElement(type, elements)
    assert.equal(added.type, type)
    assert.equal(added.name, ELEMENT_TYPES[type].label)
    assert.ok(added.x >= 0 && added.y >= 0)
    assert.ok(added.x + added.width <= 100 && added.y + added.height <= 100)
    assert.ok(elements.every(existing => added.x >= existing.x + existing.width || added.x + added.width <= existing.x || added.y >= existing.y + existing.height || added.y + added.height <= existing.y))
    elements.push(added)
  }
  assert.equal(new Set(elements.map(item => item.id)).size, elements.length)
})

test('空き場所がない場合もマップ内に追加できる', () => {
  const added = createMapElement('sales', [{ ...element, x: 0, y: 0, width: 100, height: 100 }])
  assert.ok(added.x >= 0 && added.y >= 0)
  assert.ok(added.x + added.width <= 100 && added.y + added.height <= 100)
})

test('初期配置に通路オブジェクトはなく、すべての四角形がマップ内に収まる', () => {
  assert.ok(initialStoreMap.every(item => Object.hasOwn(ELEMENT_TYPES, item.type)))
  assert.ok(initialStoreMap.every(item => item.x >= 0 && item.y >= 0 && item.x + item.width <= 100 && item.y + item.height <= 100))
})
