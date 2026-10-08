import { useState } from 'react'
import Icon from '../Icon.jsx'
import ObservationEndActions from './ObservationEndActions.jsx'

export default function PurchaseSelection({ candidates, onChoose, onBack, onNoPurchase }) {
  const [multiple, setMultiple] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const visited = candidates.filter((candidate) => candidate.visited)
  const others = candidates.filter((candidate) => !candidate.visited)

  function choose(candidate) {
    if (!multiple) {
      onChoose([candidate.id], false)
      return
    }
    setSelectedIds((current) => current.includes(candidate.id) ? current.filter((id) => id !== candidate.id) : [...current, candidate.id])
  }

  function renderCandidates(items, heading) {
    if (items.length === 0) return null
    return (
      <section className="purchase-candidates" aria-label={heading}>
        <h2>{heading}</h2>
        <div>{items.map((candidate) => (
          <button key={candidate.id} type="button" className="purchase-candidate" aria-pressed={multiple ? selectedIds.includes(candidate.id) : undefined} onClick={() => choose(candidate)} data-item-id={candidate.id}>
            <Icon name={selectedIds.includes(candidate.id) ? 'check' : 'bag'} />
            <span><span className="purchase-candidate__name">{candidate.zoneName || candidate.productName}</span>{candidate.zoneName && <span className="purchase-candidate__product">{candidate.productName}</span>}</span>
          </button>
        ))}</div>
      </section>
    )
  }

  return (
    <main className="purchase-selection">
      <button className="purchase-back-button" type="button" onClick={onBack}><Icon name="back" />観察に戻る</button>
      <h1 tabIndex={-1}>何を購入しましたか？</h1>
      <p className="purchase-selection__help">{multiple ? `${selectedIds.length}件選択中。商品を選んで「購入で終了」。` : '商品をタップすると記録して終了します。'}</p>
      <button className="purchase-multiple-button" type="button" aria-pressed={multiple} onClick={() => { setMultiple((current) => !current); setSelectedIds([]) }}><Icon name={multiple ? 'check' : 'plus'} />複数購入</button>
      {renderCandidates(visited, '立ち寄った売場の商品')}
      {renderCandidates(others, visited.length > 0 ? 'ほかの商品' : '購入した商品')}
      <ObservationEndActions onPurchase={() => onChoose(selectedIds, true)} purchaseDisabled={!multiple || selectedIds.length === 0} onNoPurchase={onNoPurchase} />
    </main>
  )
}
