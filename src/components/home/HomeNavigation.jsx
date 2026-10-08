import Icon from '../Icon.jsx'

export default function HomeNavigation({ onAction }) {
  return (
    <nav className="home-navigation" aria-label="分析と配置履歴">
      <button type="button" onClick={() => onAction('analysis')}>
        <Icon name="chart" className="home-navigation__icon" />
        <span className="home-navigation__label">分析を見る<Icon name="chevron" /></span>
      </button>
      <button type="button" onClick={() => onAction('history')}>
        <Icon name="history" className="home-navigation__icon" />
        <span className="home-navigation__label">配置履歴<Icon name="chevron" /></span>
      </button>
    </nav>
  )
}
