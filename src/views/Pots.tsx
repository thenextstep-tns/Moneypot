import { useMemo, useState } from 'react';
import { useData } from '../store';
import { dayLabel, money, monthLabel, monthRange, occurrences, shiftMonth, thisMonth } from '../schedule';
import { convert } from '../fx';
import { calcAllAccountBalances, calcTotalLiquidBalance, findAccountShortfalls } from '../balances';
import type { Category, Occurrence } from '../types';
import { Bar, Empty, HelpButton } from '../ui';
import { CategoryModal } from './CategoryModal';
import { TransferModal } from './Money';
import { ScreenHelpModal } from './ScreenHelpModal';
import { SharingModal } from './SharingModal';

const sum = (xs: Occurrence[], targetCur: string) => xs.reduce((s, o) => s + convert(o.amount, o.currency, targetCur), 0);

/** MAIN FLOW #2 — monthly pots: planned vs done vs still needed */
export function Pots() {
  const { plans, payments, transfers, stashes, accounts, categories, settings } = useData();
  const [ym, setYm] = useState(thisMonth());
  const [open, setOpen] = useState<string | null>(null);
  const [editingCat, setEditingCat] = useState<Category | 'new' | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sharingItem, setSharingItem] = useState<Category | null>(null);
  const cur = settings.currency;

  const occ = useMemo(() => occurrences(plans, payments, ...monthRange(ym)).filter(o => o.status !== 'cancelled'), [plans, payments, ym]);

  const balances = useMemo(
    () => calcAllAccountBalances(accounts, payments, transfers, plans, stashes),
    [accounts, payments, transfers, plans, stashes]
  );
  const totalLiquid = useMemo(
    () => calcTotalLiquidBalance(accounts, payments, transfers, plans, stashes, cur),
    [accounts, payments, transfers, plans, stashes, cur]
  );

  const shortfalls = useMemo(
    () => findAccountShortfalls(accounts, occ, balances),
    [accounts, occ, balances]
  );

  const income = occ.filter(o => o.kind === 'income');
  const outgoing = occ.filter(o => o.kind !== 'income');

  const inPlan = sum(income, cur);
  const inDone = sum(income.filter(o => o.status === 'confirmed'), cur);
  const inPending = sum(income.filter(o => o.status === 'pending'), cur);

  const outPlan = sum(outgoing, cur);
  const outDone = sum(outgoing.filter(o => o.status === 'confirmed'), cur);
  const outPending = sum(outgoing.filter(o => o.status === 'pending'), cur);

  const flowNet = inPlan - outPlan;
  // Month-end outlook: current funds in accounts + pending income - pending expenses
  const projectedMonthEnd = totalLiquid + inPending - outPending;
  const isShortfall = projectedMonthEnd < 0;
  const isCoveredByBalance = !isShortfall && flowNet < 0;

  const activePots = categories
    .filter(c => c.kind !== 'income')
    .map(c => ({ c, items: outgoing.filter(o => o.categoryId === c.id) }))
    .filter(p => p.items.length);

  const unusedPots = categories
    .filter(c => c.kind !== 'income' && !outgoing.some(o => o.categoryId === c.id));

  return (
    <div className="page">
      <header className="page-head">
        <div className="month">
          <button className="icon" onClick={() => setYm(shiftMonth(ym, -1))}>‹</button>
          <h1>
            {monthLabel(ym)}
            <HelpButton onClick={() => setHelpOpen(true)} title="How pots work" />
          </h1>
          <button className="icon" onClick={() => setYm(shiftMonth(ym, 1))}>›</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {ym !== thisMonth() && <button className="btn ghost" onClick={() => setYm(thisMonth())}>Back to now</button>}
          <button className="btn primary" onClick={() => setEditingCat('new')}>+ New pot</button>
        </div>
      </header>


      <div className="summary">
        <div>
          <span>In accounts now</span>
          <b>{money(totalLiquid, cur)}</b>
          <small>{accounts.length} account{accounts.length === 1 ? '' : 's'} connected</small>
        </div>
        <div>
          <span>Coming in</span>
          <b className="in">{money(inPlan, cur)}</b>
          <small>{money(inDone, cur)} received{inPending > 0 ? ` · ${money(inPending, cur)} pending` : ''}</small>
        </div>
        <div>
          <span>Going out</span>
          <b>{money(outPlan, cur)}</b>
          <small>{money(outDone, cur)} done{outPending > 0 ? ` · ${money(outPending, cur)} left` : ''}</small>
        </div>
        <div className={isShortfall ? 'badbox' : 'good'}>
          <span>
            {isShortfall
              ? 'Short by'
              : isCoveredByBalance
              ? 'Covered by balance'
              : 'Left over at end'}
          </span>
          <b>{money(isShortfall ? Math.abs(projectedMonthEnd) : projectedMonthEnd, cur)}</b>
          <small>
            {isShortfall
              ? "Accounts + pending income won't cover plans"
              : isCoveredByBalance
              ? `Plans exceed income by ${money(Math.abs(flowNet), cur)}, fully covered`
              : `+${money(flowNet, cur)} net surplus this month`}
          </small>
        </div>
      </div>

      {shortfalls.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shortfalls.map(s => (
            <div
              key={s.accountId}
              className="item"
              style={{ background: '#FFFBEB', borderLeft: '4px solid #F59E0B', margin: 0, padding: '12px 16px' }}
            >
              <div className="emoji" style={{ background: '#FEF3C7', fontSize: 18 }}>⚠️</div>
              <div className="grow">
                <div className="title" style={{ color: '#92400E', fontSize: 14 }}>
                  Low balance alert: {s.accountName}
                </div>
                <div className="sub" style={{ color: '#B45309', fontSize: 13 }}>
                  Available: <b>{money(s.currentBalance, s.accountCurrency)}</b> · Scheduled to pay this month: <b>{money(s.scheduledOutgoing, s.accountCurrency)}</b> (short by {money(s.shortBy, s.accountCurrency)})
                </div>
              </div>
              <button
                type="button"
                className="btn"
                style={{ borderColor: '#F59E0B', color: '#92400E', fontWeight: 600, background: '#FEF3C7' }}
                onClick={() => setShowTransfer(true)}
              >
                ⇄ Move money
              </button>
            </div>
          ))}
        </div>
      )}


      {activePots.length === 0 && (
        <Empty
          emoji="🫙"
          title="No spending in pots this month"
          text="Plan your regular expenses in “Plan” or record spending in “Today” to fill your pots."
        />
      )}

      <div className="pots">
        {activePots.map(({ c, items }) => (
          <Pot
            key={c.id}
            c={c}
            items={items}
            cur={cur}
            open={open === c.id}
            toggle={() => setOpen(open === c.id ? null : c.id)}
            onEdit={() => setEditingCat(c)}
            onShare={() => setSharingItem(c)}
          />
        ))}
      </div>

      {unusedPots.length > 0 && (
        <section style={{ marginTop: 36 }}>
          <h2>Other pots <span className="muted">· no expenses this month</span></h2>
          <div className="grid">
            {unusedPots.map(c => (
              <button
                key={c.id}
                type="button"
                className="card click"
                style={{ ['--c' as string]: c.color, borderLeft: `4px solid ${c.color}` }}
                onClick={() => setEditingCat(c)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="big" style={{ fontSize: 28 }}>{c.emoji}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {c.sharedWith && c.sharedWith.length > 0 && <span className="tag shared-tag">👥 Shared</span>}
                    <span className="pill">{c.kind === 'saving' ? 'Saving' : 'Expense'}</span>
                  </div>
                </div>
                <div className="title" style={{ marginTop: 4 }}>{c.name}</div>
                <div className="sub">
                  {c.subcategories?.length ? `${c.subcategories.length} subcategories` : 'No subcategories'}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {editingCat && (
        <CategoryModal
          category={editingCat === 'new' ? undefined : editingCat}
          onClose={() => setEditingCat(null)}
        />
      )}

      {showTransfer && (
        <TransferModal onClose={() => setShowTransfer(false)} />
      )}

      {helpOpen && (
        <ScreenHelpModal screenKey="pots" onClose={() => setHelpOpen(false)} />
      )}

      {sharingItem && (
        <SharingModal type="pot" item={sharingItem} onClose={() => setSharingItem(null)} />
      )}
    </div>

  );
}

function Pot({ c, items, cur, open, toggle, onEdit, onShare }: { c: Category; items: Occurrence[]; cur: string; open: boolean; toggle: () => void; onEdit: () => void; onShare: () => void }) {
  const planned = sum(items, cur);
  const doneItems = items.filter(o => o.status === 'confirmed');
  const left = items.filter(o => o.status === 'pending');
  const done = sum(doneItems, cur), need = sum(left, cur);
  const full = left.length === 0;

  // Breakdown by subcategory
  const subcatTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const key = item.subcategory || 'General';
      map.set(key, (map.get(key) ?? 0) + convert(item.amount, item.currency, cur));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [items, cur]);

  return (
    <div className={`pot ${open ? 'open' : ''}`} style={{ ['--c' as string]: c.color }} onClick={toggle}>
      <div className="pot-head">
        <div className="emoji">{c.emoji}</div>
        <div className="grow">
          <div className="title">
            {c.name}
            {c.sharedWith && c.sharedWith.length > 0 && (
              <span className="tag shared-tag">👥 Shared ({c.sharedWith.length})</span>
            )}
          </div>
          <div className="sub">{money(planned, cur)} this month</div>
        </div>
        <button
          type="button"
          className="btn ghost icon-btn"
          title="Share pot with collaborators"
          onClick={e => { e.stopPropagation(); onShare(); }}
        >
          👥
        </button>
        <button
          type="button"
          className="btn ghost icon-btn"
          title="Edit pot & subcategories"
          onClick={e => { e.stopPropagation(); onEdit(); }}
        >
          ✎
        </button>
        {full ? <span className="pill ok">Done ✓</span> : <span className="pill">{money(need, cur)} to go</span>}

      </div>

      <Bar done={done} total={planned} color={c.color} />

      <div className="pot-foot">
        <span><b>{money(done, cur)}</b> paid</span>
        <span>{full ? 'Nothing left this month' : <><b>{money(need, cur)}</b> still needed · {left.length} payment{left.length > 1 ? 's' : ''}</>}</span>
      </div>

      {open && (
        <div className="pot-details" onClick={e => e.stopPropagation()}>
          {subcatTotals.length > 1 && (
            <div className="subcat-summary">
              <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>BY SUBCATEGORY:</span>
              <div className="chips" style={{ marginTop: 4 }}>
                {subcatTotals.map(([sub, amount]) => (
                  <span key={sub} className="chip subcat-pill">
                    {sub}: <b>{money(amount, cur)}</b>
                  </span>
                ))}
              </div>
            </div>
          )}

          <ul className="pot-list">
            {items.map(o => (
              <li key={o.key} className={o.status}>
                <span>{o.status === 'confirmed' ? '✅' : '⏳'}</span>
                <span className="grow">
                  <b>{o.name}</b>
                  {o.subcategory && <span className="tag subcat-badge">{o.subcategory}</span>}
                  {(o.note || o.planNote) && <small className="muted"> · 📝 {o.note || o.planNote}</small>}
                </span>
                <span className="muted">{dayLabel(o.date)}</span>
                <b>{money(o.amount, o.currency)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
