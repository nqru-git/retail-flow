// マップと同じDOM・CSSで、折り返した名前、商品名、アイコン、余白を実測する。
// 計測用の要素は毎回取り除き、保存するスナップショットには含めない。
function withMeasurement(board, element, callback) {
  const original = [...(board?.querySelectorAll('.map-element') ?? [])].find(node => node.dataset.elementId === element.id)
  if (!original) return null
  const probe = original.cloneNode(true)
  probe.removeAttribute('data-element-id')
  probe.classList.remove('is-selected')
  probe.querySelector('.map-element__resize')?.remove()
  probe.setAttribute('aria-hidden', 'true')
  Object.assign(probe.style, { position: 'absolute', left: '-10000px', top: '0', width: 'min-content', height: 'auto', visibility: 'hidden', pointerEvents: 'none' })
  const body = probe.querySelector('.map-element__body')
  body.tabIndex = -1
  body.style.height = 'auto'
  body.querySelector('.map-element__name').textContent = element.name.trim() || '名前未設定'
  body.querySelector('.map-element__product')?.remove()
  if (element.type === 'sales' && element.product) {
    const product = document.createElement('span')
    product.className = 'map-element__product'
    product.textContent = element.product
    body.append(product)
  }
  board.append(probe)
  try {
    const rect = board.getBoundingClientRect()
    const intrinsicWidth = probe.getBoundingClientRect().width
    const heightAt = width => {
      probe.style.width = `${width}px`
      return probe.getBoundingClientRect().height
    }
    const widthFor = (height, maxWidth) => {
      let low = Math.min(intrinsicWidth, maxWidth)
      let high = maxWidth
      for (let step = 0; step < 16; step++) {
        const middle = (low + high) / 2
        if (heightAt(middle) <= height + 0.01) high = middle
        else low = middle
      }
      return high
    }
    return callback({ boardWidth: rect.width, boardHeight: rect.height, heightAt, widthFor })
  } finally { probe.remove() }
}

const ceilPercent = (pixels, total) => Math.ceil(pixels / total * 1000 - 1e-6) / 10

export function getMapElementMinimumSize(board, element) {
  return withMeasurement(board, element, ({ boardWidth, boardHeight, heightAt, widthFor }) => ({
    width: ceilPercent(widthFor(element.height / 100 * boardHeight, (100 - element.x) / 100 * boardWidth), boardWidth),
    height: ceilPercent(heightAt(element.width / 100 * boardWidth), boardHeight),
    // 小さいボックスの文字にハンドルを重ねない。端では空き側の角を使う。
    resizeHandleStyle: {
      ...((100 - element.x - element.width) / 100 * boardWidth >= 26 ? { right: -35 } : element.x / 100 * boardWidth >= 26 ? { right: 'auto', left: -35 } : { right: -22 }),
      ...((100 - element.y - element.height) / 100 * boardHeight >= 26 ? { bottom: -35 } : element.y / 100 * boardHeight >= 26 ? { bottom: 'auto', top: -35 } : { bottom: -22 }),
    },
  }))
}

export function fitMapElementSize(board, element, requested = element, { axis = 'both', allowReposition = false } = {}) {
  return withMeasurement(board, element, ({ boardWidth, boardHeight, heightAt, widthFor }) => {
    let x = element.x
    let y = element.y
    let maxWidth = (100 - x) / 100 * boardWidth
    let maxHeight = (100 - y) / 100 * boardHeight
    // 名称変更・狭い画面への切り替えで必要な場合だけ、コピー内で位置を補正する。
    if (allowReposition && heightAt(maxWidth) > maxHeight) {
      if (heightAt(maxWidth) > boardHeight) { x = 0; maxWidth = boardWidth }
      y = Math.max(0, Math.min(y, 100 - ceilPercent(heightAt(maxWidth), boardHeight)))
      maxHeight = (100 - y) / 100 * boardHeight
    }
    let width = Math.min(maxWidth, Math.max(1, requested.width / 100 * boardWidth))
    const minHeight = axis === 'height' ? heightAt(width) : heightAt(maxWidth)
    let height = Math.min(maxHeight, Math.max(minHeight, requested.height / 100 * boardHeight))
    width = Math.max(width, widthFor(height, maxWidth))
    height = Math.max(height, heightAt(width))
    return {
      ...element, x, y,
      width: Math.min(100 - x, ceilPercent(width, boardWidth)),
      height: Math.min(100 - y, ceilPercent(height, boardHeight)),
    }
  }) ?? requested
}
