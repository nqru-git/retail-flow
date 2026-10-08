export default function LayoutStatus({ loading, error, localNotice, onRetry }) {
  return (
    <div className="layout-status">
      {loading && <p className="summary-message" role="status">最新の配置を取得しています。</p>}
      {localNotice && <p className="summary-message" role="status">{localNotice}</p>}
      {error && <><p className="summary-message summary-message--error" role="alert">{error}</p><button className="summary-retry" type="button" onClick={onRetry} disabled={loading}>配置を再取得</button></>}
    </div>
  )
}
