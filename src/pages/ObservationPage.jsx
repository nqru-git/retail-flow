import { useEffect, useReducer } from 'react'
import Icon from '../components/Icon.jsx'
import ObservationMap from '../components/observation/ObservationMap.jsx'
import ObservationRoute from '../components/observation/ObservationRoute.jsx'
import ObservationZoneList from '../components/observation/ObservationZoneList.jsx'
import ObservationEvents from '../components/observation/ObservationEvents.jsx'
import ObservationEndActions from '../components/observation/ObservationEndActions.jsx'
import CustomerServiceView from '../components/observation/CustomerServiceView.jsx'
import PurchaseSelection from '../components/observation/PurchaseSelection.jsx'
import { getPurchaseCandidates, observationReducer } from '../lib/observation.js'
import './Observation.css'

export default function ObservationPage({ initialState, onComplete, onDiscard }) {
  const [state, dispatch] = useReducer(observationReducer, initialState)
  const observation = state.observation

  useEffect(() => {
    if (state.stage === 'completed') onComplete(state.observation)
    if (state.stage === 'discarded') onDiscard()
  }, [state.stage, state.observation, onComplete, onDiscard])

  useEffect(() => {
    window.scrollTo(0, 0)
    document.querySelector('.app-shell--observation h1')?.focus()
  }, [state.stage])

  const beginPurchase = () => dispatch({ type: 'begin-purchase', at: new Date().toISOString() })
  const noPurchase = () => dispatch({ type: 'complete-no-purchase', at: new Date().toISOString() })

  function discard() {
    if (window.confirm('この観察を記録せずに破棄しますか？')) dispatch({ type: 'discard' })
  }

  if (state.stage === 'completed' || state.stage === 'discarded') return null

  if (state.stage === 'serving') {
    return <div className="app-shell app-shell--observation"><CustomerServiceView zoneName={observation.customerService.sessions.at(-1).startedZone.zoneName} onResume={() => dispatch({ type: 'resume', at: new Date().toISOString() })} onPurchase={beginPurchase} onNoPurchase={noPurchase} /></div>
  }

  if (state.stage === 'purchasing') {
    return <div className="app-shell app-shell--observation"><PurchaseSelection candidates={getPurchaseCandidates(state.mapElements, observation.routeSteps)} onChoose={(itemIds, multiple) => dispatch({ type: 'complete-purchase', itemIds, multiple })} onBack={() => dispatch({ type: 'cancel-purchase' })} onNoPurchase={noPurchase} /></div>
  }

  const startTime = new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(observation.startedAt))

  return (
    <div className="app-shell app-shell--observation">
      <main className="observation-page">
        <header className="observation-header"><h1 tabIndex={-1}>観察 <span>#{String(observation.number).padStart(3, '0')}</span></h1><p>開始 <time dateTime={observation.startedAt}>{startTime}</time></p></header>
        <div className="observation-toolbar"><p>ゾーンをタップして記録</p><button type="button" disabled={state.undoStack.length === 0} onClick={() => dispatch({ type: 'undo' })}><Icon name="undo" />1つ戻す</button></div>
        <ObservationMap elements={state.mapElements} routeSteps={observation.routeSteps} onZoneTap={(zoneId) => dispatch({ type: 'add-route', zoneId })} />
        <ObservationRoute steps={observation.routeSteps} />
        <ObservationEvents currentStep={observation.routeSteps.at(-1)} onToggle={(event) => dispatch({ type: 'toggle-event', event })} onStartService={() => dispatch({ type: 'start-service', at: new Date().toISOString() })} onDiscard={discard} />
        <ObservationZoneList elements={state.mapElements} onZoneTap={(zoneId) => dispatch({ type: 'add-route', zoneId })} />
        <ObservationEndActions onPurchase={beginPurchase} onNoPurchase={noPurchase} />
      </main>
    </div>
  )
}
