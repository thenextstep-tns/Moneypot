import { useState } from 'react';
import { uid, useData } from '../store';
import { money, today } from '../schedule';
import type { Account, Stash } from '../types';
import { Bar, CurrencySelect, Empty, Field, Modal, Seg } from '../ui';

const ICONS: Record<Account['type'], string> = { card: '💳', bank: '🏦', cash: '💵', wallet: '👛', savings: '🐷' };

/** Savings goals */
export function Stashes() {
  const { stashes, plans, payments } = useData();
  const [edit, setEdit] = useState<Stash | 'new' | null>(null);
  const saved = (s: Stash) => s.startAmount + payments
    .filter(p => p.status === 'confirmed' && (p.stashId ?? plans.find(x => x.id === p.planId)?.stashId) === s.id)
    .reduce((a, p) => a + p.amount, 0);
  return (
    <div className="page">
      <header className="page-head"><div><h1>Stashes</h1><p className="muted">Money you're putting aside for something.</p></div>
        <button className="btn primary" onClick={() => setEdit('new')}>+ New stash</button></header>
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
  const { accounts, plans, payments, stashes } = useData();
  const [edit, setEdit] = useState<Account | 'new' | null>(null);
  const balance = (a: Account) => payments.filter(p => p.status === 'confirmed').reduce((b, p) => {
    const plan = plans.find(x => x.id === p.planId);
    const kind = p.kind ?? plan?.kind, stashId = p.stashId ?? plan?.stashId;
    if (!kind) return b;
    let d = 0;
    if (p.accountId === a.id) d += kind === 'income' ? p.amount : -p.amount;
    if (kind === 'saving' && stashes.find(s => s.id === stashId)?.accountId === a.id) d += p.amount;
    return b + d;
  }, a.startBalance);
  return (
    <div className="page">
      <header className="page-head"><div><h1>Accounts</h1><p className="muted">Where your money lives.</p></div>
        <button className="btn primary" onClick={() => setEdit('new')}>+ Add account</button></header>
      <div className="grid">
        {accounts.map(a => (
          <button key={a.id} className="card click acc" style={{ ['--c' as string]: a.color }} onClick={() => setEdit(a)}>
            <div className="big">{ICONS[a.type]}</div>
            <div className="title">{a.name}</div>
            <div className="sub">{a.institution ?? a.type}</div>
            <div className="stash-amt"><b>{money(balance(a), a.currency)}</b></div>
          </button>
        ))}
      </div>
      {edit && <AccountForm acc={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
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
      <Field label="Bank / service (optional)"><input value={a.institution ?? ''} placeholder="Revolut, Payoneer…" onChange={e => set({ institution: e.target.value || undefined })} /></Field>
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
