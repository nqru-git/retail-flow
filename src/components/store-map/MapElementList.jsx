import Icon from '../Icon.jsx'
import { ELEMENT_TYPES } from '../../lib/storeMap.js'

export default function MapElementList({ elements, selectedId, onSelect }) {
  return (
    <section className="map-element-list" aria-labelledby="element-list-heading">
      <div className="section-heading"><h2 id="element-list-heading">配置したもの</h2><span className="status-badge">{elements.length}件</span></div>
      {elements.length === 0 ? <p className="map-element-list__empty">まだ配置されていません。</p> : (
        <div className="map-element-list__items">
          {elements.map((element) => (
            <button key={element.id} type="button" aria-pressed={element.id === selectedId} onClick={() => onSelect(element.id)}>
              <Icon name={ELEMENT_TYPES[element.type].icon} /><span>{element.name.trim() || '名前未設定'}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
