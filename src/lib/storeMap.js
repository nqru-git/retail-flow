export const ELEMENT_TYPES = {
  sales: { label: '売場ゾーン', icon: 'layout' },
  entrance: { label: '入口', icon: 'door' },
  checkout: { label: 'レジ', icon: 'register' },
  fitting: { label: '試着室', icon: 'fitting' },
}

// DOMを使わない幾何計算の下限。編集UIでは内容を実測した下限を渡す。
export const MIN_ELEMENT_WIDTH = 0.1
export const MIN_ELEMENT_HEIGHT = 0.1

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const round = (value) => Math.round(value * 10) / 10

export function cloneMapElements(elements) {
  return elements.map((element) => ({ ...element }))
}

export function moveMapElement(element, deltaX, deltaY) {
  return {
    ...element,
    x: round(clamp(element.x + deltaX, 0, 100 - element.width)),
    y: round(clamp(element.y + deltaY, 0, 100 - element.height)),
  }
}

export function resizeMapElement(element, deltaWidth, deltaHeight, minimum = {}) {
  return {
    ...element,
    width: round(clamp(element.width + deltaWidth, minimum.width ?? MIN_ELEMENT_WIDTH, 100 - element.x)),
    height: round(clamp(element.height + deltaHeight, minimum.height ?? MIN_ELEMENT_HEIGHT, 100 - element.y)),
  }
}

export function createMapElement(type, elements) {
  const width = type === 'sales' ? 28 : 24
  const height = type === 'sales' ? 22 : 16
  let position = null

  // 空き場所を優先する。満杯でも追加でき、一覧から重なった要素を選べる。
  for (let y = 2; y <= 98 - height && !position; y += 4) {
    for (let x = 2; x <= 98 - width; x += 4) {
      const overlaps = elements.some((element) => (
        x < element.x + element.width + 2 && x + width + 2 > element.x &&
        y < element.y + element.height + 2 && y + height + 2 > element.y
      ))
      if (!overlaps) {
        position = { x, y }
        break
      }
    }
  }

  return {
    id: globalThis.crypto?.randomUUID?.() ?? `element-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    name: ELEMENT_TYPES[type].label,
    category: '',
    product: '',
    memo: '',
    ...(position ?? { x: (100 - width) / 2, y: (100 - height) / 2 }),
    width,
    height,
  }
}
