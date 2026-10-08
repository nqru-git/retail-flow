import { useEffect, useRef } from 'react'
import Icon from '../Icon.jsx'
import { ELEMENT_TYPES, MIN_ELEMENT_HEIGHT, MIN_ELEMENT_WIDTH } from '../../lib/storeMap.js'

export default function MapElementProperties({ element, onChange, onDelete, showNameError }) {
  const nameRef = useRef(null)

  useEffect(() => {
    if (showNameError) nameRef.current?.focus()
  }, [showNameError])

  return (
    <section className="map-properties" aria-labelledby="properties-heading">
      <div className="section-heading">
        <h2 id="properties-heading">選択したものを編集</h2>
        {element && <span className="sample-badge">{ELEMENT_TYPES[element.type].label}</span>}
      </div>
      {!element ? (
        <p className="map-properties__empty">マップまたは一覧から<br />編集したいものを選んでください。</p>
      ) : (
        <div className="map-properties__fields">
          <label className="map-field">
            <span>{element.type === 'sales' ? 'ゾーン名' : '名称'}<span className="map-field__required">必須</span></span>
            <input
              ref={nameRef}
              name="element-name"
              value={element.name}
              maxLength={60}
              required
              aria-invalid={showNameError || undefined}
              aria-describedby={showNameError ? 'name-error' : undefined}
              onChange={(event) => onChange({ name: event.target.value })}
              placeholder="例：新作バッグ"
            />
          </label>
          {showNameError && <p id="name-error" className="map-field__error">名前を入力してください。</p>}
          {element.type === 'sales' && (
            <>
              <label className="map-field">
                <span>カテゴリー</span>
                <input name="category" value={element.category} maxLength={80} placeholder="例：バッグ" onChange={(event) => onChange({ category: event.target.value })} />
              </label>
              <label className="map-field">
                <span>商品名または商品グループ</span>
                <input name="product" value={element.product} maxLength={120} placeholder="例：ボストンバッグ" onChange={(event) => onChange({ product: event.target.value })} />
              </label>
            </>
          )}
          <label className="map-field">
            <span>メモ</span>
            <textarea name="memo" value={element.memo} maxLength={500} rows={3} placeholder="例：10/8発売" onChange={(event) => onChange({ memo: event.target.value })} />
          </label>
          <fieldset className="map-size-controls">
            <legend>サイズを調整</legend>
            <label><span>幅</span><input type="range" aria-label="幅" min={MIN_ELEMENT_WIDTH} max={Math.floor(100 - element.x)} step="1" value={element.width} onChange={(event) => onChange({ width: Number(event.target.value) })} /></label>
            <label><span>高さ</span><input type="range" aria-label="高さ" min={MIN_ELEMENT_HEIGHT} max={Math.floor(100 - element.y)} step="1" value={element.height} onChange={(event) => onChange({ height: Number(event.target.value) })} /></label>
          </fieldset>
          <button className="map-delete-button" type="button" onClick={onDelete}><Icon name="trash" />選択したものを削除</button>
        </div>
      )}
    </section>
  )
}
