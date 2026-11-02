import { useEffect, useState } from 'react'

interface Props {
  label?: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  unit?: string
  digits?: number
  disabled?: boolean
  defaultValue?: number
  testId?: string
}

export function Slider({ label, value, min, max, step = 0.01, onChange, unit = '', digits = 2, disabled, defaultValue, testId }: Props) {
  const [txt, setTxt] = useState<string | null>(null)
  useEffect(() => setTxt(null), [value])
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className={'slider' + (disabled ? ' disabled' : '')} data-testid={testId}>
      {label && <label title={defaultValue !== undefined ? 'Double-click to reset' : undefined} onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}>{label}</label>}
      <input
        type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        style={{ ['--pct' as any]: pct + '%' }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
      />
      <span className="num">
        <input
          value={txt ?? value.toFixed(digits)} disabled={disabled}
          onChange={(e) => setTxt(e.target.value)}
          onBlur={() => { if (txt !== null) { const v = parseFloat(txt); if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v))); setTxt(null) } }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        />
        {unit && <i>{unit}</i>}
      </span>
    </div>
  )
}
