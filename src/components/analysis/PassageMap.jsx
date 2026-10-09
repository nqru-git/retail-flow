import { formatRate, metric } from '../../lib/analysis.js'

export default function PassageMap({ layout, aggregate, label, selectedZone }) {
  const zoneCounts = new Map(aggregate.zones.map(zone => [zone.zoneId, zone.passedCount]))
  const passage = zone => metric(zoneCounts.get(zone.id) ?? null, aggregate.observedCount)
  const selected = layout.layoutSnapshot.find(zone => zone.id === selectedZone?.id && zone.type === 'sales')
  return (
    <article className="analysis-map-card">
      <h3>配置 {label} <span>{aggregate.observedCount}人観察</span></h3>
      {selectedZone && <p className="analysis-map-selection"><span>{selectedZone.name}の通過率</span><strong>{selected ? formatRate(passage(selected).rate) : 'この配置にはありません'}</strong></p>}
      <div className="layout-map-preview analysis-passage-map" role="img" aria-label={`配置 ${label} の通過率。${layout.layoutSnapshot.map(zone => `${zone.name} ${formatRate(passage(zone).rate)}`).join('、')}`}>
        {layout.layoutSnapshot.map(zone => (
          <div key={zone.id} className={`layout-preview-zone layout-preview-zone--${zone.type}${zone.id === selected?.id ? ' is-selected' : ''}`} data-analysis-zone-id={zone.id} style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%` }}>
            <span>{zone.name}</span><strong>{formatRate(passage(zone).rate)}</strong>
          </div>
        ))}
        {layout.layoutSnapshot.length === 0 && <p className="layout-map-preview__empty">配置はありません</p>}
      </div>
      <details className="analysis-map-details"><summary>全ゾーンの人数を確認</summary><ul>{layout.layoutSnapshot.map(zone => <li key={zone.id}><span>{zone.name}</span><strong>{formatRate(passage(zone).rate)}<small>{passage(zone).count ?? '—'}人 / {aggregate.observedCount}人</small></strong></li>)}</ul></details>
    </article>
  )
}
