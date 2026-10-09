export default function ObservationZoneList({ elements, currentZoneId, onZoneTap }) {
  if (elements.length === 0) return null
  return (
    <details className="observation-zone-list">
      <summary>一覧から場所を選ぶ</summary>
      <div>{elements.map((element) => <button type="button" key={element.id} aria-pressed={currentZoneId === element.id} onClick={() => onZoneTap(element.id)}>{element.name}</button>)}</div>
    </details>
  )
}
