import Icon from '../Icon.jsx'
import { ELEMENT_TYPES } from '../../lib/storeMap.js'

export default function ObservationMap({ elements, routeSteps, onZoneTap }) {
  const currentId = routeSteps.at(-1)?.zoneId
  return (
    <section className="observation-map-section" aria-label="観察用店舗マップ">
      <div className="observation-map-frame">
        <div className="observation-map" role="group" aria-label="店舗マップ">
          {elements.length === 0 && <p className="observation-map__empty">マップは未配置です。<br />ホームの「配置を変更」から<br />売場や入口を追加できます。</p>}
          {elements.map((element) => {
            const visits = routeSteps.flatMap((step, index) => step.zoneId === element.id ? [index + 1] : [])
            return (
              <button
                key={element.id}
                type="button"
                className={`observation-zone observation-zone--${element.type}${currentId === element.id ? ' is-current' : ''}`}
                style={{ left: `${element.x}%`, top: `${element.y}%`, width: `${element.width}%`, height: `${element.height}%` }}
                aria-label={element.name}
                data-zone-id={element.id}
                onClick={() => onZoneTap(element.id)}
              >
                {element.type !== 'sales' && <Icon name={ELEMENT_TYPES[element.type].icon} />}
                <span className="observation-zone__name">{element.name}</span>
                {visits.length > 0 && <span className="observation-zone__visits" aria-label={`ルートの${visits.join('、')}番目`}>{visits.at(-1)}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
