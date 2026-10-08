import type { ReactNode } from 'react';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button className="icon" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
);

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => <button type="button" key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

/** Progress bar: solid = done, light = still to come */
export const Bar = ({ done, total, color, over }: { done: number; total: number; color: string; over?: boolean }) => (
  <div className="bar" style={{ background: `${color}22` }}>
    <div style={{ width: `${total ? Math.min(100, (done / total) * 100) : 0}%`, background: over ? 'var(--bad)' : color }} />
  </div>
);

export const Empty = ({ emoji, title, text, action }: { emoji: string; title: string; text?: string; action?: ReactNode }) => (
  <div className="empty"><div className="big">{emoji}</div><h3>{title}</h3>{text && <p>{text}</p>}{action}</div>
);

export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CNY', 'RUB', 'RSD', 'CHF', 'PLN', 'UAH', 'TRY', 'GEL', 'JPY', 'CAD', 'AUD'];
export const CurrencySelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <select value={value} onChange={e => onChange(e.target.value)}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>
);
