import { useEffect, useMemo, useState } from 'react';
import { uid, useData } from '../store';
import { addDays, dayLabel, money, occurrences, today } from '../schedule';
import { convert, getRate } from '../fx';
import type { Account, Payment, Plan, Stash, Transfer } from '../types';
import { AccountCardsSelect, AccountForm, Bar, CurrencySelect, Empty, Field, HelpButton, Modal, Seg } from '../ui';
import { EmojiPicker } from '../emojis';
import { calcAccountBalance, calcProjectedAccountBalance, calcStashBalance, calcProjectedStashBalance } from '../balances';
import { ScreenHelpModal } from './ScreenHelpModal';
import { AcceptInviteModal, SharingModal } from './SharingModal';

export { calcAccountBalance, calcStashBalance };

const ICONS: Record<Account['type'], string> = { card: '💳', bank: '🏦', cash: '💵', wallet: '👛', savings: '🐷' };

/** Savings goals */
export function Stashes() {
  const { user, stashes, plans, payments, transfers } = useData();
  const [edit, setEdit] = useState<Stash | 'new' | null>(null);
  const [showAcceptInvite, setShowAcceptInvite] = useState(false);
  const [transferStash, setTransferStash] = useState<Stash | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const saved = (s: Stash) => calcStashBalance(s, payments, transfers, plans);

  const getStashContributors = (s: Stash) => {
    const pays = payments.filter(
      p => p.status === 'confirmed' && (p.stashId ?? plans.find(x => x.id === p.planId)?.stashId) === s.id
    );
    const byUser = new Map<string, number>();

    const ownerLabel = s.ownerEmail
      ? (s.ownerEmail === user?.email ? 'You (Creator)' : s.ownerEmail.split('@')[0])
      : 'Initial balance';

    if (s.startAmount > 0) {
      byUser.set(ownerLabel, (byUser.get(ownerLabel) ?? 0) + s.startAmount);
    }

    for (const p of pays) {
      let label = p.contributorName;
      if (!label && p.contributorEmail) {
        label = p.contributorEmail === user?.email ? 'You' : p.contributorEmail.split('@')[0];
      }
      if (!label) {
        label = p.ownerId === user?.uid ? 'You' : 'Collaborator';
      }
      byUser.set(label, (byUser.get(label) ?? 0) + p.amount);
    }

    return Array.from(byUser.entries()).map(([name, amount]) => ({ name, amount }));
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>
            Stashes
            <HelpButton onClick={() => setHelpOpen(true)} title="How stashes work" />
          </h1>
          <p className="muted">Money you're putting aside for something.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setShowAcceptInvite(true)}
            title="Join a shared stash using an invite code"
          >
            <span>👥</span>
            <span>Join shared stash</span>
          </button>
          <button className="btn primary" onClick={() => setEdit('new')}>+ New stash</button>
        </div>
      </header>
      {stashes.length === 0 && <Empty emoji="🐷" title="No stashes yet" text="A safety cushion of 3 months of expenses is a great first goal." />}
      <div className="grid">
        {stashes.map(s => {
          const v = saved(s);
          const contribs = getStashContributors(s);
          const isSharedStash = Boolean((s.sharedWith && s.sharedWith.length > 0) || s.name?.toLowerCase().trim() === 'kinky fund');
          const isInstant = s.isInstantAccess !== false && !isSharedStash;
          return (
            <button key={s.id} className="card click" onClick={() => setEdit(s)}>
              <div className="big">{s.emoji}</div>
              <div className="title">
                {s.name}
                {isInstant && (
                  <span className="tag" style={{ background: '#ECFDF5', color: '#065F46', fontSize: 11 }}>⚡ Instant Access</span>
                )}
                {isSharedStash && (
                  <span className="tag shared-tag">👥 Shared{s.sharedWith?.length ? ` (${s.sharedWith.length})` : ''}</span>
                )}
              </div>
              <div className="stash-amt"><b>{money(v, s.currency)}</b> <span className="muted">of {money(s.target, s.currency)}</span></div>
              <Bar done={v} total={s.target} color="#2FA36B" />
              <div className="sub">{v >= s.target ? '🎉 Goal reached!' : `${money(s.target - v, s.currency)} to go`}</div>
              {s.sharedWith && s.sharedWith.length > 0 && contribs.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                  {contribs.map(c => (
                    <span key={c.name} style={{ fontSize: 11, background: '#F1F5F9', padding: '2px 6px', borderRadius: 6, color: 'var(--ink)' }}>
                      👤 {c.name}: <b>{money(c.amount, s.currency)}</b>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end', borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                <span
                  className="btn ok"
                  style={{ fontSize: 12, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTransferStash(s);
                  }}
                  title="Withdraw to account or deposit into this stash"
                >
                  <span>⇄</span>
                  <span>Move money / Withdraw</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {edit && <StashForm stash={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {showAcceptInvite && <AcceptInviteModal onClose={() => setShowAcceptInvite(false)} />}
      {transferStash && <TransferModal initialFromId={`stash_${transferStash.id}`} onClose={() => setTransferStash(null)} />}
      {helpOpen && <ScreenHelpModal screenKey="stashes" onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

function StashForm({ stash, onClose }: { stash?: Stash; onClose: () => void }) {
  const { user, accounts, categories, settings, payments, plans, transfers, save, remove } = useData();
  const savingCats = categories.filter(c => c.kind === 'saving');
  const expenseCats = categories.filter(c => c.kind === 'expense');
  const defaultCatId = savingCats[0]?.id || 'savings';
  const [showSharing, setShowSharing] = useState(false);
  const [transferring, setTransferring] = useState(false);

  const isSharedStash = Boolean((stash?.sharedWith && stash.sharedWith.length > 0) || stash?.name?.toLowerCase().trim() === 'kinky fund');
  const initialInstant = stash
    ? (stash.isInstantAccess !== false && !isSharedStash)
    : true;

  const [s, setS] = useState<Stash>(stash ?? {
    id: uid(),
    name: '',
    emoji: '🎯',
    target: 0,
    currency: settings.currency,
    startAmount: 0,
    accountId: accounts.find(a => a.type === 'savings')?.id,
    categoryId: undefined,
    subcategory: undefined,
    isInstantAccess: true,
  });
  const [isInstant, setIsInstant] = useState(initialInstant);
  const [monthly, setMonthly] = useState(0);
  const set = (p: Partial<Stash>) => setS(x => ({ ...x, ...p }));

  const contribs = useMemo(() => {
    if (!stash) return [];
    const pays = payments.filter(
      p => p.status === 'confirmed' && (p.stashId ?? plans.find(x => x.id === p.planId)?.stashId) === stash.id
    );
    const byUser = new Map<string, number>();
    const ownerLabel = stash.ownerEmail
      ? (stash.ownerEmail === user?.email ? 'You (Creator)' : stash.ownerEmail.split('@')[0])
      : 'Initial balance';

    if (stash.startAmount > 0) {
      byUser.set(ownerLabel, (byUser.get(ownerLabel) ?? 0) + stash.startAmount);
    }
    for (const p of pays) {
      let label = p.contributorName;
      if (!label && p.contributorEmail) {
        label = p.contributorEmail === user?.email ? 'You' : p.contributorEmail.split('@')[0];
      }
      if (!label) {
        label = p.ownerId === user?.uid ? 'You' : 'Collaborator';
      }
      byUser.set(label, (byUser.get(label) ?? 0) + p.amount);
    }
    return Array.from(byUser.entries()).map(([name, amount]) => ({ name, amount }));
  }, [stash, payments, plans, user]);

  const submit = () => {
    const finalIsInstant = !isSharedStash && isInstant;
    const finalCatId = finalIsInstant ? undefined : (s.categoryId || defaultCatId);
    const finalSubcat = finalIsInstant ? undefined : (s.subcategory || s.name.trim());
    const finalStash: Stash = {
      ...s,
      isInstantAccess: finalIsInstant,
      categoryId: finalCatId,
      subcategory: finalSubcat,
    };
    save('stashes', finalStash);
    if (monthly > 0) {
      save('plans', {
        id: uid(),
        name: s.name,
        kind: 'saving',
        categoryId: finalCatId || defaultCatId,
        subcategory: finalSubcat || s.name.trim(),
        stashId: s.id,
        amount: monthly,
        currency: s.currency,
        freq: 'monthly',
        every: 1,
        startDate: today(),
        accountId: s.accountId || accounts[0]?.id,
      });
    }
    onClose();
  };
  return (
    <Modal title={stash ? 'Edit stash' : 'New stash'} onClose={onClose}>
      <Field label="Icon">
        <EmojiPicker value={s.emoji} onChange={emoji => set({ emoji })} />
      </Field>
      <Field label="What are you saving for?"><input autoFocus value={s.name} placeholder="Safety cushion" onChange={e => set({ name: e.target.value })} /></Field>
      <div className="row">
        <Field label="Goal"><input type="number" value={s.target || ''} onChange={e => set({ target: +e.target.value })} /></Field>
        <Field label="Currency"><CurrencySelect value={s.currency} onChange={v => set({ currency: v })} /></Field>
      </div>
      <Field label="Already have"><input type="number" value={s.startAmount || ''} onChange={e => set({ startAmount: +e.target.value })} /></Field>

      {/* Instant access parameter */}
      <div style={{ margin: '6px 0 14px' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: isSharedStash ? 'not-allowed' : 'pointer', background: '#F8FAFC', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)' }}>
          <input
            type="checkbox"
            checked={isSharedStash ? false : isInstant}
            disabled={isSharedStash}
            onChange={e => {
              const val = e.target.checked;
              setIsInstant(val);
              if (val) {
                set({ categoryId: undefined, subcategory: undefined });
              } else if (!s.categoryId) {
                set({ categoryId: defaultCatId });
              }
            }}
            style={{ marginTop: 2 }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⚡ Instant Access Stash</span>
              {isInstant && !isSharedStash && <span style={{ fontSize: 10, background: '#ECFDF5', color: '#065F46', padding: '1px 5px', borderRadius: 4 }}>Default</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>
              {isSharedStash
                ? 'Shared stashes cannot be general instant access stashes; they must be tied to a specific pot.'
                : 'Allows paying directly from this stash like an account. Does not require an associated pot.'}
            </div>
          </div>
        </label>
      </div>

      {!stash && <Field label="Put aside every month (optional)" hint="We'll remind you each month"><input type="number" value={monthly || ''} onChange={e => setMonthly(+e.target.value)} /></Field>}
      <Field label="Where is it kept?">
        <AccountCardsSelect
          accounts={accounts}
          value={s.accountId}
          onChange={id => set({ accountId: id })}
          allowStashes={false}
        />
      </Field>

      {/* Only show Associated Pot if NOT an Instant Access Stash (or if shared) */}
      {(!isInstant || isSharedStash) && (
        <Field label="Associated Pot" hint="Category for expenses or payments tied to this stash">
          <select
            value={s.categoryId || defaultCatId}
            onChange={e => set({ categoryId: e.target.value })}
          >
            <optgroup label="🌱 Savings Pots">
              {savingCats.map(c => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
            </optgroup>
            <optgroup label="💸 Expense Pots">
              {expenseCats.map(c => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
            </optgroup>
            {savingCats.length === 0 && <option value="savings">🌱 Savings & Stashes</option>}
          </select>
        </Field>
      )}

      <div className="note" style={{ margin: '8px 0 14px' }}>
        💡 Stashes act as dedicated money buckets. Transferring money between accounts and stashes adjusts your available account balances.
      </div>
      {stash && contribs.length > 0 && (
        <div style={{ background: '#F8FAFC', border: '1px solid var(--line)', borderRadius: 12, padding: 12, margin: '0 0 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 8 }}>
            👥 Contributors Breakdown
          </div>
          {contribs.map(c => (
            <div key={c.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #F1F5F9' }}>
              <span>👤 {c.name}</span>
              <b>{money(c.amount, s.currency)}</b>
            </div>
          ))}
        </div>
      )}
      <button className="btn primary wide" disabled={!s.name || !s.target} onClick={submit}>{stash ? 'Save' : 'Create stash'}</button>
      {stash && (
        <button
          type="button"
          className="btn ok wide"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}
          onClick={() => setTransferring(true)}
        >
          <span>⇄</span>
          <span>Move / Withdraw money from this stash</span>
        </button>
      )}
      {stash && (
        <button
          type="button"
          className="btn dashed wide"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}
          onClick={() => setShowSharing(true)}
        >
          <span>👥</span>
          <span>Share stash with others {s.sharedWith?.length ? `(${s.sharedWith.length})` : ''}</span>
        </button>
      )}
      {stash && <button className="btn ghost wide danger" style={{ marginTop: 8 }} onClick={() => { remove('stashes', stash.id); onClose(); }}>Delete</button>}
      {showSharing && <SharingModal type="stash" item={s} onClose={() => setShowSharing(false)} />}
      {transferring && <TransferModal initialFromId={`stash_${stash!.id}`} onClose={() => setTransferring(false)} />}
    </Modal>
  );
}


/** Where money lives: cards, Payoneer, cash, savings accounts */
export function Accounts() {
  const { accounts, plans, payments, stashes, transfers } = useData();
  const [edit, setEdit] = useState<Account | 'new' | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [expandedAccId, setExpandedAccId] = useState<string | null>(null);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>
            Accounts
            <HelpButton onClick={() => setHelpOpen(true)} title="How accounts work" />
          </h1>
          <p className="muted">Where your money lives.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {accounts.length >= 2 && (
            <button className="btn ok" onClick={() => setTransferring(true)}>⇄ Move money</button>
          )}
          <button className="btn primary" onClick={() => setEdit('new')}>+ Add account</button>
        </div>
      </header>

      <div className="grid">
        {accounts.map(a => {
          const isExpanded = expandedAccId === a.id;
          const from = today();
          const to = addDays(today(), 60);
          const upcoming = occurrences(plans, payments, from, to)
            .filter(o => o.accountId === a.id && o.status !== 'confirmed')
            .sort((x, y) => x.dueDate.localeCompare(y.dueDate));
          const bal = calcAccountBalance(a, payments, transfers, plans, stashes);

          return (
            <div
              key={a.id}
              className={`card acc ${isExpanded ? 'acc-open' : ''}`}
              style={{ ['--c' as string]: a.color, position: 'relative', cursor: 'pointer' }}
              onClick={() => setExpandedAccId(isExpanded ? null : a.id)}
            >
              {/* Three dots top right corner for edit modal */}
              <button
                type="button"
                className="acc-three-dots"
                title="Edit account & balance correction"
                onClick={(e) => {
                  e.stopPropagation();
                  setEdit(a);
                }}
              >
                ⋮
              </button>

              <div className="big">{ICONS[a.type]}</div>
              <div className="title" style={{ paddingRight: 24 }}>{a.name}</div>
              <div className="sub">{a.institution ?? a.type} · {a.currency}</div>
              <div className="stash-amt">
                <b>{money(bal, a.currency)}</b>
              </div>

              {/* Reveal toggle indicator */}
              <div className="acc-expand-toggle">
                <span>{isExpanded ? '▲ Hide upcoming' : `▼ Upcoming (${upcoming.length})`}</span>
              </div>

              {/* Revealed upcoming payments */}
              {isExpanded && (
                <div className="acc-upcoming-tray" onClick={e => e.stopPropagation()}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 4 }}>
                    Upcoming Scheduled ({upcoming.length})
                  </div>
                  {upcoming.length === 0 ? (
                    <div className="muted" style={{ fontSize: 12, padding: '4px 0' }}>
                      No payments scheduled for this account in the next 60 days.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                      {upcoming.slice(0, 8).map(o => (
                        <div key={o.key} className="acc-upcoming-row">
                          <div>
                            <div style={{ fontWeight: 600 }}>{o.plan.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--mute)' }}>
                              Due {dayLabel(o.dueDate)}
                            </div>
                          </div>
                          <div
                            style={{
                              fontWeight: 700,
                              color: o.plan.kind === 'income' ? '#16A34A' : '#DC2626',
                            }}
                          >
                            {o.plan.kind === 'income' ? '+' : '-'}{money(o.amount, o.currency)}
                          </div>
                        </div>
                      ))}
                      {upcoming.length > 8 && (
                        <div className="muted" style={{ fontSize: 11, textAlign: 'center', paddingTop: 2 }}>
                          +{upcoming.length - 8} more upcoming…
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {edit && <AccountForm acc={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {transferring && <TransferModal onClose={() => setTransferring(false)} />}
      {helpOpen && <ScreenHelpModal screenKey="accounts" onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

/** Modal to move money between accounts and stashes with differing currencies & exchange rates */
export function TransferModal({
  transfer,
  initialFromId,
  initialToId,
  onClose,
}: {
  transfer?: Transfer;
  initialFromId?: string;
  initialToId?: string;
  onClose: () => void;
}) {
  const { accounts, save, remove, payments, plans, stashes, transfers } = useData();

  const allParties = useMemo(() => {
    const list: { id: string; name: string; currency: string; type: 'account' | 'stash'; icon: string }[] = [];
    for (const a of accounts) {
      list.push({ id: a.id, name: a.name, currency: a.currency, type: 'account', icon: ICONS[a.type] || '💳' });
    }
    for (const s of stashes) {
      list.push({ id: `stash_${s.id}`, name: `${s.name} (Stash)`, currency: s.currency, type: 'stash', icon: s.emoji || '🐷' });
    }
    return list;
  }, [accounts, stashes]);

  const defaultFrom = initialFromId || transfer?.fromAccountId || accounts[0]?.id || '';
  const defaultTo = initialToId || transfer?.toAccountId || (defaultFrom.startsWith('stash_') ? accounts[0]?.id : (accounts.find(a => a.id !== defaultFrom)?.id || (stashes[0] ? `stash_${stashes[0].id}` : '')));

  const [fromId, setFromId] = useState(defaultFrom);
  const [toId, setToId] = useState(defaultTo);
  const [fromAmount, setFromAmount] = useState<number>(transfer?.fromAmount ?? 0);
  const [toAmount, setToAmount] = useState<number>(transfer?.toAmount ?? 0);
  const [date, setDate] = useState(transfer?.date ?? today());
  const [note, setNote] = useState(transfer?.note ?? '');

  const fromParty = allParties.find(p => p.id === fromId);
  const toParty = allParties.find(p => p.id === toId);

  // Helper to fetch live & projected balances for an account or stash
  const getPartyBals = (partyId: string) => {
    if (partyId.startsWith('stash_')) {
      const sId = partyId.replace('stash_', '');
      const stash = stashes.find(s => s.id === sId);
      if (!stash) return null;
      return calcProjectedStashBalance(stash, date, payments, transfers, plans);
    }
    const acc = accounts.find(a => a.id === partyId);
    if (!acc) return null;
    return calcProjectedAccountBalance(acc, date, payments, transfers, plans, stashes);
  };

  // Auto-suggest toAmount on fromAmount change if currencies differ and not manually altered
  const [userEditedTo, setUserEditedTo] = useState(!!transfer);

  useEffect(() => {
    if (!userEditedTo && fromParty && toParty && fromAmount > 0) {
      const converted = convert(fromAmount, fromParty.currency, toParty.currency);
      setToAmount(Math.round(converted * 100) / 100);
    }
  }, [fromAmount, fromParty?.currency, toParty?.currency, userEditedTo]);

  const submit = () => {
    if (!fromParty || !toParty || fromAmount <= 0 || toAmount <= 0 || fromId === toId) return;
    const t: Transfer = {
      id: transfer?.id ?? uid(),
      date,
      fromAccountId: fromId,
      toAccountId: toId,
      fromAmount: +fromAmount,
      fromCurrency: fromParty.currency,
      toAmount: +toAmount,
      toCurrency: toParty.currency,
      note: note.trim() || undefined,
      status: transfer?.status ?? 'confirmed',
      createdAt: transfer?.createdAt ?? Date.now(),
    };
    save('transfers', t);
    onClose();
  };

  const isFuture = date > today();
  const fromBals = fromParty ? getPartyBals(fromParty.id) : null;
  const toBals = toParty ? getPartyBals(toParty.id) : null;

  const effectiveFromBal = isFuture ? (fromBals?.projected ?? 0) : (fromBals?.current ?? 0);
  const isShort = !!fromParty && fromAmount > 0 && fromAmount > effectiveFromBal;

  return (
    <Modal title={transfer ? 'Edit transfer' : 'Move money'} onClose={onClose}>
      <Field label="When (Date)">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      </Field>

      <Field label="From (Source)">
        <select value={fromId} onChange={e => { setFromId(e.target.value); setUserEditedTo(false); }}>
          <optgroup label="💳 Accounts">
            {accounts.map(a => {
              const b = calcProjectedAccountBalance(a, date, payments, transfers, plans, stashes);
              return (
                <option key={a.id} value={a.id} disabled={a.id === toId}>
                  {a.name} ({a.currency}) · Current: {money(b.current, a.currency)}{isFuture ? ` → Projected on ${dayLabel(date)}: ${money(b.projected, a.currency)}` : ''}
                </option>
              );
            })}
          </optgroup>
          {stashes.length > 0 && (
            <optgroup label="🐷 Stashes">
              {stashes.map(s => {
                const key = `stash_${s.id}`;
                const b = calcProjectedStashBalance(s, date, payments, transfers, plans);
                return (
                  <option key={key} value={key} disabled={key === toId}>
                    {s.emoji} {s.name} ({s.currency}) · Current: {money(b.current, s.currency)}{isFuture ? ` → Projected on ${dayLabel(date)}: ${money(b.projected, s.currency)}` : ''}
                  </option>
                );
              })}
            </optgroup>
          )}
        </select>
      </Field>

      <Field label="To (Destination)">
        <select value={toId} onChange={e => { setToId(e.target.value); setUserEditedTo(false); }}>
          <optgroup label="💳 Accounts">
            {accounts.map(a => {
              const b = calcProjectedAccountBalance(a, date, payments, transfers, plans, stashes);
              return (
                <option key={a.id} value={a.id} disabled={a.id === fromId}>
                  {a.name} ({a.currency}) · Current: {money(b.current, a.currency)}{isFuture ? ` → Projected on ${dayLabel(date)}: ${money(b.projected, a.currency)}` : ''}
                </option>
              );
            })}
          </optgroup>
          {stashes.length > 0 && (
            <optgroup label="🐷 Stashes">
              {stashes.map(s => {
                const key = `stash_${s.id}`;
                const b = calcProjectedStashBalance(s, date, payments, transfers, plans);
                return (
                  <option key={key} value={key} disabled={key === fromId}>
                    {s.emoji} {s.name} ({s.currency}) · Current: {money(b.current, s.currency)}{isFuture ? ` → Projected on ${dayLabel(date)}: ${money(b.projected, s.currency)}` : ''}
                  </option>
                );
              })}
            </optgroup>
          )}
        </select>
      </Field>

      {/* Projection summary card */}
      {fromParty && toParty && fromBals && toBals && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 14px', margin: '4px 0 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--mute)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>{isFuture ? `🗓 Projected balances on ${dayLabel(date)}` : '💳 Live balances'}</span>
            {isFuture && <span style={{ color: 'var(--brand)', textTransform: 'none', fontWeight: 600 }}>Includes scheduled transactions</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>From: {fromParty.icon} {fromParty.name}</div>
              <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 2 }}>
                Current: <b>{money(fromBals.current, fromParty.currency)}</b>
              </div>
              {isFuture && (
                <div style={{ fontSize: 11, color: fromBals.projected < 0 ? '#DC2626' : '#2563EB', marginTop: 2, fontWeight: 600 }}>
                  Projected: <b>{money(fromBals.projected, fromParty.currency)}</b>
                </div>
              )}
              {fromAmount > 0 && (
                <div style={{ fontSize: 11, color: effectiveFromBal - fromAmount < 0 ? '#DC2626' : '#166534', marginTop: 4, paddingTop: 4, borderTop: '1px dashed #E2E8F0' }}>
                  After move: <b>{money(effectiveFromBal - fromAmount, fromParty.currency)}</b>
                </div>
              )}
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>To: {toParty.icon} {toParty.name}</div>
              <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 2 }}>
                Current: <b>{money(toBals.current, toParty.currency)}</b>
              </div>
              {isFuture && (
                <div style={{ fontSize: 11, color: '#2563EB', marginTop: 2, fontWeight: 600 }}>
                  Projected: <b>{money(toBals.projected, toParty.currency)}</b>
                </div>
              )}
              {toAmount > 0 && (
                <div style={{ fontSize: 11, color: '#166534', marginTop: 4, paddingTop: 4, borderTop: '1px dashed #E2E8F0' }}>
                  After move: <b>{money((isFuture ? toBals.projected : toBals.current) + toAmount, toParty.currency)}</b>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="row even">
        <Field label={`Amount taken out (${fromParty?.currency ?? ''})`}>
          <input
            type="number"
            inputMode="decimal"
            value={fromAmount || ''}
            placeholder="0"
            onChange={e => setFromAmount(+e.target.value)}
          />
        </Field>
        <Field label={`Amount put in (${toParty?.currency ?? ''})`} hint="Editable for exact rate/fees">
          <input
            type="number"
            inputMode="decimal"
            value={toAmount || ''}
            placeholder="0"
            onChange={e => { setToAmount(+e.target.value); setUserEditedTo(true); }}
          />
        </Field>
      </div>

      {isShort && (
        <div className="preview" style={{ background: '#FDE8E8', color: '#9B1C1C', borderColor: '#F8B4B4', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>⚠️</span>
          <span>
            <strong>Insufficient {isFuture ? 'projected ' : ''}funds in {fromParty?.name}:</strong> {isFuture ? `Projected balance on ${dayLabel(date)}` : 'Available balance'} is {money(effectiveFromBal, fromParty?.currency)}, which is {money(fromAmount - effectiveFromBal, fromParty?.currency)} short.
          </span>
        </div>
      )}

      {isFuture && fromParty && fromAmount > 0 && fromAmount > (fromBals?.current ?? 0) && fromAmount <= (fromBals?.projected ?? 0) && (
        <div className="preview" style={{ background: '#EFF6FF', color: '#1E40AF', borderColor: '#BFDBFE', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>ℹ️</span>
          <span>
            Current balance is {money(fromBals?.current ?? 0, fromParty.currency)}, but projected to reach {money(fromBals?.projected ?? 0, fromParty.currency)} by {dayLabel(date)} from scheduled incoming money.
          </span>
        </div>
      )}

      {fromParty && toParty && fromParty.currency !== toParty.currency && fromAmount > 0 && toAmount > 0 && (
        <div className="preview" style={{ fontSize: 13 }}>
          💱 Effective rate: 1 {fromParty.currency} = {(toAmount / fromAmount).toFixed(4)} {toParty.currency}
        </div>
      )}

      <Field label="Note (optional)">
        <input
          value={note}
          placeholder="e.g. Card top-up, withdrawal, savings deposit…"
          onChange={e => setNote(e.target.value)}
        />
      </Field>

      <button
        className="btn primary wide"
        disabled={!fromParty || !toParty || fromId === toId || fromAmount <= 0 || toAmount <= 0 || isShort}
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
