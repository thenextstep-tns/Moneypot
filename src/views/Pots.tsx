import { useMemo, useState } from 'react';
import { useData } from '../store';
import { dayLabel, money, monthLabel, monthRange, occurrences, shiftMonth, thisMonth } from '../schedule';
import { convert } from '../fx';
import { calcAllAccountBalances, calcMonthStartingBalances, findAccountShortfalls } from '../balances';
import type { Category, Occurrence } from '../types';
import { Bar, DragHandle, Empty, HelpButton } from '../ui';
import { CategoryModal } from './CategoryModal';
import { TransferModal } from './Money';
import { ScreenHelpModal } from './ScreenHelpModal';
import { AcceptInviteModal, SharingModal } from './SharingModal';

const sum = (xs: Occurrence[], targetCur: string) => xs.reduce((s, o) => s + convert(o.amount, o.currency, targetCur), 0);

/** MAIN FLOW #2 — monthly pots: planned vs done vs still needed */
export function Pots() {
  const { plans, payments, transfers, stashes, accounts, categories, settings, reorder } = useData();
  const [ym, setYm] = useState(thisMonth());
  const [open, setOpen] = useState<string | null>(null);
  const [editingCat, setEditingCat] = useState<Category | 'new' | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showAcceptInvite, setShowAcceptInvite] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sharingItem, setSharingItem] = useState<Category | null>(null);
  const [draggedCatId, setDraggedCatId] = useState<string | null>(null);
  const [dragOverCatId, setDragOverCatId] = useState<string | null>(null);
  const cur = settings.currency;

  const moveCat = (catId: string, direction: -1 | 1) => {
    const idx = categories.findIndex(c => c.id === catId);
    if (idx < 0) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= categories.length) return;
    const next = [...categories];
    const [item] = next.splice(idx, 1);
    next.splice(targetIdx, 0, item);
    void reorder('categories', next);
  };

  const handleDropCat = (targetCatId: string) => {
    if (!draggedCatId || draggedCatId === targetCatId) {
      setDraggedCatId(null);
      setDragOverCatId(null);
      return;
    }
    const fromIdx = categories.findIndex(c => c.id === draggedCatId);
    const toIdx = categories.findIndex(c => c.id === targetCatId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...categories];
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    void reorder('categories', next);
    setDraggedCatId(null);
    setDragOverCatId(null);
  };

  const occ = useMemo(() => occurrences(plans, payments, ...monthRange(ym)).filter(o => o.status !== 'cancelled'), [plans, payments, ym]);

  const curYm = thisMonth();
  const isCurrentMonth = ym === curYm;
  const isFutureMonth = ym > curYm;
  const isPastMonth = ym < curYm;

  const monthProjection = useMemo(
    () => calcMonthStartingBalances(accounts, payments, transfers, plans, stashes, ym, cur),
    [accounts, payments, transfers, plans, stashes, ym, cur]
  );
  const displayStartBalance = monthProjection.totalAvailable;
  const displayTotalLiquid = monthProjection.totalLiquid;
  const displayTotalStashed = monthProjection.totalStashed;
  const monthBalances = monthProjection.accountBalances;

  const shortfalls = useMemo(
    () => findAccountShortfalls(accounts, occ, monthBalances),
    [accounts, occ, monthBalances]
  );

  const income = occ.filter(o => o.kind === 'income');
  const outgoing = occ.filter(o => o.kind !== 'income' && o.kind !== 'transfer');

  const inPlan = sum(income, cur);
  const inDone = sum(income.filter(o => o.status === 'confirmed'), cur);
  const inPending = sum(income.filter(o => o.status === 'pending'), cur);

  const outPlan = sum(outgoing, cur);
  const outDone = sum(outgoing.filter(o => o.status === 'confirmed'), cur);
  const outPending = sum(outgoing.filter(o => o.status === 'pending'), cur);

  const flowNet = inPlan - outPlan;
  // Month-end outlook: starting available funds + pending/done net cash flow
  const projectedMonthEnd = isPastMonth
    ? displayStartBalance + inDone - outDone
    : displayStartBalance + inPending - outPending;
  const projectedTotalMonthEnd = isPastMonth
    ? displayTotalLiquid + inDone - outDone
    : displayTotalLiquid + inPending - outPending;
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {ym !== thisMonth() && <button className="btn ghost" onClick={() => setYm(thisMonth())}>Back to now</button>}
          <button
            type="button"
            className="btn"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setShowAcceptInvite(true)}
            title="Join a shared pot using an invite code"
          >
            <span>👥</span>
            <span>Join shared pot</span>
          </button>
          <button className="btn primary" onClick={() => setEditingCat('new')}>+ New pot</button>
        </div>
      </header>

      {isFutureMonth && (
        <div className="consecutive-badge">
          <span>📅 <b>Consecutive projection:</b> Starting balance factors in pending plans up through {monthLabel(shiftMonth(ym, -1))}</span>
        </div>
      )}

      <div className="summary">
        <div>
          <span>{isCurrentMonth ? 'Available in accounts' : isFutureMonth ? 'Projected available starting' : 'Starting available balance'}</span>
          <b>{money(displayStartBalance, cur)}</b>
          <small>
            {isCurrentMonth
              ? `Total: ${money(displayTotalLiquid, cur)}${displayTotalStashed > 0 ? ` · 🔒 ${money(displayTotalStashed, cur)} reserved` : ''}`
              : isFutureMonth
              ? `Adjusted for ${monthLabel(shiftMonth(ym, -1))} plans${displayTotalStashed > 0 ? ` · 🔒 ${money(displayTotalStashed, cur)} reserved` : ''}`
              : `Balance at start of ${monthLabel(ym)}`}
          </small>
        </div>
        <div>
          <span>Coming in</span>
          <b className="in">{money(inPlan, cur)}</b>
          <small>
            {isCurrentMonth
              ? `${money(inDone, cur)} received${inPending > 0 ? ` · ${money(inPending, cur)} pending` : ''}`
              : isFutureMonth
              ? `${inDone > 0 ? `${money(inDone, cur)} prepaid · ` : ''}${money(inPending, cur)} planned`
              : `${money(inDone, cur)} received${inPending > 0 ? ` · ${money(inPending, cur)} unpaid` : ''}`}
          </small>
        </div>
        <div>
          <span>Going out</span>
          <b>{money(outPlan, cur)}</b>
          <small>
            {isCurrentMonth
              ? `${money(outDone, cur)} done${outPending > 0 ? ` · ${money(outPending, cur)} left` : ''}`
              : isFutureMonth
              ? `${outDone > 0 ? `${money(outDone, cur)} prepaid · ` : ''}${money(outPending, cur)} planned`
              : `${money(outDone, cur)} paid${outPending > 0 ? ` · ${money(outPending, cur)} unpaid` : ''}`}
          </small>
        </div>
        <div className={isShortfall ? 'badbox' : 'good'}>
          <span>
            {isShortfall
              ? isFutureMonth ? 'Projected shortfall' : 'Short by'
              : 'Month-end outlook'}
          </span>
          <b>{money(isShortfall ? Math.abs(projectedMonthEnd) : projectedMonthEnd, cur)}</b>
          <small>
            {isShortfall
              ? isFutureMonth
                ? "Starting balance + planned income won't cover plans"
                : "Accounts + pending income won't cover plans"
              : isCoveredByBalance
              ? `Covers ${money(Math.abs(flowNet), cur)} deficit${displayTotalStashed > 0 ? ` · Total: ${money(projectedTotalMonthEnd, cur)}` : ''}`
              : `+${money(flowNet, cur)} net surplus this month${displayTotalStashed > 0 ? ` · Total: ${money(projectedTotalMonthEnd, cur)}` : ''}`}
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
                  {isFutureMonth ? 'Projected available entering month: ' : 'Available: '}<b>{money(s.currentBalance, s.accountCurrency)}</b> · Scheduled to pay this month: <b>{money(s.scheduledOutgoing, s.accountCurrency)}</b> (short by {money(s.shortBy, s.accountCurrency)})
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
        {activePots.map(({ c, items }, idx) => {
          const catIndex = categories.findIndex(cat => cat.id === c.id);
          return (
            <Pot
              key={c.id}
              c={c}
              items={items}
              cur={cur}
              open={open === c.id}
              toggle={() => setOpen(open === c.id ? null : c.id)}
              onEdit={() => setEditingCat(c)}
              onShare={() => setSharingItem(c)}
              canMoveUp={catIndex > 0}
              canMoveDown={catIndex < categories.length - 1}
              onMoveUp={() => moveCat(c.id, -1)}
              onMoveDown={() => moveCat(c.id, 1)}
              isDragging={draggedCatId === c.id}
              isDragOver={dragOverCatId === c.id}
              onDragStart={e => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', c.id);
                setDraggedCatId(c.id);
              }}
              onDragOver={e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverCatId !== c.id) setDragOverCatId(c.id);
              }}
              onDrop={e => {
                e.preventDefault();
                handleDropCat(c.id);
              }}
              onDragEnd={() => {
                setDraggedCatId(null);
                setDragOverCatId(null);
              }}
            />
          );
        })}
      </div>

      {unusedPots.length > 0 && (
        <section style={{ marginTop: 36 }}>
          <h2>Other pots <span className="muted">· no expenses this month</span></h2>
          <div className="grid">
            {unusedPots.map(c => {
              const catIndex = categories.findIndex(cat => cat.id === c.id);
              return (
                <div
                  key={c.id}
                  className={`card click ${draggedCatId === c.id ? 'dragging' : ''} ${dragOverCatId === c.id ? 'drag-over' : ''}`}
                  style={{ ['--c' as string]: c.color, borderLeft: `4px solid ${c.color}`, cursor: 'pointer' }}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', c.id);
                    setDraggedCatId(c.id);
                  }}
                  onDragOver={e => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverCatId !== c.id) setDragOverCatId(c.id);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    handleDropCat(c.id);
                  }}
                  onDragEnd={() => {
                    setDraggedCatId(null);
                    setDragOverCatId(null);
                  }}
                  onClick={() => setEditingCat(c)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <DragHandle
                        canMoveUp={catIndex > 0}
                        canMoveDown={catIndex < categories.length - 1}
                        onMoveUp={() => moveCat(c.id, -1)}
                        onMoveDown={() => moveCat(c.id, 1)}
                      />
                      <span className="big" style={{ fontSize: 28 }}>{c.emoji}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {c.sharedWith && c.sharedWith.length > 0 && <span className="tag shared-tag">👥 Shared</span>}
                      <span className="pill">{c.kind === 'saving' ? 'Saving' : 'Expense'}</span>
                    </div>
                  </div>
                  <div className="title" style={{ marginTop: 4 }}>{c.name}</div>
                  <div className="sub">
                    {c.subcategories?.length ? `${c.subcategories.length} subcategories` : 'No subcategories'}
                  </div>
                </div>
              );
            })}
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

      {showAcceptInvite && (
        <AcceptInviteModal onClose={() => setShowAcceptInvite(false)} />
      )}
    </div>

  );
}

function Pot({
  c,
  items,
  cur,
  open,
  toggle,
  onEdit,
  onShare,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  c: Category;
  items: Occurrence[];
  cur: string;
  open: boolean;
  toggle: () => void;
  onEdit: () => void;
  onShare: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
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
    <div
      className={`pot ${open ? 'open' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
      style={{ ['--c' as string]: c.color }}
      onClick={toggle}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className="pot-head">
        {onMoveUp && onMoveDown && (
          <DragHandle
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
          />
        )}
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
