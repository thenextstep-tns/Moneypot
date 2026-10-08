import { useMemo, useState } from 'react';
import { useData } from '../store';
import { dayLabel, money, monthLabel, monthRange, occurrences, shiftMonth, thisMonth } from '../schedule';
import type { Category, Occurrence } from '../types';
import { Bar, Empty } from '../ui';

const sum = (xs: Occurrence[]) => xs.reduce((s, o) => s + o.amount, 0);

/** MAIN FLOW #2 — monthly pots: planned vs done vs still needed */
export function Pots() {
  const { plans, payments, categories, settings } = useData();
  const [ym, setYm] = useState(thisMonth());
  const [open, setOpen] = useState<string | null>(null);
  const cur = settings.currency;
  // NOTE: skeleton sums amounts across currencies without conversion — add FX rates later.
  const occ = useMemo(() => occurrences(plans, payments, ...monthRange(ym)).filter(o => o.status !== 'cancelled'), [plans, payments, ym]);

  const income = occ.filter(o => o.kind === 'income');
  const outgoing = occ.filter(o => o.kind !== 'income');
  const inPlan = sum(income), outPlan = sum(outgoing);
  const free = inPlan - outPlan;

  const pots = categories
    .filter(c => c.kind !== 'income')
    .map(c => ({ c, items: outgoing.filter(o => o.categoryId === c.id) }))
    .filter(p => p.items.length);

  return (
    <div className="page">
      <header className="page-head">
        <div className="month">
          <button className="icon" onClick={() => setYm(shiftMonth(ym, -1))}>‹</button>
          <h1>{monthLabel(ym)}</h1>
          <button className="icon" onClick={() => setYm(shiftMonth(ym, 1))}>›</button>
        </div>
        {ym !== thisMonth() && <button className="btn ghost" onClick={() => setYm(thisMonth())}>Back to now</button>}
      </header>

      <div className="summary">
        <div><span>Coming in</span><b className="in">{money(inPlan, cur)}</b><small>{money(sum(income.filter(o => o.status === 'confirmed')), cur)} received</small></div>
        <div><span>Going out</span><b>{money(outPlan, cur)}</b><small>{money(sum(outgoing.filter(o => o.status === 'confirmed')), cur)} done</small></div>
        <div className={free >= 0 ? 'good' : 'badbox'}>
          <span>{free >= 0 ? 'Free to use' : 'Short by'}</span><b>{money(Math.abs(free), cur)}</b>
          <small>{free >= 0 ? 'not planned for anything yet' : 'plans are bigger than income'}</small>
        </div>
      </div>

      {pots.length === 0 && <Empty emoji="🫙" title="No pots this month" text="Add your regular expenses in “Plan” and they'll show up here." />}
      <div className="pots">
        {pots.map(({ c, items }) => <Pot key={c.id} c={c} items={items} cur={cur} open={open === c.id} toggle={() => setOpen(open === c.id ? null : c.id)} />)}
      </div>
    </div>
  );
}

function Pot({ c, items, cur, open, toggle }: { c: Category; items: Occurrence[]; cur: string; open: boolean; toggle: () => void }) {
  const planned = sum(items);
  const doneItems = items.filter(o => o.status === 'confirmed');
  const left = items.filter(o => o.status === 'pending');
  const done = sum(doneItems), need = sum(left);
  const full = left.length === 0;
  return (
    <div className={`pot ${open ? 'open' : ''}`} style={{ ['--c' as string]: c.color }} onClick={toggle}>
      <div className="pot-head">
        <div className="emoji">{c.emoji}</div>
        <div className="grow"><div className="title">{c.name}</div><div className="sub">{money(planned, cur)} this month</div></div>
        {full ? <span className="pill ok">Done ✓</span> : <span className="pill">{money(need, cur)} to go</span>}
      </div>
      <Bar done={done} total={planned} color={c.color} />
      <div className="pot-foot">
        <span><b>{money(done, cur)}</b> paid</span>
        <span>{full ? 'Nothing left this month' : <><b>{money(need, cur)}</b> still needed · {left.length} payment{left.length > 1 ? 's' : ''}</>}</span>
      </div>
      {open && (
        <ul className="pot-list">
          {items.map(o => (
            <li key={o.key} className={o.status}>
              <span>{o.status === 'confirmed' ? '✅' : '⏳'}</span><span className="grow">{o.name}{(o.note || o.planNote) && <small className="muted"> · {o.note || o.planNote}</small>}</span>
              <span className="muted">{dayLabel(o.date)}</span><b>{money(o.amount, o.currency)}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
