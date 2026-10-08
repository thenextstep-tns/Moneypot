import { useMemo, useState } from 'react';
import { useData } from '../store';
import { addDays, dayLabel, money, occurrences, toPayment, today } from '../schedule';
import { calcAllAccountBalances, calcAllProjectedAccountBalances, calcProjectedAccountBalance, calcProjectedStashBalance, checkAccountFunds } from '../balances';
import type { Occurrence, Payment, QuickTemplate } from '../types';
import { AccountCardsSelect, CurrencySelect, Empty, Field, HelpButton, Modal } from '../ui';
import { OneOffPaymentModal, TemplateModal } from './PaymentModal';
import { ScreenHelpModal } from './ScreenHelpModal';

/** MAIN FLOW #1 — confirm / edit / postpone / skip what's due */
export function Today() {
  const { user, plans, payments, transfers, stashes, categories, accounts, templates, save, remove } = useData();
  const [act, setAct] = useState<{ o: Occurrence; mode: 'confirm' | 'later' } | null>(null);
  const [oneOffModal, setOneOffModal] = useState<{ open: boolean; template?: QuickTemplate } | null>(null);
  const [templateModal, setTemplateModal] = useState<QuickTemplate | 'new' | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const t = today();
  const occ = useMemo(() => occurrences(plans, payments, addDays(t, -60), addDays(t, 7)), [plans, payments, t]);
  const balances = useMemo(
    () => calcAllAccountBalances(accounts, payments, transfers, plans, stashes),
    [accounts, payments, transfers, plans, stashes]
  );
  const cat = (id: string) => categories.find(c => c.id === id);
  const acc = (id?: string) => accounts.find(a => a.id === id);

  const firstName = useMemo(() => {
    if (user?.displayName) {
      const parts = user.displayName.trim().split(/\s+/);
      return parts[0];
    }
    if (user?.email) {
      const namePart = user.email.split('@')[0].split('.')[0];
      return namePart.charAt(0).toUpperCase() + namePart.slice(1);
    }
    return '';
  }, [user]);

  const isSharedItem = (o: Occurrence) => {
    const c = cat(o.categoryId);
    const s = stashes.find(x => x.id === o.stashId);
    return Boolean((c?.sharedWith && c.sharedWith.length > 0) || (s?.sharedWith && s.sharedWith.length > 0) || s?.name?.toLowerCase().trim() === 'kinky fund');
  };

  const pending = occ.filter(o => o.status === 'pending');
  const missed = pending.filter(o => o.date < t);
  const due = pending.filter(o => o.date === t);
  const soon = pending.filter(o => o.date > t);
  const done = occ.filter(o => o.status !== 'pending' && o.date >= addDays(t, -3) && o.date <= t).reverse();

  const write = (o: Occurrence, status: Payment['status'], patch: Partial<Payment> = {}) => save('payments', toPayment(o, status, patch));

  const Card = ({ o }: { o: Occurrence }) => {
    const isTransfer = o.kind === 'transfer';
    const c = cat(o.categoryId);
    const inc = o.kind === 'income';
    const verb = isTransfer ? 'Moved' : inc ? 'Got it' : o.kind === 'saving' ? 'Put aside' : 'Paid';
    const funds = (!inc && o.accountId)
      ? checkAccountFunds(o.accountId, o.amount, o.currency, accounts, balances, stashes)
      : null;

    const handleConfirm = () => {
      setAct({ o, mode: 'confirm' });
    };

    const getPartyLabel = (partyId?: string) => {
      if (!partyId) return 'No account';
      if (partyId.startsWith('stash_')) {
        const s = stashes.find(x => x.id === partyId.replace('stash_', ''));
        return s ? `${s.emoji} ${s.name} (Stash)` : 'Stash';
      }
      return acc(partyId)?.name ?? 'No account';
    };

    const fromLabel = getPartyLabel(o.accountId);
    const toLabel = getPartyLabel(o.toAccountId);

    return (
      <div className="item" style={{ ['--c' as string]: isTransfer ? '#6366F1' : c?.color }}>
        <div className="emoji">{isTransfer ? '⇄' : c?.emoji ?? '•'}</div>
        <div className="grow">
          <div className="title">
            {o.name}
            {isTransfer && (
              <span className="tag" style={{ background: '#EEF2FF', color: '#4338CA' }}>
                {fromLabel} → {toLabel}
              </span>
            )}
            {o.subcategory && <span className="tag subcat-badge">{o.subcategory}</span>}
            {isSharedItem(o) && <span className="tag shared-tag">👥 Shared</span>}
            {o.contributorName && <span className="tag" style={{ background: '#EFF6FF', color: '#1E40AF' }}>👤 {o.contributorName}</span>}
            {o.postponed && <span className="tag">moved</span>}
            {funds?.isShort && (
              <span className="tag warn-badge" title={`Account has only ${money(funds.balance ?? 0, funds.accountCurrency)}`}>
                ⚠️ Low balance ({money(funds.balance ?? 0, funds.accountCurrency)})
              </span>
            )}
          </div>
          <div className="sub">
            {dayLabel(o.date)} · {isTransfer ? `Transfer · ${fromLabel} → ${toLabel}` : `${c?.name ?? 'Pot'}${o.subcategory ? ` › ${o.subcategory}` : ''} · ${fromLabel}`}
          </div>
          {(o.planNote || o.note) && <div className="note">📝 {[o.planNote, o.note].filter(Boolean).join(' — ')}</div>}
        </div>
        <div className={`amt ${inc ? 'in' : ''}`}>{inc ? '+' : ''}{money(o.amount, o.currency)}</div>
        <div className="actions">
          <button className="btn ok" onClick={handleConfirm}>✓ {verb}</button>
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
        <div>
          <h1>
            Hi there{firstName ? `, ${firstName}` : ''} 👋
            <HelpButton onClick={() => setHelpOpen(true)} title="How the Today view works" />
          </h1>
          <p className="muted">{due.length + missed.length ? `You have ${due.length + missed.length} thing${due.length + missed.length > 1 ? 's' : ''} to check.` : 'Nothing to check right now.'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => setTemplateModal('new')} title="Create a reusable payment template">
            + Payment template
          </button>
          <button className="btn primary" onClick={() => setOneOffModal({ open: true })}>
            + I spent money
          </button>
        </div>
      </header>

      {templates && templates.length > 0 && (
        <section className="quick-templates-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>Quick payments <span className="muted">· 1-tap logging</span></h2>
            <button
              type="button"
              className="btn ghost"
              style={{ fontSize: 12, padding: '3px 8px' }}
              onClick={() => setTemplateModal('new')}
            >
              + Add template
            </button>
          </div>
          <div className="quick-templates-scroll">
            {templates.map(t => (
              <div key={t.id} className="quick-template-card">
                <button
                  type="button"
                  className="quick-template-main-btn"
                  onClick={() => setOneOffModal({ open: true, template: t })}
                  title={`Tap to log ${t.name} (${money(t.amount, t.currency)})`}
                >
                  <span className="quick-template-emoji">{t.emoji}</span>
                  <div className="quick-template-info">
                    <div className="quick-template-name">{t.name}</div>
                    <div className="quick-template-sub">
                      <b>{money(t.amount, t.currency)}</b>
                      {t.subcategory ? ` · ${t.subcategory}` : ''}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  className="quick-template-edit-btn"
                  title={`Edit "${t.name}" template`}
                  onClick={() => setTemplateModal(t)}
                >
                  ✎
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

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
              <div className="emoji">{o.kind === 'transfer' ? '⇄' : o.status === 'confirmed' ? '✅' : '⏭️'}</div>
              <div className="grow"><div className="title">{o.name}</div><div className="sub">{o.status === 'confirmed' ? (o.kind === 'transfer' ? 'Transferred' : 'Done') : 'Skipped'} · {dayLabel(o.date)}{o.note && ` · 📝 ${o.note}`}</div></div>
              <div className="amt">{money(o.amount, o.currency)}</div>
              <button
                className="btn ghost"
                onClick={() => {
                  remove('payments', o.key);
                  if (o.kind === 'transfer') {
                    remove('transfers', `tr_${o.key}`);
                  }
                }}
              >
                Undo
              </button>
            </div>
          ))}
        </section>
      )}

      {act && (
        <ActModal
          {...act}
          onClose={() => setAct(null)}
          onSave={(s, p) => {
            write(act.o, s, p);
            if (act.o.kind === 'transfer' && s === 'confirmed') {
              const trId = `tr_${act.o.key}`;
              const fromPartyId = p.accountId || act.o.accountId || '';
              const toPartyId = p.toAccountId || act.o.toAccountId || '';
              const fromAmt = p.amount ?? act.o.amount;
              const fromCur = p.currency || act.o.currency;
              const toAmt = p.toAmount ?? fromAmt;
              const toCur = p.toCurrency || fromCur;
              save('transfers', {
                id: trId,
                date: p.date || act.o.date,
                fromAccountId: fromPartyId,
                toAccountId: toPartyId,
                fromAmount: fromAmt,
                fromCurrency: fromCur,
                toAmount: toAmt,
                toCurrency: toCur,
                note: p.note || act.o.note,
                status: 'confirmed',
                createdAt: Date.now(),
                planId: act.o.plan.id,
                dueDate: act.o.dueDate,
              });
            }
            setAct(null);
          }}
        />
      )}
      {oneOffModal?.open && (
        <OneOffPaymentModal
          template={oneOffModal.template}
          onClose={() => setOneOffModal(null)}
        />
      )}
      {templateModal && (
        <TemplateModal
          template={templateModal === 'new' ? undefined : templateModal}
          onClose={() => setTemplateModal(null)}
        />
      )}
      {helpOpen && <ScreenHelpModal screenKey="today" onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

function ActModal({ o, mode, onClose, onSave }: { o: Occurrence; mode: 'confirm' | 'later'; onClose: () => void; onSave: (s: 'confirmed' | 'postponed', p: Partial<Payment>) => void }) {
  const { accounts, categories, payments, transfers, plans, stashes } = useData();
  const balances = useMemo(() => calcAllAccountBalances(accounts, payments, transfers, plans, stashes), [accounts, payments, transfers, plans, stashes]);
  const t = today();
  const [amount, setAmount] = useState(o.amount);
  const [currency, setCurrency] = useState(o.currency);
  const [accountId, setAccountId] = useState(o.accountId || accounts[0]?.id || '');
  const [toAccountId, setToAccountId] = useState(o.toAccountId || accounts.find(a => a.id !== (o.accountId || accounts[0]?.id))?.id || (accounts[0]?.id ? `stash_${stashes[0]?.id}` : ''));
  const [toAmount, setToAmount] = useState(o.toAmount ?? o.amount);
  const [toCurrency, setToCurrency] = useState(o.toCurrency ?? o.currency);
  const [categoryId, setCategoryId] = useState(o.categoryId);
  const [subcategory, setSubcategory] = useState(o.subcategory);
  const [note, setNote] = useState(o.note ?? '');
  const [date, setDate] = useState(mode === 'later' ? addDays(t, 1) : (o.date > t ? t : o.date));
  const patch: Partial<Payment> = {
    amount: +amount,
    currency,
    accountId: accountId || undefined,
    toAccountId: o.kind === 'transfer' ? (toAccountId || undefined) : undefined,
    toAmount: o.kind === 'transfer' ? (+toAmount || +amount) : undefined,
    toCurrency: o.kind === 'transfer' ? (toCurrency || currency) : undefined,
    stashId: accountId.startsWith('stash_') ? accountId.replace('stash_', '') : (o.stashId || undefined),
    date,
    categoryId: o.kind === 'transfer' ? '' : categoryId,
    subcategory: o.kind === 'transfer' ? undefined : subcategory,
    note: note.trim() || undefined,
  };
  const currentCat = categories.find(c => c.id === categoryId);

  const isFuture = date > t;
  const projectedBalances = useMemo(() => {
    if (!isFuture) return undefined;
    return calcAllProjectedAccountBalances(accounts, date, payments, transfers, plans, stashes);
  }, [accounts, date, payments, transfers, plans, stashes, isFuture]);

  const selParty = useMemo(() => {
    if (!accountId) return null;
    if (accountId.startsWith('stash_')) {
      const sId = accountId.replace('stash_', '');
      const st = stashes.find(s => s.id === sId);
      if (!st) return null;
      return {
        name: `${st.emoji} ${st.name} (Stash)`,
        currency: st.currency,
        isStash: true,
        stash: st,
      };
    }
    const a = accounts.find(x => x.id === accountId);
    if (!a) return null;
    return {
      name: a.name,
      currency: a.currency,
      isStash: false,
      acc: a,
    };
  }, [accountId, accounts, stashes]);

  const toParty = useMemo(() => {
    if (!toAccountId) return null;
    if (toAccountId.startsWith('stash_')) {
      const sId = toAccountId.replace('stash_', '');
      const st = stashes.find(s => s.id === sId);
      if (!st) return null;
      return {
        name: `${st.emoji} ${st.name} (Stash)`,
        currency: st.currency,
        isStash: true,
        stash: st,
      };
    }
    const a = accounts.find(x => x.id === toAccountId);
    if (!a) return null;
    return {
      name: a.name,
      currency: a.currency,
      isStash: false,
      acc: a,
    };
  }, [toAccountId, accounts, stashes]);

  const selBals = useMemo(() => {
    if (!selParty) return null;
    if (selParty.isStash && selParty.stash) {
      return calcProjectedStashBalance(selParty.stash, date, payments, transfers, plans);
    }
    if (selParty.acc) {
      return calcProjectedAccountBalance(selParty.acc, date, payments, transfers, plans, stashes);
    }
    return null;
  }, [selParty, date, payments, transfers, plans, stashes]);

  const toBals = useMemo(() => {
    if (!toParty) return null;
    if (toParty.isStash && toParty.stash) {
      return calcProjectedStashBalance(toParty.stash, date, payments, transfers, plans);
    }
    if (toParty.acc) {
      return calcProjectedAccountBalance(toParty.acc, date, payments, transfers, plans, stashes);
    }
    return null;
  }, [toParty, date, payments, transfers, plans, stashes]);

  const selFunds = o.kind !== 'income' && accountId
    ? checkAccountFunds(accountId, +amount || 0, currency, accounts, balances, stashes)
    : null;
  const valid = +amount > 0 && !!accountId && (o.kind !== 'transfer' || (!!toAccountId && toAccountId !== accountId));

  return (
    <Modal title={mode === 'later' ? `Move "${o.name}" to…` : o.kind === 'transfer' ? `Confirm transfer: "${o.name}"` : `Confirm payment: "${o.name}"`} onClose={onClose}>
      {mode === 'confirm' && (
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          {o.kind === 'transfer'
            ? 'Please confirm the amount and accounts for this transfer:'
            : o.kind === 'income'
            ? 'Please confirm the final sum and the account the money goes into:'
            : 'Please confirm the final sum and the account the money is taken out of:'}
        </p>
      )}
      {o.planNote && <div className="preview">📝 {o.planNote}</div>}
      {mode === 'later' && (
        <div className="chips">
          {[['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7], ['In 2 weeks', 14]].map(([l, n]) =>
            <button key={l} className={date === addDays(t, +n) ? 'chip on' : 'chip'} onClick={() => setDate(addDays(t, +n))}>{l}</button>)}
        </div>
      )}
      <Field label={mode === 'later' ? 'New date' : 'When'}><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      <div className="row">
        <Field label={mode === 'confirm' ? 'Final sum' : 'How much'}><input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(+e.target.value)} /></Field>
        <Field label="Currency"><CurrencySelect value={currency} onChange={setCurrency} /></Field>
      </div>

      {o.kind === 'transfer' ? (
        <>
          <Field label="From (Source account / stash)">
            <AccountCardsSelect
              accounts={accounts}
              stashes={stashes}
              allowStashes={true}
              value={accountId}
              onChange={id => setAccountId(id)}
              balances={balances}
              targetDate={date}
              projectedBalances={projectedBalances}
            />
            {!accountId && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--bad)' }}>
                Please select source account
              </p>
            )}

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: +amount > 0 ? 4 : 0 }}>
                  <span style={{ color: 'var(--mute)' }}>Projected on {dayLabel(date)}:</span>
                  <b style={{ color: selBals.projected < 0 ? '#DC2626' : '#2563EB' }}>
                    {money(selBals.projected, selParty.currency)}
                  </b>
                </div>
                {+amount > 0 && (
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
                    <b style={{ color: selBals.projected - +amount < 0 ? '#DC2626' : '#166534' }}>
                      {money(selBals.projected - +amount, selParty.currency)}
                    </b>
                  </div>
                )}
              </div>
            )}
          </Field>

          <Field label="To (Destination account / stash)">
            <AccountCardsSelect
              accounts={accounts}
              stashes={stashes}
              allowStashes={true}
              value={toAccountId}
              onChange={id => setToAccountId(id)}
              balances={balances}
              targetDate={date}
              projectedBalances={projectedBalances}
            />

            {toAccountId && toAccountId === accountId && (
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: +amount > 0 ? 4 : 0 }}>
                  <span style={{ color: 'var(--mute)' }}>Projected on {dayLabel(date)}:</span>
                  <b style={{ color: '#2563EB' }}>
                    {money(toBals.projected, toParty.currency)}
                  </b>
                </div>
                {+amount > 0 && (
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
                      {money(toBals.projected + +amount, toParty.currency)}
                    </b>
                  </div>
                )}
              </div>
            )}
          </Field>
        </>
      ) : (
        <>
          <Field label={o.kind === 'income' ? 'Into account' : 'From account'}>
            <AccountCardsSelect
              accounts={accounts}
              stashes={stashes}
              value={accountId}
              onChange={id => setAccountId(id)}
              balances={balances}
              targetDate={date}
              projectedBalances={projectedBalances}
            />
            {!accountId && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--bad)' }}>
                Please select an account
              </p>
            )}

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: +amount > 0 ? 4 : 0 }}>
                  <span style={{ color: 'var(--mute)' }}>Projected on {dayLabel(date)}:</span>
                  <b style={{ color: selBals.projected < 0 ? '#DC2626' : '#2563EB' }}>
                    {money(selBals.projected, selParty.currency)}
                  </b>
                </div>
                {+amount > 0 && (
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
                      After this {o.kind === 'income' ? 'income' : 'payment'}:
                    </span>
                    <b
                      style={{
                        color:
                          (o.kind === 'income'
                            ? selBals.projected + +amount
                            : selBals.projected - +amount) < 0
                            ? '#DC2626'
                            : '#166534',
                      }}
                    >
                      {money(
                        o.kind === 'income'
                          ? selBals.projected + +amount
                          : selBals.projected - +amount,
                        selParty.currency
                      )}
                    </b>
                  </div>
                )}
              </div>
            )}
          </Field>

          {isFuture && selParty && +amount > 0 && selBals && o.kind !== 'income' && (selBals.projected - +amount < 0) && (
            <div className="preview" style={{ background: '#FDE8E8', color: '#9B1C1C', borderColor: '#F8B4B4', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⚠️</span>
              <span>
                <strong>Low projected balance in {selParty.name}:</strong> On {dayLabel(date)}, projected balance is {money(selBals.projected, selParty.currency)}, which is {money(+amount - selBals.projected, selParty.currency)} short.
              </span>
            </div>
          )}

          {!isFuture && selFunds?.isShort && (
            <div className="preview" style={{ background: '#FFFBEB', color: '#92400E', borderColor: '#FDE68A', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⚠️</span>
              <span>
                <strong>Low balance in {selFunds.accountName}:</strong> Has {money(selFunds.balance ?? 0, selFunds.accountCurrency)}, but this payment needs {money(selFunds.neededInAccCur, selFunds.accountCurrency)} (short by {money(selFunds.shortBy, selFunds.accountCurrency)}).
              </span>
            </div>
          )}

          {o.kind === 'saving' ? (
            <div className="preview" style={{ background: '#F0FDF4', color: '#166534', borderColor: '#BBF7D0', margin: '4px 0 10px' }}>
              🌱 Saving into stash: <b>{stashes.find(s => s.id === o.stashId)?.name || o.name}</b>
            </div>
          ) : (
            <>
              <Field label="Pot">
                <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setSubcategory(undefined); }}>
                  {categories.filter(c => c.kind === o.kind).map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                </select>
              </Field>

              {currentCat?.subcategories && currentCat.subcategories.length > 0 && (
                <Field label="Subcategory (optional)">
                  <div className="chips">
                    <button
                      type="button"
                      className={!subcategory ? 'chip on' : 'chip'}
                      onClick={() => setSubcategory(undefined)}
                    >
                      General
                    </button>
                    {currentCat.subcategories.map(s => (
                      <button
                        key={s}
                        type="button"
                        className={subcategory === s ? 'chip on' : 'chip'}
                        onClick={() => setSubcategory(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
            </>
          )}
        </>
      )}

      <Field label="Comment (optional)">
        <textarea rows={2} value={note} placeholder={mode === 'later' ? 'Why later? e.g. waiting for the invoice' : 'What exactly was it? e.g. bought a new kettle too'} onChange={e => setNote(e.target.value)} />
      </Field>
      <button
        className="btn primary wide"
        disabled={!valid}
        onClick={() => onSave(mode === 'later' ? 'postponed' : 'confirmed', patch)}
      >
        {mode === 'later'
          ? '⏰ Move it'
          : o.kind === 'transfer'
          ? '✓ Approve & Transfer'
          : selFunds?.isShort
          ? '✓ Approve & Pay anyway (Overdraft)'
          : o.kind === 'income'
          ? '✓ Approve & Record Income'
          : o.kind === 'saving'
          ? '✓ Approve & Put Aside'
          : '✓ Approve & Record Payment'}
      </button>
    </Modal>
  );
}

