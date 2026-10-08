import Icon from '../Icon.jsx'

export default function StoreHeader({ storeName }) {
  return (
    <header className="store-header">
      <p className="eyebrow">ホーム</p>
      <div className="store-header__name">
        <h1>{storeName}</h1>
        <Icon name="store" />
      </div>
      <p className="store-header__description">今日の観察を、ここから。</p>
    </header>
  )
}
