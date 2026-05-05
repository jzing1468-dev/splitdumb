import { useCallback } from 'react';

/**
 * Clean numeric input with subtle +/- stepper buttons.
 * Hides ugly native spinners, adds keyboard-friendly increment buttons.
 *
 * Props: value, onChange, step, min, max, placeholder, style, className, ...rest
 */
export default function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  max,
  placeholder,
  style,
  className = 'form-input',
  ...rest
}) {
  const stepNum = parseFloat(step) || 1;
  const minNum = min != null ? parseFloat(min) : undefined;
  const maxNum = max != null ? parseFloat(max) : undefined;
  const decimals = step.toString().includes('.') ? (step.toString().split('.')[1] || '').length : 0;

  const clamp = useCallback((v) => {
    if (v === '' || v === undefined || v === null || isNaN(v)) return v;
    let n = parseFloat(v);
    if (minNum != null && n < minNum) n = minNum;
    if (maxNum != null && n > maxNum) n = maxNum;
    return decimals > 0 ? n.toFixed(decimals) : String(n);
  }, [minNum, maxNum, decimals]);

  const increment = useCallback((dir) => {
    const current = parseFloat(value) || 0;
    let next = current + dir * stepNum;
    if (minNum != null && next < minNum) next = minNum;
    if (maxNum != null && next > maxNum) next = maxNum;
    next = decimals > 0 ? parseFloat(next.toFixed(decimals)) : next;
    onChange({ target: { value: String(next) } });
  }, [value, stepNum, minNum, maxNum, decimals, onChange]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, ...style?.container }} className={rest.containerClassName}>
      <button
        type="button"
        onClick={() => increment(-1)}
        style={{
          width: 32,
          height: 38,
          border: '1px solid var(--border)',
          borderRight: 'none',
          borderRadius: 'var(--radius-xs) 0 0 var(--radius-xs)',
          background: 'var(--surface2)',
          color: 'var(--text-dim)',
          fontSize: '1rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          flexShrink: 0,
          transition: 'background 0.15s',
        }}
        onMouseDown={e => e.preventDefault()}
      >−</button>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={className}
        style={{
          ...style,
          borderRadius: 0,
          borderLeft: 'none',
          borderRight: 'none',
          textAlign: 'center',
          MozAppearance: 'textfield',
          appearance: 'textfield',
          flex: 1,
          minWidth: 0,
        }}
        {...rest}
      />
      <button
        type="button"
        onClick={() => increment(1)}
        style={{
          width: 32,
          height: 38,
          border: '1px solid var(--border)',
          borderLeft: 'none',
          borderRadius: '0 var(--radius-xs) var(--radius-xs) 0',
          background: 'var(--surface2)',
          color: 'var(--text-dim)',
          fontSize: '1rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          flexShrink: 0,
          transition: 'background 0.15s',
        }}
        onMouseDown={e => e.preventDefault()}
      >+</button>
    </div>
  );
}