import { detectLayoutChanges } from '../../lib/layoutHistory.js'

export default function LayoutChanges({ before, after, changeNote }) {
  const changes = detectLayoutChanges(before, after)
  return (
    <div className="layout-changes">
      <section aria-label="自動検出した変更内容">
        <h3>変更内容 <span>自動比較</span></h3>
        {changes.length === 0 ? <p className="layout-changes__empty">店舗マップの変更はありません。</p> : (
          <ul>{changes.map((change) => (
            <li key={`${change.zoneId}-${change.type}`}>
              <p><strong>{change.zoneName}</strong><span className="layout-change-type">{change.label}</span></p>
              <p className="layout-change-detail">
                {change.type === 'moved' && change.before === change.after ? `${change.before}のエリア内で移動` : change.before === null ? `${change.after}を追加` : change.after === null ? `${change.before}を削除` : <>{change.before}<span aria-label="から"> → </span>{change.after}</>}
              </p>
            </li>
          ))}</ul>
        )}
      </section>
      <section className="layout-change-reason" aria-label="入力された変更理由">
        <h3>変更理由 <span>スタッフのメモ</span></h3>
        <p>{changeNote || '変更理由の記入はありません。'}</p>
      </section>
    </div>
  )
}
