import Icon from '../Icon.jsx'

export default function LayoutVersionCard({ version }) {
  return (
    <section className="layout-version" aria-labelledby="layout-heading">
      <span className="layout-version__icon">
        <Icon name="layout" />
      </span>
      <h2 id="layout-heading">現在の配置</h2>
      <span className="version-badge">{version}</span>
    </section>
  )
}
