import { useEffect, useMemo, useState } from 'react';
import { uid, useData } from '../store';
import { dayLabel, money, today } from '../schedule';
import { convert } from '../fx';
import { calcAllAccountBalances, calcAllProjectedAccountBalances, calcProjectedAccountBalance, calcProjectedStashBalance, checkAccountFunds, calcAccountStashedBalance } from '../balances';
import type { Payment, Plan, QuickTemplate, Transfer } from '../types';
import { ACC_ICONS, AccountCardsSelect, CurrencySelect, Field, Modal, Seg } from '../ui';
import { EmojiPicker } from '../emojis';

/**
 * Modal to record a ONE-OFF payment, income, or transfer.
 * First choice is the operation type: Expense, Income, Transfer.
 */
export function OneOffPaymentModal({
  template,
  initialType = 'expense',
  initialFromId,
  initialToId,
  onClose,
}: {
  template?: QuickTemplate;
  initialType?: 'expense' | 'income' | 'transfer';
  initialFromId?: string;
  initialToId?: string;
  onClose: () => void;
}) {
  const { categories, accounts, stashes, settings, payments, transfers, plans, save } = useData();
  const balances = useMemo(
    () => calcAllAccountBalances(accounts, payments, transfers, plans, stashes),
    [accounts, payments, transfers, plans, stashes]
  );

  const [opType, setOpType] = useState<'expense' | 'income' | 'transfer'>(
    initialType || (template?.kind === 'income' ? 'income' : 'expense')
  );

  const expenseCats = categories.filter(c => c.kind === 'expense');
  const incomeCats = categories.filter(c => c.kind === 'income');

  const [name, setName] = useState(template?.name ?? '');
  const [emoji, setEmoji] = useState(template?.emoji ?? (template?.kind === 'income' ? '💰' : expenseCats[0]?.emoji ?? '💸'));
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [amount, setAmount] = useState<number | string>(template?.amount ?? '');
  const [currency, setCurrency] = useState(template?.currency ?? settings.currency);
  const [date, setDate] = useState(today());
  const [categoryId, setCategoryId] = useState(
    template?.categoryId || (initialType === 'income' ? (incomeCats[0]?.id || '') : (expenseCats[0]?.id || ''))
  );
  const [subcategory, setSubcategory] = useState<string | undefined>(template?.subcategory);
  const [accountId, setAccountId] = useState(template?.accountId ?? initialFromId ?? accounts[0]?.id ?? '');
  const [note, setNote] = useState(template?.note ?? '');
  const [addingSub, setAddingSub] = useState(false);
  const [newSubVal, setNewSubVal] = useState('');

  // Transfer specific state
  const [fromId, setFromId] = useState(initialFromId || accounts[0]?.id || '');
  const [toId, setToId] = useState(
    initialToId ||
      accounts.find(a => a.id !== (initialFromId || accounts[0]?.id))?.id ||
      (stashes[0] ? `stash_${stashes[0].id}` : accounts[0]?.id) ||
      ''
  );
  const [transferAmount, setTransferAmount] = useState<number | string>('');
  const [transferToAmount, setTransferToAmount] = useState<number | string>('');
  const [transferUserEditedTo, setTransferUserEditedTo] = useState(false);
  const [transferNote, setTransferNote] = useState('');

  useEffect(() => {
    if (initialType) setOpType(initialType);
    if (initialFromId) {
      setFromId(initialFromId);
      setAccountId(initialFromId);
    }
    if (initialToId) setToId(initialToId);
  }, [initialType, initialFromId, initialToId]);

  useEffect(() => {
    if (opType === 'income') {
      if (!incomeCats.some(c => c.id === categoryId)) {
        const first = incomeCats[0]?.id || '';
        setCategoryId(first);
        setSubcategory(undefined);
        if (!template) setEmoji(incomeCats[0]?.emoji || '💰');
      }
    } else if (opType === 'expense') {
      if (!expenseCats.some(c => c.id === categoryId)) {
        const first = expenseCats[0]?.id || '';
        setCategoryId(first);
        setSubcategory(undefined);
        if (!template) setEmoji(expenseCats[0]?.emoji || '💸');
      }
    }
  }, [opType]);

  const selCat = categories.find(c => c.id === categoryId);
  const expenseValid = name.trim().length > 0 && Number(amount) > 0 && !!categoryId && !!accountId;
  const incomeValid = name.trim().length > 0 && Number(amount) > 0 && !!accountId;

  const handleQuickAddSub = () => {
    const v = newSubVal.trim();
    if (!v || !selCat) return;
    const currentSubs = selCat.subcategories ?? [];
    if (!currentSubs.includes(v)) {
      save('categories', { ...selCat, subcategories: [...currentSubs, v] });
    }
    setSubcategory(v);
    setNewSubVal('');
    setAddingSub(false);
  };

  const funds = accountId
    ? checkAccountFunds(accountId, Number(amount) || 0, currency, accounts, balances, stashes)
    : null;

  const isFuture = date > today();

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
    const acc = accounts.find(a => a.id === accountId);
    if (!acc) return null;
    return {
      name: acc.name,
      currency: acc.currency,
      isStash: false,
      acc,
    };
  }, [accountId, accounts, stashes]);

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

  // Transfer helpers
  const getParty = (id: string) => {
    if (id.startsWith('stash_')) {
      const s = stashes.find(x => x.id === id.replace('stash_', ''));
      return s ? { id, name: s.name, currency: s.currency, isStash: true, icon: s.emoji } : null;
    }
    const a = accounts.find(x => x.id === id);
    return a ? { id, name: a.name, currency: a.currency, isStash: false, icon: ACC_ICONS[a.type] || '💳' } : null;
  };

  const getPartyBals = (id: string) => {
    if (id.startsWith('stash_')) {
      const s = stashes.find(x => x.id === id.replace('stash_', ''));
      if (!s) return null;
      return calcProjectedStashBalance(s, date, payments, transfers, plans);
    }
    const a = accounts.find(x => x.id === id);
    if (!a) return null;
    return calcProjectedAccountBalance(a, date, payments, transfers, plans, stashes);
  };

  const fromParty = getParty(fromId);
  const toParty = getParty(toId);
  const fromBals = fromParty ? getPartyBals(fromParty.id) : null;
  const toBals = toParty ? getPartyBals(toParty.id) : null;

  const fromAcc = fromParty && !fromParty.isStash ? accounts.find(a => a.id === fromParty.id) : null;
  const fromStashedBal = fromAcc ? calcAccountStashedBalance(fromAcc, stashes, payments, transfers, plans, accounts) : 0;
  const fromFreeCurrent = Math.max(0, (fromBals?.current ?? 0) - fromStashedBal);
  const effectiveFromBal = isFuture ? (fromBals?.projected ?? 0) : fromFreeCurrent;

  const toAcc = toParty && !toParty.isStash ? accounts.find(a => a.id === toParty.id) : null;
  const toStashedBal = toAcc ? calcAccountStashedBalance(toAcc, stashes, payments, transfers, plans, accounts) : 0;
  const toFreeCurrent = Math.max(0, (toBals?.current ?? 0) - toStashedBal);

  const transferIsShort = !!fromParty && +transferAmount > 0 && +transferAmount > effectiveFromBal;

  const handleTransferFromChange = (newFromId: string) => {
    setFromId(newFromId);
    setTransferUserEditedTo(false);
    const newFromParty = getParty(newFromId);
    if (newFromParty && toParty && newFromParty.currency === toParty.currency) {
      setTransferToAmount(transferAmount);
    } else if (newFromParty && toParty && +transferAmount > 0) {
      const c = convert(+transferAmount, newFromParty.currency, toParty.currency);
      setTransferToAmount(c ? +c.toFixed(2) : '');
    }
  };

  const handleTransferToChange = (newToId: string) => {
    setToId(newToId);
    setTransferUserEditedTo(false);
    const newToParty = getParty(newToId);
    if (fromParty && newToParty && fromParty.currency === newToParty.currency) {
      setTransferToAmount(transferAmount);
    } else if (fromParty && newToParty && +transferAmount > 0) {
      const c = convert(+transferAmount, fromParty.currency, newToParty.currency);
      setTransferToAmount(c ? +c.toFixed(2) : '');
    }
  };

  const handleTransferAmountChange = (val: string) => {
    setTransferAmount(val);
    if (!fromParty || !toParty) return;
    if (fromParty.currency === toParty.currency) {
      setTransferToAmount(val);
    } else if (!transferUserEditedTo) {
      const c = convert(+val, fromParty.currency, toParty.currency);
      setTransferToAmount(c ? +c.toFixed(2) : '');
    }
  };

  const handleSaveExpense = (addQuickTemplate: boolean) => {
    if (!expenseValid) return;
    const numAmount = Number(amount);
    const targetStashId = accountId.startsWith('stash_') ? accountId.replace('stash_', '') : undefined;
    const targetStash = targetStashId ? stashes.find(s => s.id === targetStashId) : undefined;
    const isSharedStash = Boolean((targetStash?.sharedWith && targetStash.sharedWith.length > 0) || targetStash?.name?.toLowerCase().trim() === 'kinky fund');
    const isShared = isSharedStash || Boolean(selCat?.sharedWith && selCat.sharedWith.length > 0);

    if (isFuture) {
      const newPlan: Plan = {
        id: `oneoff_${uid()}`,
        name: name.trim(),
        kind: 'expense',
        categoryId,
        subcategory: subcategory || undefined,
        accountId: accountId || undefined,
        stashId: targetStashId,
        isShared,
        amount: numAmount,
        currency,
        freq: 'once',
        every: 1,
        startDate: date,
        note: note.trim() || undefined,
      };
      save('plans', newPlan);
    } else {
      const payId = `pay_${uid()}`;
      const planId = `oneoff_${uid()}`;

      const payment: Payment = {
        id: payId,
        planId,
        dueDate: date,
        date,
        amount: numAmount,
        currency,
        accountId: accountId || undefined,
        stashId: targetStashId,
        isShared,
        name: name.trim(),
        kind: 'expense',
        categoryId,
        subcategory: subcategory || undefined,
        note: note.trim() || undefined,
        status: 'confirmed',
      };
      save('payments', payment);
    }

    if (addQuickTemplate) {
      const newTemplate: QuickTemplate = {
        id: `tpl_${uid()}`,
        name: name.trim(),
        emoji: emoji || selCat?.emoji || '💸',
        amount: numAmount,
        currency,
        categoryId,
        subcategory: subcategory || undefined,
        accountId: accountId || undefined,
        note: note.trim() || undefined,
        kind: 'expense',
      };
      save('templates', newTemplate);
    }

    onClose();
  };

  const handleSaveIncome = (addQuickTemplate: boolean) => {
    if (!incomeValid) return;
    const numAmount = Number(amount);
    const targetStashId = accountId.startsWith('stash_') ? accountId.replace('stash_', '') : undefined;
    const targetStash = targetStashId ? stashes.find(s => s.id === targetStashId) : undefined;
    const isSharedStash = Boolean((targetStash?.sharedWith && targetStash.sharedWith.length > 0) || targetStash?.name?.toLowerCase().trim() === 'kinky fund');
    const isShared = isSharedStash || Boolean(selCat?.sharedWith && selCat.sharedWith.length > 0);

    if (isFuture) {
      const newPlan: Plan = {
        id: `oneoff_${uid()}`,
        name: name.trim(),
        kind: 'income',
        categoryId: categoryId || undefined,
        subcategory: subcategory || undefined,
        accountId: accountId || undefined,
        stashId: targetStashId,
        isShared,
        amount: numAmount,
        currency,
        freq: 'once',
        every: 1,
        startDate: date,
        note: note.trim() || undefined,
      };
      save('plans', newPlan);
    } else {
      const payId = `pay_${uid()}`;
      const planId = `oneoff_${uid()}`;

      const payment: Payment = {
        id: payId,
        planId,
        dueDate: date,
        date,
        amount: numAmount,
        currency,
        accountId: accountId || undefined,
        stashId: targetStashId,
        isShared,
        name: name.trim(),
        kind: 'income',
        categoryId: categoryId || undefined,
        subcategory: subcategory || undefined,
        note: note.trim() || undefined,
        status: 'confirmed',
      };
      save('payments', payment);
    }

    if (addQuickTemplate) {
      const newTemplate: QuickTemplate = {
        id: `tpl_${uid()}`,
        name: name.trim(),
        emoji: emoji || selCat?.emoji || '💰',
        amount: numAmount,
        currency,
        categoryId: categoryId || incomeCats[0]?.id || '',
        subcategory: subcategory || undefined,
        accountId: accountId || undefined,
        note: note.trim() || undefined,
        kind: 'income',
      };
      save('templates', newTemplate);
    }

    onClose();
  };

  const handleSaveTransfer = () => {
    const fAmt = Number(transferAmount);
    const tAmt = Number(transferToAmount) || fAmt;
    if (!fromParty || !toParty || fromId === toId || fAmt <= 0 || tAmt <= 0) return;

    if (isFuture) {
      const p: Plan = {
        id: `oneoff_${uid()}`,
        name: transferNote.trim() || `Transfer: ${fromParty.name} → ${toParty.name}`,
        kind: 'transfer',
        accountId: fromId,
        toAccountId: toId,
        amount: fAmt,
        currency: fromParty.currency,
        toAmount: tAmt,
        toCurrency: toParty.currency,
        freq: 'once',
        every: 1,
        startDate: date,
        note: transferNote.trim() || undefined,
      };
      save('plans', p);
    } else {
      const t: Transfer = {
        id: uid(),
        date,
        fromAccountId: fromId,
        toAccountId: toId,
        fromAmount: fAmt,
        fromCurrency: fromParty.currency,
        toAmount: tAmt,
        toCurrency: toParty.currency,
        note: transferNote.trim() || undefined,
        status: 'confirmed',
        createdAt: Date.now(),
      };
      save('transfers', t);
    }
    onClose();
  };

  const getModalTitle = () => {
    if (template) {
      return isFuture ? `Plan: ${template.name}` : `Log: ${template.name}`;
    }
    if (opType === 'transfer') {
      return isFuture ? 'Plan upcoming transfer' : 'Move money / Transfer';
    }
    if (opType === 'income') {
      return isFuture ? 'Plan upcoming income' : 'Record Income';
    }
    return isFuture ? 'Plan upcoming payment' : 'Record Expense';
  };

  return (
    <Modal title={getModalTitle()} onClose={onClose}>
      <div style={{ marginBottom: 16 }}>
        <Seg
          value={opType}
          onChange={setOpType}
          options={[
            ['expense', '💸 Expense'],
            ['income', '💰 Income'],
            ['transfer', '⇄ Transfer'],
          ]}
        />
      </div>

      {opType === 'expense' && (
        <>
          <Field label="What is it?">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="chip on"
                style={{ fontSize: 20, padding: '6px 12px', flexShrink: 0 }}
                title="Choose icon"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              >
                {emoji} {showEmojiPicker ? '▲' : '▼'}
              </button>
              <input
                autoFocus={!template}
                value={name}
                placeholder="e.g. Coffee, Groceries, Pharmacy…"
                onChange={e => setName(e.target.value)}
              />
            </div>
          </Field>

          {showEmojiPicker && (
            <Field label="Choose individual icon">
              <EmojiPicker
                value={emoji}
                onChange={e => {
                  setEmoji(e);
                  setShowEmojiPicker(false);
                }}
              />
            </Field>
          )}

          <div className="row">
            <Field label="How much?">
              <input
                type="number"
                inputMode="decimal"
                autoFocus={!!template}
                value={amount}
                placeholder="0.00"
                onChange={e => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Currency">
              <CurrencySelect value={currency} onChange={v => setCurrency(v)} />
            </Field>
          </div>

          <Field label="When">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>

          {isFuture && (
            <div
              className="preview"
              style={{
                background: '#EFF6FF',
                color: '#1E40AF',
                borderColor: '#BFDBFE',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                margin: '-6px 0 14px',
              }}
            >
              <span>📅</span>
              <span>
                <b>Future date:</b> This will be scheduled as a <b>planned one-off payment</b> for {dayLabel(date)}. It won't deduct from accounts until approved on that day.
              </span>
            </div>
          )}

          <Field label="Which pot?">
            <div className="chips">
              {expenseCats.map(c => (
                <button
                  type="button"
                  key={c.id}
                  className={c.id === categoryId ? 'chip on' : 'chip'}
                  onClick={() => {
                    setCategoryId(c.id);
                    setSubcategory(undefined);
                    if (!template) setEmoji(c.emoji);
                  }}
                >
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>
          </Field>

          {selCat && (
            <Field label="Subcategory (optional)">
              <div className="chips" style={{ alignItems: 'center' }}>
                <button
                  type="button"
                  className={!subcategory ? 'chip on' : 'chip'}
                  onClick={() => setSubcategory(undefined)}
                >
                  General
                </button>
                {(selCat.subcategories ?? []).map(s => (
                  <button
                    type="button"
                    key={s}
                    className={subcategory === s ? 'chip on' : 'chip'}
                    onClick={() => setSubcategory(s)}
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

          {/* If current pot is linked to a shared stash, show quick helper */}
          {(() => {
            const sharedStashForCat = stashes.find(s =>
              ((s.sharedWith && s.sharedWith.length > 0) || s.name?.toLowerCase().trim() === 'kinky fund') &&
              (s.categoryId === categoryId || s.name.toLowerCase() === selCat?.name.toLowerCase())
            );
            if (!sharedStashForCat) return null;
            const isUsingStash = accountId === `stash_${sharedStashForCat.id}`;
            return (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '8px 12px', margin: '-4px 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 12, color: '#166534', fontWeight: 500 }}>
                  👥 Linked shared stash: <b>{sharedStashForCat.emoji} {sharedStashForCat.name}</b>
                </span>
                <button
                  type="button"
                  className={`btn ${isUsingStash ? 'ok' : 'ghost'}`}
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={() => setAccountId(`stash_${sharedStashForCat.id}`)}
                >
                  {isUsingStash ? '✓ Paid from Shared Stash' : 'Pay from Shared Stash'}
                </button>
              </div>
            );
          })()}

          <Field label="Paid from">
            <AccountCardsSelect
              accounts={accounts}
              stashes={stashes}
              value={accountId}
              onChange={id => setAccountId(id)}
              balances={balances}
              targetDate={date}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: Number(amount) > 0 ? 4 : 0 }}>
                  <span style={{ color: 'var(--mute)' }}>Projected on {dayLabel(date)}:</span>
                  <b style={{ color: selBals.projected < 0 ? '#DC2626' : '#2563EB' }}>
                    {money(selBals.projected, selParty.currency)}
                  </b>
                </div>
                {Number(amount) > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: 4,
                      borderTop: '1px dashed #E2E8F0',
                    }}
                  >
                    <span style={{ color: 'var(--mute)' }}>After this payment:</span>
                    <b
                      style={{
                        color:
                          selBals.projected - Number(amount) < 0
                            ? '#DC2626'
                            : '#166534',
                      }}
                    >
                      {money(selBals.projected - Number(amount), selParty.currency)}
                    </b>
                  </div>
                )}
              </div>
            )}
          </Field>

          {!isFuture && funds?.isShort && (
            <div className="preview" style={{ background: '#FDE8E8', color: '#9B1C1C', borderColor: '#F8B4B4', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                ⚠️ <b>Low free balance:</b> {funds.accountName} only has <b>{money(funds.balance ?? 0, funds.accountCurrency)} free</b> to spend
                {funds.stashedBalance && funds.stashedBalance > 0 ? (
                  <span> (Total: {money(funds.totalBalance ?? 0, funds.accountCurrency)}, but 🔒 {money(funds.stashedBalance, funds.accountCurrency)} is reserved in stashes).</span>
                ) : '.'}
              </div>
              {funds.stashesInAccount && funds.stashesInAccount.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Did you want to pay from a stash instead?</span>
                  {funds.stashesInAccount.map(s => {
                    const sBal = balances.get(`stash_${s.id}`) ?? balances.get(s.id) ?? 0;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className="btn"
                        style={{ padding: '4px 8px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, background: '#FFFFFF', border: '1px solid #F8B4B4', color: '#9B1C1C', cursor: 'pointer' }}
                        onClick={() => setAccountId(`stash_${s.id}`)}
                      >
                        <span>{s.emoji} Pay from {s.name} ({money(sBal, s.currency)})</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {isFuture && selParty && Number(amount) > 0 && selBals && selBals.projected < Number(amount) && (
            <div className="preview" style={{ background: '#FDE8E8', color: '#9B1C1C', borderColor: '#F8B4B4', fontSize: 13 }}>
              ⚠️ <b>Low projected balance:</b> On {dayLabel(date)}, {selParty.name} is projected to have {money(selBals.projected, selParty.currency)}, which is {money(Number(amount) - selBals.projected, selParty.currency)} short.
            </div>
          )}

          {isFuture && selParty && Number(amount) > 0 && selBals && selBals.current < Number(amount) && selBals.projected >= Number(amount) && (
            <div className="preview" style={{ background: '#EFF6FF', color: '#1E40AF', borderColor: '#BFDBFE', fontSize: 13 }}>
              ℹ️ Current balance is {money(selBals.current, selParty.currency)}, but projected to reach {money(selBals.projected, selParty.currency)} by {dayLabel(date)} (sufficient funds expected).
            </div>
          )}

          <Field label="Notes (optional)">
            <input
              value={note}
              placeholder="e.g. Receipt #12, treats with friends…"
              onChange={e => setNote(e.target.value)}
            />
          </Field>

          <div className="save-actions-row">
            <button
              type="button"
              className="btn primary btn-save-primary"
              disabled={!expenseValid}
              onClick={() => handleSaveExpense(false)}
            >
              {isFuture ? `📅 Plan for ${dayLabel(date)}` : '✓ Save'}
            </button>
            <button
              type="button"
              className="btn btn-save-template"
              disabled={!expenseValid}
              onClick={() => handleSaveExpense(true)}
              title={isFuture ? 'Plan this payment and save it as a reusable quick template' : 'Save this payment and keep it as a 1-tap quick payment'}
            >
              {isFuture ? '★ Plan + Add Quick Payment' : '★ Save + Add Quick Payment'}
            </button>
          </div>
        </>
      )}

      {opType === 'income' && (
        <>
          <Field label="What is it / Source?">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="chip on"
                style={{ fontSize: 20, padding: '6px 12px', flexShrink: 0 }}
                title="Choose icon"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              >
                {emoji} {showEmojiPicker ? '▲' : '▼'}
              </button>
              <input
                autoFocus={!template}
                value={name}
                placeholder="e.g. Salary, Client payout, Bonus, Gift…"
                onChange={e => setName(e.target.value)}
              />
            </div>
          </Field>

          {showEmojiPicker && (
            <Field label="Choose individual icon">
              <EmojiPicker
                value={emoji}
                onChange={e => {
                  setEmoji(e);
                  setShowEmojiPicker(false);
                }}
              />
            </Field>
          )}

          <div className="row">
            <Field label="How much?">
              <input
                type="number"
                inputMode="decimal"
                autoFocus={!!template}
                value={amount}
                placeholder="0.00"
                onChange={e => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Currency">
              <CurrencySelect value={currency} onChange={v => setCurrency(v)} />
            </Field>
          </div>

          <Field label="When">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>

          {isFuture && (
            <div
              className="preview"
              style={{
                background: '#EFF6FF',
                color: '#1E40AF',
                borderColor: '#BFDBFE',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                margin: '-6px 0 14px',
              }}
            >
              <span>📅</span>
              <span>
                <b>Future date:</b> This will be scheduled as a <b>planned income</b> for {dayLabel(date)}. It won't credit accounts until approved on that day.
              </span>
            </div>
          )}

          {incomeCats.length > 0 && (
            <Field label="Which pot?">
              <div className="chips">
                {incomeCats.map(c => (
                  <button
                    type="button"
                    key={c.id}
                    className={c.id === categoryId ? 'chip on' : 'chip'}
                    onClick={() => {
                      setCategoryId(c.id);
                      setSubcategory(undefined);
                      if (!template) setEmoji(c.emoji);
                    }}
                  >
                    {c.emoji} {c.name}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {selCat && (
            <Field label="Subcategory (optional)">
              <div className="chips" style={{ alignItems: 'center' }}>
                <button
                  type="button"
                  className={!subcategory ? 'chip on' : 'chip'}
                  onClick={() => setSubcategory(undefined)}
                >
                  General
                </button>
                {(selCat.subcategories ?? []).map(s => (
                  <button
                    type="button"
                    key={s}
                    className={subcategory === s ? 'chip on' : 'chip'}
                    onClick={() => setSubcategory(s)}
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

          <Field label="Deposit into / Received to">
            <AccountCardsSelect
              accounts={accounts}
              stashes={stashes}
              value={accountId}
              onChange={id => setAccountId(id)}
              balances={balances}
              targetDate={date}
              projectedBalances={projectedBalances}
            />

            {selParty && selBals && (
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
                {isFuture && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ color: 'var(--mute)' }}>Projected on {dayLabel(date)}:</span>
                    <b style={{ color: '#2563EB' }}>
                      {money(selBals.projected, selParty.currency)}
                    </b>
                  </div>
                )}
                {Number(amount) > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: 4,
                      borderTop: '1px dashed #E2E8F0',
                    }}
                  >
                    <span style={{ color: 'var(--mute)' }}>After this income:</span>
                    <b style={{ color: '#166534' }}>
                      {money((isFuture ? selBals.projected : selBals.current) + Number(amount), selParty.currency)}
                    </b>
                  </div>
                )}
              </div>
            )}
          </Field>

          <Field label="Notes (optional)">
            <input
              value={note}
              placeholder="e.g. Invoice #102, gift from family…"
              onChange={e => setNote(e.target.value)}
            />
          </Field>

          <div className="save-actions-row">
            <button
              type="button"
              className="btn primary btn-save-primary"
              disabled={!incomeValid}
              onClick={() => handleSaveIncome(false)}
            >
              {isFuture ? `📅 Plan for ${dayLabel(date)}` : '✓ Save Income'}
            </button>
            <button
              type="button"
              className="btn btn-save-template"
              disabled={!incomeValid}
              onClick={() => handleSaveIncome(true)}
              title={isFuture ? 'Plan this income and save it as a reusable quick template' : 'Save this income and keep it as a 1-tap quick template'}
            >
              {isFuture ? '★ Plan + Add Quick Income' : '★ Save + Add Quick Income'}
            </button>
          </div>
        </>
      )}

      {opType === 'transfer' && (
        <>
          <Field label="When (Date)">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>

          {isFuture && (
            <div
              className="preview"
              style={{
                background: '#EFF6FF',
                color: '#1E40AF',
                borderColor: '#BFDBFE',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                margin: '-6px 0 14px',
              }}
            >
              <span>📅</span>
              <span>
                <b>Future date:</b> This will be scheduled as a <b>planned transfer</b> for {dayLabel(date)}.
              </span>
            </div>
          )}

          <Field label="From (Source)">
            <select value={fromId} onChange={e => handleTransferFromChange(e.target.value)}>
              <optgroup label="💳 Accounts">
                {accounts.map(a => {
                  const b = calcProjectedAccountBalance(a, date, payments, transfers, plans, stashes);
                  const stashed = calcAccountStashedBalance(a, stashes, payments, transfers, plans, accounts);
                  const free = Math.max(0, b.current - stashed);
                  return (
                    <option key={a.id} value={a.id} disabled={a.id === toId}>
                      {a.name} ({a.currency}) · {stashed > 0 ? `${money(free, a.currency)} free (Total: ${money(b.current, a.currency)})` : `Current: ${money(b.current, a.currency)}`}{isFuture ? ` → Projected on ${dayLabel(date)}: ${money(b.projected, a.currency)}` : ''}
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
            <select value={toId} onChange={e => handleTransferToChange(e.target.value)}>
              <optgroup label="💳 Accounts">
                {accounts.map(a => {
                  const b = calcProjectedAccountBalance(a, date, payments, transfers, plans, stashes);
                  const stashed = calcAccountStashedBalance(a, stashes, payments, transfers, plans, accounts);
                  const free = Math.max(0, b.current - stashed);
                  return (
                    <option key={a.id} value={a.id} disabled={a.id === fromId}>
                      {a.name} ({a.currency}) · {stashed > 0 ? `${money(free, a.currency)} free (Total: ${money(b.current, a.currency)})` : `Current: ${money(b.current, a.currency)}`}{isFuture ? ` → Projected on ${dayLabel(date)}: ${money(b.projected, a.currency)}` : ''}
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
                    {fromStashedBal > 0 ? (
                      <>
                        Free: <b>{money(fromFreeCurrent, fromParty.currency)}</b>
                        <span style={{ display: 'block', fontSize: 10, color: 'var(--mute)', marginTop: 1 }}>
                          Total: {money(fromBals.current, fromParty.currency)} (🔒 {money(fromStashedBal, fromParty.currency)})
                        </span>
                      </>
                    ) : (
                      <>Current: <b>{money(fromBals.current, fromParty.currency)}</b></>
                    )}
                  </div>
                  {isFuture && (
                    <div style={{ fontSize: 11, color: fromBals.projected < 0 ? '#DC2626' : '#2563EB', marginTop: 2, fontWeight: 600 }}>
                      Projected: <b>{money(fromBals.projected, fromParty.currency)}</b>
                    </div>
                  )}
                  {+transferAmount > 0 && (
                    <div style={{ fontSize: 11, color: effectiveFromBal - +transferAmount < 0 ? '#DC2626' : '#166534', marginTop: 4, paddingTop: 4, borderTop: '1px dashed #E2E8F0' }}>
                      After move: <b>{money(effectiveFromBal - +transferAmount, fromParty.currency)}</b> free
                    </div>
                  )}
                </div>

                <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>To: {toParty.icon} {toParty.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--mute)', marginTop: 2 }}>
                    {toStashedBal > 0 ? (
                      <>
                        Free: <b>{money(toFreeCurrent, toParty.currency)}</b>
                        <span style={{ display: 'block', fontSize: 10, color: 'var(--mute)', marginTop: 1 }}>
                          Total: {money(toBals.current, toParty.currency)} (🔒 {money(toStashedBal, toParty.currency)})
                        </span>
                      </>
                    ) : (
                      <>Current: <b>{money(toBals.current, toParty.currency)}</b></>
                    )}
                  </div>
                  {isFuture && (
                    <div style={{ fontSize: 11, color: '#2563EB', marginTop: 2, fontWeight: 600 }}>
                      Projected: <b>{money(toBals.projected, toParty.currency)}</b>
                    </div>
                  )}
                  {+transferToAmount > 0 && (
                    <div style={{ fontSize: 11, color: '#166534', marginTop: 4, paddingTop: 4, borderTop: '1px dashed #E2E8F0' }}>
                      After move: <b>{money((isFuture ? toBals.projected : toBals.current) + +transferToAmount, toParty.currency)}</b>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {fromParty && toParty && fromParty.currency !== toParty.currency ? (
            <div className="row even">
              <Field label={`Amount taken out (${fromParty.currency})`}>
                <input
                  type="number"
                  inputMode="decimal"
                  value={transferAmount}
                  placeholder="0.00"
                  onChange={e => handleTransferAmountChange(e.target.value)}
                />
              </Field>
              <Field label={`Amount put in (${toParty.currency})`} hint="Editable for exact rate/fees">
                <input
                  type="number"
                  inputMode="decimal"
                  value={transferToAmount}
                  placeholder="0.00"
                  onChange={e => {
                    setTransferToAmount(e.target.value);
                    setTransferUserEditedTo(true);
                  }}
                />
              </Field>
            </div>
          ) : (
            <Field label={`Amount (${fromParty?.currency ?? ''})`}>
              <input
                type="number"
                inputMode="decimal"
                value={transferAmount}
                placeholder="0.00"
                onChange={e => handleTransferAmountChange(e.target.value)}
              />
            </Field>
          )}

          {transferIsShort && (
            <div className="preview" style={{ background: '#FDE8E8', color: '#9B1C1C', borderColor: '#F8B4B4', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>⚠️</span>
                <span>
                  <strong>Insufficient {isFuture ? 'projected ' : ''}funds in {fromParty?.name}:</strong> {isFuture ? `Projected balance on ${dayLabel(date)}` : 'Available free balance'} is {money(effectiveFromBal, fromParty?.currency)}, which is {money(+transferAmount - effectiveFromBal, fromParty?.currency)} short.
                </span>
              </div>
              {fromParty && !fromParty.isStash && toParty?.isStash && (
                <div style={{ fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>💡 Did you want to take money <em>out</em> of <b>{toParty.name}</b> and put it into <b>{fromParty.name}</b>?</span>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '3px 8px', fontSize: 11, background: '#FFFFFF', border: '1px solid #F8B4B4', color: '#9B1C1C', cursor: 'pointer' }}
                    onClick={() => {
                      const curFrom = fromId;
                      const curTo = toId;
                      handleTransferFromChange(curTo);
                      handleTransferToChange(curFrom);
                    }}
                  >
                    ⇄ Swap direction
                  </button>
                </div>
              )}
            </div>
          )}

          {fromParty && toParty && fromParty.currency !== toParty.currency && +transferAmount > 0 && +transferToAmount > 0 && (
            <div className="preview" style={{ fontSize: 13 }}>
              💱 Effective rate: 1 {fromParty.currency} = {(+transferToAmount / +transferAmount).toFixed(4)} {toParty.currency}
            </div>
          )}

          <Field label="Notes (optional)">
            <input
              value={transferNote}
              placeholder="e.g. Card top-up, withdrawal, stash deposit…"
              onChange={e => setTransferNote(e.target.value)}
            />
          </Field>

          <div className="save-actions-row">
            <button
              type="button"
              className="btn primary wide"
              disabled={!fromParty || !toParty || fromId === toId || +transferAmount <= 0 || +transferToAmount <= 0 || transferIsShort}
              onClick={handleSaveTransfer}
            >
              {isFuture ? `🗓️ Plan transfer for ${dayLabel(date)}` : '✓ Move money'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/**
 * Modal to create or edit a reusable payment template.
 */
export function TemplateModal({
  template,
  onClose,
}: {
  template?: QuickTemplate;
  onClose: () => void;
}) {
  const { categories, accounts, stashes, settings, save, remove } = useData();
  const expenseCats = categories.filter(c => c.kind === 'expense');

  const [name, setName] = useState(template?.name ?? '');
  const [emoji, setEmoji] = useState(template?.emoji ?? '⚡');
  const [amount, setAmount] = useState<number | string>(template?.amount ?? '');
  const [currency, setCurrency] = useState(template?.currency ?? settings.currency);
  const [categoryId, setCategoryId] = useState(template?.categoryId || expenseCats[0]?.id || '');
  const [subcategory, setSubcategory] = useState<string | undefined>(template?.subcategory);
  const [accountId, setAccountId] = useState(template?.accountId ?? accounts[0]?.id ?? '');
  const [note, setNote] = useState(template?.note ?? '');
  const [addingSub, setAddingSub] = useState(false);
  const [newSubVal, setNewSubVal] = useState('');

  const selCat = categories.find(c => c.id === categoryId);
  const valid = name.trim().length > 0 && Number(amount) > 0 && !!accountId;

  const handleQuickAddSub = () => {
    const v = newSubVal.trim();
    if (!v || !selCat) return;
    const currentSubs = selCat.subcategories ?? [];
    if (!currentSubs.includes(v)) {
      save('categories', { ...selCat, subcategories: [...currentSubs, v] });
    }
    setSubcategory(v);
    setNewSubVal('');
    setAddingSub(false);
  };

  const submit = () => {
    if (!valid) return;
    const tpl: QuickTemplate = {
      id: template?.id ?? `tpl_${uid()}`,
      name: name.trim(),
      emoji: emoji || selCat?.emoji || '⚡',
      amount: Number(amount),
      currency,
      categoryId,
      subcategory: subcategory || undefined,
      accountId: accountId || undefined,
      note: note.trim() || undefined,
      kind: 'expense',
    };
    save('templates', tpl);
    onClose();
  };

  return (
    <Modal title={template ? `Edit template: ${template.name}` : 'New payment template'} onClose={onClose}>
      <Field label="Template name">
        <input
          autoFocus
          value={name}
          placeholder="e.g. Morning Coffee, Weekly Supermarket, Metro Ride…"
          onChange={e => setName(e.target.value)}
        />
      </Field>

      <Field label="Individual Icon">
        <EmojiPicker value={emoji} onChange={setEmoji} />
      </Field>

      <div className="row">
        <Field label="Default amount">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            placeholder="0.00"
            onChange={e => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Currency">
          <CurrencySelect value={currency} onChange={setCurrency} />
        </Field>
      </div>

      <Field label="Which pot?">
        <div className="chips">
          {expenseCats.map(c => (
            <button
              type="button"
              key={c.id}
              className={c.id === categoryId ? 'chip on' : 'chip'}
              onClick={() => {
                setCategoryId(c.id);
                setSubcategory(undefined);
              }}
            >
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
      </Field>

      {selCat && (
        <Field label="Subcategory (optional)">
          <div className="chips" style={{ alignItems: 'center' }}>
            <button
              type="button"
              className={!subcategory ? 'chip on' : 'chip'}
              onClick={() => setSubcategory(undefined)}
            >
              General
            </button>
            {(selCat.subcategories ?? []).map(s => (
              <button
                type="button"
                key={s}
                className={subcategory === s ? 'chip on' : 'chip'}
                onClick={() => setSubcategory(s)}
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

      <Field label="Paid from (default account)">
        <AccountCardsSelect
          accounts={accounts}
          stashes={stashes}
          value={accountId}
          onChange={id => setAccountId(id)}
        />
      </Field>

      <Field label="Notes (optional)">
        <input
          value={note}
          placeholder="e.g. Double espresso with oat milk…"
          onChange={e => setNote(e.target.value)}
        />
      </Field>

      <button className="btn primary wide" disabled={!valid} onClick={submit}>
        {template ? 'Save changes' : 'Create template'}
      </button>

      {template && (
        <button
          className="btn ghost wide danger"
          onClick={() => {
            remove('templates', template.id);
            onClose();
          }}
        >
          Delete template
        </button>
      )}
    </Modal>
  );
}
