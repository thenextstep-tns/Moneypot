import type { Occurrence, Payment, Plan } from './types';

export const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => toISO(new Date());
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return toISO(d); };
export const thisMonth = () => today().slice(0, 7);
export const shiftMonth = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const monthRange = (ym: string): [string, string] => { const [y, m] = ym.split('-').map(Number); return [`${ym}-01`, toISO(new Date(y, m, 0))]; };
export const monthLabel = (ym: string) => parse(`${ym}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

export function weekRange(s: string): [string, string] {
  const d = parse(s);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [toISO(monday), toISO(sunday)];
}
export const shiftWeek = (s: string, n: number) => addDays(s, n * 7);
export function weekLabel(s: string): string {
  const [monStr, sunStr] = weekRange(s);
  const mon = parse(monStr);
  const sun = parse(sunStr);
  return `${mon.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${sun.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

export const dayLabel = (s: string) => {
  const t = today();
  if (s === t) return 'Today';
  if (s === addDays(t, 1)) return 'Tomorrow';
  if (s === addDays(t, -1)) return 'Yesterday';
  return parse(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

// ---------- Recurrence ----------
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const NTH: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' };
export const ord = (n: number) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

const diffDays = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5);
const lastDay = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
export const weekdaysOf = (p: Plan) => p.weekdays?.length ? p.weekdays : [parse(p.startDate).getDay()];
export const monthDaysOf = (p: Plan) => p.monthDays?.length ? p.monthDays : [parse(p.startDate).getDate()];

function dayInMonth(p: Plan, d: Date): boolean {
  const L = lastDay(d), day = d.getDate();
  if (p.monthMode === 'weekday') {
    if (d.getDay() !== (p.nthWeekday ?? parse(p.startDate).getDay())) return false;
    const n = p.nth ?? 1;
    return n === -1 ? day + 7 > L : Math.ceil(day / 7) === n;
  }
  // -1 = last day; 31 in a 30-day month falls on the 30th
  return monthDaysOf(p).some(x => (x === -1 ? L : Math.min(x, L)) === day);
}

/** Does plan `p` fall on date `s`? */
export function matches(p: Plan, s: string): boolean {
  const st = parse(p.startDate), d = parse(s), every = Math.max(1, p.every || 1);
  const months = (d.getFullYear() - st.getFullYear()) * 12 + d.getMonth() - st.getMonth();
  switch (p.freq) {
    case 'once': return s === p.startDate;
    case 'daily': return diffDays(p.startDate, s) % every === 0;
    case 'weekly': {
      if (!weekdaysOf(p).includes(d.getDay())) return false;
      const weeks = Math.floor((diffDays(p.startDate, s) + (st.getDay() + 6) % 7) / 7); // Monday-based weeks
      return weeks % every === 0;
    }
    case 'monthly': return months % every === 0 && dayInMonth(p, d);
    case 'yearly': return months % (12 * every) === 0 && d.getDate() === Math.min(st.getDate(), lastDay(d));
  }
}

export function dueDates(p: Plan, from: string, to: string): string[] {
  const start = from > p.startDate ? from : p.startDate;
  const end = p.endDate && p.endDate < to ? p.endDate : to;
  if (p.freq === 'once') return p.startDate >= from && p.startDate <= end ? [p.startDate] : [];
  const out: string[] = [];
  for (let s = start; s <= end; s = addDays(s, 1)) if (matches(p, s)) out.push(s);
  return out;
}

/** Plain-language description: "Every 2 weeks on Mon, Thu", "Every month on the first Monday" */
export function freqLabel(p: Plan): string {
  const e = Math.max(1, p.every || 1);
  const base = (u: string) => (e === 1 ? `Every ${u}` : `Every ${e} ${u}s`);
  switch (p.freq) {
    case 'once': return `Once, ${dayLabel(p.startDate)}`;
    case 'daily': return base('day');
    case 'weekly': return `${base('week')} on ${[...weekdaysOf(p)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => WEEKDAYS[d]).join(', ')}`;
    case 'monthly': return p.monthMode === 'weekday'
      ? `${base('month')} on the ${NTH[p.nth ?? 1]} ${WEEKDAYS_LONG[p.nthWeekday ?? parse(p.startDate).getDay()]}`
      : `${base('month')} on the ${monthDaysOf(p).map(x => (x === -1 ? 'last day' : ord(x))).join(' & ')}`;
    case 'yearly': return `${base('year')} on ${parse(p.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`;
  }
}

export function perMonth(p: Plan): number {
  const e = Math.max(1, p.every || 1);
  switch (p.freq) {
    case 'daily': return (p.amount * 30.44) / e;
    case 'weekly': return (p.amount * weekdaysOf(p).length * 52) / 12 / e;
    case 'monthly': return (p.amount * (p.monthMode === 'weekday' ? 1 : monthDaysOf(p).length)) / e;
    case 'yearly': return p.amount / 12 / e;
    default: return 0;
  }
}

// ---------- Occurrences ----------
/** A plan stand-in for payments whose plan was deleted — history is preserved via the payment snapshot */
const ghost = (p: Payment): Plan => ({
  id: p.planId, name: p.name ?? 'Removed item', kind: p.kind ?? 'expense', categoryId: p.categoryId ?? 'other',
  subcategory: p.subcategory, stashId: p.stashId, amount: p.amount, currency: p.currency,
  accountId: p.accountId, toAccountId: p.toAccountId, toAmount: p.toAmount, toCurrency: p.toCurrency,
  freq: 'once', every: 1, startDate: p.dueDate,
});

/** Expand plans into concrete occurrences in [from, to], applying confirmations / postponements / cancellations */
export function occurrences(plans: Plan[], payments: Payment[], from: string, to: string): Occurrence[] {
  const pay = new Map(payments.map(p => [p.id, p]));
  const byId = new Map(plans.map(p => [p.id, p]));
  const used = new Set<string>();
  const inRange = (d: string) => d >= from && d <= to;
  const mk = (plan: Plan, due: string, p?: Payment): Occurrence => ({
    key: p?.id ?? `${plan.id}_${due}`,
    plan, dueDate: due,
    date: p?.date ?? due,
    amount: p?.amount ?? plan.amount,
    currency: p?.currency ?? plan.currency,
    accountId: p ? p.accountId : plan.accountId,
    toAccountId: p ? p.toAccountId : plan.toAccountId,
    toAmount: p ? p.toAmount : plan.toAmount,
    toCurrency: p ? p.toCurrency : plan.toCurrency,
    status: !p || p.status === 'postponed' ? 'pending' : p.status,
    postponed: p?.status === 'postponed',
    // snapshot: once acted on, the payment's own data wins over the (editable) plan
    name: p?.name ?? plan.name,
    kind: p?.kind ?? plan.kind,
    categoryId: (p?.categoryId ?? plan.categoryId) || '',
    subcategory: p?.subcategory ?? plan.subcategory,
    stashId: p?.stashId ?? plan.stashId,
    note: p?.note,
    planNote: plan.note,
    isShared: p?.isShared ?? plan.isShared,
    contributorEmail: p?.contributorEmail,
    contributorName: p?.contributorName,
  });
  const out: Occurrence[] = [];
  for (const plan of plans)
    for (const due of dueDates(plan, from, to)) {
      const p = pay.get(`${plan.id}_${due}`);
      if (p) used.add(p.id);
      const o = mk(plan, due, p);
      if (inRange(o.date)) out.push(o);
    }
  // moved-in postponements, payments whose plan schedule changed, or whose plan was deleted
  for (const p of payments)
    if (!used.has(p.id) && inRange(p.date)) out.push(mk(byId.get(p.planId) ?? ghost(p), p.dueDate, p));
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Build a self-contained payment record (snapshots name/kind/pot/stash so history never shifts) */
export const toPayment = (o: Occurrence, status: Payment['status'], patch: Partial<Payment> = {}): Payment => ({
  id: o.key, planId: o.plan.id, dueDate: o.dueDate, date: o.date, amount: o.amount, currency: o.currency,
  accountId: o.accountId, toAccountId: o.toAccountId, toAmount: o.toAmount, toCurrency: o.toCurrency,
  name: o.name, kind: o.kind, categoryId: o.categoryId, subcategory: o.subcategory, stashId: o.stashId, note: o.note,
  isShared: o.isShared, contributorEmail: o.contributorEmail, contributorName: o.contributorName,
  ...patch, status,
});

export const money = (n: number, cur = 'EUR') => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); }
  catch { return `${n.toFixed(2)} ${cur}`; }
};
