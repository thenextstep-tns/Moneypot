import { useMemo, useState } from 'react';
import { uid, useData } from '../store';
import { addDays, dayLabel, dueDates, freqLabel, money, occurrences, perMonth, toPayment, today } from '../schedule';
import { calcAllAccountBalances, calcAllProjectedAccountBalances, calcProjectedAccountBalance, calcProjectedStashBalance } from '../balances';
import type { Kind, Plan } from '../types';
import { AccountCardsSelect, CurrencySelect, Empty, Field, HelpButton, Modal, Seg } from '../ui';
import { RecurrenceEditor } from './Recurrence';
import { ScreenHelpModal } from './ScreenHelpModal';

const GROUPS: [Kind, string, string][] = [
  ['income', 'Money coming in', 'Salary, freelance, anything you receive'],
  ['expense', 'Money going out', 'Bills, groceries, subscriptions…'],
  ['transfer', 'Transfers & Stash top-ups', 'Regular card top-ups, moving money to stashes, or between accounts'],
];

/** Setup: income & expenses with their regularity */
export function Plans() {
  const { plans, categories, accounts, stashes, settings } = useData();
  const [edit, setEdit] = useState<Plan | Kind | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [showOneOffs, setShowOneOffs] = useState(false);
  const cat = (id?: string) => (id ? categories.find(c => c.id === id) : undefined);
  const isShared = (p: Plan) => {
    const c = cat(p.categoryId);
    const s = stashes.find(x => x.id === p.stashId);
    return Boolean((c?.sharedWith && c.sharedWith.length > 0) || (s?.sharedWith && s.sharedWith.length > 0) || s?.name?.toLowerCase().trim() === 'kinky fund');
  };

  const getPartyName = (id?: string) => {
    if (!id) return 'Account';
    if (id.startsWith('stash_')) {
      const s = stashes.find(x => x.id === id.replace('stash_', ''));
      return s ? `${s.emoji} ${s.name}` : 'Stash';
    }
    const a = accounts.find(x => x.id === id);
    return a ? a.name : 'Account';
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className={`chip ${showOneOffs ? 'on' : ''}`}
            style={{ fontWeight: 600, padding: '8px 14px', fontSize: 13 }}
            onClick={() => setShowOneOffs(!showOneOffs)}
            title="Toggle showing one-off planned payments"
          >
            {showOneOffs ? '✓ Showing one-off plans' : '+ Show one-off plans'}
          </button>
        </div>
      </header>
      {GROUPS.map(([kind, title, hint]) => {
        const list = plans.filter(p => {
          const matchesKind = kind === 'transfer' ? (p.kind === 'transfer' || p.kind === 'saving') : (p.kind === kind);
          if (!matchesKind) return false;
          if (p.freq === 'once') return showOneOffs;
          return ['daily', 'weekly', 'monthly', 'yearly'].includes(p.freq);
        });
        const monthly = list.filter(p => p.freq !== 'once').reduce((s, p) => s + perMonth(p), 0);
        const oneOffTotal = list.filter(p => p.freq === 'once').reduce((s, p) => s + p.amount, 0);
        return (
          <section key={kind}>
            <h2>
              {title}
              {monthly > 0 && <span className="muted"> · ≈ {money(monthly, settings.currency)} / month</span>}
              {showOneOffs && oneOffTotal > 0 && <span className="muted"> · +{money(oneOffTotal, settings.currency)} one-off</span>}
            </h2>
            {list.length === 0 && <p className="muted">{hint}</p>}
            {list.map(p => {
              const isTransfer = p.kind === 'transfer' || p.kind === 'saving';
              const s = p.stashId ? stashes.find(x => x.id === p.stashId) : undefined;
              const c = cat(p.categoryId);
              const fromName = getPartyName(p.accountId || s?.accountId);
              const toName = p.kind === 'saving' && s ? `${s.emoji} ${s.name}` : getPartyName(p.toAccountId);
              return (
                <button
                  key={p.id}
                  className="item click"
                  style={{ ['--c' as string]: isTransfer ? '#6366F1' : c?.color }}
                  onClick={() => {
                    if (p.kind === 'saving') {
                      setEdit({
                        ...p,
                        kind: 'transfer',
                        toAccountId: p.toAccountId || (p.stashId ? `stash_${p.stashId}` : ''),
                      });
                    } else {
                      setEdit(p);
                    }
                  }}
                >
                  <div className="emoji">{isTransfer ? (p.kind === 'saving' && s ? s.emoji : '⇄') : c?.emoji}</div>
                  <div className="grow">
                    <div className="title">
                      {p.name}
                      {p.freq === 'once' && (
                        <span className="tag" style={{ background: '#E0F2FE', color: '#0369A1' }}>
                          One-off · {dayLabel(p.startDate)}
                        </span>
                      )}
                      {isTransfer && (
                        <span className="tag" style={{ background: '#EEF2FF', color: '#4338CA' }}>
                          {fromName} → {toName}
                        </span>
                      )}
                      {p.subcategory && <span className="tag subcat-badge">{p.subcategory}</span>}
                      {isShared(p) && <span className="tag shared-tag">👥 Shared</span>}
                    </div>
                    <div className="sub">
                      {p.freq === 'once' ? `Due ${dayLabel(p.startDate)}` : freqLabel(p)}
                      {isTransfer ? ` · ${fromName} → ${toName}` : (c?.name ? ` · ${c.name}` : '')}
                    </div>
                    {p.note && <div className="note">📝 {p.note}</div>}
                  </div>
                  <div className={`amt ${p.kind === 'income' ? 'in' : ''}`}>{money(p.amount, p.currency)}</div>
                </button>
              );
            })}
            <button className="btn dashed wide" onClick={() => setEdit(kind)}>+ Add</button>
          </section>
        );
      })}
      {plans.filter(p => showOneOffs || ['daily', 'weekly', 'monthly', 'yearly'].includes(p.freq)).length === 0 && (
        <Empty emoji="🧭" title="Start with your income" text="Then add rent and the bills you always pay." />
      )}
      {edit && <PlanForm plan={typeof edit === 'string' ? undefined : edit} kind={typeof edit === 'string' ? edit : undefined} onClose={() => setEdit(null)} />}
      {helpOpen && <ScreenHelpModal screenKey="plan" onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

/** Recurring income & expense form */
export function PlanForm({ plan, kind, onClose }: { plan?: Plan; kind?: Kind; onClose: () => void }) {
  const { categories, accounts, stashes, settings, payments, transfers, plans, save, remove } = useData();
  const balances = useMemo(() => calcAllAccountBalances(accounts, payments, transfers, plans, stashes), [accounts, payments, transfers, plans, stashes]);

  const [p, setP] = useState<Plan>(() => {
    if (plan) {
      if (plan.kind === 'saving') {
        return {
          ...plan,
          kind: 'transfer',
          toAccountId: plan.toAccountId || (plan.stashId ? `stash_${plan.stashId}` : ''),
        };
      }
      return plan;
    }
    const k: Kind = (kind === 'saving' ? 'transfer' : (kind ?? 'expense'));
    return {
      id: uid(),
      name: '',
      kind: k,
      categoryId: '',
      amount: 0,
      currency: settings.currency,
      accountId: accounts[0]?.id || '',
      toAccountId: accounts.find(a => a.id !== accounts[0]?.id)?.id || (accounts[0]?.id ? `stash_${stashes[0]?.id}` : ''),
      freq: 'monthly',
      every: 1,
      startDate: today(),
    };
  });
  const [addingSub, setAddingSub] = useState(false);
  const [newSubVal, setNewSubVal] = useState('');

  const t = today();
  const targetDate = useMemo(() => {
    if (p.freq === 'once') return p.startDate || t;
    const next = dueDates(p, t > p.startDate ? t : p.startDate, addDays(t, 800));
    return next[0] || p.startDate || t;
  }, [p, t]);

  const isFuture = targetDate > t;
  const projectedBalances = useMemo(() => {
    if (!isFuture) return undefined;
    return calcAllProjectedAccountBalances(accounts, targetDate, payments, transfers, plans, stashes);
  }, [accounts, targetDate, payments, transfers, plans, stashes, isFuture]);

  const selParty = useMemo(() => {
    if (!p.accountId) return null;
    if (p.accountId.startsWith('stash_')) {
      const sId = p.accountId.replace('stash_', '');
      const st = stashes.find(s => s.id === sId);
      if (!st) return null;
      return {
        name: `${st.emoji} ${st.name} (Stash)`,
        currency: st.currency,
        isStash: true,
        stash: st,
      };
    }
    const a = accounts.find(x => x.id === p.accountId);
    if (!a) return null;
    return {
      name: a.name,
      currency: a.currency,
      isStash: false,
      acc: a,
    };
  }, [p.accountId, accounts, stashes]);

  const toParty = useMemo(() => {
    if (!p.toAccountId) return null;
    if (p.toAccountId.startsWith('stash_')) {
      const sId = p.toAccountId.replace('stash_', '');
      const st = stashes.find(s => s.id === sId);
      if (!st) return null;
      return {
        name: `${st.emoji} ${st.name} (Stash)`,
        currency: st.currency,
        isStash: true,
        stash: st,
      };
    }
    const a = accounts.find(x => x.id === p.toAccountId);
    if (!a) return null;
    return {
      name: a.name,
      currency: a.currency,
      isStash: false,
      acc: a,
    };
  }, [p.toAccountId, accounts, stashes]);

  const selBals = useMemo(() => {
    if (!selParty) return null;
    if (selParty.isStash && selParty.stash) {
      return calcProjectedStashBalance(selParty.stash, targetDate, payments, transfers, plans);
    }
    if (selParty.acc) {
      return calcProjectedAccountBalance(selParty.acc, targetDate, payments, transfers, plans, stashes);
    }
    return null;
  }, [selParty, targetDate, payments, transfers, plans, stashes]);

  const toBals = useMemo(() => {
    if (!toParty) return null;
    if (toParty.isStash && toParty.stash) {
      return calcProjectedStashBalance(toParty.stash, targetDate, payments, transfers, plans);
    }
    if (toParty.acc) {
      return calcProjectedAccountBalance(toParty.acc, targetDate, payments, transfers, plans, stashes);
    }
    return null;
  }, [toParty, targetDate, payments, transfers, plans, stashes]);

  const set = (patch: Partial<Plan>) => setP(x => ({ ...x, ...patch }));
  const currentStashId = p.stashId || (p.kind === 'saving' ? stashes[0]?.id : undefined);
  const activeStash = stashes.find(s => s.id === currentStashId);
  const cats = categories.filter(c => c.kind === p.kind);
  const categoryId = p.kind === 'saving'
    ? (activeStash?.categoryId || categories.find(c => c.kind === 'saving')?.id || 'savings')
    : (p.categoryId || cats[0]?.id || '');
  const valid = p.name.trim() && p.amount > 0 && !!p.accountId && (p.kind !== 'transfer' || (!!p.toAccountId && p.toAccountId !== p.accountId));

  const handleQuickAddSub = () => {
    const v = newSubVal.trim();
    const currentCat = categories.find(c => c.id === categoryId);
    if (!v || !currentCat) return;
    const currentSubs = currentCat.subcategories ?? [];
    if (!currentSubs.includes(v)) {
      save('categories', { ...currentCat, subcategories: [...currentSubs, v] });
    }
    set({ subcategory: v });
    setNewSubVal('');
    setAddingSub(false);
  };

  const submit = () => {
    let finalCatId = categoryId;
    let finalSub = p.subcategory;
    let finalStashId = p.stashId;
    if (p.kind === 'saving') {
      finalStashId = currentStashId;
      finalCatId = activeStash?.categoryId || categories.find(c => c.kind === 'saving')?.id || 'savings';
      finalSub = activeStash?.subcategory || activeStash?.name;
    } else if (p.kind === 'transfer') {
      finalCatId = '';
      finalSub = undefined;
      finalStashId = undefined;
    } else if (p.accountId?.startsWith('stash_')) {
      finalStashId = p.accountId.replace('stash_', '');
    }
    const final: Plan = {
      ...p,
      stashId: finalStashId,
      categoryId: finalCatId,
      subcategory: finalSub,
      toAccountId: p.kind === 'transfer' ? p.toAccountId : undefined,
      toAmount: p.kind === 'transfer' ? (p.toAmount ?? p.amount) : undefined,
      toCurrency: p.kind === 'transfer' ? (p.toCurrency ?? p.currency) : undefined,
      name: p.name.trim(),
    };
    save('plans', final);
    onClose();
  };

  return (
    <Modal title={plan ? 'Edit plan' : 'Add to your plan'} onClose={onClose}>
      <Seg
        value={p.kind}
        onChange={k => {
          if (k === 'transfer') {
            set({
              kind: k,
              categoryId: '',
              stashId: undefined,
              subcategory: undefined,
              toAccountId: p.toAccountId || accounts.find(a => a.id !== p.accountId)?.id || (accounts[0]?.id ? `stash_${stashes[0]?.id}` : ''),
              name: p.name || 'Transfer',
            });
          } else {
            set({ kind: k, categoryId: '', stashId: undefined, toAccountId: undefined });
          }
        }}
        options={[
          ['income', '💰 In'],
          ['expense', '💸 Out'],
          ['transfer', '⇄ Transfer'],
        ]}
      />
      <Field label="What is it?">
        <input
          autoFocus
          value={p.name}
          placeholder={p.kind === 'income' ? 'Salary' : p.kind === 'transfer' ? 'Card top-up, stash top-up, transfer…' : 'Rent, Groceries, Netflix…'}
          onChange={e => set({ name: e.target.value })}
        />
      </Field>
      <div className="row">
        <Field label="How much?"><input type="number" inputMode="decimal" value={p.amount || ''} onChange={e => set({ amount: +e.target.value })} /></Field>
        <Field label="Currency"><CurrencySelect value={p.currency} onChange={v => set({ currency: v })} /></Field>
      </div>
      <RecurrenceEditor p={p} set={set} />

      {p.kind === 'transfer' ? (
        <>
          <Field label="From (Source account / stash)">
            <AccountCardsSelect
              accounts={accounts}
              stashes={stashes}
              allowStashes={true}
              value={p.accountId}
              onChange={id => set({ accountId: id })}
              balances={balances}
              targetDate={targetDate}
              projectedBalances={projectedBalances}
            />

            {selParty && isFuture && selBals && (
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 12,
                  padding: '10px 14px',
                  marginTop: 8,
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ color: 'var(--mute)' }}>Current balance ({selParty.name}):</span>
                  <b>{money(selBals.current, selParty.currency)}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: p.amount > 0 ? 4 : 0 }}>
                  <span style={{ color: 'var(--mute)' }}>Projected on {dayLabel(targetDate)}:</span>
                  <b style={{ color: selBals.projected < 0 ? '#DC2626' : '#2563EB' }}>
                    {money(selBals.projected, selParty.currency)}
                  </b>
                </div>
                {p.amount > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: 4,
                      borderTop: '1px dashed #E2E8F0',
                    }}
                  >
                    <span style={{ color: 'var(--mute)' }}>
                      After this transfer:
                    </span>
                    <b style={{ color: selBals.projected - p.amount < 0 ? '#DC2626' : '#166534' }}>
                      {money(selBals.projected - p.amount, selParty.currency)}
                    </b>
                  </div>
                )}
              </div>
            )}

            {selParty && isFuture && selBals && p.amount > 0 && (selBals.projected - p.amount < 0) && (
              <div className="preview" style={{ background: '#FDE8E8', color: '#9B1C1C', borderColor: '#F8B4B4', fontSize: 13, marginTop: 8 }}>
                ⚠️ <b>Low projected funds:</b> On {dayLabel(targetDate)}, {selParty.name} is projected to have {money(selBals.projected, selParty.currency)}, which is {money(p.amount - selBals.projected, selParty.currency)} short.
              </div>
            )}
          </Field>

          <Field label="To (Destination account / stash)">
            <AccountCardsSelect
              accounts={accounts}
              stashes={stashes}
              allowStashes={true}
              value={p.toAccountId}
              onChange={id => set({ toAccountId: id })}
              balances={balances}
              targetDate={targetDate}
              projectedBalances={projectedBalances}
            />

            {p.toAccountId && p.toAccountId === p.accountId && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--bad)' }}>
                Source and destination cannot be the same
              </p>
            )}

            {toParty && isFuture && toBals && (
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 12,
                  padding: '10px 14px',
                  marginTop: 8,
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ color: 'var(--mute)' }}>Current balance ({toParty.name}):</span>
                  <b>{money(toBals.current, toParty.currency)}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: p.amount > 0 ? 4 : 0 }}>
                  <span style={{ color: 'var(--mute)' }}>Projected on {dayLabel(targetDate)}:</span>
                  <b style={{ color: '#2563EB' }}>
                    {money(toBals.projected, toParty.currency)}
                  </b>
                </div>
                {p.amount > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: 4,
                      borderTop: '1px dashed #E2E8F0',
                    }}
                  >
                    <span style={{ color: 'var(--mute)' }}>
                      After receiving transfer:
                    </span>
                    <b style={{ color: '#166534' }}>
                      {money(toBals.projected + p.amount, toParty.currency)}
                    </b>
                  </div>
                )}
              </div>
            )}
          </Field>
        </>
      ) : (
        <>
          {p.kind === 'saving' ? (
            <Field label="Into which stash?">
              {stashes.length > 0 ? (
                <select
                  value={currentStashId ?? ''}
                  onChange={e => {
                    const sid = e.target.value;
                    const chosen = stashes.find(s => s.id === sid);
                    const sCat = chosen?.categoryId || categories.find(c => c.kind === 'saving')?.id || 'savings';
                    const sSub = chosen?.subcategory || chosen?.name;
                    set({
                      stashId: sid,
                      categoryId: sCat,
                      subcategory: sSub,
                      name: p.name.trim() ? p.name : (chosen?.name ?? ''),
                    });
                  }}
                >
                  {stashes.map(s => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
                </select>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  ⚠️ No stashes found. Create one in the Stashes tab.
                </p>
              )}
            </Field>
          ) : (
            <>
              <Field label="Which pot?">
                <div className="chips">
                  {cats.map(c => (
                    <button
                      type="button"
                      key={c.id}
                      className={c.id === categoryId ? 'chip on' : 'chip'}
                      onClick={() => set({ categoryId: c.id, subcategory: undefined })}
                    >
                      {c.emoji} {c.name}
                    </button>
                  ))}
                </div>
              </Field>
              {categories.find(c => c.id === categoryId) && (
                <Field label="Subcategory (optional)">
                  <div className="chips" style={{ alignItems: 'center' }}>
                    <button
                      type="button"
                      className={!p.subcategory ? 'chip on' : 'chip'}
                      onClick={() => set({ subcategory: undefined })}
                    >
                      General
                    </button>
                    {(categories.find(c => c.id === categoryId)?.subcategories ?? []).map(s => (
                      <button
                        key={s}
                        type="button"
                        className={p.subcategory === s ? 'chip on' : 'chip'}
                        onClick={() => set({ subcategory: s })}
                      >
                        {s}
                      </button>
                    ))}
                    {addingSub ? (
                      <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        <input
                          autoFocus
                          style={{ width: 130, padding: '4px 8px', fontSize: 13, borderRadius: 8 }}
                          placeholder="New name…"
                          value={newSubVal}
                          onChange={e => setNewSubVal(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); handleQuickAddSub(); }
                            if (e.key === 'Escape') { e.preventDefault(); setAddingSub(false); }
                          }}
                        />
                        <button type="button" className="btn ok" style={{ padding: '4px 8px', fontSize: 12 }} onClick={handleQuickAddSub}>✓</button>
                        <button type="button" className="btn ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setAddingSub(false)}>✕</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="chip"
                        style={{ borderStyle: 'dashed' }}
                        onClick={() => setAddingSub(true)}
                      >
                        + Add subcategory
                      </button>
                    )}
                  </div>
                </Field>
              )}
            </>
          )}

          <Field label={p.kind === 'income' ? 'Arrives to' : 'Paid from'}>
            <AccountCardsSelect
              accounts={accounts}
              stashes={stashes}
              allowStashes={p.kind !== 'saving'}
              value={p.accountId}
              onChange={id => set({ accountId: id })}
              balances={balances}
              targetDate={targetDate}
              projectedBalances={projectedBalances}
            />

            {selParty && isFuture && selBals && (
              <div
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 12,
                  padding: '10px 14px',
                  marginTop: 8,
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ color: 'var(--mute)' }}>Current balance ({selParty.name}):</span>
                  <b>{money(selBals.current, selParty.currency)}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: p.amount > 0 ? 4 : 0 }}>
                  <span style={{ color: 'var(--mute)' }}>Projected on {dayLabel(targetDate)}:</span>
                  <b style={{ color: selBals.projected < 0 ? '#DC2626' : '#2563EB' }}>
                    {money(selBals.projected, selParty.currency)}
                  </b>
                </div>
                {p.amount > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: 4,
                      borderTop: '1px dashed #E2E8F0',
                    }}
                  >
                    <span style={{ color: 'var(--mute)' }}>
                      After this {p.kind === 'income' ? 'income' : 'expense'}:
                    </span>
                    <b
                      style={{
                        color:
                          (p.kind === 'income'
                            ? selBals.projected + p.amount
                            : selBals.projected - p.amount) < 0
                            ? '#DC2626'
                            : '#166534',
                      }}
                    >
                      {money(
                        p.kind === 'income'
                          ? selBals.projected + p.amount
                          : selBals.projected - p.amount,
                        selParty.currency
                      )}
                    </b>
                  </div>
                )}
              </div>
            )}

            {selParty && isFuture && selBals && p.kind !== 'income' && p.amount > 0 && (selBals.projected - p.amount < 0) && (
              <div className="preview" style={{ background: '#FDE8E8', color: '#9B1C1C', borderColor: '#F8B4B4', fontSize: 13, marginTop: 8 }}>
                ⚠️ <b>Low projected funds:</b> On {dayLabel(targetDate)}, {selParty.name} is projected to have {money(selBals.projected, selParty.currency)}, which is {money(p.amount - selBals.projected, selParty.currency)} short.
              </div>
            )}
          </Field>
        </>
      )}

      <Field label="Notes (optional)">
        <textarea rows={2} value={p.note ?? ''} placeholder="What does it include? e.g. electricity + water" onChange={e => set({ note: e.target.value || undefined })} />
      </Field>
      <button className="btn primary wide" disabled={!valid} onClick={submit}>{plan ? 'Save changes' : 'Add to plan'}</button>
      {plan && <button className="btn ghost wide danger" onClick={() => { remove('plans', plan.id); onClose(); }}>Delete (past payments are kept)</button>}
    </Modal>
  );
}
