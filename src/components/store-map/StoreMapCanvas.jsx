import { useEffect, useRef } from 'react'
import Icon from '../Icon.jsx'
import { ELEMENT_TYPES, moveMapElement, resizeMapElement } from '../../lib/storeMap.js'
import { fitMapElementSize, getMapElementMinimumSize } from '../../lib/mapElementSizing.js'

export default function StoreMapCanvas({ elements, selectedId, onSelect, onChange, boardRef, minimumSizes, onMinimumSizesChange }) {
  const gestureRef = useRef(null)

  useEffect(() => {
    let active = true
    let frame
    function scheduleMeasurement() {
      if (!active) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const minimumSizes = {}
        for (const element of elements) {
          const fitted = fitMapElementSize(boardRef.current, element, element, { allowReposition: true })
          if (['x', 'y', 'width', 'height'].some(key => fitted[key] !== element[key])) onChange(element.id, fitted)
          minimumSizes[element.id] = getMapElementMinimumSize(boardRef.current, fitted)
        }
        onMinimumSizesChange(minimumSizes)
      })
    }
    const observer = new ResizeObserver(scheduleMeasurement)
    observer.observe(boardRef.current)
    scheduleMeasurement()
    document.fonts?.ready.then(scheduleMeasurement)
    return () => { active = false; cancelAnimationFrame(frame); observer.disconnect() }
  }, [elements, boardRef, onChange, onMinimumSizesChange])

  function startGesture(event, element, mode) {
    if (!event.isPrimary || event.button !== 0) return
    event.stopPropagation()
    onSelect(element.id)
    const rect = boardRef.current.getBoundingClientRect()
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      boardWidth: rect.width,
      boardHeight: rect.height,
      element: { ...element },
      mode,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function updateGesture(event) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const deltaX = (event.clientX - gesture.startX) / gesture.boardWidth * 100
    const deltaY = (event.clientY - gesture.startY) / gesture.boardHeight * 100
    const updated = gesture.mode === 'move'
      ? moveMapElement(gesture.element, deltaX, deltaY)
      : fitMapElementSize(boardRef.current, gesture.element, resizeMapElement(gesture.element, deltaX, deltaY), { axis: deltaX === 0 ? 'height' : deltaY === 0 ? 'width' : 'both' })
    onChange(gesture.element.id, updated)
  }

  function endGesture(event) {
    if (gestureRef.current?.pointerId !== event.pointerId) return
    gestureRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleArrowKey(event, element, mode) {
    const step = event.shiftKey ? 5 : 2
    const delta = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0],
      ArrowUp: [0, -step], ArrowDown: [0, step],
    }[event.key]
    if (!delta) return
    event.preventDefault()
    onSelect(element.id)
    onChange(element.id, mode === 'move'
      ? moveMapElement(element, ...delta)
      : fitMapElementSize(boardRef.current, element, resizeMapElement(element, ...delta), { axis: delta[0] === 0 ? 'height' : 'width' }))
  }

  function gestureEvents(element, mode) {
    return {
      onPointerDown: (event) => startGesture(event, element, mode),
      onPointerMove: updateGesture,
      onPointerUp: endGesture,
      onPointerCancel: endGesture,
      onLostPointerCapture: () => { gestureRef.current = null },
      onKeyDown: (event) => handleArrowKey(event, element, mode),
    }
  }

  return (
    <div className="store-map-frame">
      <div
        ref={boardRef}
        className="store-map"
        role="group"
        aria-label="店舗マップ"
        aria-describedby="map-keyboard-help"
        onClick={(event) => { if (event.target === event.currentTarget) onSelect(null) }}
      >
        {elements.length === 0 && <p className="store-map__empty">下のボタンから<br />売場や入口を追加しましょう</p>}
        {elements.map((element) => {
          const selected = element.id === selectedId
          const type = ELEMENT_TYPES[element.type]
          const name = element.name.trim() || '名前未設定'
          return (
            <div
              key={element.id}
              className={`map-element map-element--${element.type}${selected ? ' is-selected' : ''}`}
              data-element-id={element.id}
              style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%` }}
            >
              <button
                type="button"
                className="map-element__body"
                aria-label={`${type.label}「${name}」を編集`}
                aria-pressed={selected}
                onClick={() => onSelect(element.id)}
                {...gestureEvents(element, 'move')}
              >
                {element.type !== 'sales' && <Icon name={type.icon} />}
                <span className="map-element__name">{name}</span>
                {element.type === 'sales' && element.product && <span className="map-element__product">{element.product}</span>}
              </button>
              {selected && (
                <button
                  type="button"
                  className="map-element__resize"
                  style={minimumSizes[element.id]?.resizeHandleStyle}
                  aria-label={`「${name}」のサイズを変更`}
                  aria-describedby="map-resize-help"
                  {...gestureEvents(element, 'resize')}
                >
                  <Icon name="resize" />
                </button>
              )}
            </div>
          )
        })}
      </div>
      <p id="map-keyboard-help" className="map-sr-only">ゾーンを選んで矢印キーを押すと移動できます。</p>
      <p id="map-resize-help" className="map-sr-only">緑のハンドルをドラッグするか、矢印キーでサイズを変更できます。</p>
    </div>
  )
}
