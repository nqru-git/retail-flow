import Icon from './Icon.jsx'

export default function ActionButton({ label, description, icon, variant = 'secondary', onClick, disabled = false }) {
  return (
    <button
      className={`action-button action-button--${variant}`}
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="action-button__icon">
        <Icon name={icon} />
      </span>
      <span className="action-button__text">
        <span className="action-button__label">{label}</span>
        {description && <span className="action-button__description">{description}</span>}
      </span>
      <Icon name={variant === 'primary' ? 'arrow' : 'chevron'} className="action-button__arrow" />
    </button>
  )
}
