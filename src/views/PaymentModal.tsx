import { useMemo, useState } from 'react';
import { uid, useData } from '../store';
import { today } from '../schedule';
import { calcAllAccountBalances, checkAccountFunds } from '../balances';
import type { Payment, QuickTemplate } from '../types';
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
    ? checkAccountFunds(accountId, Number(amount) || 0, currency, accounts, balances)
    : null;

  const handleSave = (addQuickTemplate: boolean) => {
    if (!valid) return;
    const numAmount = Number(amount);
    const payId = `pay_${uid()}`;
    const planId = `oneoff_${uid()}`;

    // 1. Record the confirmed one-off payment
    const payment: Payment = {
      id: payId,
      planId,
      dueDate: date,
      date,
      amount: numAmount,
      currency,
      accountId: accountId || undefined,
      name: name.trim(),
      kind: 'expense',
      categoryId,
      subcategory: subcategory || undefined,
      note: note.trim() || undefined,
      status: 'confirmed',
    };
    save('payments', payment);

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
    <Modal title={template ? `Log quick payment: ${template.name}` : 'What did you spend on?'} onClose={onClose}>
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

      <Field label="Paid from">
        <AccountCardsSelect
          accounts={accounts}
          value={accountId}
          onChange={id => setAccountId(id)}
          balances={balances}
        />
      </Field>

      {funds?.isShort && (
        <div className="preview" style={{ background: '#FDE8E8', color: '#9B1C1C', borderColor: '#F8B4B4', fontSize: 13 }}>
          ⚠️ <b>Low balance:</b> {funds.accountName} only has {funds.balance} {funds.accountCurrency}.
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
          ✓ Save
        </button>
        <button
          type="button"
          className="btn btn-save-template"
          disabled={!valid}
          onClick={() => handleSave(true)}
          title="Save this payment and keep it as a 1-tap quick payment"
        >
          ★ Save + Add Quick Payment
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
  const { categories, accounts, settings, save, remove } = useData();
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
