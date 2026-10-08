import { useMemo, useState } from 'react';
import { useData } from '../store';
import { dayLabel, money } from '../schedule';
import type { Payment, Transfer } from '../types';
import { CurrencySelect, Empty, Field, Modal } from '../ui';
import { TransferModal } from './Money';

type FilterType = 'all' | 'expense' | 'income' | 'saving' | 'transfer' | 'cancelled';

interface LogItem {
  id: string;
  type: 'expense' | 'income' | 'saving' | 'transfer';
  date: string;
  title: string;
  potName?: string;
  potEmoji?: string;
  potColor?: string;
  subcategory?: string;
  accountName?: string;
  toAccountName?: string;
  amount: number;
  currency: string;
  toAmount?: number;
  toCurrency?: string;
  status: 'confirmed' | 'cancelled' | 'postponed';
  note?: string;
  payment?: Payment;
  transfer?: Transfer;
}

/** Complete transaction log book with search, filters, cancel (reverting money), and editing */
export function LogBook() {
  const { payments, transfers, accounts, categories, plans, save, remove } = useData();
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [editTransfer, setEditTransfer] = useState<Transfer | null>(null);

  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const accMap = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
  const planMap = useMemo(() => new Map(plans.map(p => [p.id, p])), [plans]);

  // Combine and sort all transactions
  const items: LogItem[] = useMemo(() => {
    const list: LogItem[] = [];

    for (const p of payments) {
      const plan = planMap.get(p.planId);
      const cat = catMap.get(p.categoryId ?? plan?.categoryId ?? '');
      const acc = accMap.get(p.accountId ?? plan?.accountId ?? '');
      const kind = p.kind ?? plan?.kind ?? 'expense';

      list.push({
        id: p.id,
        type: kind,
        date: p.date,
        title: p.name ?? plan?.name ?? 'Expense',
        potName: cat?.name,
        potEmoji: cat?.emoji,
        potColor: cat?.color,
        subcategory: p.subcategory ?? plan?.subcategory,
        accountName: acc?.name ?? 'No account',
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        note: p.note,
        payment: p,
      });
    }

    for (const t of transfers) {
      const fromAcc = accMap.get(t.fromAccountId);
      const toAcc = accMap.get(t.toAccountId);

      list.push({
        id: t.id,
        type: 'transfer',
        date: t.date,
        title: `Transfer: ${fromAcc?.name ?? 'Account'} → ${toAcc?.name ?? 'Account'}`,
        accountName: fromAcc?.name,
        toAccountName: toAcc?.name,
        amount: t.fromAmount,
        currency: t.fromCurrency,
        toAmount: t.toAmount,
        toCurrency: t.toCurrency,
        status: t.status,
        note: t.note,
        transfer: t,
      });
    }

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [payments, transfers, catMap, accMap, planMap]);

  // Apply filters
  const filtered = useMemo(() => {
    return items.filter(item => {
      // Status / Type filter
      if (filter === 'cancelled' && item.status !== 'cancelled') return false;
      if (filter !== 'cancelled' && filter !== 'all' && item.type !== filter) return false;
      if (filter !== 'cancelled' && item.status === 'cancelled') return false;

      // Account filter
      if (selectedAccount !== 'all') {
        const matchesFrom = item.payment?.accountId === selectedAccount;
        const matchesTransfer = item.transfer?.fromAccountId === selectedAccount || item.transfer?.toAccountId === selectedAccount;
        if (!matchesFrom && !matchesTransfer) return false;
      }

      // Search text
      if (search.trim()) {
        const q = search.toLowerCase();
        const text = `${item.title} ${item.note ?? ''} ${item.potName ?? ''} ${item.subcategory ?? ''} ${item.accountName ?? ''} ${item.toAccountName ?? ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }

      return true;
    });
  }, [items, filter, selectedAccount, search]);

  const toggleCancel = (item: LogItem) => {
    if (item.payment) {
      const nextStatus = item.payment.status === 'cancelled' ? 'confirmed' : 'cancelled';
      save('payments', { ...item.payment, status: nextStatus });
    } else if (item.transfer) {
      const nextStatus = item.transfer.status === 'cancelled' ? 'confirmed' : 'cancelled';
      save('transfers', { ...item.transfer, status: nextStatus });
    }
  };

  const deleteItem = (item: LogItem) => {
    if (!confirm(`Delete this ${item.type} record permanently?`)) return;
    if (item.payment) remove('payments', item.payment.id);
    if (item.transfer) remove('transfers', item.transfer.id);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Log Book 📜</h1>
          <p className="muted">All past operations. Cancel an operation anytime to restore the money back to the account.</p>
        </div>
      </header>

      {/* Filter and search bar */}
      <div className="log-controls">
        <input
          type="search"
          placeholder="Search operations, notes, pots…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />

        <div className="row even" style={{ marginTop: 8 }}>
          <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
            <option value="all">All accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </select>

          <div className="chips">
            {(['all', 'expense', 'income', 'transfer', 'saving', 'cancelled'] as FilterType[]).map(f => (
              <button
                key={f}
                type="button"
                className={filter === f ? 'chip on' : 'chip'}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'expense' ? '💸 Expenses' : f === 'income' ? '💰 Income' : f === 'transfer' ? '⇄ Transfers' : f === 'saving' ? '🌱 Savings' : '🚫 Cancelled'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 && (
        <Empty
          emoji="📖"
          title="No operations found"
          text={items.length === 0 ? "You haven't confirmed any operations yet." : "No operations match your current search/filters."}
        />
      )}

      <div className="log-list" style={{ marginTop: 16 }}>
        {filtered.map(item => {
          const isCancelled = item.status === 'cancelled';
          const isTransfer = item.type === 'transfer';
          const isIncome = item.type === 'income';

          return (
            <div
              key={item.id}
              className={`item log-item ${isCancelled ? 'cancelled-item' : ''}`}
              style={{ ['--c' as string]: item.potColor ?? (isTransfer ? '#3FB5A6' : '#9AA0A6') }}
            >
              <div className="emoji">
                {isCancelled ? '🚫' : isTransfer ? '⇄' : item.potEmoji ?? (isIncome ? '💰' : '💸')}
              </div>

              <div className="grow">
                <div className="title">
                  {item.title}
                  {item.subcategory && <span className="tag subcat-badge">{item.subcategory}</span>}
                  {isCancelled && <span className="tag danger-tag">Cancelled (Money restored)</span>}
                </div>
                <div className="sub">
                  {dayLabel(item.date)} · {isTransfer ? `${item.accountName} → ${item.toAccountName}` : `${item.potName ? `${item.potName} · ` : ''}${item.accountName}`}
                </div>
                {item.note && <div className="note">📝 {item.note}</div>}
              </div>

              <div className="log-amt-box">
                <div className={`amt ${isIncome ? 'in' : ''} ${isCancelled ? 'strikethrough' : ''}`}>
                  {isTransfer ? (
                    <span>-{money(item.amount, item.currency)} <br /><small className="in">+{money(item.toAmount ?? 0, item.toCurrency ?? '')}</small></span>
                  ) : (
                    <>{isIncome ? '+' : '-'}{money(item.amount, item.currency)}</>
                  )}
                </div>
              </div>

              <div className="actions" style={{ paddingLeft: 52 }}>
                <button
                  type="button"
                  className={`btn ${isCancelled ? 'ok' : 'ghost'}`}
                  title={isCancelled ? "Restore money to its transaction state" : "Cancel operation and return money back to account"}
                  onClick={() => toggleCancel(item)}
                >
                  {isCancelled ? '↩ Restore operation' : '🚫 Cancel & revert money'}
                </button>

                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (item.payment) setEditPayment(item.payment);
                    if (item.transfer) setEditTransfer(item.transfer);
                  }}
                >
                  ✎ Edit
                </button>

                <button
                  type="button"
                  className="btn ghost danger"
                  title="Permanently remove"
                  onClick={() => deleteItem(item)}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editPayment && (
        <EditPaymentModal
          payment={editPayment}
          onClose={() => setEditPayment(null)}
        />
      )}

      {editTransfer && (
        <TransferModal
          transfer={editTransfer}
          onClose={() => setEditTransfer(null)}
        />
      )}
    </div>
  );
}

/** Modal to edit a logged payment */
function EditPaymentModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const { accounts, categories, save, remove } = useData();
  const [name, setName] = useState(payment.name ?? '');
  const [amount, setAmount] = useState(payment.amount);
  const [currency, setCurrency] = useState(payment.currency);
  const [accountId, setAccountId] = useState(payment.accountId ?? '');
  const [categoryId, setCategoryId] = useState(payment.categoryId ?? '');
  const [subcategory, setSubcategory] = useState(payment.subcategory);
  const [date, setDate] = useState(payment.date);
  const [note, setNote] = useState(payment.note ?? '');

  const curCat = categories.find(c => c.id === categoryId);

  const submit = () => {
    save('payments', {
      ...payment,
      name: name.trim() || undefined,
      amount: +amount,
      currency,
      accountId: accountId || undefined,
      categoryId: categoryId || undefined,
      subcategory,
      date,
      note: note.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal title="Edit logged payment" onClose={onClose}>
      <Field label="Description">
        <input value={name} onChange={e => setName(e.target.value)} />
      </Field>

      <div className="row">
        <Field label="Amount">
          <input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(+e.target.value)} />
        </Field>
        <Field label="Currency">
          <CurrencySelect value={currency} onChange={setCurrency} />
        </Field>
      </div>

      <div className="row even">
        <Field label="Account">
          <select value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">—</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </select>
        </Field>
        <Field label="Pot">
          <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setSubcategory(undefined); }}>
            <option value="">—</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>
        </Field>
      </div>

      {curCat?.subcategories && curCat.subcategories.length > 0 && (
        <Field label="Subcategory (optional)">
          <div className="chips">
            <button
              type="button"
              className={!subcategory ? 'chip on' : 'chip'}
              onClick={() => setSubcategory(undefined)}
            >
              General
            </button>
            {curCat.subcategories.map(s => (
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

      <Field label="Date">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
      </Field>

      <Field label="Comment (optional)">
        <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} />
      </Field>

      <button className="btn primary wide" disabled={amount <= 0} onClick={submit}>
        Save changes
      </button>

      <button
        className="btn ghost wide danger"
        onClick={() => {
          if (confirm('Delete this payment record permanently?')) {
            remove('payments', payment.id);
            onClose();
          }
        }}
      >
        Delete record
      </button>
    </Modal>
  );
}
