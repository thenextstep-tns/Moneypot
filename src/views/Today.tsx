import { useMemo, useState } from 'react';
import { useData } from '../store';
import { addDays, dayLabel, money, occurrences, toPayment, today } from '../schedule';
import type { Occurrence, Payment } from '../types';
import { CurrencySelect, Empty, Field, Modal } from '../ui';
import { PlanForm } from './Plans';

/** MAIN FLOW #1 — confirm / edit / postpone / skip what's due */
export function Today() {
  const { plans, payments, categories, accounts, save, remove } = useData();
  const [act, setAct] = useState<{ o: Occurrence; mode: 'confirm' | 'later' } | null>(null);
  const [adding, setAdding] = useState(false);
  const t = today();
  const occ = useMemo(() => occurrences(plans, payments, addDays(t, -60), addDays(t, 7)), [plans, payments, t]);
  const cat = (id: string) => categories.find(c => c.id === id);
  const acc = (id?: string) => accounts.find(a => a.id === id);

  const pending = occ.filter(o => o.status === 'pending');
  const missed = pending.filter(o => o.date < t);
  const due = pending.filter(o => o.date === t);
  const soon = pending.filter(o => o.date > t);
  const done = occ.filter(o => o.status !== 'pending' && o.date >= addDays(t, -3) && o.date <= t).reverse();

  const write = (o: Occurrence, status: Payment['status'], patch: Partial<Payment> = {}) => save('payments', toPayment(o, status, patch));

  const Card = ({ o }: { o: Occurrence }) => {
    const c = cat(o.categoryId);
    const inc = o.kind === 'income';
    const verb = inc ? 'Got it' : o.kind === 'saving' ? 'Put aside' : 'Paid';
    return (
      <div className="item" style={{ ['--c' as string]: c?.color }}>
        <div className="emoji">{c?.emoji ?? '•'}</div>
        <div className="grow">
          <div className="title">{o.name}{o.postponed && <span className="tag">moved</span>}</div>
          <div className="sub">{dayLabel(o.date)} · {acc(o.accountId)?.name ?? 'No account'}</div>
          {(o.planNote || o.note) && <div className="note">📝 {[o.planNote, o.note].filter(Boolean).join(' — ')}</div>}
        </div>
        <div className={`amt ${inc ? 'in' : ''}`}>{inc ? '+' : ''}{money(o.amount, o.currency)}</div>
        <div className="actions">
          <button className="btn ok" onClick={() => write(o, 'confirmed')}>✓ {verb}</button>
          <button className="btn" onClick={() => setAct({ o, mode: 'confirm' })} title="Different amount or account">✎ Edit</button>
          <button className="btn" onClick={() => setAct({ o, mode: 'later' })}>⏰ Later</button>
          <button className="btn ghost" onClick={() => write(o, 'cancelled')} title="Didn't happen">Skip</button>
        </div>
      </div>
    );
  };

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Hi there 👋</h1><p className="muted">{due.length + missed.length ? `You have ${due.length + missed.length} thing${due.length + missed.length > 1 ? 's' : ''} to check.` : 'Nothing to check right now.'}</p></div>
        <button className="btn primary" onClick={() => setAdding(true)}>+ I spent money</button>
      </header>

      {missed.length > 0 && <section><h2>Did these happen? <span className="muted">· earlier</span></h2>{missed.map(o => <Card key={o.key} o={o} />)}</section>}
      <section>
        <h2>Today</h2>
        {due.length ? due.map(o => <Card key={o.key} o={o} />) : <Empty emoji="🎉" title="All caught up for today" />}
      </section>
      {soon.length > 0 && <section><h2>Coming up this week</h2>{soon.map(o => <Card key={o.key} o={o} />)}</section>}
      {done.length > 0 && (
        <section className="done">
          <h2>Recently done</h2>
          {done.map(o => (
            <div key={o.key} className="item small">
              <div className="emoji">{o.status === 'confirmed' ? '✅' : '⏭️'}</div>
              <div className="grow"><div className="title">{o.name}</div><div className="sub">{o.status === 'confirmed' ? 'Done' : 'Skipped'} · {dayLabel(o.date)}{o.note && ` · 📝 ${o.note}`}</div></div>
              <div className="amt">{money(o.amount, o.currency)}</div>
              <button className="btn ghost" onClick={() => remove('payments', o.key)}>Undo</button>
            </div>
          ))}
        </section>
      )}

      {act && <ActModal {...act} onClose={() => setAct(null)} onSave={(s, p) => { write(act.o, s, p); setAct(null); }} />}
      {adding && <PlanForm quick onClose={() => setAdding(false)} />}
    </div>
  );
}

function ActModal({ o, mode, onClose, onSave }: { o: Occurrence; mode: 'confirm' | 'later'; onClose: () => void; onSave: (s: 'confirmed' | 'postponed', p: Partial<Payment>) => void }) {
  const { accounts, categories } = useData();
  const t = today();
  const [amount, setAmount] = useState(o.amount);
  const [currency, setCurrency] = useState(o.currency);
  const [accountId, setAccountId] = useState(o.accountId ?? '');
  const [categoryId, setCategoryId] = useState(o.categoryId);
  const [note, setNote] = useState(o.note ?? '');
  const [date, setDate] = useState(mode === 'later' ? addDays(t, 1) : (o.date > t ? t : o.date));
  const patch: Partial<Payment> = { amount: +amount, currency, accountId: accountId || undefined, date, categoryId, note: note.trim() || undefined };

  return (
    <Modal title={mode === 'later' ? `Move "${o.name}" to…` : `Confirm "${o.name}"`} onClose={onClose}>
      {o.planNote && <div className="preview">📝 {o.planNote}</div>}
      {mode === 'later' && (
        <div className="chips">
          {[['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7], ['In 2 weeks', 14]].map(([l, n]) =>
            <button key={l} className={date === addDays(t, +n) ? 'chip on' : 'chip'} onClick={() => setDate(addDays(t, +n))}>{l}</button>)}
        </div>
      )}
      <Field label={mode === 'later' ? 'New date' : 'When'}><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      <div className="row">
        <Field label="How much"><input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(+e.target.value)} /></Field>
        <Field label="Currency"><CurrencySelect value={currency} onChange={setCurrency} /></Field>
      </div>
      <div className="row even">
        <Field label={o.kind === 'income' ? 'Into account' : 'From account'}>
          <select value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">—</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Pot">
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            {categories.filter(c => c.kind === o.kind).map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Comment (optional)">
        <textarea rows={2} value={note} placeholder={mode === 'later' ? 'Why later? e.g. waiting for the invoice' : 'What exactly was it? e.g. bought a new kettle too'} onChange={e => setNote(e.target.value)} />
      </Field>
      <button className="btn primary wide" onClick={() => onSave(mode === 'later' ? 'postponed' : 'confirmed', patch)}>
        {mode === 'later' ? '⏰ Move it' : '✓ Confirm'}
      </button>
    </Modal>
  );
}
