import Icon from '../Icon.jsx'
import { OBSERVATION_EVENTS } from '../../lib/observation.js'

export default function ObservationEvents({ currentStep, onToggle, onStartService }) {
  return (
    <section className="observation-events" aria-labelledby="current-zone-heading">
      <div className="observation-current-zone">
        <span>現在のゾーン</span>
        <h2 id="current-zone-heading">{currentStep?.zoneName ?? 'ゾーンを選んでください'}</h2>
      </div>
      <div className="observation-event-buttons">
        {Object.entries(OBSERVATION_EVENTS).map(([event, { label, icon }]) => {
          const active = Boolean(currentStep?.events.includes(event))
          return <button key={event} type="button" aria-label={label} aria-pressed={active} disabled={!currentStep} onClick={() => onToggle(event)}><Icon name={active ? 'check' : icon} />{label}</button>
        })}
      </div>
      <div className="observation-secondary-actions">
        <button className="observation-service-button" type="button" disabled={!currentStep} onClick={onStartService}><Icon name="people" />接客開始</button>
      </div>
    </section>
  )
}
