import type { ReactNode } from 'react';
import type { Account } from './types';
import { money } from './schedule';

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

const ACC_ICONS: Record<Account['type'], string> = { card: '💳', bank: '🏦', cash: '💵', wallet: '👛', savings: '🐷' };

/** Selectable card grid for accounts instead of boring dropdowns */
export function AccountCardsSelect({
  accounts,
  value,
  onChange,
  balances,
  allowNone = true,
  noneLabel = 'No account'
}: {
  accounts: Account[];
  value?: string;
  onChange: (id: string | undefined) => void;
  balances?: Map<string, number>;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  return (
    <div className="account-cards-select">
      {allowNone && (
        <button
          type="button"
          className={`account-select-card ${!value ? 'selected' : ''}`}
          onClick={() => onChange(undefined)}
        >
          <div className="acc-card-icon">⚪</div>
          <div className="acc-card-info">
            <span className="acc-card-name">{noneLabel}</span>
            <small className="acc-card-sub">Not assigned</small>
          </div>
          {!value && <span className="acc-card-check">✓</span>}
        </button>
      )}
      {accounts.map(a => {
        const isSel = value === a.id;
        const bal = balances?.get(a.id);
        const icon = ACC_ICONS[a.type] ?? '💳';
        return (
          <button
            key={a.id}
            type="button"
            className={`account-select-card ${isSel ? 'selected' : ''}`}
            style={{ ['--acc-c' as string]: a.color || 'var(--brand)' }}
            onClick={() => onChange(a.id)}
          >
            <div className="acc-card-icon">{icon}</div>
            <div className="acc-card-info">
              <span className="acc-card-name">{a.name}</span>
              <small className="acc-card-sub">
                {a.currency}
                {bal !== undefined ? ` · ${money(bal, a.currency)}` : ''}
              </small>
            </div>
            {isSel && <span className="acc-card-check">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Standalone help question mark button */
export function HelpButton({ onClick, title = 'How this works' }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      className="help-icon-btn"
      title={title}
      onClick={e => { e.stopPropagation(); onClick(); }}
    >
      ?
    </button>
  );
}
