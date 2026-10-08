import Icon from '../Icon.jsx'

export default function TodaySummary({ observedCount, purchasedCount, recordedCount = 0 }) {
  return (
    <section className="today-summary" aria-labelledby="summary-heading">
      <div className="section-heading">
        <h2 id="summary-heading">今日の記録</h2>
        <span className="sample-badge">{recordedCount > 0 ? '仮データ＋今回の記録' : '仮データ'}</span>
      </div>
      <dl className="summary-grid">
        <div className="summary-stat">
          <dt><Icon name="people" />観察人数</dt>
          <dd>{observedCount}<span>人</span></dd>
        </div>
        <div className="summary-stat summary-stat--purchase">
          <dt><Icon name="bag" />購入人数</dt>
          <dd>{purchasedCount}<span>人</span></dd>
        </div>
      </dl>
    </section>
  )
}
