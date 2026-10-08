import Icon from '../Icon.jsx'
import { ELEMENT_TYPES } from '../../lib/storeMap.js'

export default function MapElementPalette({ onAdd }) {
  return (
    <section className="map-palette" aria-labelledby="palette-heading">
      <h2 id="palette-heading">追加する</h2>
      <div className="map-palette__buttons">
        {Object.entries(ELEMENT_TYPES).map(([type, { label, icon }]) => (
          <button key={type} type="button" onClick={() => onAdd(type)} aria-label={`${label}を追加`}>
            <Icon name={icon} /><span>{label}</span><Icon name="plus" />
          </button>
        ))}
      </div>
    </section>
  )
}
