import ActionButton from '../components/ActionButton.jsx'
import Icon from '../components/Icon.jsx'
import HomeNavigation from '../components/home/HomeNavigation.jsx'
import LayoutVersionCard from '../components/home/LayoutVersionCard.jsx'
import StoreHeader from '../components/home/StoreHeader.jsx'
import TodaySummary from '../components/home/TodaySummary.jsx'
import LayoutStatus from '../components/layout-history/LayoutStatus.jsx'

export default function HomePage({ data, onAction, notice, onRetrySummary, layoutState }) {
  return (
    <div className="app-shell">
      <div className="brand-bar">
        <div className="brand">
          <span className="brand__mark"><Icon name="flow" /></span>
          <span>Retail Flow</span>
        </div>
        <span className="brand-bar__caption">店舗観察ノート</span>
      </div>

      <main>
        <StoreHeader storeName={data.storeName} />
        <LayoutVersionCard version={data.layoutVersion} />
        <LayoutStatus loading={layoutState.loading} error={layoutState.error} localNotice={layoutState.localNotice} onRetry={layoutState.refresh} />
        {notice && <p className="feature-notice" role="status" aria-atomic="true">{notice}</p>}

        <div className="home-actions">
          <ActionButton
            label="観察を開始"
            description="お客さまの動きを記録"
            icon="plus"
            variant="primary"
            onClick={() => onAction('observation')}
            disabled={!layoutState.currentLayout || layoutState.loading}
          />
          <ActionButton label="配置を変更" icon="layout" onClick={() => onAction('layout')} disabled={!layoutState.currentLayout || layoutState.loading} />
        </div>

        <TodaySummary {...data.today} onRetry={onRetrySummary} />
        <HomeNavigation onAction={onAction} />
      </main>

    </div>
  )
}
