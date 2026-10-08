import { useMemo, useState } from 'react';
import { useData } from '../store';
import { dayLabel, money, monthLabel, monthRange, occurrences, shiftMonth, thisMonth } from '../schedule';
import type { Category, Occurrence } from '../types';
import { Bar, Empty } from '../ui';
import { CategoryModal } from './CategoryModal';

const sum = (xs: Occurrence[]) => xs.reduce((s, o) => s + o.amount, 0);

/** MAIN FLOW #2 — monthly pots: planned vs done vs still needed */
export function Pots() {
  const { plans, payments, categories, settings } = useData();
  const [ym, setYm] = useState(thisMonth());
  const [open, setOpen] = useState<string | null>(null);
  const [editingCat, setEditingCat] = useState<Category | 'new' | null>(null);
  const cur = settings.currency;

  const occ = useMemo(() => occurrences(plans, payments, ...monthRange(ym)).filter(o => o.status !== 'cancelled'), [plans, payments, ym]);

  const income = occ.filter(o => o.kind === 'income');
  const outgoing = occ.filter(o => o.kind !== 'income');
  const inPlan = sum(income), outPlan = sum(outgoing);
  const free = inPlan - outPlan;

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
          <h1>{monthLabel(ym)}</h1>
          <button className="icon" onClick={() => setYm(shiftMonth(ym, 1))}>›</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {ym !== thisMonth() && <button className="btn ghost" onClick={() => setYm(thisMonth())}>Back to now</button>}
          <button className="btn primary" onClick={() => setEditingCat('new')}>+ New pot</button>
        </div>
      </header>

      <div className="summary">
        <div><span>Coming in</span><b className="in">{money(inPlan, cur)}</b><small>{money(sum(income.filter(o => o.status === 'confirmed')), cur)} received</small></div>
        <div><span>Going out</span><b>{money(outPlan, cur)}</b><small>{money(sum(outgoing.filter(o => o.status === 'confirmed')), cur)} done</small></div>
        <div className={free >= 0 ? 'good' : 'badbox'}>
          <span>{free >= 0 ? 'Free to use' : 'Short by'}</span><b>{money(Math.abs(free), cur)}</b>
          <small>{free >= 0 ? 'not planned for anything yet' : 'plans are bigger than income'}</small>
        </div>
      </div>

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
                  <span className="pill">{c.kind === 'saving' ? 'Saving' : 'Expense'}</span>
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
    </div>
  );
}

function Pot({ c, items, cur, open, toggle, onEdit }: { c: Category; items: Occurrence[]; cur: string; open: boolean; toggle: () => void; onEdit: () => void }) {
  const planned = sum(items);
  const doneItems = items.filter(o => o.status === 'confirmed');
  const left = items.filter(o => o.status === 'pending');
  const done = sum(doneItems), need = sum(left);
  const full = left.length === 0;

  // Breakdown by subcategory
  const subcatTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const key = item.subcategory || 'General';
      map.set(key, (map.get(key) ?? 0) + item.amount);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  return (
    <div className={`pot ${open ? 'open' : ''}`} style={{ ['--c' as string]: c.color }} onClick={toggle}>
      <div className="pot-head">
        <div className="emoji">{c.emoji}</div>
        <div className="grow">
          <div className="title">{c.name}</div>
          <div className="sub">{money(planned, cur)} this month</div>
        </div>
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
