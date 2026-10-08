import ObservationEndActions from './ObservationEndActions.jsx'

export default function CustomerServiceView({ zoneName, onResume, onPurchase, onNoPurchase }) {
  return (
    <main className="customer-service-view">
      <div className="customer-service-view__heading">
        <span className="customer-service-view__indicator" aria-hidden="true" />
        <h1 tabIndex={-1}>接客中</h1>
      </div>
      <p className="customer-service-view__zone">{zoneName}</p>
      <button className="customer-service-view__resume" type="button" onClick={onResume}>接客終了・観察再開</button>
      <ObservationEndActions onPurchase={onPurchase} onNoPurchase={onNoPurchase} />
    </main>
  )
}
