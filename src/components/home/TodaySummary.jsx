import Icon from '../Icon.jsx'

export default function TodaySummary({ observedCount, purchasedCount, status, error, onRetry }) {
  return (
    <section className="today-summary" aria-labelledby="summary-heading">
      <div className="section-heading">
        <h2 id="summary-heading">今日の記録</h2>
        <span className="sample-badge">{status === 'ready' ? 'Supabase · 日本時間' : status === 'loading' ? '取得中…' : '未取得'}</span>
      </div>
      <dl className="summary-grid">
        <div className="summary-stat">
          <dt><Icon name="people" />観察人数</dt>
          <dd>{observedCount ?? '—'}<span>人</span></dd>
        </div>
        <div className="summary-stat summary-stat--purchase">
          <dt><Icon name="bag" />購入人数</dt>
          <dd>{purchasedCount ?? '—'}<span>人</span></dd>
        </div>
      </dl>
      {status === 'loading' && <p className="summary-message" role="status">今日の人数を取得しています。</p>}
      {error && <p className="summary-message summary-message--error" role="alert">{error}</p>}
      {status === 'error' && <button className="summary-retry" type="button" onClick={onRetry}>人数を再取得</button>}
    </section>
  )
}
