import { formatDelta, formatRate } from '../../lib/analysis.js'

function countLabel(value) {
  if (value.count === null) return 'この配置にはありません'
  return `${value.count}人 / ${value.total}人`
}

export default function MetricComparison({ label, before, after, beforeLabel, afterLabel, isCount = false }) {
  return (
    <article className="analysis-metric" aria-label={label}>
      <div className="analysis-metric__heading"><h3>{label}</h3><span className="analysis-delta">{isCount ? `${after.count - before.count > 0 ? '+' : ''}${after.count - before.count}人` : formatDelta(before, after)}</span></div>
      <div className="analysis-metric__values">
        {[before, after].map((value, index) => (
          <div key={index}><span>{index === 0 ? beforeLabel : afterLabel}</span><strong>{isCount ? `${value.count}人` : formatRate(value.rate)}</strong>{!isCount && <small>{countLabel(value)}</small>}</div>
        ))}
      </div>
    </article>
  )
}
