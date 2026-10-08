import { useMemo, useState, type ReactNode } from 'react';
import type { Account, Payment } from './types';
import { money, today } from './schedule';
import { uid, useData } from './store';
import { calcAccountBalance } from './balances';

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
  const { settings, categories, payments, transfers, plans, stashes, save, remove } = useData();
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

  const currentBal = useMemo(
    () => (acc ? calcAccountBalance(acc, payments, transfers, plans, stashes) : 0),
    [acc, payments, transfers, plans, stashes]
  );

  const [showCorrection, setShowCorrection] = useState(false);
  const [targetBalStr, setTargetBalStr] = useState('');
  const [correctionNote, setCorrectionNote] = useState('');

  const targetBalNum = +targetBalStr;
  const correctionDiff = targetBalStr !== '' ? targetBalNum - currentBal : 0;

  const handleApplyCorrection = () => {
    if (!acc || targetBalStr === '' || correctionDiff === 0) return;
    const isInc = correctionDiff > 0;
    const defaultCat = categories.find(c => c.kind === (isInc ? 'income' : 'expense'));

    const corrPayment: Payment = {
      id: `pay_${uid()}`,
      planId: `adj_${uid()}`,
      dueDate: today(),
      date: today(),
      amount: Math.abs(correctionDiff),
      currency: acc.currency,
      accountId: acc.id,
      name: 'Balance correction',
      kind: isInc ? 'income' : 'expense',
      categoryId: defaultCat?.id ?? 'other',
      note: correctionNote.trim() || `Manual balance correction (adjusted from ${money(currentBal, acc.currency)} to ${money(targetBalNum, acc.currency)})`,
      status: 'confirmed',
    };
    save('payments', corrPayment);
    setShowCorrection(false);
    setTargetBalStr('');
    setCorrectionNote('');
  };

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

      {!acc ? (
        <div className="row">
          <Field label="Starter balance">
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
      ) : (
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 16px', margin: '14px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 11, color: 'var(--mute)', display: 'block', fontWeight: 700, letterSpacing: '0.04em' }}>
                CURRENT BALANCE
              </span>
              <b style={{ fontSize: 22, letterSpacing: '-0.02em', color: currentBal < 0 ? 'var(--bad)' : 'var(--ink)' }}>
                {money(currentBal, acc.currency)}
              </b>
            </div>
            <button
              type="button"
              className="btn"
              style={{ fontSize: 13, fontWeight: 600, padding: '6px 12px', background: showCorrection ? '#E2E8F0' : undefined }}
              onClick={() => setShowCorrection(!showCorrection)}
            >
              ⚖️ Balance Correction
            </button>
          </div>

          {showCorrection && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #E2E8F0' }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#1E293B', marginBottom: 4 }}>
                Set Current Balance Manually
              </div>
              <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
                Override the live balance to match your actual bank/wallet account. The adjustment difference will be logged as a manual correction in your Log Book.
              </p>
              <div className="row">
                <Field label="Actual current balance">
                  <input
                    type="number"
                    inputMode="decimal"
                    autoFocus
                    placeholder={currentBal.toFixed(2)}
                    value={targetBalStr}
                    onChange={e => setTargetBalStr(e.target.value)}
                  />
                </Field>
                <Field label="Currency">
                  <input value={acc.currency} disabled style={{ opacity: 0.7 }} />
                </Field>
              </div>

              {targetBalStr !== '' && (
                <div style={{ fontSize: 13, margin: '4px 0 10px', color: correctionDiff >= 0 ? '#166534' : '#991B1B' }}>
                  Correction adjustment: <b>{correctionDiff >= 0 ? `+${money(correctionDiff, acc.currency)}` : money(correctionDiff, acc.currency)}</b>
                </div>
              )}

              <Field label="Reason / note (optional)">
                <input
                  placeholder="e.g. Bank statement reconciliation, cash count…"
                  value={correctionNote}
                  onChange={e => setCorrectionNote(e.target.value)}
                />
              </Field>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  className="btn primary"
                  disabled={targetBalStr === '' || correctionDiff === 0}
                  onClick={handleApplyCorrection}
                >
                  Apply Balance Correction
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setShowCorrection(false);
                    setTargetBalStr('');
                    setCorrectionNote('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {acc && (
        <Field label="Currency">
          <CurrencySelect value={a.currency} onChange={v => set({ currency: v })} />
        </Field>
      )}

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
