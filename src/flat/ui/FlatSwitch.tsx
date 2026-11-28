import "./flat-controls.css"

export function FlatSwitch({ label, checked, onChange, disabled, className }: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button type="button" className={className ? `fl-switch ${className}` : "fl-switch"}
      role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="fl-switch__track" aria-hidden />
      {label}
    </button>
  )
}
