import { useEffect, useState } from 'react';
import { uid, useData } from '../store';
import { money, today } from '../schedule';
import { convert, getRate } from '../fx';
import type { Account, Payment, Plan, Stash, Transfer } from '../types';
import { Bar, CurrencySelect, Empty, Field, Modal, Seg } from '../ui';

const ICONS: Record<Account['type'], string> = { card: '💳', bank: '🏦', cash: '💵', wallet: '👛', savings: '🐷' };

/** Calculate live balance of an account considering payments and transfers */
export function calcAccountBalance(
  a: Account,
  payments: Payment[],
  transfers: Transfer[] = [],
  plans: Plan[] = [],
  stashes: Stash[] = []
): number {
  let b = a.startBalance;
  for (const p of payments) {
    if (p.status !== 'confirmed') continue;
    const plan = plans.find(x => x.id === p.planId);
    const kind = p.kind ?? plan?.kind, stashId = p.stashId ?? plan?.stashId;
    if (!kind) continue;
    if (p.accountId === a.id) b += kind === 'income' ? p.amount : -p.amount;
    if (kind === 'saving' && stashes.find(s => s.id === stashId)?.accountId === a.id) b += p.amount;
  }
  for (const t of transfers) {
    if (t.status === 'cancelled') continue;
    if (t.fromAccountId === a.id) b -= t.fromAmount;
    if (t.toAccountId === a.id) b += t.toAmount;
  }
  return b;
}

/** Savings goals */
export function Stashes() {
  const { stashes, plans, payments } = useData();
  const [edit, setEdit] = useState<Stash | 'new' | null>(null);
  const saved = (s: Stash) => s.startAmount + payments
    .filter(p => p.status === 'confirmed' && (p.stashId ?? plans.find(x => x.id === p.planId)?.stashId) === s.id)
    .reduce((a, p) => a + p.amount, 0);
  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Stashes</h1><p className="muted">Money you're putting aside for something.</p></div>
        <button className="btn primary" onClick={() => setEdit('new')}>+ New stash</button>
      </header>
      {stashes.length === 0 && <Empty emoji="🐷" title="No stashes yet" text="A safety cushion of 3 months of expenses is a great first goal." />}
      <div className="grid">
        {stashes.map(s => {
          const v = saved(s);
          return (
            <button key={s.id} className="card click" onClick={() => setEdit(s)}>
              <div className="big">{s.emoji}</div>
              <div className="title">{s.name}</div>
              <div className="stash-amt"><b>{money(v, s.currency)}</b> <span className="muted">of {money(s.target, s.currency)}</span></div>
              <Bar done={v} total={s.target} color="#2FA36B" />
              <div className="sub">{v >= s.target ? '🎉 Goal reached!' : `${money(s.target - v, s.currency)} to go`}</div>
            </button>
          );
        })}
      </div>
      {edit && <StashForm stash={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function StashForm({ stash, onClose }: { stash?: Stash; onClose: () => void }) {
  const { accounts, settings, save, remove } = useData();
  const [s, setS] = useState<Stash>(stash ?? { id: uid(), name: '', emoji: '🎯', target: 0, currency: settings.currency, startAmount: 0, accountId: accounts.find(a => a.type === 'savings')?.id });
  const [monthly, setMonthly] = useState(0);
  const set = (p: Partial<Stash>) => setS(x => ({ ...x, ...p }));
  const submit = () => {
    save('stashes', s);
    if (monthly > 0) save('plans', { id: uid(), name: s.name, kind: 'saving', categoryId: 'savings', stashId: s.id, amount: monthly, currency: s.currency, freq: 'monthly', every: 1, startDate: today(), accountId: accounts[0]?.id });
    onClose();
  };
  return (
    <Modal title={stash ? 'Edit stash' : 'New stash'} onClose={onClose}>
      <div className="chips">{['🎯', '🛟', '🏖️', '🏠', '🚗', '💻', '🎓', '💍', '📈'].map(e => <button key={e} className={s.emoji === e ? 'chip on' : 'chip'} onClick={() => set({ emoji: e })}>{e}</button>)}</div>
      <Field label="What are you saving for?"><input autoFocus value={s.name} placeholder="Safety cushion" onChange={e => set({ name: e.target.value })} /></Field>
      <div className="row">
        <Field label="Goal"><input type="number" value={s.target || ''} onChange={e => set({ target: +e.target.value })} /></Field>
        <Field label="Currency"><CurrencySelect value={s.currency} onChange={v => set({ currency: v })} /></Field>
      </div>
      <Field label="Already have"><input type="number" value={s.startAmount || ''} onChange={e => set({ startAmount: +e.target.value })} /></Field>
      {!stash && <Field label="Put aside every month (optional)" hint="We'll remind you each month"><input type="number" value={monthly || ''} onChange={e => setMonthly(+e.target.value)} /></Field>}
      <Field label="Where is it kept?">
        <select value={s.accountId ?? ''} onChange={e => set({ accountId: e.target.value || undefined })}>
          <option value="">—</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <button className="btn primary wide" disabled={!s.name || !s.target} onClick={submit}>{stash ? 'Save' : 'Create stash'}</button>
      {stash && <button className="btn ghost wide danger" onClick={() => { remove('stashes', stash.id); onClose(); }}>Delete</button>}
    </Modal>
  );
}

/** Where money lives: cards, Payoneer, cash, savings accounts */
export function Accounts() {
  const { accounts, plans, payments, stashes, transfers } = useData();
  const [edit, setEdit] = useState<Account | 'new' | null>(null);
  const [transferring, setTransferring] = useState(false);

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Accounts</h1><p className="muted">Where your money lives.</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {accounts.length >= 2 && (
            <button className="btn ok" onClick={() => setTransferring(true)}>⇄ Move money</button>
          )}
          <button className="btn primary" onClick={() => setEdit('new')}>+ Add account</button>
        </div>
      </header>

      <div className="grid">
        {accounts.map(a => (
          <button key={a.id} className="card click acc" style={{ ['--c' as string]: a.color }} onClick={() => setEdit(a)}>
            <div className="big">{ICONS[a.type]}</div>
            <div className="title">{a.name}</div>
            <div className="sub">{a.institution ?? a.type} · {a.currency}</div>
            <div className="stash-amt"><b>{money(calcAccountBalance(a, payments, transfers, plans, stashes), a.currency)}</b></div>
          </button>
        ))}
      </div>

      {edit && <AccountForm acc={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {transferring && <TransferModal onClose={() => setTransferring(false)} />}
    </div>
  );
}

function AccountForm({ acc, onClose }: { acc?: Account; onClose: () => void }) {
  const { settings, save, remove } = useData();
  const [a, setA] = useState<Account>(acc ?? { id: uid(), name: '', type: 'card', currency: settings.currency, startBalance: 0, color: '#6C8EF5' });
  const set = (p: Partial<Account>) => setA(x => ({ ...x, ...p }));
  return (
    <Modal title={acc ? 'Edit account' : 'New account'} onClose={onClose}>
      <Seg value={a.type} onChange={t => set({ type: t })} options={Object.entries(ICONS).map(([k, v]) => [k as Account['type'], `${v} ${k}`])} />
      <Field label="Name"><input autoFocus value={a.name} placeholder="My Visa card" onChange={e => set({ name: e.target.value })} /></Field>
      <Field label="Bank / service (optional)"><input value={a.institution ?? ''} placeholder="Revolut, Payoneer, Alipay…" onChange={e => set({ institution: e.target.value || undefined })} /></Field>
      <div className="row">
        <Field label="Money there now"><input type="number" value={a.startBalance || ''} onChange={e => set({ startBalance: +e.target.value })} /></Field>
        <Field label="Currency"><CurrencySelect value={a.currency} onChange={v => set({ currency: v })} /></Field>
      </div>
      <Field label="Colour"><input type="color" value={a.color} onChange={e => set({ color: e.target.value })} /></Field>
      <button className="btn primary wide" disabled={!a.name} onClick={() => { save('accounts', a); onClose(); }}>{acc ? 'Save' : 'Add account'}</button>
      {acc && <button className="btn ghost wide danger" onClick={() => { remove('accounts', acc.id); onClose(); }}>Delete</button>}
    </Modal>
  );
}

/** Modal to move money between accounts with differing currencies & exchange rates */
export function TransferModal({ transfer, onClose }: { transfer?: Transfer; onClose: () => void }) {
  const { accounts, save, remove, payments, plans, stashes, transfers } = useData();
  const [fromId, setFromId] = useState(transfer?.fromAccountId ?? accounts[0]?.id ?? '');
  const [toId, setToId] = useState(transfer?.toAccountId ?? accounts.find(a => a.id !== fromId)?.id ?? accounts[1]?.id ?? '');
  const [fromAmount, setFromAmount] = useState<number>(transfer?.fromAmount ?? 0);
  const [toAmount, setToAmount] = useState<number>(transfer?.toAmount ?? 0);
  const [date, setDate] = useState(transfer?.date ?? today());
  const [note, setNote] = useState(transfer?.note ?? '');

  const fromAcc = accounts.find(a => a.id === fromId);
  const toAcc = accounts.find(a => a.id === toId);

  // Auto-suggest toAmount on fromAmount change if currencies differ and not manually altered
  const [userEditedTo, setUserEditedTo] = useState(!!transfer);

  useEffect(() => {
    if (!userEditedTo && fromAcc && toAcc && fromAmount > 0) {
      const converted = convert(fromAmount, fromAcc.currency, toAcc.currency);
      setToAmount(Math.round(converted * 100) / 100);
    }
  }, [fromAmount, fromAcc?.currency, toAcc?.currency, userEditedTo]);

  const submit = () => {
    if (!fromAcc || !toAcc || fromAmount <= 0 || toAmount <= 0 || fromId === toId) return;
    const t: Transfer = {
      id: transfer?.id ?? uid(),
      date,
      fromAccountId: fromId,
      toAccountId: toId,
      fromAmount: +fromAmount,
      fromCurrency: fromAcc.currency,
      toAmount: +toAmount,
      toCurrency: toAcc.currency,
      note: note.trim() || undefined,
      status: transfer?.status ?? 'confirmed',
      createdAt: transfer?.createdAt ?? Date.now(),
    };
    save('transfers', t);
    onClose();
  };

  const fromBal = fromAcc ? calcAccountBalance(fromAcc, payments, transfers, plans, stashes) : 0;
  const toBal = toAcc ? calcAccountBalance(toAcc, payments, transfers, plans, stashes) : 0;

  return (
    <Modal title={transfer ? 'Edit transfer' : 'Move money between accounts'} onClose={onClose}>
      <Field label="From account">
        <select value={fromId} onChange={e => { setFromId(e.target.value); setUserEditedTo(false); }}>
          {accounts.map(a => (
            <option key={a.id} value={a.id} disabled={a.id === toId}>
              {a.name} ({a.currency}) · Available: {money(fromBal, a.currency)}
            </option>
          ))}
        </select>
      </Field>

      <Field label="To account">
        <select value={toId} onChange={e => { setToId(e.target.value); setUserEditedTo(false); }}>
          {accounts.map(a => (
            <option key={a.id} value={a.id} disabled={a.id === fromId}>
              {a.name} ({a.currency}) · Current: {money(toBal, a.currency)}
            </option>
          ))}
        </select>
      </Field>

      <div className="row even">
        <Field label={`Amount taken out (${fromAcc?.currency ?? ''})`}>
          <input
            type="number"
            inputMode="decimal"
            value={fromAmount || ''}
            placeholder="0"
            onChange={e => setFromAmount(+e.target.value)}
          />
        </Field>
        <Field label={`Amount put in (${toAcc?.currency ?? ''})`} hint="Editable for exact rate/fees">
          <input
            type="number"
            inputMode="decimal"
            value={toAmount || ''}
            placeholder="0"
            onChange={e => { setToAmount(+e.target.value); setUserEditedTo(true); }}
          />
        </Field>
      </div>

      {fromAcc && toAcc && fromAcc.currency !== toAcc.currency && fromAmount > 0 && toAmount > 0 && (
        <div className="preview" style={{ fontSize: 13 }}>
          💱 Effective rate: 1 {fromAcc.currency} = {(toAmount / fromAmount).toFixed(4)} {toAcc.currency}
        </div>
      )}

      <Field label="Date">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      </Field>

      <Field label="Note (optional)">
        <input
          value={note}
          placeholder="e.g. Card top-up, currency conversion, withdrawal…"
          onChange={e => setNote(e.target.value)}
        />
      </Field>

      <button
        className="btn primary wide"
        disabled={!fromAcc || !toAcc || fromId === toId || fromAmount <= 0 || toAmount <= 0}
        onClick={submit}
      >
        {transfer ? 'Save changes' : '✓ Move money'}
      </button>

      {transfer && (
        <button
          className="btn ghost wide danger"
          onClick={() => { remove('transfers', transfer.id); onClose(); }}
        >
          Delete record
        </button>
      )}
    </Modal>
  );
}
