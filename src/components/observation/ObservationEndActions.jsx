import Icon from '../Icon.jsx'

export default function ObservationEndActions({ onPurchase, onNoPurchase, purchaseDisabled = false }) {
  return (
    <div className="observation-end-bar">
      <button className="observation-end-button observation-end-button--purchase" type="button" disabled={purchaseDisabled} onClick={onPurchase}><Icon name="bag" />購入で終了</button>
      <button className="observation-end-button" type="button" onClick={onNoPurchase}>非購入で終了</button>
    </div>
  )
}
