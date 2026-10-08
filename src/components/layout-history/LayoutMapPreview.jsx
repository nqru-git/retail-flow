import Icon from '../Icon.jsx'
import { ELEMENT_TYPES } from '../../lib/storeMap.js'

export default function LayoutMapPreview({ elements, version }) {
  return (
    <div className="layout-map-preview" role="img" aria-label={`配置 ${version} の店舗マップ。${elements.map((element) => element.name).join('、') || '未配置'}`}>
      {elements.length === 0 && <p className="layout-map-preview__empty">未配置</p>}
      {elements.map((element) => (
        <div key={element.id} className={`layout-preview-zone layout-preview-zone--${element.type}`} style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%` }}>
          {element.type !== 'sales' && <Icon name={ELEMENT_TYPES[element.type].icon} />}
          <span>{element.name}</span>
        </div>
      ))}
    </div>
  )
}
