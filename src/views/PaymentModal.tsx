import { useMemo, useState } from 'react';
import { uid, useData } from '../store';
import { dayLabel, money, today } from '../schedule';
import { calcAllAccountBalances, calcAllProjectedAccountBalances, calcProjectedAccountBalance, calcProjectedStashBalance, checkAccountFunds } from '../balances';
import type { Payment, Plan, QuickTemplate } from '../types';
import { AccountCardsSelect, CurrencySelect, Field, Modal } from '../ui';
import { EmojiPicker } from '../emojis';

/**
 * Modal to record a ONE-OFF payment (confirmed immediately).
 * Next to "Save", includes "★ Save + Add Quick Payment" which registers a 1-tap template.
 */
export function OneOffPaymentModal({
  template,
  onClose,
}: {
  template?: QuickTemplate;
  onClose: () => void;
}) {
  const { categories, accounts, stashes, settings, payments, transfers, plans, save } = useData();
  const balances = useMemo(
    () => calcAllAccountBalances(accounts, payments, transfers, plans, stashes),
    [accounts, payments, transfers, plans, stashes]
  );

  const expenseCats = categories.filter(c => c.kind === 'expense');
  const initialCatId = template?.categoryId || expenseCats[0]?.id || '';
  const initialCat = categories.find(c => c.id === initialCatId);

  const [name, setName] = useState(template?.name ?? '');
  const [emoji, setEmoji] = useState(template?.emoji ?? initialCat?.emoji ?? '💸');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [amount, setAmount] = useState<number | string>(template?.amount ?? '');
  const [currency, setCurrency] = useState(template?.currency ?? settings.currency);
  const [date, setDate] = useState(today());
  const [categoryId, setCategoryId] = useState(initialCatId);
  const [subcategory, setSubcategory] = useState<string | undefined>(template?.subcategory);
  const [accountId, setAccountId] = useState(template?.accountId ?? accounts[0]?.id ?? '');
  const [note, setNote] = useState(template?.note ?? '');
  const [addingSub, setAddingSub] = useState(false);
  const [newSubVal, setNewSubVal] = useState('');

  const selCat = categories.find(c => c.id === categoryId);
  const valid = name.trim().length > 0 && Number(amount) > 0 && !!categoryId && !!accountId;

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

  const handleSave = (addQuickTemplate: boolean) => {
    if (!valid) return;
    const numAmount = Number(amount);
    const targetStashId = accountId.startsWith('stash_') ? accountId.replace('stash_', '') : undefined;
    const targetStash = targetStashId ? stashes.find(s => s.id === targetStashId) : undefined;
    const isSharedStash = Boolean((targetStash?.sharedWith && targetStash.sharedWith.length > 0) || targetStash?.name?.toLowerCase().trim() === 'kinky fund');
    const isShared = isSharedStash || Boolean(selCat?.sharedWith && selCat.sharedWith.length > 0);

    if (isFuture) {
      // 1. Record as a planned one-off payment so it does NOT affect balances immediately,
      // but is properly tracked in the budget plan and surfaces on the Today view when due
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
      // 1. Record the confirmed one-off payment for today or past
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

    // 2. Optionally create a 1-tap quick template
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

  return (
    <Modal
      title={
        template
          ? isFuture
            ? `Plan quick payment: ${template.name}`
            : `Log quick payment: ${template.name}`
          : isFuture
          ? 'Plan upcoming payment'
          : 'What did you spend on?'
      }
      onClose={onClose}
    >
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
        <div className="preview" style={{ background: '#FDE8E8', color: '#9B1C1C', borderColor: '#F8B4B4', fontSize: 13 }}>
          ⚠️ <b>Low balance:</b> {funds.accountName} only has {funds.balance} {funds.accountCurrency}.
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
          disabled={!valid}
          onClick={() => handleSave(false)}
        >
          {isFuture ? `📅 Plan for ${dayLabel(date)}` : '✓ Save'}
        </button>
        <button
          type="button"
          className="btn btn-save-template"
          disabled={!valid}
          onClick={() => handleSave(true)}
          title={isFuture ? 'Plan this payment and save it as a reusable quick template' : 'Save this payment and keep it as a 1-tap quick payment'}
        >
          {isFuture ? '★ Plan + Add Quick Payment' : '★ Save + Add Quick Payment'}
        </button>
      </div>
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
