import ActionButton from '../components/ActionButton.jsx'
import Icon from '../components/Icon.jsx'
import HomeNavigation from '../components/home/HomeNavigation.jsx'
import LayoutVersionCard from '../components/home/LayoutVersionCard.jsx'
import StoreHeader from '../components/home/StoreHeader.jsx'
import TodaySummary from '../components/home/TodaySummary.jsx'

export default function HomePage({ data, onAction, notice }) {
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

        <div className="home-actions">
          <ActionButton
            label="観察を開始"
            description="お客さまの動きを記録"
            icon="plus"
            variant="primary"
            onClick={() => onAction('observation')}
          />
          <ActionButton label="配置を変更" icon="layout" onClick={() => onAction('layout')} />
        </div>

        <TodaySummary {...data.today} />
        <HomeNavigation onAction={onAction} />
        <p className="feature-notice" role="status" aria-atomic="true">{notice}</p>
      </main>

      <footer className="app-footer">店舗名・配置と開始時の人数は仮データです。<br />今回の記録は再読み込みするとリセットされます。</footer>
    </div>
  )
}
