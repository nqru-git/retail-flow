import { formatRate } from '../../lib/analysis.js'

const stages = [['observed', '観察人数'], ['passed', 'ゾーン通過'], ['stopped', '立ち止まる'], ['touched', '商品に触る'], ['checked', '値札を見る'], ['zonePurchase', 'このゾーンの商品を購入']]

export default function ProductFunnel({ before, after, beforeLabel, afterLabel }) {
  return (
    <div className="analysis-funnel">
      <div className="analysis-funnel__versions"><strong>{beforeLabel} ファネル</strong><strong>{afterLabel} ファネル</strong></div>
      <ol>{stages.map(([key, label]) => (
        <li key={key}><h3>{label}</h3><div className="analysis-funnel__pair">{[before[key], after[key]].map((value, index) => (
          <div className="analysis-funnel__value" key={index}>
            <strong>{value.count === null ? '—' : `${value.count}人`}</strong><span>{formatRate(value.rate)}</span>
            <div className="analysis-funnel__track" aria-hidden="true"><div style={{ width: `${value.rate ?? 0}%` }} /></div>
          </div>
        ))}</div></li>
      ))}</ol>
      <p className="analysis-note">各段階で記録された人数です。行動は独立して記録されるため、同じ順序で進んだ人数ではありません。記録が省略されると、後の段階の人数が増える場合もあります。</p>
      <p className="analysis-note">購入は、購入商品にこのゾーンが選ばれた人数です。「その他・不明」は含みません。接客中など、通過の記録がない購入も含みます。</p>
    </div>
  )
}
