import { useState, type ReactNode } from 'react';
import type { Account } from './types';
import { money } from './schedule';
import { uid, useData } from './store';

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

export const ACC_ICONS: Record<Account['type'], string> = { card: '💳', bank: '🏦', cash: '💵', wallet: '👛', savings: '🐷' };

/** Reusable account form modal */
export function AccountForm({
  acc,
  onSaved,
  onClose,
}: {
  acc?: Account;
  onSaved?: (account: Account) => void;
  onClose: () => void;
}) {
  const { settings, save, remove } = useData();
  const [a, setA] = useState<Account>(
    acc ?? {
      id: uid(),
      name: '',
      type: 'card',
      currency: settings.currency,
      startBalance: 0,
      color: '#6C8EF5',
    }
  );
  const set = (p: Partial<Account>) => setA(x => ({ ...x, ...p }));

  const submit = () => {
    if (!a.name.trim()) return;
    const final: Account = { ...a, name: a.name.trim() };
    save('accounts', final);
    onSaved?.(final);
    onClose();
  };

  return (
    <Modal title={acc ? 'Edit account' : 'New account'} onClose={onClose}>
      <Seg
        value={a.type}
        onChange={t => set({ type: t })}
        options={Object.entries(ACC_ICONS).map(([k, v]) => [k as Account['type'], `${v} ${k}`])}
      />
      <Field label="Name">
        <input
          autoFocus
          value={a.name}
          placeholder="e.g. Revolut Card, Cash Wallet, Barclays Bank…"
          onChange={e => set({ name: e.target.value })}
        />
      </Field>
      <Field label="Bank / service (optional)">
        <input
          value={a.institution ?? ''}
          placeholder="Revolut, Payoneer, Alipay…"
          onChange={e => set({ institution: e.target.value || undefined })}
        />
      </Field>
      <div className="row">
        <Field label="Money there now">
          <input
            type="number"
            inputMode="decimal"
            value={a.startBalance || ''}
            placeholder="0.00"
            onChange={e => set({ startBalance: +e.target.value })}
          />
        </Field>
        <Field label="Currency">
          <CurrencySelect value={a.currency} onChange={v => set({ currency: v })} />
        </Field>
      </div>
      <Field label="Colour">
        <input type="color" value={a.color} onChange={e => set({ color: e.target.value })} />
      </Field>
      <button className="btn primary wide" disabled={!a.name.trim()} onClick={submit}>
        {acc ? 'Save changes' : 'Add account'}
      </button>
      {acc && (
        <button
          className="btn ghost wide danger"
          onClick={() => {
            remove('accounts', acc.id);
            onClose();
          }}
        >
          Delete
        </button>
      )}
    </Modal>
  );
}

/**
 * Selectable card grid for accounts with inline "+ Add new account" outline card.
 * Money CANNOT be taken from an unselected account — "No account" option is completely removed.
 */
export function AccountCardsSelect({
  accounts,
  value,
  onChange,
  balances,
}: {
  accounts: Account[];
  value?: string;
  onChange: (id: string) => void;
  balances?: Map<string, number>;
}) {
  const [showAdd, setShowAdd] = useState(false);

  // An account must always be selected. Fallback to first available account.
  const activeId = value && accounts.some(a => a.id === value) ? value : accounts[0]?.id;

  return (
    <>
      <div className="account-cards-select">
        {accounts.map(a => {
          const isSel = activeId === a.id;
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

        {/* Outline of a card with button to add new account */}
        <button
          type="button"
          className="account-select-card account-add-card"
          onClick={() => setShowAdd(true)}
          title="Add a new account"
        >
          <div className="acc-card-icon">➕</div>
          <div className="acc-card-info">
            <span className="acc-card-name">+ Add new account</span>
            <small className="acc-card-sub">Bank, card, cash…</small>
          </div>
        </button>
      </div>

      {showAdd && (
        <AccountForm
          onSaved={newAcc => {
            onChange(newAcc.id);
            setShowAdd(false);
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </>
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
