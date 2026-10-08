import { useMemo, useState } from 'react';
import { uid, useData } from '../store';
import { freqLabel, money, occurrences, perMonth, toPayment, today } from '../schedule';
import { calcAllAccountBalances } from '../balances';
import type { Kind, Plan } from '../types';
import { AccountCardsSelect, CurrencySelect, Empty, Field, HelpButton, Modal, Seg } from '../ui';
import { RecurrenceEditor } from './Recurrence';
import { ScreenHelpModal } from './ScreenHelpModal';

const GROUPS: [Kind, string, string][] = [
  ['income', 'Money coming in', 'Salary, freelance, anything you receive'],
  ['expense', 'Money going out', 'Bills, groceries, subscriptions…'],
  ['saving', 'Putting aside', 'Regular top-ups of your stashes'],
];

/** Setup: income & expenses with their regularity */
export function Plans() {
  const { plans, categories, stashes, settings } = useData();
  const [edit, setEdit] = useState<Plan | Kind | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const cat = (id: string) => categories.find(c => c.id === id);
  const isShared = (p: Plan) => {
    const c = cat(p.categoryId);
    const s = stashes.find(x => x.id === p.stashId);
    return Boolean((c?.sharedWith && c.sharedWith.length > 0) || (s?.sharedWith && s.sharedWith.length > 0));
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>
            Your plan
            <HelpButton onClick={() => setHelpOpen(true)} title="How planning works" />
          </h1>
          <p className="muted">Tell us what usually comes in and goes out. We'll remind you when it's due.</p>
        </div>
      </header>
      {GROUPS.map(([kind, title, hint]) => {
        const list = plans.filter(p => p.kind === kind);
        const monthly = list.reduce((s, p) => s + perMonth(p), 0);
        return (
          <section key={kind}>
            <h2>{title} {monthly > 0 && <span className="muted">· ≈ {money(monthly, settings.currency)} / month</span>}</h2>
            {list.length === 0 && <p className="muted">{hint}</p>}
            {list.map(p => (
              <button key={p.id} className="item click" style={{ ['--c' as string]: cat(p.categoryId)?.color }} onClick={() => setEdit(p)}>
                <div className="emoji">{cat(p.categoryId)?.emoji}</div>
                <div className="grow">
                  <div className="title">
                    {p.name}
                    {p.subcategory && <span className="tag subcat-badge">{p.subcategory}</span>}
                    {isShared(p) && <span className="tag shared-tag">👥 Shared</span>}
                  </div>
                  <div className="sub">{freqLabel(p)} · {cat(p.categoryId)?.name}</div>
                  {p.note && <div className="note">📝 {p.note}</div>}
                </div>
                <div className={`amt ${kind === 'income' ? 'in' : ''}`}>{money(p.amount, p.currency)}</div>
              </button>
            ))}
            <button className="btn dashed wide" onClick={() => setEdit(kind)}>+ Add</button>
          </section>
        );
      })}
      {plans.length === 0 && <Empty emoji="🧭" title="Start with your income" text="Then add rent and the bills you always pay." />}
      {edit && <PlanForm plan={typeof edit === 'string' ? undefined : edit} kind={typeof edit === 'string' ? edit : undefined} onClose={() => setEdit(null)} />}
      {helpOpen && <ScreenHelpModal screenKey="plan" onClose={() => setHelpOpen(false)} />}
    </div>
  );
}


/** quick = "I spent money": one-off expense that's confirmed immediately */
export function PlanForm({ plan, kind, quick, onClose }: { plan?: Plan; kind?: Kind; quick?: boolean; onClose: () => void }) {
  const { categories, accounts, stashes, settings, payments, transfers, plans, save, remove } = useData();
  const balances = useMemo(() => calcAllAccountBalances(accounts, payments, transfers, plans, stashes), [accounts, payments, transfers, plans, stashes]);

  const [p, setP] = useState<Plan>(plan ?? {
    id: uid(), name: '', kind: kind ?? 'expense', categoryId: '', amount: 0, currency: settings.currency,
    accountId: accounts[0]?.id, freq: quick ? 'once' : 'monthly', every: 1, startDate: today(),
  });
  const set = (patch: Partial<Plan>) => setP(x => ({ ...x, ...patch }));
  const cats = categories.filter(c => c.kind === p.kind);
  const categoryId = p.categoryId || cats[0]?.id || '';
  const valid = p.name.trim() && p.amount > 0;

  const submit = () => {
    const final = { ...p, categoryId, name: p.name.trim() };
    save('plans', final);
    if (quick) { const o = occurrences([final], [], final.startDate, final.startDate)[0]; save('payments', toPayment(o, 'confirmed', { note: final.note })); }
    onClose();
  };

  return (
    <Modal title={quick ? 'What did you spend on?' : plan ? 'Edit' : 'Add to your plan'} onClose={onClose}>
      {!quick && <Seg value={p.kind} onChange={k => set({ kind: k, categoryId: '' })} options={[['income', '💰 In'], ['expense', '💸 Out'], ['saving', '🌱 Save']]} />}
      <Field label="What is it?"><input autoFocus value={p.name} placeholder={p.kind === 'income' ? 'Salary' : 'Rent, Groceries, Netflix…'} onChange={e => set({ name: e.target.value })} /></Field>
      <div className="row">
        <Field label="How much?"><input type="number" inputMode="decimal" value={p.amount || ''} onChange={e => set({ amount: +e.target.value })} /></Field>
        <Field label="Currency"><CurrencySelect value={p.currency} onChange={v => set({ currency: v })} /></Field>
      </div>
      {quick
        ? <Field label="When"><input type="date" value={p.startDate} onChange={e => set({ startDate: e.target.value })} /></Field>
        : <RecurrenceEditor p={p} set={set} />}
      <Field label="Which pot?">
        <div className="chips">
          {cats.map(c => <button type="button" key={c.id} className={c.id === categoryId ? 'chip on' : 'chip'} onClick={() => set({ categoryId: c.id, subcategory: undefined })}>{c.emoji} {c.name}</button>)}
        </div>
      </Field>
      {categories.find(c => c.id === categoryId)?.subcategories && (categories.find(c => c.id === categoryId)!.subcategories!.length > 0) && (
        <Field label="Subcategory (optional)">
          <div className="chips">
            <button
              type="button"
              className={!p.subcategory ? 'chip on' : 'chip'}
              onClick={() => set({ subcategory: undefined })}
            >
              General
            </button>
            {categories.find(c => c.id === categoryId)!.subcategories!.map(s => (
              <button
                key={s}
                type="button"
                className={p.subcategory === s ? 'chip on' : 'chip'}
                onClick={() => set({ subcategory: s })}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>
      )}
      {p.kind === 'saving' && (
        <Field label="Into which stash?">
          <select value={p.stashId ?? ''} onChange={e => set({ stashId: e.target.value || undefined })}>
            <option value="">—</option>{stashes.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
          </select>
        </Field>
      )}
      <Field label={p.kind === 'income' ? 'Arrives to' : 'Paid from'}>
        <AccountCardsSelect
          accounts={accounts}
          value={p.accountId}
          onChange={id => set({ accountId: id })}
          balances={balances}
        />
      </Field>

      <Field label="Notes (optional)">
        <textarea rows={2} value={p.note ?? ''} placeholder={quick ? 'What was it?' : 'What does it include? e.g. electricity + water'} onChange={e => set({ note: e.target.value || undefined })} />
      </Field>
      <button className="btn primary wide" disabled={!valid} onClick={submit}>{quick ? '✓ Save' : plan ? 'Save changes' : 'Add'}</button>
      {plan && <button className="btn ghost wide danger" onClick={() => { remove('plans', plan.id); onClose(); }}>Delete (past payments are kept)</button>}
    </Modal>
  );
}
