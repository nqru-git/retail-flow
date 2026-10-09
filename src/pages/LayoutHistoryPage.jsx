import { useEffect, useRef } from 'react'
import Icon from '../components/Icon.jsx'
import LayoutMapPreview from '../components/layout-history/LayoutMapPreview.jsx'
import LayoutChangeReason from '../components/layout-history/LayoutChanges.jsx'
import LayoutStatus from '../components/layout-history/LayoutStatus.jsx'
import { layoutLabel } from '../lib/layoutHistory.js'
import './LayoutHistory.css'

const dateFormat = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })

export default function LayoutHistoryPage({ layouts, onBack }) {
  const headingRef = useRef(null)
  useEffect(() => { headingRef.current?.focus() }, [])
  return (
    <div className="app-shell app-shell--history">
      <header className="history-topbar"><button className="editor-back-button" type="button" onClick={onBack}><Icon name="back" />ホームへ</button><button className="history-refresh" type="button" onClick={layouts.refresh} disabled={layouts.loading}>履歴を再取得</button></header>
      <main>
        <div className="history-heading"><p className="eyebrow">配置の変化を振り返る</p><h1 ref={headingRef} tabIndex={-1}>配置履歴</h1><p>古い配置から順に表示しています。</p></div>
        <LayoutStatus loading={layouts.loading} error={layouts.error} localNotice={layouts.localNotice} onRetry={layouts.refresh} />
        {!layouts.loading && !layouts.error && layouts.history.length === 0 && <p className="summary-message">保存した配置はまだありません。</p>}
        <ol className="layout-timeline">
          {layouts.history.map((layout, index) => (
            <li key={layout.id}>
              {index > 0 && <div className="layout-transition"><p className="layout-transition__arrow" aria-label={`${layoutLabel(layouts.history[index - 1])}から${layoutLabel(layout)}への変更`}>↓</p><LayoutChangeReason changeNote={layout.changeNote} /><p className="layout-transition__arrow" aria-hidden="true">↓</p></div>}
              <article className="layout-history-card" aria-label={`配置 ${layoutLabel(layout)}`}>
                <div className="layout-history-card__heading"><h2>配置 <span>{layoutLabel(layout)}</span></h2>{index === layouts.history.length - 1 && <span className="sample-badge">現在の配置</span>}</div>
                <time dateTime={layout.createdAt}>{dateFormat.format(new Date(layout.createdAt))}（日本時間）</time>
                <LayoutMapPreview elements={layout.layoutSnapshot} version={layoutLabel(layout)} />
                {index === 0 && <p className="layout-initial-note">{layout.changeNote || '最初の保存済み配置'}</p>}
                <details className="layout-zone-details"><summary>配置の詳細 · {layout.layoutSnapshot.length}か所</summary><ul>{layout.layoutSnapshot.map((zone) => <li key={zone.id}><strong>{zone.name}</strong><span>{zone.product || zoneDescription(zone.type)}{zone.category && ` / ${zone.category}`}</span>{zone.memo && <p>{zone.memo}</p>}</li>)}</ul></details>
              </article>
            </li>
          ))}
        </ol>
      </main>
    </div>
  )
}

function zoneDescription(type) {
  return { sales: '商品未設定', entrance: '入口', checkout: 'レジ', fitting: '試着室' }[type]
}
